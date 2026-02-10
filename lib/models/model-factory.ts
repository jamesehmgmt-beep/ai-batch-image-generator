/**
 * Model Strategy Factory.
 *
 * Provides factory functions to get the appropriate ModelStrategy instance
 * based on a model ID. Uses exhaustive switch for compile-time safety when
 * adding new models.
 *
 * Usage:
 *   const strategy = getModelStrategy('nano-banana-pro');
 *   const taskId = await strategy.createTask(params);
 */

import { ModelId, ModelStrategy } from './types';
import { NanoBananaStrategy } from './nano-banana-strategy';
import { SeedreamStrategy } from './seedream-strategy';

/**
 * Strategy instances cache to avoid recreating on every call.
 * These are stateless, so singleton pattern is safe.
 */
const strategyCache: Map<ModelId, ModelStrategy> = new Map();

/**
 * Get the ModelStrategy implementation for a given model ID.
 *
 * Uses exhaustive switch to ensure compile-time safety - TypeScript will
 * error if we add a new ModelId but don't handle it here.
 *
 * @param modelId - The model identifier
 * @returns ModelStrategy instance for the specified model
 * @throws {Error} if modelId is not recognized (should never happen with TypeScript)
 */
export function getModelStrategy(modelId: ModelId): ModelStrategy {
  // Check cache first
  const cached = strategyCache.get(modelId);
  if (cached) {
    return cached;
  }

  // Exhaustive switch - TypeScript ensures all ModelId values are covered
  let strategy: ModelStrategy;

  switch (modelId) {
    case 'nano-banana-pro':
      strategy = new NanoBananaStrategy();
      break;

    case 'seedream-4.5-edit':
      strategy = new SeedreamStrategy();
      break;

    default:
      // This line ensures exhaustive checking at compile time
      // If a new ModelId is added but not handled above, TypeScript will error here
      const exhaustiveCheck: never = modelId;
      throw new Error(`Unknown model ID: ${exhaustiveCheck}`);
  }

  // Cache the strategy for future calls
  strategyCache.set(modelId, strategy);

  return strategy;
}

/**
 * Try to get a ModelStrategy for a potentially invalid model ID.
 * Useful for validation flows where you need to check if a string
 * is a valid model ID.
 *
 * @param modelId - String that might be a valid ModelId
 * @returns ModelStrategy if valid, undefined otherwise
 */
export function tryGetModelStrategy(modelId: string): ModelStrategy | undefined {
  // Type guard check
  if (modelId !== 'nano-banana-pro' && modelId !== 'seedream-4.5-edit') {
    return undefined;
  }

  return getModelStrategy(modelId as ModelId);
}
