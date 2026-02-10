---
phase: 06-results-export
plan: 04
status: complete
commits: ["c36404f", "d10da2e"]
---

## Summary

Integrated all Phase 6 features: updated download endpoint to use correct file extensions based on output format, enhanced results page with format badge display.

## What Was Built

### Task 1: Download Endpoint File Extensions
- Modified `app/api/job/[jobId]/download/route.ts`
- Fetches job record to get outputFormat from parsed_job
- ZIP entries now use correct extension (.png or .jpg) matching generation format

### Task 2: Results Page Format Display
- Enhanced `app/(protected)/job/results/[jobId]/page.tsx`
- Added output format badge in header area
- Created job details API endpoint at `app/api/job/[jobId]/route.ts`
- Single-image downloads use correct file extension

## Verification

User verified complete Phase 6 functionality:
- Format selection on cost page (PNG/JPEG toggle)
- Streaming ZIP downloads with archiver
- Job history page with pagination and thumbnails
- Correct file extensions in downloads
- Output format badge on results page
- Navigation links working

## Files Modified

| File | Change |
|------|--------|
| app/api/job/[jobId]/download/route.ts | Query job for outputFormat, use correct extension |
| app/(protected)/job/results/[jobId]/page.tsx | Add format badge, fetch job details |
| app/api/job/[jobId]/route.ts | New endpoint for job details |

## Deviations

None - executed as planned.
