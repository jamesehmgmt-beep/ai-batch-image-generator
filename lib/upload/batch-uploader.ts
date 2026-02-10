import { supabase } from '@/lib/supabase'
import { FileWithPath, UploadProgress, PresignedUrl } from '@/lib/types/upload'

const BUCKET_NAME = 'images'
const CONCURRENCY = 10 // Upload 10 files at a time
const BATCH_SIZE = 50 // Request 50 presigned URLs at a time

/**
 * Sanitize file path for Supabase Storage
 * - Replaces non-ASCII characters with transliterated or safe versions
 * - Ensures path is URL-safe
 * EXPORTED: Used in cost page to match uploaded file paths
 */
export function sanitizeStoragePath(path: string): string {
  // Split into parts to preserve folder structure
  const parts = path.split('/')

  const sanitizedParts = parts.map(part => {
    // Check if part contains non-ASCII characters
    if (!/^[\x00-\x7F]*$/.test(part)) {
      // Get file extension if present
      const lastDot = part.lastIndexOf('.')
      const ext = lastDot > 0 ? part.slice(lastDot) : ''
      const name = lastDot > 0 ? part.slice(0, lastDot) : part

      // Create a hash-based safe name for non-ASCII filenames
      // This preserves uniqueness while being storage-safe
      const safeChars = name.replace(/[^\x00-\x7F]/g, '_')
      const hash = simpleHash(name)
      return `${safeChars}_${hash}${ext}`
    }

    // For ASCII-only parts, just clean up any problematic characters
    return part
      .replace(/[<>:"|?*]/g, '_') // Windows-unsafe chars
      .replace(/\s+/g, '_') // Spaces to underscores
  })

  return sanitizedParts.join('/')
}

/**
 * Simple hash function to create unique identifiers
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 6)
}

interface UploadResult {
  path: string
  success: boolean
  error?: string
}

interface BatchUploadOptions {
  onProgress: (progress: UploadProgress) => void
  onFileComplete?: (result: UploadResult) => void
  sessionId?: string // Prefix for organizing uploads
}

/**
 * Fetch presigned URLs in batches
 */
async function fetchPresignedUrls(paths: string[]): Promise<Map<string, PresignedUrl>> {
  const urlMap = new Map<string, PresignedUrl>()
  const errors: string[] = []

  // Split into batches of BATCH_SIZE
  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE)

    const response = await fetch('/api/upload/presigned-url', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: batch }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Presigned URL API error:', response.status, errorText)
      throw new Error(`Failed to get presigned URLs: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    for (const url of data.urls) {
      if (url.error) {
        errors.push(`${url.path}: ${url.error}`)
        console.error('Presigned URL error for path:', url.path, url.error)
      } else {
        urlMap.set(url.path, {
          signedUrl: url.signedUrl,
          path: url.path,
          token: url.token,
        })
      }
    }
  }

  // If we got no valid URLs, throw with the errors
  if (urlMap.size === 0 && errors.length > 0) {
    throw new Error(`Failed to generate upload URLs: ${errors[0]}`)
  }

  return urlMap
}

/**
 * Upload a single file using presigned URL
 */
async function uploadSingleFile(
  file: File,
  presignedUrl: PresignedUrl
): Promise<UploadResult> {
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .uploadToSignedUrl(presignedUrl.path, presignedUrl.token, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      return { path: presignedUrl.path, success: false, error: error.message }
    }

    return { path: presignedUrl.path, success: true }
  } catch (error) {
    return {
      path: presignedUrl.path,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Upload files in parallel with concurrency limit
 */
export async function uploadBatch(
  files: FileWithPath[],
  options: BatchUploadOptions
): Promise<UploadResult[]> {
  const { onProgress, onFileComplete, sessionId } = options
  const results: UploadResult[] = []

  // Check if Supabase is configured
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || supabaseUrl === 'your-project-url' || supabaseUrl === 'your_project_url') {
    throw new Error('Supabase not configured: Please set NEXT_PUBLIC_SUPABASE_URL in .env.local')
  }

  if (!supabaseKey || supabaseKey === 'your-anon-key' || supabaseKey === 'your_anon_key') {
    throw new Error('Supabase not configured: Please set NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  }

  // Basic JWT validation - anon keys should start with "eyJ"
  if (!supabaseKey.startsWith('eyJ')) {
    throw new Error('Invalid Supabase anon key: The key should be a JWT starting with "eyJ". Please check your NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  }

  const progress: UploadProgress = {
    total: files.length,
    completed: 0,
    failed: 0,
    inProgress: 0,
  }

  // Generate storage paths with optional session prefix
  // Sanitize paths to handle non-ASCII characters (e.g., Chinese filenames)
  const prefix = sessionId ? `${sessionId}/` : ''
  const pathMap = new Map<string, FileWithPath>()
  const paths: string[] = []

  for (const fileWithPath of files) {
    const sanitizedPath = sanitizeStoragePath(fileWithPath.path)
    const storagePath = `${prefix}${sanitizedPath}`
    paths.push(storagePath)
    pathMap.set(storagePath, fileWithPath)
  }

  // Fetch all presigned URLs
  const presignedUrls = await fetchPresignedUrls(paths)

  // Create upload queue
  const queue = [...paths]

  async function processOne(storagePath: string): Promise<UploadResult> {
    const presignedUrl = presignedUrls.get(storagePath)
    const fileWithPath = pathMap.get(storagePath)

    if (!presignedUrl || !fileWithPath) {
      console.error(`Missing presigned URL for: ${storagePath}`)
      return {
        path: storagePath,
        success: false,
        error: 'Missing presigned URL - file may have failed to register',
      }
    }

    return await uploadSingleFile(fileWithPath.file, presignedUrl)
  }

  // Process uploads with concurrency limit using a simpler, more reliable approach
  const processingQueue = async () => {
    while (queue.length > 0) {
      // Take up to CONCURRENCY items from queue
      const batch = queue.splice(0, CONCURRENCY)

      progress.inProgress = batch.length
      onProgress({ ...progress })

      // Process batch in parallel
      const batchResults = await Promise.all(
        batch.map(async (storagePath) => {
          const result = await processOne(storagePath)

          // Update progress after each file
          progress.inProgress--
          if (result.success) {
            progress.completed++
          } else {
            progress.failed++
            console.error(`Upload failed for ${storagePath}:`, result.error)
          }
          onProgress({ ...progress })

          if (onFileComplete) {
            onFileComplete(result)
          }

          return result
        })
      )

      results.push(...batchResults)
    }
  }

  await processingQueue()

  // console.log(`Upload complete: ${progress.completed} succeeded, ${progress.failed} failed out of ${progress.total}`)

  return results
}

/**
 * Generate a unique session ID for organizing uploads
 */
export function generateSessionId(): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '')
  const random = Math.random().toString(36).slice(2, 6)
  return `upload-${dateStr}-${timeStr}-${random}`
}
