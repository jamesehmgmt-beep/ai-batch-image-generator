// lib/job/prompt-builder.ts

/**
 * Prompt combination modes:
 * - prefix: global prompt first, then folder prompt
 * - suffix: folder prompt first, then global prompt
 * - only: use global prompt only, ignore folder prompt
 */
export type PromptCombinationMode = 'prefix' | 'suffix' | 'only';

/**
 * Build final prompt by combining global and folder-specific prompts.
 * Used during job expansion to determine final prompt sent to generation API.
 *
 * @param globalPrompt - Optional global prompt applied to all generations
 * @param folderOperation - Folder-specific operation/prompt
 * @param combinationMode - How to combine when both exist (default: 'prefix')
 * @returns Final prompt string to send to generation API
 * @throws Error if neither globalPrompt nor folderOperation is provided
 */
export function buildFinalPrompt(
  globalPrompt: string | undefined,
  folderOperation: string | undefined,
  combinationMode: PromptCombinationMode = 'prefix'
): string {
  // Validation: at least one must exist
  if (!globalPrompt && !folderOperation) {
    throw new Error('Either globalPrompt or folderOperation must be provided');
  }

  // No global: use folder only
  if (!globalPrompt) {
    return folderOperation!;
  }

  // No folder or "only" mode: use global only
  if (!folderOperation || combinationMode === 'only') {
    return globalPrompt;
  }

  // Combine based on mode with clear separator
  if (combinationMode === 'prefix') {
    return `${globalPrompt}\n\n${folderOperation}`;
  }

  if (combinationMode === 'suffix') {
    return `${folderOperation}\n\n${globalPrompt}`;
  }

  // Fallback (should never reach here)
  return folderOperation;
}
