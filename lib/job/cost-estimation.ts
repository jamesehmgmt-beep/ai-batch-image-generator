// lib/job/cost-estimation.ts
import type { FolderOperation, Resolution } from '@/lib/types/job';
import type { ModelId } from '@/lib/models/types';
import { getModelStrategy } from '@/lib/models/model-factory';
import { calculateGenerationCount } from './generation-count';

export interface CostBreakdown {
  totalImages: number;
  estimatedCost: number;
  byModel: Array<{
    model: ModelId;
    imageCount: number;
    costPerImage: number;  // Average for this model
    totalCost: number;
  }>;
  byFolder: Array<{
    folderPath: string;
    imageCount: number;
    model: ModelId;
    tier: string;  // resolution for Nano, quality for Seedream
    folderCost: number;
  }>;
  // Keep byResolution for backward compatibility with existing UI
  byResolution: {
    '1K': number;
    '2K': number;
    '4K': number;
  };
  perImageCost: {
    '1K': number;
    '2K': number;
    '4K': number;
  };
}

/**
 * Calculate cost estimate for a parsed job
 * @param operations - Folder operations from parsed job
 * @param fileCountByFolder - Map of folder path to file count (from upload phase)
 */
export function calculateCostEstimate(
  operations: FolderOperation[],
  fileCountByFolder: Record<string, number>
): CostBreakdown {
  const byModelMap = new Map<ModelId, { count: number; cost: number }>();
  const byFolder: CostBreakdown['byFolder'] = [];
  const byResolution: CostBreakdown['byResolution'] = { '1K': 0, '2K': 0, '4K': 0 };

  for (const op of operations) {
    // Calculate effective count using shared logic
    const effectiveCount = calculateGenerationCount(
      {
        generationCount: (op as any).generationCount,
        imageOperations: (op as any).imageOperations,
        excludedFiles: op.excludedFiles,
      },
      fileCountByFolder[op.folderPath] || 0
    );

    // Get model from operation, default to nano-banana-pro
    const model: ModelId = (op as any).model || 'nano-banana-pro';
    const strategy = getModelStrategy(model);

    // Determine tier and cost based on model
    let tier: string;
    let costPerImage: number;

    if (model === 'nano-banana-pro') {
      tier = op.resolution || '2K';
      costPerImage = strategy.capabilities.costPerGeneration[tier] || 0.134;
      // Track by resolution for backward compatibility
      if (tier === '1K' || tier === '2K' || tier === '4K') {
        byResolution[tier] += effectiveCount;
      }
    } else if (model === 'seedream-4.5-edit') {
      tier = (op as any).quality || 'basic';
      costPerImage = strategy.capabilities.costPerGeneration[tier] || 0.032;
    } else {
      tier = 'standard';
      costPerImage = 0.134;
    }

    const folderCost = effectiveCount * costPerImage;

    // Accumulate by model
    const existing = byModelMap.get(model) || { count: 0, cost: 0 };
    byModelMap.set(model, {
      count: existing.count + effectiveCount,
      cost: existing.cost + folderCost,
    });

    // Add folder breakdown
    byFolder.push({
      folderPath: op.folderPath,
      imageCount: effectiveCount,
      model,
      tier,
      folderCost,
    });
  }

  // Calculate totals
  const totalImages = Array.from(byModelMap.values()).reduce((sum, m) => sum + m.count, 0);
  const estimatedCost = Array.from(byModelMap.values()).reduce((sum, m) => sum + m.cost, 0);

  // Convert byModel map to array
  const byModel = Array.from(byModelMap.entries()).map(([model, data]) => ({
    model,
    imageCount: data.count,
    costPerImage: data.count > 0 ? data.cost / data.count : 0,
    totalCost: data.cost,
  }));

  // Get per-image costs from strategy (for backward compatibility display)
  const nanoBananaStrategy = getModelStrategy('nano-banana-pro');
  const perImageCost = {
    '1K': nanoBananaStrategy.capabilities.costPerGeneration['1K'] || 0.134,
    '2K': nanoBananaStrategy.capabilities.costPerGeneration['2K'] || 0.134,
    '4K': nanoBananaStrategy.capabilities.costPerGeneration['4K'] || 0.24,
  };

  return {
    totalImages,
    estimatedCost,
    byModel,
    byFolder,
    byResolution,
    perImageCost,
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}
