/**
 * Seedream 4.5 Edit model strategy implementation.
 *
 * Implements the ModelStrategy interface for Seedream 4.5 Edit.
 * Per docs: https://docs.kie.ai/market/seedream/4.5-edit
 *
 * Key differences from Nano Banana Pro:
 * - 'quality' (basic/high) instead of 'resolution' (1K/2K/4K) - basic=2K, high=4K
 * - 'aspect_ratio' with standard values like '16:9', '3:4' (not imageSize format)
 * - 'image_urls' array for reference images
 * - Supports up to 14 reference images (vs Nano's 8)
 * - Model identifier is 'seedream/4.5-edit' (with slash)
 * - No output format option (PNG/JPG) - Seedream decides the format
 */

import pRetry, { AbortError } from 'p-retry';
import {
  ModelStrategy,
  ModelGenerationParams,
  SeedreamParams,
  SEEDREAM_CAPABILITIES,
} from './types';

/**
 * Seedream API payload structure for task creation.
 * Per docs: https://docs.kie.ai/market/seedream/4.5-edit
 */
interface SeedreamPayload {
  model: 'seedream/4.5-edit';
  input: {
    prompt: string;
    image_urls: string[];
    aspect_ratio: string;  // '1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'
    quality: 'basic' | 'high';  // basic=2K, high=4K
  };
}

/**
 * Seedream task creation response.
 */
interface SeedreamTaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

/**
 * Seedream task query response (polling endpoint).
 */
interface SeedreamQueryResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    model: string;
    state: 'waiting' | 'processing' | 'success' | 'failed' | 'done';
    param: string;
    resultJson: string;
    failCode: string | null;
    failMsg: string | null;
    costTime: number | null;
    completeTime: number | null;
    createTime: number;
  };
}

/**
 * Helper to get and validate KIE_API_KEY for Seedream.
 * Both Nano Banana Pro and Seedream use the same kie.ai platform.
 */
function getKieApiKey(): string {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    throw new Error('KIE_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Map UI imageSize values to standard aspect ratio format for Seedream API.
 *
 * UI uses: square_1_1, portrait_3_4, portrait_9_16, landscape_4_3, landscape_16_9
 * Seedream API expects: 1:1, 3:4, 9:16, 4:3, 16:9, etc.
 *
 * @param imageSize - UI imageSize value
 * @returns Standard aspect ratio string for API
 */
function mapImageSizeToAspectRatio(imageSize: string | undefined): string | undefined {
  if (!imageSize) return undefined;

  const mapping: Record<string, string> = {
    // UI imageSize -> API aspect_ratio
    'square_1_1': '1:1',
    'square': '1:1',
    'portrait_3_4': '3:4',
    'portrait_4_3': '3:4',
    'portrait_9_16': '9:16',
    'portrait_16_9': '9:16',
    'portrait_2_3': '2:3',
    'portrait_3_2': '2:3',
    'landscape_4_3': '4:3',
    'landscape_3_4': '4:3',
    'landscape_16_9': '16:9',
    'landscape_9_16': '16:9',
    'landscape_3_2': '3:2',
    'landscape_2_3': '3:2',
    'landscape_21_9': '21:9',
  };

  const mapped = mapping[imageSize];

  if (mapped) {
    return mapped;
  }

  // If it looks like an aspect ratio already (contains ':'), return as-is
  if (imageSize.includes(':')) {
    return imageSize;
  }

  console.warn(`[Seedream] Unknown imageSize: ${imageSize}, defaulting to 1:1`);
  return '1:1';
}


/**
 * Seedream 4.5 Edit strategy implementation.
 *
 * Handles task creation, polling, and parameter validation for
 * the Seedream 4.5 Edit model on the kie.ai platform.
 */
export class SeedreamStrategy implements ModelStrategy {
  readonly capabilities = SEEDREAM_CAPABILITIES;

  /**
   * Validate Seedream-specific parameters before API submission.
   *
   * @param params - Parameters to validate (should be SeedreamParams)
   * @throws Error if parameters are invalid for Seedream
   */
  validateParams(params: ModelGenerationParams): void {
    const seedreamParams = params as SeedreamParams;

    // Validate reference image count (max 14 for Seedream)
    if (seedreamParams.referenceImages.length > 14) {
      throw new Error(
        `Seedream supports max 14 reference images, got ${seedreamParams.referenceImages.length}`
      );
    }

    // Validate quality parameter
    if (!['basic', 'high'].includes(seedreamParams.quality)) {
      throw new Error(
        `Invalid quality for Seedream: ${seedreamParams.quality}. Must be 'basic' or 'high'`
      );
    }

    // Validate aspect ratio - convert from imageSize if needed
    const aspectRatio = mapImageSizeToAspectRatio(seedreamParams.imageSize) || seedreamParams.aspectRatio || '1:1';
    const validAspectRatios = ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'];

    if (!validAspectRatios.includes(aspectRatio)) {
      throw new Error(
        `Unsupported aspect ratio for Seedream: ${aspectRatio}. Valid values: ${validAspectRatios.join(', ')}`
      );
    }
  }

  /**
   * Create a new image generation task with Seedream 4.5 Edit.
   *
   * @param params - Seedream generation parameters
   * @returns Promise resolving to the kie.ai task ID
   */
  async createTask(params: ModelGenerationParams): Promise<string> {
    const seedreamParams = params as SeedreamParams;
    const apiKey = getKieApiKey();

    // Convert imageSize (UI format like 'portrait_3_4') back to aspect_ratio (API format like '3:4')
    // The API expects standard aspect ratio strings, not the imageSize format
    const aspectRatio = mapImageSizeToAspectRatio(seedreamParams.imageSize) || seedreamParams.aspectRatio || '1:1';

    // console.log(`[Seedream] createTask - imageSize: ${seedreamParams.imageSize}, aspectRatio input: ${seedreamParams.aspectRatio}, final aspectRatio: ${aspectRatio}, quality: ${seedreamParams.quality}`);

    // Build Seedream payload per docs: https://docs.kie.ai/market/seedream/4.5-edit
    const payload: SeedreamPayload = {
      model: 'seedream/4.5-edit',
      input: {
        prompt: seedreamParams.prompt,
        image_urls: seedreamParams.referenceImages,
        aspect_ratio: aspectRatio,
        quality: seedreamParams.quality,
      },
    };

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

        const data: SeedreamTaskResponse = await response.json();
        // console.log('[Seedream] createTask response:', JSON.stringify(data, null, 2));

        if (!data.data?.taskId) {
          throw new AbortError(`Invalid API response: missing taskId. Got: ${JSON.stringify(data)}`);
        }

        return data.data.taskId;
      },
      {
        retries: 5,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 30000,
        randomize: true,
        onFailedAttempt: (error) => {
          // Attempt logging disabled
        },
      }
    );
  }

  /**
   * Poll Seedream task until completion or failure.
   *
   * @param taskId - kie.ai task ID from createTask
   * @returns Promise resolving to result URL when task completes
   */
  async pollTask(taskId: string): Promise<{ resultUrl: string }> {
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

        const data: SeedreamQueryResponse = await response.json();
        // console.log('[Seedream] pollTask response:', JSON.stringify(data, null, 2));

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

          // console.log('[Seedream] Task completed, extracting result URL...');

          // Try to parse resultJson which contains the result URLs
          if (resultJson) {
            try {
              const parsed = JSON.parse(resultJson);
              // console.log('[Seedream] Parsed resultJson:', JSON.stringify(parsed, null, 2));

              resultUrl = extractUrlFromObject(parsed);
            } catch (e) {
              // resultJson might be a direct URL string
              if (typeof resultJson === 'string' && resultJson.startsWith('http')) {
                resultUrl = resultJson;
              }
            }
          }

          // Fallback: search for URL in entire data object
          if (!resultUrl) {
            resultUrl = findUrlInObject(data.data);
          }

          if (!resultUrl) {
            console.error('[Seedream] Could not extract result URL. Full response:', JSON.stringify(data, null, 2));
            throw new AbortError(`Task ${taskId} completed but could not extract result URL`);
          }

          // console.log('[Seedream] Extracted result URL:', resultUrl);
          return { resultUrl };
        }

        throw new AbortError(`Task ${taskId} has unknown state: ${state}`);
      },
      {
        retries: 120,
        factor: 1.1,
        minTimeout: 3000,
        maxTimeout: 15000,
        randomize: true,
        onFailedAttempt: (error) => {
          // Polling logging disabled
        },
      }
    );
  }
}

/**
 * Extract URL from various possible response formats.
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
 * Recursively search for any URL in an object (last resort).
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
