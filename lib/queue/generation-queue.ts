// lib/queue/generation-queue.ts
import PQueue from 'p-queue';
import { getKieApiKey } from './kie-api-client';
import { GenerationJob, GenerationState } from '@/lib/types/generation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getAnthropicClient, CLAUDE_MODEL } from '@/lib/ai/anthropic';
import { classifyError, calculateBackoff, sleep } from './retry-strategies';
import { getModelStrategy } from '@/lib/models';
import { buildModelParams } from './model-params';

// Note: Strategies (NanoBananaStrategy, SeedreamStrategy) handle their own
// kie.ai API interactions. This queue manager is now model-agnostic.

// Retry configuration
const MAX_RETRIES = 50; // High limit for "never skip" - about 24 hours of retrying
const RETRY_FOREVER_ENABLED = true; // Set to false to respect MAX_RETRIES

// Retry state tracking
interface RetryState {
  attemptNumber: number;
  lastError?: string;
  totalBackoffMs: number;
}

// Result of a generation attempt
export interface GenerationResult {
  id: string;
  state: GenerationState;
  resultUrl?: string;
  errorMessage?: string;
}

/**
 * Queue manager for image generation with 20-concurrent limit
 * Uses p-queue for automatic queue feeding and concurrency control
 */
export class GenerationQueueManager {
  private queue: PQueue;
  private supabase: ReturnType<typeof createServerSupabaseClient>;
  private kieApiKey: string;

  constructor(kieApiKey?: string) {
    // Initialize PQueue with 20 concurrent workers
    this.queue = new PQueue({
      concurrency: 20,
      autoStart: true,
    });

    // Set up event listeners for monitoring
    this.queue.on('active', () => {
      // Queue active
    });

    this.queue.on('idle', () => {
      // Queue idle
    });

    this.queue.on('error', (error) => {
      console.error('[Queue] Queue error:', error);
    });

    // Initialize Supabase client
    this.supabase = createServerSupabaseClient();

    // Get API key from parameter or environment
    this.kieApiKey = kieApiKey || getKieApiKey();
  }

  /**
   * Add a single generation to the queue with automatic retry
   * Returns promise that resolves when generation completes (or permanently fails)
   */
  async addGeneration(job: GenerationJob): Promise<GenerationResult> {
    return this.queue.add(async () => {
      return this.executeWithRetry(job);
    }) as Promise<GenerationResult>;
  }

  /**
   * Execute a single generation attempt (no retry logic)
   * This is the core generation logic, called by executeWithRetry
   */
  private async executeGeneration(job: GenerationJob): Promise<GenerationResult> {
    try {
      // Step 1: Update state to 'processing'
      const { error: processingError } = await this.supabase
        .from('generations')
        .update({
          state: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (processingError) {
        throw new Error(`Failed to update state to processing: ${processingError.message}`);
      }

      // Step 2: Prepare prompt (with optional Claude analysis for analysis mode)
      // Use generation-specific prompt if available, fall back to folder operation
      console.log(`[Queue] ========== PROMPT DEBUG ==========`);
      console.log(`[Queue] Generation ID: ${job.id}`);
      console.log(`[Queue] job.prompt type: ${typeof job.prompt}`);
      console.log(`[Queue] job.prompt value: "${job.prompt}"`);
      console.log(`[Queue] job.prompt starts with [POSE: ${job.prompt?.startsWith('[POSE:') ? 'YES' : 'NO'}`);
      console.log(`[Queue] job.operation (first 60): "${job.operation?.substring(0, 60)}..."`);

      let finalPrompt = job.prompt || job.operation;
      console.log(`[Queue] finalPrompt (first 80): "${finalPrompt?.substring(0, 80)}..."`);
      console.log(`[Queue] ====================================`);

      if (job.photoMode === 'analysis' && job.referenceImageUrls.length > 0) {
        // If generation already has a custom prompt, use it as-is
        // If using fallback operation, enhance with Claude analysis
        if (!job.prompt) {
          finalPrompt = await analyzeImageWithClaude(
            job.referenceImageUrls[0],
            job.operation
          );
        }
        // else: prompt was pre-generated, no need to analyze again
      }

      // Step 3: Get strategy for this generation's model
      const strategy = getModelStrategy(job.model);

      // Step 4: Build model-specific parameters
      const params = buildModelParams(job, strategy, finalPrompt);

      // Step 5: Validate before API call
      strategy.validateParams(params);

      // Step 6: Create task via strategy
      const taskId = await strategy.createTask(params);

      // Step 7: Update database with task_id
      const { error: taskIdError } = await this.supabase
        .from('generations')
        .update({ task_id: taskId })
        .eq('id', job.id);

      if (taskIdError) {
        throw new Error(`Failed to update task_id: ${taskIdError.message}`);
      }

      // Step 8: Poll for completion via strategy
      const { resultUrl } = await strategy.pollTask(taskId);

      // Step 9: Update state to 'completed'
      const { error: completedError } = await this.supabase
        .from('generations')
        .update({
          state: 'completed',
          result_url: resultUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (completedError) {
        throw new Error(`Failed to update state to completed: ${completedError.message}`);
      }

      return {
        id: job.id,
        state: GenerationState.COMPLETED,
        resultUrl,
      };
    } catch (error) {
      // Step 10: Handle errors - update state to 'failed'
      const errorMessage = error instanceof Error ? error.message : String(error);

      const { error: failedError } = await this.supabase
        .from('generations')
        .update({
          state: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (failedError) {
        console.error(`[Queue] Failed to update error state for ${job.id}:`, failedError);
      }

      console.error(`[Queue] Generation ${job.id} failed:`, errorMessage);

      return {
        id: job.id,
        state: GenerationState.FAILED,
        errorMessage,
      };
    }
  }

  /**
   * Execute a generation with automatic retry on failure
   * Implements PROC-04: Never skip - retry until success or non-retryable error
   */
  private async executeWithRetry(job: GenerationJob): Promise<GenerationResult> {
    const retryState: RetryState = {
      attemptNumber: 0,
      totalBackoffMs: 0,
    };

    while (true) {
      retryState.attemptNumber++;

      // Update retry count in database BEFORE attempt (skip first attempt)
      if (retryState.attemptNumber > 1) {
        const { error: updateError } = await this.supabase
          .from('generations')
          .update({
            retry_count: retryState.attemptNumber - 1,
            error_message: retryState.lastError || 'Retrying...',
          })
          .eq('id', job.id);

        if (updateError) {
          console.error(`[Retry] Failed to update retry count for ${job.id}:`, updateError);
        }
      }

      try {
        // Execute the generation (existing logic wrapped)
        const result = await this.executeGeneration(job);

        // Success - return result
        if (result.state === GenerationState.COMPLETED) {
          return result;
        }

        // Failed - classify the error
        const errorClassification = classifyError(result.errorMessage);
        retryState.lastError = result.errorMessage;

        // Non-retryable error - fail immediately
        if (!errorClassification.retryable) {
          // Update database with final error state and user-friendly message
          await this.supabase
            .from('generations')
            .update({
              state: 'failed',
              error_message: errorClassification.userMessage,
              retry_count: retryState.attemptNumber,
              completed_at: new Date().toISOString(),
            })
            .eq('id', job.id);

          return {
            ...result,
            errorMessage: errorClassification.userMessage,
          };
        }

        // Check retry limit (unless RETRY_FOREVER_ENABLED)
        if (!RETRY_FOREVER_ENABLED && retryState.attemptNumber >= MAX_RETRIES) {
          return result;
        }

        // Calculate backoff and wait
        const backoffMs = calculateBackoff(retryState.attemptNumber, errorClassification.strategy);
        retryState.totalBackoffMs += backoffMs;

        await sleep(backoffMs);

        // Reset state to pending for retry
        await this.supabase
          .from('generations')
          .update({
            state: 'pending',
            started_at: null,
          })
          .eq('id', job.id);

      } catch (error) {
        // Unexpected error - log and retry with backoff
        const errorMessage = error instanceof Error ? error.message : String(error);
        retryState.lastError = errorMessage;

        console.error(`[Retry] Job ${job.id} unexpected error:`, errorMessage);

        const backoffMs = calculateBackoff(retryState.attemptNumber, 'exponential');
        retryState.totalBackoffMs += backoffMs;

        await sleep(backoffMs);
      }
    }
  }

  /**
   * Add multiple generations to the queue
   * Returns promise that resolves when ALL generations complete
   * CRITICAL: Maps all jobs first, then awaits Promise.all for concurrency
   */
  async addBatch(jobs: GenerationJob[]): Promise<GenerationResult[]> {
    // Map all jobs to promises WITHOUT awaiting
    const promises = jobs.map((job) => this.addGeneration(job));

    // Await all promises concurrently
    return Promise.all(promises);
  }

  /**
   * Get current queue status
   */
  getStatus(): { pending: number; queued: number; total: number } {
    return {
      pending: this.queue.pending,
      queued: this.queue.size,
      total: this.queue.pending + this.queue.size,
    };
  }

  /**
   * Wait for all queued jobs to complete
   */
  async waitForCompletion(): Promise<void> {
    await this.queue.onIdle();
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.queue.pause();
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    this.queue.start();
  }

  /**
   * Clear all pending jobs from queue
   */
  clear(): void {
    this.queue.clear();
  }
}

/**
 * Analyze an image using Claude to create a detailed description
 * Used for "analysis" mode where Claude examines the photo before generation
 */
async function analyzeImageWithClaude(
  imageUrl: string,
  originalPrompt: string
): Promise<string> {
  const anthropic = getAnthropicClient();

  try {
    // Fetch the image and convert to base64
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine media type from URL or default to jpeg
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
    if (imageUrl.toLowerCase().includes('.png')) mediaType = 'image/png';
    else if (imageUrl.toLowerCase().includes('.gif')) mediaType = 'image/gif';
    else if (imageUrl.toLowerCase().includes('.webp')) mediaType = 'image/webp';

    // Ask Claude to analyze the image
    const analysisResponse = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Analyze this image for an AI image generation task. The user's intent is: "${originalPrompt}"

Describe the key visual elements that should be preserved or referenced in the generation:
- Main subject/item (clothing, product, person, etc.)
- Colors, patterns, textures
- Style or aesthetic
- Any important details

Be concise but specific. Your description will be combined with the original prompt to create a better generation. Just provide the description, no preamble.`,
            },
          ],
        },
      ],
    });

    const analysisText =
      analysisResponse.content[0].type === 'text'
        ? analysisResponse.content[0].text
        : '';

    // Combine original prompt with analysis
    const enhancedPrompt = `${originalPrompt}

Based on the reference image: ${analysisText}`;

    return enhancedPrompt;
  } catch (error) {
    console.error('[Analysis] Failed to analyze image:', error);
    // Fall back to original prompt if analysis fails
    return originalPrompt;
  }
}

// Singleton instance pattern
let instance: GenerationQueueManager | null = null;

/**
 * Get or create the singleton queue manager instance
 */
export function getQueueManager(): GenerationQueueManager {
  if (!instance) {
    instance = new GenerationQueueManager();
  }
  return instance;
}
