-- Migration: Jobs and Generations Tables
-- Purpose: Queue processing foundation for image generation tracking
-- Created: 2026-01-25

-- Jobs table: Parent job records that group multiple generations
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  parsed_job JSONB NOT NULL,
  total_generations INTEGER NOT NULL DEFAULT 0,
  completed_generations INTEGER NOT NULL DEFAULT 0,
  failed_generations INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  estimated_cost DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for jobs table
CREATE INDEX idx_jobs_session_id ON jobs(session_id);
CREATE INDEX idx_jobs_state ON jobs(state);

-- Generations table: Individual image generation records
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  folder_path TEXT NOT NULL,
  operation TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'completed', 'failed')),
  task_id TEXT,
  result_url TEXT,
  source_file_name TEXT NOT NULL,
  reference_image_urls JSONB NOT NULL DEFAULT '[]',
  resolution TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  photo_mode TEXT NOT NULL,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Indexes for generations table
CREATE INDEX idx_generations_job_id ON generations(job_id);
CREATE INDEX idx_generations_state ON generations(state);
CREATE INDEX idx_generations_task_id ON generations(task_id);
