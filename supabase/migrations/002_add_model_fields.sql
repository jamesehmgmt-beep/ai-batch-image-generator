-- Migration: Add Model Selection and Seedream-Specific Fields
-- Purpose: Enable multi-model support by persisting model selection and model-specific parameters
-- Created: 2026-01-26
-- Safety: Uses constant defaults (metadata-only in PostgreSQL 11+), zero downtime for existing rows

-- ============================================================================
-- 1. Add model column to jobs table
-- ============================================================================
ALTER TABLE jobs
ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro';

-- ============================================================================
-- 2. Add model column to generations table
-- ============================================================================
ALTER TABLE generations
ADD COLUMN model TEXT NOT NULL DEFAULT 'nano-banana-pro';

-- ============================================================================
-- 3. Add Seedream-specific columns to generations table
-- ============================================================================
-- These columns are nullable because they only apply to Seedream generations
ALTER TABLE generations
ADD COLUMN quality TEXT,
ADD COLUMN image_size TEXT;

-- ============================================================================
-- 4. Add CHECK constraints for model validation
-- ============================================================================
-- Validate model values match ModelId type from lib/models/types.ts
ALTER TABLE jobs
ADD CONSTRAINT check_jobs_model
CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

ALTER TABLE generations
ADD CONSTRAINT check_generations_model
CHECK (model IN ('nano-banana-pro', 'seedream-4.5-edit'));

-- Validate Seedream quality tier values
ALTER TABLE generations
ADD CONSTRAINT check_generations_quality
CHECK (quality IS NULL OR quality IN ('basic', 'high'));

-- ============================================================================
-- 5. Add indexes for model-based queries
-- ============================================================================
-- Index for filtering jobs by model
CREATE INDEX idx_jobs_model ON jobs(model);

-- Index for filtering generations by model
CREATE INDEX idx_generations_model ON generations(model);

-- Composite index for common query pattern (filter by model and state)
CREATE INDEX idx_generations_model_state ON generations(model, state);
