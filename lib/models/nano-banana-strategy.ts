/**
 * Nano Banana Pro model strategy implementation.
 *
 * This strategy wraps the existing kie.ai API client logic and adapts it
 * to the ModelStrategy interface. It handles:
 * - Resolution-based parameter validation (1K, 2K, 4K)
 * - 8 reference image limit
 * - Aspect ratio validation
 * - Automatic retry with exponential backoff
 * - Flexible URL extraction from various response formats
 */

import pRetry, { AbortError } from 'p-retry';
import {
  ModelStrategy,
  ModelGenerationParams,
  NanoBananaParams,
  NANO_BANANA_CAPABILITIES,
} from './types';

/**
 * kie.ai API payload structure for Nano Banana Pro.
 */
interface KieAIPayload {
  model: 'nano-banana-pro';
  input: {
    prompt: string;
    image_input: string[];
    aspect_ratio: string;
    resolution: string;
    output_format: 'png' | 'jpg';
  };
}

/**
 * kie.ai task creation response.
 */
interface KieAITaskResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

/**
 * kie.ai task query response from recordInfo endpoint.
 */
interface KieAIQueryResponse {
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

/**
 * Nano Banana Pro strategy class.
 * Implements the ModelStrategy interface for the Nano Banana Pro model.
 */
export class NanoBananaStrategy implements ModelStrategy {
  readonly capabilities = NANO_BANANA_CAPABILITIES;

  /**
   * Validate Nano Banana Pro specific parameters.
   * @throws {Error} if parameters are invalid for this model
   */
  validateParams(params: ModelGenerationParams): void {
    // Type guard to ensure we have NanoBananaParams
    const nbParams = params as NanoBananaParams;

    // Validate resolution
    if (!nbParams.resolution || !['1K', '2K', '4K'].includes(nbParams.resolution)) {
      throw new Error(
        `Invalid resolution: ${nbParams.resolution}. Must be one of: 1K, 2K, 4K`
      );
    }

    // Validate reference image count
    if (nbParams.referenceImages.length > this.capabilities.maxReferenceImages) {
      throw new Error(
        `Too many reference images: ${nbParams.referenceImages.length}. Maximum is ${this.capabilities.maxReferenceImages}`
      );
    }

    // Validate aspect ratio
    if (!this.capabilities.supportedAspectRatios.includes(nbParams.aspectRatio)) {
      throw new Error(
        `Unsupported aspect ratio: ${nbParams.aspectRatio}. Supported: ${this.capabilities.supportedAspectRatios.join(', ')}`
      );
    }

    // Validate output format
    if (!nbParams.outputFormat || !['png', 'jpg'].includes(nbParams.outputFormat)) {
      throw new Error(
        `Invalid output format: ${nbParams.outputFormat}. Must be 'png' or 'jpg'`
      );
    }
  }

  /**
   * Create a new image generation task with kie.ai API.
   * Uses p-retry for automatic retry with exponential backoff.
   * @param params - Nano Banana Pro generation parameters
   * @returns Promise resolving to kie.ai task ID
   */
  async createTask(params: ModelGenerationParams): Promise<string> {
    // Validate first
    this.validateParams(params);

    const nbParams = params as NanoBananaParams;
    const apiKey = this.getApiKey();

    // Build kie.ai API payload
    const payload: KieAIPayload = {
      model: 'nano-banana-pro',
      input: {
        prompt: nbParams.prompt,
        image_input: nbParams.referenceImages,
        aspect_ratio: nbParams.aspectRatio,
        resolution: nbParams.resolution,
        output_format: nbParams.outputFormat,
      },
    };

    // Debug: Log the prompt being sent to kie.ai
    console.log(`[kie.ai] Sending prompt: "${nbParams.prompt.substring(0, 80)}..."`);

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
        // console.log('[NanoBananaStrategy] createTask response:', JSON.stringify(data, null, 2));

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
   * Poll for task completion status.
   * Uses kie.ai /api/v1/playground/recordInfo endpoint.
   * Retries until state is 'success', 'done', or 'failed'.
   * @param taskId - kie.ai task ID from createTask
   * @returns Promise resolving to result URL when complete
   */
  async pollTask(taskId: string): Promise<{ resultUrl: string }> {
    const apiKey = this.getApiKey();

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
        // console.log('[NanoBananaStrategy] pollTask response:', JSON.stringify(data, null, 2));

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

          // console.log('[NanoBananaStrategy] Task completed, extracting result URL...');
          // console.log('[NanoBananaStrategy] resultJson type:', typeof resultJson);
          // console.log('[NanoBananaStrategy] resultJson value:', resultJson);

          // Try to parse resultJson which contains the result URLs
          if (resultJson) {
            try {
              const parsed = JSON.parse(resultJson);
              // console.log('[NanoBananaStrategy] Parsed resultJson:', JSON.stringify(parsed, null, 2));

              // Try various possible formats that kie.ai might use
              resultUrl = this.extractResultUrl(parsed);
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
            resultUrl = this.findUrl(data.data);
          }

          if (!resultUrl) {
            console.error('[NanoBananaStrategy] Could not extract result URL. Full response:', JSON.stringify(data, null, 2));
            throw new AbortError(`Task ${taskId} completed but could not extract result URL`);
          }

          // console.log('[NanoBananaStrategy] Extracted result URL:', resultUrl);
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
   * Extract URL from various possible response formats.
   */
  private extractResultUrl(obj: unknown): string | undefined {
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
          const url = this.extractResultUrl(firstItem);
          if (url) return url;
        }
      }

      // Nested object
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const url = this.extractResultUrl(value);
        if (url) return url;
      }
    }

    return undefined;
  }

  /**
   * Recursively search for any URL in an object (last resort).
   */
  private findUrl(obj: unknown, depth = 0): string | undefined {
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
        const url = this.findUrl(item, depth + 1);
        if (url) return url;
      }
      return undefined;
    }

    if (typeof obj === 'object') {
      for (const value of Object.values(obj)) {
        const url = this.findUrl(value, depth + 1);
        if (url) return url;
      }
    }

    return undefined;
  }

  /**
   * Get and validate KIE_API_KEY from environment.
   */
  private getApiKey(): string {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) {
      throw new Error('KIE_API_KEY environment variable is required');
    }
    return apiKey;
  }
}
