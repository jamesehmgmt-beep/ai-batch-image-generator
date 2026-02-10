// lib/ai/schemas/job.ts
import { z } from 'zod';

// Photo mode: how the image is used in generation
export const PhotoModeSchema = z.enum(['reference', 'analysis']);

// Model selection schema
export const ModelSchema = z.enum(['nano-banana-pro', 'seedream-4.5-edit'])
  .default('nano-banana-pro');

// Seedream quality tiers
export const SeedreamQualitySchema = z.enum(['basic', 'high'])
  .default('basic');

// Seedream image size presets - maps to aspect ratios
export const SeedreamImageSizeSchema = z.enum([
  'square_1_1',     // 1:1
  'portrait_3_4',   // 3:4
  'portrait_9_16',  // 9:16
  'landscape_4_3',  // 4:3
  'landscape_16_9', // 16:9
]).optional();

// Resolution options (kie.ai supported) - Nano Banana only
// Accept any case, normalize later - transform+pipe doesn't convert well to JSON Schema
export const ResolutionSchema = z.enum(['1K', '2K', '4K', '1k', '2k', '4k'])
  .transform((val) => val.toUpperCase() as '1K' | '2K' | '4K')
  .optional();

// Aspect ratio options (kie.ai supported)
export const AspectRatioSchema = z.enum([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'
]);

// Prompt mode: global prompt or per-folder prompts
export const PromptModeSchema = z.enum(['global', 'per-folder'])
  .default('global')
  .describe('Whether using one global prompt or per-folder prompts');

// How to combine global and folder prompts when both exist
export const PromptCombinationModeSchema = z.enum(['prefix', 'suffix', 'only'])
  .default('prefix')
  .describe('How to combine global with folder prompts: prefix=global first, suffix=global last, only=ignore folder');

// ===== Per-Image Operation Schemas =====
// Allows assigning different models to individual images within a folder
// NOTE: Declared here before BaseFolderOperationSchema to avoid forward reference

// Base schema for per-image operations
const BaseImageOperationSchema = z.object({
  fileName: z.string().describe('Specific file like "X.jpg" or "product-1.png"'),
  operation: z.string().optional().describe('Override folder operation for this file'),
});

// Nano Banana Pro specific image operation
const NanoBananaImageSchema = BaseImageOperationSchema.extend({
  model: z.literal('nano-banana-pro'),
  resolution: ResolutionSchema.default('2K'),
  // Seedream fields explicitly undefined for this model
  quality: z.undefined().optional(),
  imageSize: z.undefined().optional(),
});

// Seedream 4.5 Edit specific image operation
const SeedreamImageSchema = BaseImageOperationSchema.extend({
  model: z.literal('seedream-4.5-edit'),
  quality: SeedreamQualitySchema.default('basic'),
  imageSize: SeedreamImageSizeSchema.default('landscape_16_9'),
  // Nano Banana fields explicitly undefined for this model
  resolution: z.undefined().optional(),
});

// Discriminated union for per-image model-specific validation
export const ImageOperationSchema = z.discriminatedUnion('model', [
  NanoBananaImageSchema,
  SeedreamImageSchema,
]);

// Type inference from discriminated union
export type ImageOperation = z.infer<typeof ImageOperationSchema>;

// Base schema for common folder operation fields
const BaseFolderOperationSchema = z.object({
  folderPath: z.string().describe('Path to the folder, e.g., "5" or "products/summer"'),
  operation: z.string().describe('What to do with images - the generation prompt for this folder'),
  excludedFiles: z.array(z.string()).optional().describe('Files to exclude, e.g., ["no.jpg", "test.jpg"]'),
  photoMode: PhotoModeSchema.describe('reference = use photo as-is in generation, analysis = AI examines photo content first'),
  aspectRatio: AspectRatioSchema.describe('Output aspect ratio'),
  generationCount: z.number().int().min(1).max(100).optional().describe('Number of images to generate. If specified, generates this many total (not per input). If not specified, generates 1 per input image.'),
  imageOperations: z.array(ImageOperationSchema).optional()
    .describe('Per-image overrides: different models or settings for specific files. Mutually exclusive with excludedFiles - if imageOperations exists, only those files are processed.'),
});

// Nano Banana Pro specific schema
const NanoBananaFolderSchema = BaseFolderOperationSchema.extend({
  model: z.literal('nano-banana-pro'),
  resolution: ResolutionSchema.default('2K'),
  // Seedream fields explicitly undefined for this model
  quality: z.undefined().optional(),
  imageSize: z.undefined().optional(),
});

// Seedream 4.5 Edit specific schema
const SeedreamFolderSchema = BaseFolderOperationSchema.extend({
  model: z.literal('seedream-4.5-edit'),
  quality: SeedreamQualitySchema.default('basic'),
  imageSize: SeedreamImageSizeSchema.default('landscape_16_9'),
  // Nano Banana fields explicitly undefined for this model
  resolution: z.undefined().optional(),
});

// Discriminated union for model-specific validation
// Uses 'model' field as discriminator for O(1) schema selection
export const FolderOperationSchema = z.discriminatedUnion('model', [
  NanoBananaFolderSchema,
  SeedreamFolderSchema,
]);

// Type inference from discriminated union
export type FolderOperation = z.infer<typeof FolderOperationSchema>;

// Clarifying question structure
export const ClarifyingQuestionSchema = z.object({
  question: z.string().describe('The question to ask the user'),
  context: z.string().optional().describe('Why this question is being asked'),
  options: z.array(z.string()).optional().describe('Suggested options if applicable'),
});

// Complete parsed job schema - this is what Claude returns
export const ParsedJobSchema = z.object({
  understood: z.boolean().describe('True if AI fully understands the request and can create a job'),
  confidence: z.number().min(0).max(1).describe('Confidence level 0-1 in the interpretation'),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).optional()
    .describe('Questions to ask if understood=false or confidence is low'),
  interpretation: z.string().optional()
    .describe('Human-readable summary of what the AI understood'),
  job: z.object({
    folders: z.array(FolderOperationSchema),
    globalPrompt: z.string().optional().describe('Prompt text applied to all generations'),
    model: ModelSchema.describe('Default model for this job'),
    promptMode: PromptModeSchema,
    globalPromptMode: PromptCombinationModeSchema.optional(),
    // Accept any case, normalize later
    outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg'])
      .optional()
      .transform((val) => (val ? val.toUpperCase() as 'PNG' | 'JPG' : 'PNG'))
      .describe('Output image format'),
  }).optional().describe('Parsed job structure - only present when understood=true'),
});

// Response type for clarification flow
export const ClarificationResponseSchema = z.object({
  understood: z.literal(false),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).min(1),
  interpretation: z.string(),
});

// Response type for confirmed understanding
export const ConfirmedJobSchema = z.object({
  understood: z.literal(true),
  confidence: z.number().min(0.8),
  interpretation: z.string(),
  job: z.object({
    folders: z.array(FolderOperationSchema).min(1),
    globalPrompt: z.string().optional(),
    model: ModelSchema,
    promptMode: PromptModeSchema,
    globalPromptMode: PromptCombinationModeSchema.optional(),
    outputFormat: z.enum(['PNG', 'JPG', 'png', 'jpg'])
      .optional()
      .transform((val) => (val ? val.toUpperCase() as 'PNG' | 'JPG' : 'PNG')),
  }),
});
