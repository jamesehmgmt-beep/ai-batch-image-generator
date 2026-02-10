// lib/types/job.ts
import { z } from 'zod';
import {
  ParsedJobSchema,
  FolderOperationSchema,
  ImageOperationSchema,
  ClarifyingQuestionSchema,
  PhotoModeSchema,
  ResolutionSchema,
  AspectRatioSchema,
} from '@/lib/ai/schemas/job';

// Inferred types from Zod schemas
export type ParsedJob = z.infer<typeof ParsedJobSchema>;
export type FolderOperation = z.infer<typeof FolderOperationSchema>;
export type ImageOperation = z.infer<typeof ImageOperationSchema>;
export type ClarifyingQuestion = z.infer<typeof ClarifyingQuestionSchema>;
export type PhotoMode = z.infer<typeof PhotoModeSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

// Conversation message for multi-turn AI interaction
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Conversation state machine
export type ConversationState =
  | 'awaiting_prompt'      // User hasn't entered a prompt yet
  | 'parsing'              // AI is processing the prompt
  | 'clarifying'           // AI asked questions, awaiting answers
  | 'awaiting_confirmation' // Parsed job shown, awaiting user confirmation
  | 'editing'              // User is editing the parsed job
  | 'confirmed';           // User confirmed, ready for execution

// Full conversation context for state management
export interface ConversationContext {
  state: ConversationState;
  messages: ConversationMessage[];
  parsedJob: ParsedJob | null;
  uploadedFolders: string[];  // Folder paths from upload phase
  fileCountByFolder: Record<string, number>;  // For cost estimation
}

// Job stored in database
export interface StoredJob {
  id: string;
  sessionId: string;  // Links to upload session
  conversation: ConversationMessage[];
  state: ConversationState;
  parsedJob: ParsedJob | null;
  estimatedCost: number | null;
  photoCount: number | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
}
