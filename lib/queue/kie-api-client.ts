// lib/queue/kie-api-client.ts
import pRetry, { AbortError } from 'p-retry';

// kie.ai API payload structure
export interface KieAIPayload {
  model: 'nano-banana-pro';
  input: {
    prompt: string;
    image_input: string[]; // URLs, max 8
    aspect_ratio: string;
    resolution: string;
    output_format: 'png' | 'jpg';  // kie.ai requires lowercase
  };
}

// kie.ai task creation response
interface KieAITaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;  // camelCase per kie.ai docs
  };
}

// kie.ai task query response (recordInfo endpoint)
// The API returns state field, not successFlag
interface KieAIQueryResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    model: string;
    state: 'waiting' | 'processing' | 'success' | 'failed' | 'done';
    param: string;
    resultJson: string; // JSON string containing result URLs when complete
    failCode: string | null;
    failMsg: string | null;
    costTime: number | null;
    completeTime: number | null;
    createTime: number;
    // Legacy fields (may or may not be present)
    successFlag?: 0 | 1 | 2 | 3;
    progress?: number;
    response?: {
      result_urls?: string[];
    };
    errorCode?: string;
    errorMessage?: string;
  };
}

// Helper to get and validate KIE_API_KEY
export function getKieApiKey(): string {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error('KIE_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Create a new task on kie.ai API with retry logic
 * Retries on transient errors (429, 500, 502, 503, 504)
 * Aborts immediately on auth/payment errors (401, 402, 422)
 */
export async function createKieAITask(payload: KieAIPayload): Promise<string> {
  const apiKey = getKieApiKey();

  return pRetry(
    async () => {
      const response = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Non-retryable errors - abort immediately
      if (response.status === 401 || response.status === 402 || response.status === 422) {
        const errorText = await response.text();
        throw new AbortError(`Non-retryable error (${response.status}): ${errorText}`);
      }

      // Retryable errors - throw to trigger retry
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Retryable error (${response.status}): ${response.statusText}`);
      }

      // Other non-2xx responses
      if (!response.ok) {
        const errorText = await response.text();
        throw new AbortError(`API error (${response.status}): ${errorText}`);
      }

      const data: KieAITaskResponse = await response.json();
      // console.log('[kie.ai] createTask response:', JSON.stringify(data, null, 2));

      if (!data.data?.taskId) {
        throw new AbortError(`Invalid API response: missing taskId. Got: ${JSON.stringify(data)}`);
      }

      return data.data.taskId;
    },
    {
      retries: 5,
      factor: 2, // 1s, 2s, 4s, 8s, 16s
      minTimeout: 1000,
      maxTimeout: 30000,
      randomize: true, // Add jitter to prevent thundering herd
      onFailedAttempt: (error) => {
        // Attempt logging disabled
      },
    }
  );
}

/**
 * Poll kie.ai task until completion or failure
 * Uses /api/v1/playground/recordInfo endpoint
 * state: 'waiting'|'processing' = still running, 'success'|'done' = completed, 'failed' = error
 * Returns result URL on completion
 */
export async function pollTaskCompletion(taskId: string): Promise<{ resultUrl: string }> {
  const apiKey = getKieApiKey();

  return pRetry(
    async () => {
      const response = await fetch(
        `https://api.kie.ai/api/v1/playground/recordInfo?taskId=${taskId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Query task failed (${response.status}): ${response.statusText}`);
      }

      const data: KieAIQueryResponse = await response.json();
      // console.log('[kie.ai] pollTask response:', JSON.stringify(data, null, 2));

      const { state, resultJson, failCode, failMsg } = data.data;

      // Still processing - throw to trigger retry
      if (state === 'waiting' || state === 'processing') {
        throw new Error(`Task ${taskId} still ${state}`);
      }

      // Failed - abort immediately
      if (state === 'failed') {
        throw new AbortError(
          `Task ${taskId} failed: ${failMsg || failCode || 'Unknown error'}`
        );
      }

      // Success - extract result URL from resultJson
      if (state === 'success' || state === 'done') {
        let resultUrl: string | undefined;

        // console.log('[kie.ai] Task completed, extracting result URL...');
        // console.log('[kie.ai] resultJson type:', typeof resultJson);
        // console.log('[kie.ai] resultJson value:', resultJson);

        // Try to parse resultJson which contains the result URLs
        if (resultJson) {
          try {
            const parsed = JSON.parse(resultJson);
            // console.log('[kie.ai] Parsed resultJson:', JSON.stringify(parsed, null, 2));

            // Try various possible formats that kie.ai might use
            resultUrl = extractUrlFromObject(parsed);
          } catch (e) {
            // resultJson might be a direct URL string
            if (typeof resultJson === 'string' && resultJson.startsWith('http')) {
              resultUrl = resultJson;
            }
          }
        }

        // Fallback: check legacy response structure
        if (!resultUrl && data.data.response?.result_urls?.length) {
          resultUrl = data.data.response.result_urls[0];
        }

        // Fallback: check if there's any URL-like string in the entire data object
        if (!resultUrl) {
          resultUrl = findUrlInObject(data.data);
        }

        if (!resultUrl) {
          console.error('[kie.ai] Could not extract result URL. Full response:', JSON.stringify(data, null, 2));
          throw new AbortError(`Task ${taskId} completed but could not extract result URL`);
        }

        // console.log('[kie.ai] Extracted result URL:', resultUrl);
        return { resultUrl };
      }

      // Unknown status - check legacy successFlag as fallback
      if (data.data.successFlag !== undefined) {
        if (data.data.successFlag === 0) {
          throw new Error(`Task ${taskId} still processing (legacy successFlag)`);
        }
        if (data.data.successFlag === 1) {
          const resultUrls = data.data.response?.result_urls;
          if (resultUrls && resultUrls.length > 0) {
            return { resultUrl: resultUrls[0] };
          }
        }
        if (data.data.successFlag === 2 || data.data.successFlag === 3) {
          throw new AbortError(`Task ${taskId} failed (legacy): ${data.data.errorMessage || 'Unknown'}`);
        }
      }

      throw new AbortError(`Task ${taskId} has unknown state: ${state}`);
    },
    {
      retries: 120, // Poll for up to ~10 minutes (image gen can take a while)
      factor: 1.1, // Slower growth for polling
      minTimeout: 3000, // Start at 3s
      maxTimeout: 15000, // Cap at 15s
      randomize: true,
      onFailedAttempt: (error) => {
        // Polling logging disabled
      },
    }
  );
}

/**
 * Extract URL from various possible response formats
 */
function extractUrlFromObject(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') {
    if (typeof obj === 'string' && obj.startsWith('http')) {
      return obj;
    }
    return undefined;
  }

  const data = obj as Record<string, unknown>;

  // Try common field names for result URLs
  const urlFields = [
    'result_urls',
    'resultUrls',
    'images',
    'image_urls',
    'imageUrls',
    'urls',
    'result',
    'output',
    'data',
    'url',
    'image',
    'image_url',
    'imageUrl',
  ];

  for (const field of urlFields) {
    const value = data[field];

    // Direct URL string
    if (typeof value === 'string' && value.startsWith('http')) {
      return value;
    }

    // Array of URLs
    if (Array.isArray(value) && value.length > 0) {
      const firstItem = value[0];
      if (typeof firstItem === 'string' && firstItem.startsWith('http')) {
        return firstItem;
      }
      // Array of objects with url field
      if (typeof firstItem === 'object' && firstItem !== null) {
        const url = extractUrlFromObject(firstItem);
        if (url) return url;
      }
    }

    // Nested object
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const url = extractUrlFromObject(value);
      if (url) return url;
    }
  }

  return undefined;
}

/**
 * Recursively search for any URL in an object (last resort)
 */
function findUrlInObject(obj: unknown, depth = 0): string | undefined {
  // Prevent infinite recursion
  if (depth > 5) return undefined;

  if (!obj) return undefined;

  if (typeof obj === 'string') {
    // Check if it's a URL (specifically image URLs)
    if (obj.startsWith('http') && (
      obj.includes('.png') ||
      obj.includes('.jpg') ||
      obj.includes('.jpeg') ||
      obj.includes('.webp') ||
      obj.includes('/image') ||
      obj.includes('storage') ||
      obj.includes('cdn')
    )) {
      return obj;
    }
    return undefined;
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      const url = findUrlInObject(item, depth + 1);
      if (url) return url;
    }
    return undefined;
  }

  if (typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      const url = findUrlInObject(value, depth + 1);
      if (url) return url;
    }
  }

  return undefined;
}
