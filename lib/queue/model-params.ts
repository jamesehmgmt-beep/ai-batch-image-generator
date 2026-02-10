import { GenerationJob } from '@/lib/types/generation';
import {
  ModelStrategy,
  ModelGenerationParams,
  NanoBananaParams,
  SeedreamParams
} from '@/lib/models';

/**
 * Build model-specific generation parameters from a GenerationJob.
 * Uses strategy.capabilities.id to determine which param type to construct.
 * Slices reference images to model limit as defense-in-depth.
 */
export function buildModelParams(
  job: GenerationJob,
  strategy: ModelStrategy,
  finalPrompt: string
): ModelGenerationParams {
  // Slice reference images to model limit (defense-in-depth)
  const referenceImages = job.referenceImageUrls.slice(
    0,
    strategy.capabilities.maxReferenceImages
  );

  // Base parameters common to all models
  const baseParams = {
    prompt: finalPrompt,
    referenceImages,
    aspectRatio: job.aspectRatio,
  };

  // Build model-specific parameters based on strategy ID
  switch (strategy.capabilities.id) {
    case 'nano-banana-pro':
      return {
        ...baseParams,
        resolution: job.resolution || '2K',
        outputFormat: (job.outputFormat?.toLowerCase() as 'png' | 'jpg') || 'png',
      } as NanoBananaParams;

    case 'seedream-4.5-edit':
      return {
        ...baseParams,
        quality: job.quality || 'basic',
        imageSize: job.imageSize || 'square',
      } as SeedreamParams;

    default:
      // TypeScript exhaustive check ensures this never happens
      const exhaustiveCheck: never = strategy.capabilities.id;
      throw new Error(`Unknown model ID: ${exhaustiveCheck}`);
  }
}
