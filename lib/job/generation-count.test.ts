import { describe, it, expect } from 'vitest';
import { calculateGenerationCount } from './generation-count';

describe('calculateGenerationCount', () => {
  // generationCount is now a MULTIPLIER (e.g., "4 variations per image")
  it('should multiply files by generationCount (variations per image)', () => {
    const folder = {
      generationCount: 4,
    };
    const result = calculateGenerationCount(folder, 14);
    expect(result).toBe(56); // 14 files × 4 variations = 56
  });

  it('should multiply files by generationCount when provided', () => {
    const folder = {
      generationCount: 5,
    };
    const result = calculateGenerationCount(folder, 10);
    expect(result).toBe(50); // 10 files × 5 variations = 50
  });

  it('should ignore zero generationCount and fall through to default', () => {
    const folder = {
      generationCount: 0,
    };
    const result = calculateGenerationCount(folder, 10);
    expect(result).toBe(10); // Falls through to 1 per file
  });

  it('should prioritize imageOperations over generationCount', () => {
    // When imageOperations specified, generationCount is ignored
    // (per-image operations take precedence)
    const folder = {
      generationCount: 10,
      imageOperations: [{ fileName: 'a.jpg' }],
    };
    const result = calculateGenerationCount(folder, 5);
    expect(result).toBe(1); // imageOperations takes priority
  });

  it('should use imageOperations.length when specified', () => {
    const folder = {
      imageOperations: [{ fileName: 'a.jpg' }, { fileName: 'b.jpg' }],
    };
    const result = calculateGenerationCount(folder, 10);
    expect(result).toBe(2);
  });

  it('should fall through to default when imageOperations is empty array', () => {
    const folder = {
      imageOperations: [],
    };
    const result = calculateGenerationCount(folder, 5);
    expect(result).toBe(5); // Falls through to totalFiles - 0 excluded
  });

  it('should default to totalFiles - excludedFiles.length', () => {
    const folder = {
      excludedFiles: ['skip.jpg', 'test.jpg'],
    };
    const result = calculateGenerationCount(folder, 10);
    expect(result).toBe(8);
  });

  it('should apply generationCount multiplier after exclusions', () => {
    const folder = {
      generationCount: 4,
      excludedFiles: ['skip.jpg', 'test.jpg'],
    };
    const result = calculateGenerationCount(folder, 10);
    expect(result).toBe(32); // (10 - 2) × 4 = 32
  });

  it('should return totalFiles when no excludedFiles', () => {
    const folder = {};
    const result = calculateGenerationCount(folder, 5);
    expect(result).toBe(5);
  });

  it('should handle undefined excludedFiles', () => {
    const folder = {
      excludedFiles: undefined,
    };
    const result = calculateGenerationCount(folder, 7);
    expect(result).toBe(7);
  });

  it('should return 0 when exclusions exceed total files', () => {
    const folder = {
      excludedFiles: ['a.jpg', 'b.jpg', 'c.jpg'],
    };
    const result = calculateGenerationCount(folder, 2);
    expect(result).toBe(0); // Math.max(0, 2-3) = 0
  });

  it('should handle zero totalFiles', () => {
    const folder = {};
    const result = calculateGenerationCount(folder, 0);
    expect(result).toBe(0);
  });

  it('should handle generationCount with zero totalFiles', () => {
    const folder = {
      generationCount: 4,
    };
    const result = calculateGenerationCount(folder, 0);
    expect(result).toBe(0); // 0 × 4 = 0
  });
});
