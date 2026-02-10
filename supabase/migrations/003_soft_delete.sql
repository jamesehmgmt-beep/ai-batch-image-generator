-- Migration: Soft delete for generations
-- Phase: 12-delete-generations
-- Purpose: Add deleted_at column, partial indexes, and atomic counter decrement function
-- Date: 2026-01-27

-- Add deleted_at column to generations table
ALTER TABLE generations
ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Add partial index for efficient filtering of non-deleted records
-- This index is only used for queries filtering WHERE deleted_at IS NULL
CREATE INDEX idx_generations_not_deleted
ON generations(job_id)
WHERE deleted_at IS NULL;

-- Create atomic counter decrement function
-- This ensures job.completed_generations is updated atomically when a completed generation is deleted
CREATE OR REPLACE FUNCTION decrement_job_generation_count(
  p_job_id UUID
) RETURNS void AS $$
BEGIN
  UPDATE jobs
  SET completed_generations = GREATEST(completed_generations - 1, 0)
  WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION decrement_job_generation_count(UUID) TO authenticated;
