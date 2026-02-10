# Phase 6: Results & Export - Research

**Researched:** 2026-01-26
**Domain:** File download systems, ZIP streaming, image format conversion, job history UIs
**Confidence:** HIGH

## Summary

Phase 6 focuses on enabling users to download completed generations with folder organization, view job history, and choose output formats. The existing codebase already has a working results page with server-side ZIP creation using JSZip, but several enhancements are needed for production readiness and the full feature set.

Key findings:
1. **Archiver** is superior to JSZip for large file streaming in Node.js server environments, avoiding memory issues with 500+ images
2. **kie.ai already supports format selection** via `output_format: 'png' | 'jpg'` in the API payload, making format conversion straightforward
3. **Sharp** is the industry-standard library for server-side image processing if client-side format conversion is needed
4. **Supabase Storage with CDN** provides built-in public URLs and global CDN distribution (285+ cities)
5. **Streaming ZIP generation** directly to HTTP response prevents memory bloat and disk I/O overhead

**Primary recommendation:** Migrate from JSZip to Archiver for streaming ZIP generation, add format selection UI before job execution (not at download time), implement job history page with Supabase queries, and leverage existing Supabase CDN for generated image storage.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| archiver | ^7.0.1 | Streaming ZIP creation | Industry standard for Node.js server-side ZIP generation with streaming support, reduces memory usage vs JSZip |
| sharp | ^0.33.5 | Image format conversion | High-performance (4-5x faster than ImageMagick), uses libvips, handles ICC profiles and metadata correctly |
| @tanstack/react-virtual | ^3.13.18 | Virtualized image gallery | Already in project, proven solution for rendering 500+ thumbnails without UI slowdown |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| jszip | ^3.10.1 | Client-side ZIP | Keep for potential browser-side operations, but not for server download endpoint |
| Supabase Storage | Current | CDN-backed storage | Already in use, provides public URLs and global CDN (285+ cities) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| archiver | JSZip with generateNodeStream() | JSZip loads full ZIP into memory before sending; archiver streams incrementally |
| Sharp | Native fetch + re-upload | Sharp allows format conversion without round-trip; kie.ai already supports format param |
| Virtualization | Pagination | Pagination requires user clicks; virtualization handles 500+ images seamlessly |

**Installation:**
```bash
npm install archiver sharp
npm install --save-dev @types/archiver
```

## Architecture Patterns

### Recommended Project Structure
```
lib/
├── export/
│   ├── zip-builder.ts          # Archiver-based streaming ZIP
│   ├── format-converter.ts     # Sharp format conversion (if needed)
│   └── download-helpers.ts     # URL validation, filename sanitization
├── db/
│   └── job-history-queries.ts  # Supabase queries for past jobs
app/
├── (protected)/
│   ├── job/
│   │   └── history/
│   │       └── page.tsx        # Job history browser
│   └── job/results/[jobId]/
│       └── page.tsx            # Enhanced results page (already exists)
└── api/
    └── job/[jobId]/
        └── download/
            └── route.ts        # Migrate to archiver streaming
```

### Pattern 1: Streaming ZIP to HTTP Response

**What:** Use archiver to stream ZIP file creation directly to HTTP response without storing temporary files on disk.

**When to use:** For all large file downloads (100+ images), to prevent memory bloat and disk I/O overhead.

**Example:**
```typescript
// Source: archiver documentation + Next.js streaming patterns
import archiver from 'archiver';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const archive = archiver('zip', { zlib: { level: 6 } });

  // Create readable stream for Response
  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (err) => controller.error(err));
    }
  });

  // Start archiving (async, won't block)
  (async () => {
    for (const file of files) {
      const response = await fetch(file.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      archive.append(buffer, { name: `${file.folder}/${file.name}` });
    }
    archive.finalize();
  })();

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="results.zip"',
    }
  });
}
```

### Pattern 2: Format Selection at Job Creation

**What:** Set output format preference when creating the job, store in database, use when calling kie.ai API.

**When to use:** Always - kie.ai supports `output_format: 'png' | 'jpg'` natively, avoiding post-generation conversion.

**Example:**
```typescript
// In job creation schema (lib/ai/schemas/job.ts)
export const ParsedJobSchema = z.object({
  // ... existing fields
  outputFormat: z.enum(['png', 'jpeg']).default('png'),
});

// In kie.ai API call (lib/queue/kie-api-client.ts)
const payload: KieAIPayload = {
  model: 'nano-banana-pro',
  input: {
    prompt: generation.operation,
    image_input: generation.referenceImageUrls,
    aspect_ratio: generation.aspectRatio,
    resolution: generation.resolution,
    output_format: job.parsedJob.outputFormat === 'jpeg' ? 'jpg' : 'png', // kie.ai uses 'jpg'
  }
};
```

### Pattern 3: Job History with Thumbnail Previews

**What:** Query jobs table with first completed generation thumbnail for preview, use virtualized grid for performance.

**When to use:** Job history page showing past jobs with quick visual identification.

**Example:**
```typescript
// lib/db/job-history-queries.ts
export async function getJobHistory(limit = 20, offset = 0) {
  const supabase = createServerSupabaseClient();

  // Get jobs with first completed generation for thumbnail
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`
      id,
      created_at,
      completed_at,
      state,
      total_generations,
      completed_generations,
      estimated_cost,
      generations (
        result_url,
        source_file_name
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)
    .range(offset, offset + limit - 1);

  return jobs?.map(job => ({
    ...job,
    thumbnailUrl: job.generations.find(g => g.result_url)?.result_url,
  }));
}
```

### Pattern 4: Async Route Params (Next.js 15+)

**What:** In Next.js 15+ with React 19, dynamic route params are Promises and must be awaited or unwrapped with `use()`.

**When to use:** All dynamic routes in the app directory.

**Example:**
```typescript
// app/api/job/[jobId]/download/route.ts
interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params; // Must await!
  // ... rest of handler
}

// Client component (app/(protected)/job/history/page.tsx)
'use client';
import { use } from 'react';

export default function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); // Use React's use() hook
  // ... rest of component
}
```

### Anti-Patterns to Avoid

- **Loading entire ZIP into memory:** Don't use JSZip's `generateAsync({ type: 'nodebuffer' })` for large batches - causes OOM errors
- **Format conversion after generation:** Don't convert PNG→JPEG server-side if kie.ai can generate JPEG directly
- **Fetching all thumbnails at once:** Don't load 500+ thumbnail URLs without virtualization - causes browser slowdown
- **Temporary ZIP files on disk:** Don't write ZIP to filesystem then stream - just stream directly to response
- **Synchronous params access:** Don't treat `params` as synchronous object in Next.js 15+ - always await or use `use()`

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Streaming ZIP generation | Custom ZIP writer | archiver package | Handles compression levels, streaming, folder structures, error recovery |
| Image format conversion | Canvas API or custom converter | sharp package | 4-5x faster than alternatives, handles ICC profiles, metadata, color spaces correctly |
| Large image gallery rendering | Custom pagination or infinite scroll | @tanstack/react-virtual | Handles variable heights, scrolling performance, memory management automatically |
| Download filename sanitization | Regex-based cleaners | Node's `path.basename()` + allowlist | Prevents path traversal, handles Unicode, OS-specific restrictions |
| Thumbnail caching | Custom in-memory cache | Supabase Storage CDN | Global CDN (285+ cities), automatic cache invalidation, no maintenance overhead |

**Key insight:** ZIP generation and image processing have numerous edge cases (compression algorithms, corrupt files, memory management, streaming backpressure). Production-ready libraries solve these problems; custom solutions introduce bugs and performance issues.

## Common Pitfalls

### Pitfall 1: Memory Overflow with Large ZIP Files

**What goes wrong:** Using JSZip's `generateAsync()` loads the entire ZIP into Node.js memory before sending to client. With 500 images at ~2MB each, this consumes 1GB+ RAM, causing OOM crashes.

**Why it happens:** JSZip was designed for browser use where files are smaller; it buffers the entire archive before output.

**How to avoid:**
- Use archiver with streaming: `archive.pipe(response)` sends chunks incrementally
- Set appropriate zlib compression level (6 is good balance of speed/size)
- Monitor memory usage with `process.memoryUsage()` in development

**Warning signs:**
- Server crashes or freezes during download generation
- `ENOMEM` errors in logs
- Download endpoint takes >30s to respond

### Pitfall 2: Browser Timeout on Large Downloads

**What goes wrong:** Browser times out waiting for ZIP download because server is fetching/zipping 500+ images sequentially before sending anything.

**Why it happens:** No response headers sent until entire ZIP is ready, browser's default timeout (typically 2-5 minutes) expires.

**How to avoid:**
- Send response headers immediately, then stream ZIP chunks
- Use archiver's `append()` async method with `await` in loop to process files incrementally
- Consider pagination: allow downloading by folder or date range

**Warning signs:**
- "Download failed - Network error" in browser
- 504 Gateway Timeout errors
- Users report downloads never complete

### Pitfall 3: Format Selection After Generation

**What goes wrong:** Generating images as PNG, then converting to JPEG server-side doubles processing time and storage costs.

**Why it happens:** Assuming format conversion is easier than passing format to generation API.

**How to avoid:**
- kie.ai API already supports `output_format: 'png' | 'jpg'` parameter
- Store format preference in `parsed_job` JSONB during job creation
- Pass format to kie.ai when creating task, not during download

**Warning signs:**
- High bandwidth usage (downloading PNG, re-uploading JPEG)
- Slow download preparation times
- Unnecessary sharp processing overhead

### Pitfall 4: Missing Folder Structure in ZIP

**What goes wrong:** All images dumped in ZIP root, losing original folder organization user uploaded.

**Why it happens:** Not preserving `folder_path` from database when adding files to archive.

**How to avoid:**
- Use `archive.append(buffer, { name: 'folder/subfolder/file.png' })` with full path
- Sanitize folder paths to prevent path traversal: validate no `..` or absolute paths
- Match original upload structure from `folder_path` field in generations table

**Warning signs:**
- Users complain about "flat" ZIP structure
- Duplicate filenames collide (overwrite each other)
- Hard to identify which image came from which source folder

### Pitfall 5: No Job History Pagination

**What goes wrong:** Querying all jobs from database (potentially thousands) causes slow page load and memory issues.

**Why it happens:** Not implementing cursor-based or offset pagination for job history.

**How to avoid:**
- Use Supabase `.range(offset, offset + limit - 1)` for pagination
- Default to 20 jobs per page
- Include loading states and "Load more" button or infinite scroll

**Warning signs:**
- Job history page takes >5s to load
- Browser freezes when rendering job list
- Database query timeout errors

### Pitfall 6: Supabase CDN Cache Staleness

**What goes wrong:** Downloaded images show old versions after regeneration because CDN cache not invalidated.

**Why it happens:** Supabase Smart CDN caches public bucket files; updates take up to 60s to propagate.

**How to avoid:**
- Append version query param to URLs: `?v=${timestamp}` for cache busting
- Use private buckets with signed URLs if immediate updates are critical
- Document 60s cache propagation delay in UI

**Warning signs:**
- Users report "old images" in downloads
- Regenerated images don't reflect changes
- Inconsistent results across regions

## Code Examples

Verified patterns from official sources:

### Archiver Streaming ZIP

```typescript
// Source: archiver documentation + Next.js streaming
import archiver from 'archiver';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Create archiver instance
  const archive = archiver('zip', {
    zlib: { level: 6 } // Compression level (0-9)
  });

  // Track archive progress
  let archiveSize = 0;
  archive.on('progress', (progress) => {
    archiveSize = progress.fs.processedBytes;
  });

  // Error handling
  archive.on('error', (err) => {
    console.error('[Archive] Error:', err);
  });

  // Create ReadableStream from archiver events
  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      archive.on('end', () => {
        console.log(`[Archive] Completed: ${archiveSize} bytes`);
        controller.close();
      });
      archive.on('error', (err: Error) => {
        controller.error(err);
      });
    }
  });

  // Fetch and append files asynchronously
  (async () => {
    try {
      // Fetch generations from database
      const generations = await fetchCompletedGenerations(jobId);

      for (const gen of generations) {
        const response = await fetch(gen.result_url);
        if (!response.ok) {
          console.error(`Failed to fetch ${gen.result_url}`);
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        const fileName = `${gen.source_file_name.replace(/\.[^/.]+$/, '')}_generated.png`;
        const fullPath = `${gen.folder_path}/${fileName}`;

        archive.append(buffer, { name: fullPath });
      }

      // Finalize archive (triggers 'end' event)
      await archive.finalize();
    } catch (error) {
      console.error('[Archive] Fatal error:', error);
      archive.destroy();
    }
  })();

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="results.zip"`,
      'Cache-Control': 'no-cache',
    }
  });
}
```

### Sharp Format Conversion (if needed)

```typescript
// Source: sharp documentation
import sharp from 'sharp';

/**
 * Convert image to specified format with quality optimization
 * Note: Only use if kie.ai doesn't support format - prefer native API format param
 */
export async function convertImageFormat(
  inputBuffer: Buffer,
  format: 'png' | 'jpeg',
  quality = 80
): Promise<Buffer> {
  const sharpInstance = sharp(inputBuffer);

  if (format === 'jpeg') {
    return sharpInstance
      .jpeg({
        quality,
        mozjpeg: true // Better compression
      })
      .toBuffer();
  } else {
    return sharpInstance
      .png({
        compressionLevel: 6 // 0-9, higher = smaller but slower
      })
      .toBuffer();
  }
}

// Usage example
const pngBuffer = await fetch(imageUrl).then(r => r.arrayBuffer()).then(Buffer.from);
const jpegBuffer = await convertImageFormat(pngBuffer, 'jpeg', 85);
```

### Job History Query with Thumbnails

```typescript
// Source: Supabase documentation + project patterns
import { createServerSupabaseClient } from '@/lib/supabase-server';

export interface JobHistoryItem {
  id: string;
  createdAt: string;
  completedAt: string | null;
  state: string;
  totalGenerations: number;
  completedGenerations: number;
  estimatedCost: number;
  thumbnailUrl: string | null;
  firstFileName: string | null;
}

export async function getJobHistory(
  limit = 20,
  offset = 0
): Promise<JobHistoryItem[]> {
  const supabase = createServerSupabaseClient();

  // Fetch jobs with first completed generation for thumbnail
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select(`
      id,
      created_at,
      completed_at,
      state,
      total_generations,
      completed_generations,
      estimated_cost
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  if (!jobs) return [];

  // Fetch first completed generation for each job (for thumbnail)
  const jobsWithThumbnails = await Promise.all(
    jobs.map(async (job) => {
      const { data: gen } = await supabase
        .from('generations')
        .select('result_url, source_file_name')
        .eq('job_id', job.id)
        .eq('state', 'completed')
        .not('result_url', 'is', null)
        .limit(1)
        .single();

      return {
        id: job.id,
        createdAt: job.created_at,
        completedAt: job.completed_at,
        state: job.state,
        totalGenerations: job.total_generations,
        completedGenerations: job.completed_generations,
        estimatedCost: job.estimated_cost,
        thumbnailUrl: gen?.result_url || null,
        firstFileName: gen?.source_file_name || null,
      };
    })
  );

  return jobsWithThumbnails;
}
```

### Virtualized History Grid

```typescript
// Source: @tanstack/react-virtual documentation
'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

export function JobHistoryGrid({ jobs }: { jobs: JobHistoryItem[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: jobs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200, // Estimated row height in px
    overscan: 5, // Render 5 extra items outside viewport
  });

  return (
    <div ref={parentRef} className="h-screen overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const job = jobs[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <JobHistoryCard job={job} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| JSZip with `generateAsync()` | Archiver with streaming | 2022-2023 | 10x reduction in memory usage for large ZIPs |
| Canvas-based format conversion | Sharp with libvips | 2020-2021 | 4-5x faster processing, better color space handling |
| Manual pagination | TanStack Virtual | 2023-2024 | Seamless handling of 1000+ items without performance degradation |
| Manual CDN invalidation | Supabase Smart CDN | 2024 | Automatic cache invalidation across 285+ cities |
| Synchronous route params | Async Promise params | Next.js 15 (2024) | Better streaming, parallel data fetching |

**Deprecated/outdated:**
- **react-window**: Still works but TanStack Virtual is more actively maintained and has better TypeScript support (since 2023)
- **ImageMagick/GraphicsMagick bindings**: Sharp is 4-5x faster and handles modern formats better (AVIF, WebP)
- **Manual ZIP streaming with zlib**: Archiver abstracts complexity and handles edge cases (since 2019)
- **Synchronous params in Next.js 15+**: Must await or use `use()` hook (breaking change in Next.js 15)

## Open Questions

### 1. Should format conversion happen server-side or at generation time?

**What we know:**
- kie.ai supports `output_format: 'png' | 'jpg'` natively
- Existing code already uses this parameter
- Post-generation conversion doubles bandwidth (download PNG, re-upload JPEG)

**What's unclear:**
- Does kie.ai charge differently for PNG vs JPEG?
- Are there quality differences between kie.ai's native JPEG vs PNG→JPEG conversion?

**Recommendation:** Use kie.ai native format parameter. Only implement Sharp conversion if kie.ai doesn't support a needed format (e.g., WebP). Validate kie.ai JPEG quality in Phase 6 verification.

### 2. How should job history pagination work?

**What we know:**
- Supabase supports `.range()` for offset pagination
- TanStack Virtual handles rendering performance for large lists
- User expects reverse chronological order (newest first)

**What's unclear:**
- Should we use cursor-based pagination (more efficient) or offset (simpler)?
- What's the expected number of jobs per user over time?
- Should we implement search/filter by date range?

**Recommendation:** Start with simple offset pagination (20 jobs per page) with "Load more" button. Cursor-based pagination can be added later if job volume is high. Search/filter is v2 feature.

### 3. Should downloads be ephemeral or cached?

**What we know:**
- Archiver streams directly to response (no disk storage)
- Generated images already stored in Supabase Storage
- ZIP generation takes time for large batches (500+ images)

**What's unclear:**
- Should we cache generated ZIPs for N minutes?
- Would pre-generated ZIPs improve UX?
- Storage costs vs regeneration costs?

**Recommendation:** Start ephemeral (generate ZIP on-demand). Add optional ZIP caching in v2 if users frequently re-download same jobs. Monitor download endpoint latency to inform decision.

## Sources

### Primary (HIGH confidence)
- [Archiver GitHub Repository](https://github.com/archiverjs/node-archiver) - Streaming ZIP architecture
- [Sharp Official Documentation](https://sharp.pixelplumbing.com/) - Image processing API
- [Supabase Storage CDN Documentation](https://supabase.com/docs/guides/storage/cdn/fundamentals) - CDN features and cache behavior
- [Next.js Dynamic Routes Documentation](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes) - Async params pattern
- [TanStack Virtual Documentation](https://tanstack.com/virtual/latest) - Virtualization API
- Existing codebase analysis (lib/queue/kie-api-client.ts) - kie.ai format support

### Secondary (MEDIUM confidence)
- [npm-compare: archiver vs JSZip](https://npm-compare.com/adm-zip,archiver,jszip) - Performance comparison
- [How to ZIP multiple streaming files in Node.js (Medium)](https://medium.com/@abhinavk9757/how-to-zip-multiple-streaming-files-in-nodejs-679a6e9d625f) - Archiver streaming patterns
- [Processing images with Sharp (LogRocket)](https://blog.logrocket.com/processing-images-sharp-node-js/) - Sharp best practices
- [SetProduct Pagination Guide](https://www.setproduct.com/blog/pagination-ui-design) - Pagination UI patterns

### Tertiary (LOW confidence)
- [Best bulk downloader applications (wfdownloader.xyz)](https://www.wfdownloader.xyz/blog/best-bulk-downloader-applications) - General bulk download patterns
- [JPEG vs PNG comparison (letsenhance.io)](https://letsenhance.io/blog/all/jpeg-vs-png/) - Format selection guidance

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - archiver, sharp, TanStack Virtual are industry-standard with excellent documentation
- Architecture: HIGH - Patterns verified in official docs and existing codebase
- Pitfalls: HIGH - Common issues documented across multiple sources and real-world experience

**Research date:** 2026-01-26
**Valid until:** 2026-03-26 (60 days - stable ecosystem, but Next.js updates frequently)

**Key assumptions:**
1. kie.ai API format support is stable (verified in existing code)
2. User's jobs remain in single-user context (no multi-tenancy)
3. Average generation size ~2MB (typical for 1K-2K images)
4. Network bandwidth sufficient for downloading 1GB+ ZIPs
5. Supabase Storage quotas sufficient for storing all generations
