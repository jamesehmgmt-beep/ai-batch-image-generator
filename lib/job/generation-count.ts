// lib/job/generation-count.ts

/**
 * Calculate the number of generations for a folder operation.
 *
 * Priority order:
 * 1. imageOperations length (user specified per-image operations) - NOT multiplied
 * 2. generationCount as MULTIPLIER (e.g., "4 variations" = 4 per file)
 * 3. Default: 1 per file (after exclusions)
 *
 * IMPORTANT: generationCount is a MULTIPLIER, not a total.
 * - If user has 14 images and says "4 variations each", that's 14 × 4 = 56 generations
 * - This matches user expectation for "variations" or "poses" per image
 *
 * @param folder - Folder operation with optional generationCount, imageOperations, excludedFiles
 * @param totalFilesInFolder - Total number of files uploaded to this folder
 * @returns Number of generations to create
 */
export function calculateGenerationCount(
  folder: {
    generationCount?: number;
    imageOperations?: Array<{ fileName: string }>;
    excludedFiles?: string[];
  },
  totalFilesInFolder: number
): number {
  // Case 1: Per-image operations specified - count only those files (no multiplier)
  if (folder.imageOperations && folder.imageOperations.length > 0) {
    return folder.imageOperations.length;
  }

  // Calculate effective file count (after exclusions)
  const excludedCount = folder.excludedFiles?.length || 0;
  const effectiveFileCount = Math.max(0, totalFilesInFolder - excludedCount);

  // Case 2: generationCount is a MULTIPLIER (e.g., "4 variations per image")
  // 14 files × 4 variations = 56 generations
  if (folder.generationCount && folder.generationCount > 0) {
    return effectiveFileCount * folder.generationCount;
  }

  // Case 3: Default 1-per-file behavior
  return effectiveFileCount;
}
