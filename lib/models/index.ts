/**
 * Model Strategy Pattern Barrel Export.
 *
 * This module provides a single entry point for all model strategy
 * functionality. Consumers can import everything they need from
 * '@/lib/models' without knowing the internal file structure.
 *
 * Usage:
 *   import { getModelStrategy, ModelId, NANO_BANANA_CAPABILITIES } from '@/lib/models';
 *
 *   const strategy = getModelStrategy('nano-banana-pro');
 *   const cost = NANO_BANANA_CAPABILITIES.costPerGeneration['1K'];
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

export type {
  ModelId,
  ModelCapabilities,
  ModelGenerationParams,
  NanoBananaParams,
  SeedreamParams,
  ModelStrategy,
} from './types';

// ============================================================================
// Constants
// ============================================================================

export {
  NANO_BANANA_CAPABILITIES,
  SEEDREAM_CAPABILITIES,
  ALL_MODELS,
  DEFAULT_MODEL,
  isValidModelId,
} from './types';

// ============================================================================
// Factory Functions
// ============================================================================

export {
  getModelStrategy,
  tryGetModelStrategy,
} from './model-factory';

// ============================================================================
// Strategy Implementations (rarely needed, but available for advanced use)
// ============================================================================

export { NanoBananaStrategy } from './nano-banana-strategy';
export { SeedreamStrategy } from './seedream-strategy';
