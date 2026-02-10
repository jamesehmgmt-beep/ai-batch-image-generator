-- Migration: 004_add_prompt_column.sql
-- Purpose: Add per-generation prompt storage for v4.0 Per-Generation Prompts
-- Phase: 25 (Schema & Storage)
-- Safety: Nullable column, zero downtime, no backfill required

ALTER TABLE generations
ADD COLUMN prompt TEXT NULL;

COMMENT ON COLUMN generations.prompt IS
  'AI-generated prompt specific to this generation. NULL for legacy records (fall back to operation field). Added in Phase 25 for v4.0 Per-Generation Prompts milestone.';
