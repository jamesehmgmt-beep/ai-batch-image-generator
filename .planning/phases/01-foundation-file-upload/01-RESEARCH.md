# Phase 01: Foundation & File Upload - Research

**Researched:** 2026-01-24
**Domain:** Next.js App Router file upload with Supabase Storage, browser drag-drop folder upload
**Confidence:** HIGH

## Summary

This phase implements a password-protected Next.js application that enables users to drag-drop folders containing 500+ images (up to 30MB each) directly to Supabase Storage while preserving folder structure. The research confirms that the standard approach is **client-side direct uploads using Supabase presigned URLs** to bypass Vercel's 4.5MB serverless function limit and 10-second timeout constraints.

The File System Access API provides native browser support for drag-drop folder uploads with preserved structure across all modern browsers (Chrome 86+, Edge 86+, Firefox 111+, Safari 15.2+). For simple password authentication in a single-user tool, using Next.js middleware with HTTP-only cookies is the standard pattern, avoiding the complexity of full Supabase Auth for this use case.

For UI implementation, Tailwind v4 with shadcn/ui provides the modern dark mode interface, with shadcn/ui officially supporting Tailwind v4 as of 2026. Client-side thumbnail previews should use `URL.createObjectURL()` rather than FileReader for significantly better performance (10x faster for 10MB files).

**Primary recommendation:** Use Supabase presigned upload URLs with client-side direct uploads, File System Access API for folder structure preservation, simple middleware-based password protection, and URL.createObjectURL() for thumbnail previews.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16+ | App Router framework | Latest version with React 19.2, Server Components, optimized for Vercel |
| @supabase/supabase-js | Latest | Supabase client SDK | Official client for Storage presigned URLs, handles auth tokens |
| react-dropzone | Latest | Drag-drop file upload | Industry standard React hook for HTML5 drag-drop, 10M+ weekly downloads |
| Tailwind CSS | 4.x | CSS framework | Latest version with @theme directive, OKLCH colors |
| shadcn/ui | Latest | Component library | Official Tailwind v4 support, pre-built dark mode components |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-auth | Latest (if using) | Simple password auth | If implementing middleware-based password protection |
| lucide-react | Latest | Icon system | File/folder icons for tree view, comes with shadcn/ui |
| @radix-ui/* | Latest | UI primitives | Underlying primitives for shadcn/ui components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Presigned URLs | Server proxy upload | Server proxy hits Vercel 4.5MB limit, much slower |
| File System API | react-dropzone only | Loses folder structure, only gets flat file list |
| Simple password | Full Supabase Auth | Unnecessary complexity for single-user tool |
| URL.createObjectURL | FileReader.readAsDataURL | FileReader 10x slower for large images, memory intensive |

**Installation:**
```bash
npm install @supabase/supabase-js react-dropzone next-auth
npx shadcn-ui@latest init --tailwind-v4
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── (auth)/
│   ├── login/          # Password entry page
│   └── layout.tsx      # Auth layout (minimal, centered)
├── (protected)/
│   ├── layout.tsx      # Protected layout with navigation
│   └── upload/         # Main upload interface
│       ├── page.tsx    # Upload page
│       └── _components/
│           ├── dropzone.tsx       # Drag-drop zone
│           ├── folder-tree.tsx    # Folder structure display
│           └── thumbnail-grid.tsx # Image preview grid
├── api/
│   ├── auth/           # Password verification endpoint
│   └── upload/
│       └── presigned-url/
│           └── route.ts    # Generate Supabase presigned URLs
├── lib/
│   ├── supabase.ts     # Supabase client initialization
│   └── upload/
│       ├── file-system.ts     # File System API utilities
│       └── batch-uploader.ts  # Batch upload orchestration
└── middleware.ts       # Password protection middleware
```

### Pattern 1: Client-Side Direct Upload Flow
**What:** Generate presigned URLs server-side, upload directly from browser to Supabase Storage
**When to use:** Always for files >6MB, bypasses Vercel limits
**Example:**
```typescript
// Source: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl

// 1. Server Action - Generate presigned URL
// app/api/upload/presigned-url/route.ts
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const { path } = await request.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY! // Service key for server-side
  )

  const { data, error } = await supabase.storage
    .from('user-images')
    .createSignedUploadUrl(path)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // URL valid for 2 hours
  return Response.json({ signedUrl: data.signedUrl, path: data.path })
}

// 2. Client Component - Upload using presigned URL
// app/(protected)/upload/_components/uploader.tsx
'use client'

async function uploadFile(file: File, path: string) {
  // Get presigned URL from server
  const res = await fetch('/api/upload/presigned-url', {
    method: 'POST',
    body: JSON.stringify({ path })
  })
  const { signedUrl } = await res.json()

  // Direct upload to Supabase Storage (bypasses Next.js server)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data, error } = await supabase.storage
    .from('user-images')
    .uploadToSignedUrl(path, signedUrl, file)

  if (error) throw error
  return data
}
```

### Pattern 2: Folder Structure Preservation with File System API
**What:** Use DataTransferItem.getAsFileSystemHandle() to preserve folder hierarchy on drag-drop
**When to use:** When users drag-drop folders, need to maintain directory structure
**Example:**
```typescript
// Source: https://developer.chrome.com/docs/capabilities/web-apis/file-system-access

// lib/upload/file-system.ts
interface FileWithPath {
  file: File
  path: string // e.g., "folder1/subfolder/image.jpg"
}

async function extractFilesFromDrop(
  dataTransfer: DataTransfer
): Promise<FileWithPath[]> {
  const files: FileWithPath[] = []

  const items = [...dataTransfer.items]

  for (const item of items) {
    if (item.kind !== 'file') continue

    const handle = await item.getAsFileSystemHandle()

    if (!handle) continue

    if (handle.kind === 'file') {
      const file = await handle.getFile()
      files.push({ file, path: handle.name })
    } else if (handle.kind === 'directory') {
      // Recursively read directory
      await traverseDirectory(handle, '', files)
    }
  }

  return files
}

async function traverseDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  files: FileWithPath[]
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name

    if (entry.kind === 'file') {
      const file = await entry.getFile()
      files.push({ file, path: entryPath })
    } else if (entry.kind === 'directory') {
      await traverseDirectory(entry, entryPath, files)
    }
  }
}
```

### Pattern 3: Batch Upload with Progress Tracking
**What:** Upload 500+ files in parallel with concurrency limit and progress tracking
**When to use:** Large batch uploads to prevent browser/network overload
**Example:**
```typescript
// lib/upload/batch-uploader.ts
interface UploadProgress {
  total: number
  completed: number
  failed: number
  inProgress: number
}

async function uploadBatch(
  files: FileWithPath[],
  onProgress: (progress: UploadProgress) => void,
  concurrency = 10 // Upload 10 files at a time
): Promise<void> {
  const progress: UploadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    inProgress: 0
  }

  const queue = [...files]
  const uploading: Promise<void>[] = []

  while (queue.length > 0 || uploading.length > 0) {
    // Fill up to concurrency limit
    while (queue.length > 0 && uploading.length < concurrency) {
      const fileWithPath = queue.shift()!
      progress.inProgress++

      const uploadPromise = uploadFile(fileWithPath.file, fileWithPath.path)
        .then(() => {
          progress.completed++
          progress.inProgress--
          onProgress({ ...progress })
        })
        .catch((error) => {
          console.error(`Failed to upload ${fileWithPath.path}:`, error)
          progress.failed++
          progress.inProgress--
          onProgress({ ...progress })
        })

      uploading.push(uploadPromise)
    }

    // Wait for at least one upload to complete
    if (uploading.length > 0) {
      await Promise.race(uploading)
      uploading.splice(0, uploading.length, ...uploading.filter(p =>
        p.then(() => false).catch(() => false)
      ))
    }
  }
}
```

### Pattern 4: Simple Password Protection with Middleware
**What:** Use Next.js middleware with HTTP-only cookies for password authentication
**When to use:** Single-user tools with hardcoded password, no need for full auth system
**Example:**
```typescript
// Source: https://www.alexchantastic.com/password-protecting-next

// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('auth-token')

  // Check if authenticated
  if (authCookie?.value === process.env.AUTH_SECRET) {
    return NextResponse.next()
  }

  // Redirect to login
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)']
}

// app/api/auth/route.ts
export async function POST(request: Request) {
  const { password } = await request.json()

  if (password === process.env.TOOL_PASSWORD) {
    const response = NextResponse.json({ success: true })

    // Set HTTP-only cookie
    response.cookies.set('auth-token', process.env.AUTH_SECRET!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    })

    return response
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}
```

### Pattern 5: Fast Thumbnail Previews with URL.createObjectURL
**What:** Generate temporary URLs for File objects for instant preview without reading into memory
**When to use:** Displaying image previews before upload, 10x faster than FileReader
**Example:**
```typescript
// Source: https://www.andygup.net/performance-comparison-between-readasdataurl-and-createobjecturl/

// app/(protected)/upload/_components/thumbnail-grid.tsx
'use client'
import { useEffect, useState } from 'react'

function ThumbnailPreview({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState<string>()

  useEffect(() => {
    // Create object URL (fast, synchronous, no memory copy)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)

    // IMPORTANT: Revoke URL when component unmounts to prevent memory leak
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [file])

  if (!previewUrl) return null

  return (
    <div className="relative aspect-square">
      <img
        src={previewUrl}
        alt={file.name}
        className="object-cover w-full h-full rounded-lg"
      />
      <div className="absolute bottom-2 left-2 text-xs bg-black/70 px-2 py-1 rounded">
        {(file.size / 1024 / 1024).toFixed(2)} MB
      </div>
    </div>
  )
}

// DON'T do this (10x slower for 10MB files):
// const reader = new FileReader()
// reader.onload = (e) => setPreviewUrl(e.target?.result as string)
// reader.readAsDataURL(file)
```

### Anti-Patterns to Avoid
- **Server proxy uploads:** Uploading through Next.js API routes hits Vercel's 4.5MB body limit and 10-second timeout, guaranteed failure for 30MB files
- **Using react-dropzone without File System API:** react-dropzone alone flattens folders into file list, losing structure; must use getAsFileSystemHandle()
- **FileReader for previews:** 10x slower than URL.createObjectURL for large images, blocks main thread, wastes memory
- **Supabase Auth for single password:** Adds unnecessary complexity, email verification, database overhead when you just need password check
- **Not revoking object URLs:** Creates memory leaks when previewing 500+ images; always revoke in cleanup
- **Standard uploads >6MB:** Use resumable uploads (TUS) for files >6MB for reliability and performance

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag-drop file upload | Custom drag handlers, file input wrapper | react-dropzone | Handles edge cases (multiple files, drag states, file validation, keyboard access), 10M+ weekly downloads, battle-tested |
| Directory traversal | Manual File/FileList iteration | File System Access API with async iterators | Preserves folder structure, handles nested directories, provides FileSystemHandle, works with drag-drop |
| Large file uploads | Custom chunking/resumable logic | Supabase presigned URLs + TUS for >6MB | Handles interruptions, retries, progress tracking, 6MB chunks, 24-hour URL expiry |
| Session management | Custom JWT/cookie handling | Next.js middleware + HTTP-only cookies | Built-in cookie API, automatic CSRF protection, works with App Router Server Components |
| Dark mode UI | Custom CSS variables, theme switching | Tailwind v4 + shadcn/ui | Pre-built dark mode components, OKLCH colors for accessibility, :root/.dark selectors, @theme directive |
| Folder tree display | Custom recursive rendering | shadcn-ui-tree-view | Multi-select, expand/collapse, icons, folder counting, right-click actions |
| Progress bars/toasts | Custom notification system | shadcn/ui components | Accessible, animated, composable, dark mode support |

**Key insight:** File uploads are deceptively complex. Browser APIs handle folder structure, Supabase handles large files/retries, react-dropzone handles UX edge cases. Building custom solutions leads to lost folder structure, timeout errors, and poor UX.

## Common Pitfalls

### Pitfall 1: Vercel Serverless Function Limits
**What goes wrong:** Files upload successfully in local development but fail in production with "Request Entity Too Large" or timeout errors.
**Why it happens:** Vercel serverless functions have hard limits: 4.5MB request body size, 10-second timeout (free), 60-second timeout (Pro). Large files or slow networks hit these limits.
**How to avoid:**
- Use client-side direct uploads with Supabase presigned URLs
- Never proxy files through Next.js API routes
- Generate presigned URL server-side, upload client-side
**Warning signs:**
- Uploads work locally but fail on Vercel
- Errors mention "payload too large" or "function timeout"
- Network tab shows files going to your domain, not supabase.co

### Pitfall 2: Lost Folder Structure with Standard File Input
**What goes wrong:** Users drag-drop folders but see flat file list, losing nested directory structure.
**Why it happens:** Standard `<input type="file">` and basic drag-drop only provide File[] array without path information. react-dropzone alone doesn't preserve structure.
**How to avoid:**
- Use File System Access API's `DataTransferItem.getAsFileSystemHandle()`
- Recursively traverse directories with async iterators
- Store full path with each file (e.g., "folder1/subfolder/image.jpg")
- Upload to Supabase Storage with path preserved
**Warning signs:**
- Users complain about lost organization
- All files appear in single flat list
- File.webkitRelativePath is empty or not used

### Pitfall 3: Not Adjusting Supabase Storage Limits
**What goes wrong:** Uploads fail with "File too large" error despite configuring bucket settings.
**Why it happens:** Supabase has **both** global project limits and per-bucket limits. Both must be adjusted. Default is often 50MB global, but buckets may have lower limits.
**How to avoid:**
- Check Supabase dashboard → Storage → Settings → File size limit
- Check individual bucket settings → Configuration → Maximum file size
- Set both to at least 30MB for this project
- Use resumable uploads (TUS) for files >6MB
**Warning signs:**
- "FileTooLarge" error in console
- Uploads fail at specific file size threshold
- Some files upload, others don't based on size

### Pitfall 4: Memory Leaks with 500+ Thumbnail Previews
**What goes wrong:** Browser becomes slow/unresponsive after previewing large batches of images.
**Why it happens:** `URL.createObjectURL()` creates blob URLs that stay in memory until explicitly revoked. Previewing 500 images without cleanup = 500 blob URLs = memory exhaustion.
**How to avoid:**
- Always call `URL.revokeObjectURL(url)` in component cleanup
- Use React useEffect return function for cleanup
- Consider virtualized list for 500+ items (only render visible thumbnails)
- Monitor memory in DevTools Performance tab
**Warning signs:**
- Browser slows down after uploading large batches
- Memory usage increases continuously
- Page crashes with "Out of memory" error

### Pitfall 5: Expired Presigned URLs
**What goes wrong:** Batch upload starts successfully but later uploads fail with "Invalid token" or "Expired URL" errors.
**Why it happens:** Supabase presigned upload URLs expire after 2 hours. Large batches taking >2 hours to upload will fail partway through.
**How to avoid:**
- Generate presigned URLs in batches, not all upfront
- Implement retry logic that regenerates URLs on expiry errors
- For 500+ files, generate URLs for next 100 files as current batch progresses
- Monitor upload time and warn users if approaching 2-hour limit
**Warning signs:**
- First uploads succeed, later ones fail
- Errors mention "expired" or "invalid token"
- Failures correlate with time elapsed, not file characteristics

### Pitfall 6: Wrong Supabase Storage Endpoint for Large Files
**What goes wrong:** Large file uploads are slow, timing out, or failing despite using presigned URLs.
**Why it happens:** Using standard endpoint `https://project-id.supabase.co` instead of direct storage endpoint `https://project-id.storage.supabase.co` adds proxy overhead and latency.
**How to avoid:**
- Always use `https://project-id.storage.supabase.co` for uploads >6MB
- Documented in Supabase Storage performance optimization guide
- Configure Supabase client with `storageUrl` option
**Warning signs:**
- Large files upload slowly or timeout
- Network tab shows requests to `*.supabase.co` instead of `*.storage.supabase.co`
- Performance improves when testing with direct storage URL

### Pitfall 7: Browser Compatibility Assumptions
**What goes wrong:** Folder upload works in Chrome but fails silently in older browsers or Firefox without proper fallback.
**Why it happens:** File System Access API has varying support levels. Safari 15.2+ and Firefox 111+ support it, but older versions don't.
**How to avoid:**
- Check browser support: `if ('getAsFileSystemHandle' in DataTransferItem.prototype)`
- Provide fallback: react-dropzone with `webkitdirectory` attribute (wider support)
- Show warning for unsupported browsers
- Test in Safari, Firefox, not just Chrome
**Warning signs:**
- Users report folder upload not working
- Bug reports from specific browsers
- No error messages, just silent failure

## Code Examples

Verified patterns from official sources:

### Supabase Presigned URL Generation (Server)
```typescript
// Source: https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl

import { createClient } from '@supabase/supabase-js'

// Server-side only - use service role key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Service key for admin operations
)

async function generatePresignedUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from('user-images')
    .createSignedUploadUrl(filePath)

  if (error) throw error

  return {
    signedUrl: data.signedUrl,
    path: data.path,
    token: data.token,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
  }
}
```

### Direct Upload to Presigned URL (Client)
```typescript
// Source: https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl

import { createClient } from '@supabase/supabase-js'

// Client-side - use anon key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function uploadToPresignedUrl(
  file: File,
  path: string,
  token: string
) {
  const { data, error } = await supabase.storage
    .from('user-images')
    .uploadToSignedUrl(path, token, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) throw error
  return data
}
```

### react-dropzone with Folder Support
```typescript
// Source: https://github.com/react-dropzone/react-dropzone

'use client'
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

function FolderUploadZone() {
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    // Note: acceptedFiles here are flat files, not folders
    // Must use File System API for folder structure
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    maxSize: 30 * 1024 * 1024, // 30MB
    multiple: true
  })

  // Enhanced with File System API
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()

    const items = [...e.dataTransfer.items]
    const files: { file: File; path: string }[] = []

    for (const item of items) {
      if (item.kind !== 'file') continue

      const handle = await item.getAsFileSystemHandle?.()
      if (!handle) continue

      if (handle.kind === 'directory') {
        await traverseDirectory(handle, handle.name, files)
      } else {
        const file = await handle.getFile()
        files.push({ file, path: handle.name })
      }
    }

    // Now files array has structure preserved
    console.log('Files with paths:', files)
  }, [])

  return (
    <div
      {...getRootProps()}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-600 transition"
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p className="text-lg">Drop folders here...</p>
      ) : (
        <div>
          <p className="text-lg mb-2">Drag & drop folders here</p>
          <p className="text-sm text-gray-500">or click to select folders</p>
          <p className="text-xs text-gray-400 mt-4">Up to 500+ images, 30MB each</p>
        </div>
      )}
    </div>
  )
}

async function traverseDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path: string,
  files: { file: File; path: string }[]
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    const entryPath = `${path}/${entry.name}`

    if (entry.kind === 'file') {
      const file = await entry.getFile()
      // Only accept images
      if (file.type.startsWith('image/')) {
        files.push({ file, path: entryPath })
      }
    } else if (entry.kind === 'directory') {
      await traverseDirectory(entry, entryPath, files)
    }
  }
}
```

### Thumbnail Preview with URL.createObjectURL
```typescript
// Source: https://www.andygup.net/performance-comparison-between-readasdataurl-and-createobjecturl/

'use client'
import { useEffect, useState } from 'react'

function ImageThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    // Create blob URL (fast, no data copy)
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)

    // CRITICAL: Revoke on unmount to prevent memory leak
    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  if (!url) return <div className="aspect-square bg-gray-200 animate-pulse rounded" />

  return (
    <img
      src={url}
      alt={file.name}
      className="aspect-square object-cover rounded"
      loading="lazy"
    />
  )
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server proxy uploads | Client-side direct uploads with presigned URLs | 2023-2024 | Bypasses serverless limits, 10x faster, handles 30MB files |
| FileReader for thumbnails | URL.createObjectURL | Always recommended | 10x performance improvement, no memory copy |
| webkitRelativePath | File System Access API | 2021 (Chrome 86) | True folder structure preservation, async iteration |
| TailwindCSS v3 HSL | TailwindCSS v4 OKLCH | 2025 | Better dark mode accessibility, @theme directive |
| NextAuth v4 | NextAuth v5 (Auth.js) | 2024 | Better App Router support, edge-compatible |
| Supabase standard uploads | Resumable uploads (TUS) for >6MB | Always available | Reliable for large files, auto-retry, progress tracking |

**Deprecated/outdated:**
- **Server-side file proxying:** Vercel's 4.5MB limit makes this approach non-viable for modern file uploads
- **FileReader.readAsDataURL for previews:** 10x slower than URL.createObjectURL, no longer recommended
- **react-dropzone alone for folders:** Must combine with File System API, react-dropzone doesn't preserve structure by default
- **HSL colors in Tailwind v4:** Migrated to OKLCH for better perceptual uniformity and accessibility
- **forwardRef patterns:** React 19 deprecates forwardRef, use `ref` prop directly

## Open Questions

Things that couldn't be fully resolved:

1. **Resumable Uploads Configuration**
   - What we know: Supabase supports TUS protocol for files >6MB, 6MB chunks, 24-hour URL expiry
   - What's unclear: Whether presigned URLs support resumable uploads or require different endpoint
   - Recommendation: Test with files >6MB; if presigned URLs don't support TUS, may need to use standard Supabase upload endpoint with TUS client library (tus-js-client)

2. **File System API Permission Persistence**
   - What we know: Permissions reset when tabs close, requires user gesture per session
   - What's unclear: Whether drag-drop requires permission prompt or counts as user gesture
   - Recommendation: Test drag-drop flow; if permission prompt appears, document in UX; Chrome docs suggest drag-drop is sufficient gesture

3. **Concurrent Upload Optimal Concurrency**
   - What we know: Should limit concurrent uploads to prevent browser/network overload
   - What's unclear: Optimal concurrency value for 500+ files (5, 10, 20?)
   - Recommendation: Start with concurrency=10, make configurable, test with large batches; monitor network tab for connection saturation

4. **RLS Policies for Presigned URLs**
   - What we know: Presigned URLs require `insert` permission on objects table
   - What's unclear: Exact RLS policy syntax for single-user scenario with password auth
   - Recommendation: May need to disable RLS on bucket for simplicity or create policy that allows authenticated users (via service key)

5. **Folder Tree Component Selection**
   - What we know: Multiple shadcn/ui tree view libraries exist (MrLightful, neigebaie)
   - What's unclear: Which is most maintained, best TypeScript support, works with Tailwind v4
   - Recommendation: Test neigebaie/shadcn-ui-tree-view (mentioned as having drag support); may need custom implementation for specific folder display needs

## Sources

### Primary (HIGH confidence)
- Supabase JavaScript SDK: createSignedUploadUrl - https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl
- Supabase JavaScript SDK: uploadToSignedUrl - https://supabase.com/docs/reference/javascript/storage-from-uploadtosignedurl
- Supabase Storage Resumable Uploads - https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase Storage Standard Uploads - https://supabase.com/docs/guides/storage/uploads/standard-uploads
- File System Access API - Chrome Developers - https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- File System API - MDN - https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
- react-dropzone GitHub - https://github.com/react-dropzone/react-dropzone
- Next.js 16 Release - https://nextjs.org/blog/next-16
- shadcn/ui Tailwind v4 Documentation - https://ui.shadcn.com/docs/tailwind-v4
- Next.js Cookies API - https://nextjs.org/docs/app/api-reference/functions/cookies

### Secondary (MEDIUM confidence)
- Password protecting routes in Next.js - Alex Chan - https://www.alexchantastic.com/password-protecting-next (verified with Next.js docs)
- FileReader vs createObjectURL performance comparison - Andy Gup - https://www.andygup.net/performance-comparison-between-readasdataurl-and-createobjecturl/ (verified with MDN, multiple sources agree)
- Bypass Vercel upload limits with client-side uploads - Medium - https://medium.com/@swerashed/how-to-bypass-vercel-upload-limits-in-next-js-using-use-client-for-client-side-file-uploads-b045ed3b65a5 (verified with Vercel docs)
- Bypass Vercel 4.5MB limit using Supabase - Medium - https://medium.com/@jpnreddy25/how-to-bypass-vercels-4-5mb-body-size-limit-for-serverless-functions-using-supabase-09610d8ca387 (common pattern)
- Signed URL file uploads with Next.js and Supabase - Medium - https://medium.com/@olliedoesdev/signed-url-file-uploads-with-nextjs-and-supabase-74ba91b65fe0 (verified with official Supabase docs)

### Tertiary (LOW confidence)
- shadcn-ui-tree-view components - Multiple implementations exist, not officially verified by shadcn
  - https://github.com/MrLightful/shadcn-tree-view
  - https://www.shadcn.io/template/mrlightful-shadcn-tree-view
  - GitHub neigebaie/shadcn-ui-tree-view discussions
- Top authentication solutions for Next.js 2026 - WorkOS Blog (marketing content, but aligns with Next.js docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7 searches, official docs, and GitHub repositories with current version info
- Architecture: HIGH - Patterns verified with official Supabase docs, Chrome File System API docs, Next.js docs, multiple consistent examples
- Pitfalls: MEDIUM to HIGH - Vercel limits verified with official docs and GitHub discussions; Supabase limits verified with official troubleshooting docs; performance findings verified with multiple sources

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable ecosystem, but fast-moving for File System API browser support)

**Key verification notes:**
- Vercel 4.5MB limit: Verified in multiple GitHub issues and official Vercel documentation
- File System API browser support: Verified with MDN and Chrome DevDocs, up-to-date as of 2026
- Supabase presigned URLs: Official SDK documentation, confirmed 2-hour expiry
- URL.createObjectURL performance: Verified with MDN, multiple independent performance tests showing 10x improvement
- Tailwind v4 + shadcn/ui: Official shadcn/ui announcement of v4 support, verified upgrade guide
