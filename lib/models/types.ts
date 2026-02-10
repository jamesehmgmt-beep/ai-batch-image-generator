/**
 * Core type definitions for the Model Strategy Pattern.
 *
 * This module provides the foundational types and interfaces that enable
 * type-safe model abstraction across different image generation models.
 */

/**
 * Supported image generation model identifiers.
 */
export type ModelId = 'nano-banana-pro' | 'seedream-4.5-edit';

/**
 * Capabilities and limitations of a specific image generation model.
 * Used by UI to enforce constraints and display cost estimates.
 */
export interface ModelCapabilities {
  /** Unique identifier for this model */
  id: ModelId;

  /** Human-readable model name for UI display */
  displayName: string;

  /** Maximum number of reference images this model accepts */
  maxReferenceImages: number;

  /** List of aspect ratios supported by this model */
  supportedAspectRatios: string[];

  /** Cost in credits per generation, keyed by quality/resolution tier */
  costPerGeneration: Record<string, number>;
}

/**
 * Common parameters shared by all image generation models.
 * Model-specific parameters extend this base interface.
 */
export interface ModelGenerationParams {
  /** Text prompt describing the desired image */
  prompt: string;

  /** Array of reference image URLs to guide generation */
  referenceImages: string[];

  /** Aspect ratio for output image */
  aspectRatio: string;
}

/**
 * Nano Banana Pro specific generation parameters.
 * Extends base params with resolution and format options.
 */
export interface NanoBananaParams extends ModelGenerationParams {
  /** Output image resolution tier */
  resolution: '1K' | '2K' | '4K';

  /** Output image file format */
  outputFormat: 'png' | 'jpg';
}

/**
 * Seedream 4.5 Edit specific generation parameters.
 * Extends base params with quality and size options.
 */
export interface SeedreamParams extends ModelGenerationParams {
  /** Generation quality tier */
  quality: 'basic' | 'high';

  /** Output image size preset (e.g., 'landscape_16_9', 'square') */
  imageSize: string;
}

/**
 * Strategy interface that all model implementations must follow.
 * Provides a consistent API for task creation, polling, and validation
 * regardless of the underlying model provider.
 */
export interface ModelStrategy {
  /** Capabilities and constraints for this model */
  readonly capabilities: ModelCapabilities;

  /**
   * Create a new image generation task with the model provider.
   * @param params - Model-specific generation parameters
   * @returns Promise resolving to the provider's task ID
   */
  createTask(params: ModelGenerationParams): Promise<string>;

  /**
   * Poll for task completion status.
   * @param taskId - Provider task ID from createTask
   * @returns Promise resolving to result URL when task completes
   */
  pollTask(taskId: string): Promise<{ resultUrl: string }>;

  /**
   * Validate model-specific parameters before API submission.
   * Throws error if parameters are invalid for this model.
   * @param params - Parameters to validate
   */
  validateParams(params: ModelGenerationParams): void;
}

/**
 * Capabilities for Nano Banana Pro model.
 * Supports 8 reference images, 11 aspect ratios, 3 resolution tiers.
 */
export const NANO_BANANA_CAPABILITIES: ModelCapabilities = {
  id: 'nano-banana-pro',
  displayName: 'Nano Banana Pro',
  maxReferenceImages: 8,
  supportedAspectRatios: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'],
  costPerGeneration: {
    '1K': 0.134,
    '2K': 0.134,
    '4K': 0.24,
  },
};

/**
 * Capabilities for Seedream 4.5 Edit model.
 * Supports 14 reference images, 9 preset sizes, 2 quality tiers.
 */
export const SEEDREAM_CAPABILITIES: ModelCapabilities = {
  id: 'seedream-4.5-edit',
  displayName: 'Seedream 4.5 Edit',
  maxReferenceImages: 14,
  supportedAspectRatios: ['square', 'square_hd', 'portrait_4_3', 'portrait_3_2', 'portrait_16_9', 'landscape_4_3', 'landscape_3_2', 'landscape_16_9', 'landscape_21_9'],
  costPerGeneration: {
    'basic': 0.032,
    'high': 0.032,
  },
};

/**
 * Array of all supported model IDs.
 * Used for validation and iteration.
 */
export const ALL_MODELS: ModelId[] = ['nano-banana-pro', 'seedream-4.5-edit'];

/**
 * Default model for backward compatibility.
 * Used when no model is explicitly specified.
 */
export const DEFAULT_MODEL: ModelId = 'nano-banana-pro';

/**
 * Type guard to check if a string is a valid ModelId.
 * @param value - String to check
 * @returns True if value is a valid ModelId
 */
export function isValidModelId(value: string): value is ModelId {
  return ALL_MODELS.includes(value as ModelId);
}
