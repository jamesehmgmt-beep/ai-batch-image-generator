// lib/types/generation.ts
import { ParsedJob, AspectRatio } from './job';
import { ModelId } from '@/lib/models/types';

// Generation state machine - string literals for database compatibility
export enum GenerationState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Generation job input to queue
export interface GenerationJob {
  id: string; // UUID
  jobId: string; // Parent job UUID
  folderPath: string;
  operation: string; // The prompt text (folder-level, legacy)
  prompt?: string; // Per-generation prompt (optional, v4.0+)
  model: ModelId; // Model to use for this generation
  resolution?: '1K' | '2K' | '4K'; // Nano Banana only
  aspectRatio: AspectRatio;
  photoMode: 'reference' | 'analysis';
  outputFormat: 'PNG' | 'JPG';
  referenceImageUrls: string[]; // Supabase storage URLs, max 8
  sourceFileName: string; // Original file being processed
  // Seedream-specific fields
  quality?: 'basic' | 'high';
  imageSize?: string;
}

// Generation record (database row)
export interface GenerationRecord {
  id: string; // UUID
  job_id: string; // FK to jobs table
  folder_path: string;
  operation: string; // Folder-level operation (legacy)
  prompt: string | null; // Per-generation prompt (nullable for backward compat)
  state: GenerationState;
  task_id: string | null; // kie.ai taskId after submission
  result_url: string | null; // kie.ai result after completion
  source_file_name: string;
  reference_image_urls: string[]; // JSON array in DB
  model: string; // Model used for this generation
  resolution: string | null; // Nano Banana only
  aspect_ratio: string;
  photo_mode: string;
  quality: string | null; // Seedream only
  image_size: string | null; // Seedream only
  error_message: string | null;
  retry_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Job record (parent job database row)
export interface JobRecord {
  id: string; // UUID
  session_id: string; // Links to upload session
  parsed_job: ParsedJob; // JSON - the ParsedJob from Phase 2
  model: string; // Default model for this job
  total_generations: number;
  completed_generations: number;
  failed_generations: number;
  state: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  estimated_cost: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// Enhanced generation status for UI display
export interface GenerationStatus {
  id: string;
  state: GenerationState;
  taskId: string | null;
  resultUrl: string | null;
  sourceFileName: string;
  folderPath: string;
  model: string;
  retryCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// Summary of job progress including retry information
export interface JobProgressSummary {
  total: number;
  percentage: number;
  completed: number;
  failed: number;
  pending: number;
  processing: number;
  totalRetryAttempts: number;
  generationsCurrentlyRetrying: number;
}

// Full status API response
export interface JobStatusResponse {
  success: boolean;
  job: {
    id: string;
    state: string;
    totalGenerations: number;
    completedGenerations: number;
    failedGenerations: number;
    startedAt: string | null;
    completedAt: string | null;
  };
  progress: JobProgressSummary;
  generations: GenerationStatus[];
  results?: {
    successfulUrls: string[];
    failedCount: number;
  };
}
