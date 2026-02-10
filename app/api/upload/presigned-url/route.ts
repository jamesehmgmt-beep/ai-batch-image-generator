import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const BUCKET_NAME = 'images'

interface PresignedUrlRequest {
  path: string // e.g., "folder1/subfolder/image.jpg"
}

interface PresignedUrlResponse {
  signedUrl: string
  path: string
  token: string
}

/**
 * Sanitize file path to prevent directory traversal attacks
 * - Removes leading slashes
 * - Removes parent directory references (..)
 * - Normalizes path separators
 */
function sanitizePath(path: string): string {
  return path
    .replace(/^\/+/, '') // Remove leading slashes
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/\/+/g, '/') // Normalize multiple slashes
    .replace(/^\/+/, '') // Remove any remaining leading slashes after normalization
}

/**
 * POST /api/upload/presigned-url
 * Generate a single presigned upload URL for direct browser-to-Supabase uploads
 */
export async function POST(request: Request) {
  try {
    const body: PresignedUrlRequest = await request.json()

    if (!body.path) {
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      )
    }

    const sanitizedPath = sanitizePath(body.path)

    if (!sanitizedPath) {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    // Generate presigned upload URL (valid for 2 hours)
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(sanitizedPath)

    if (error) {
      console.error('Supabase presigned URL error:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    const response: PresignedUrlResponse = {
      signedUrl: data.signedUrl,
      path: data.path,
      token: data.token,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Presigned URL API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/upload/presigned-url
 * Generate batch presigned upload URLs for multiple files
 * Maximum 100 paths per request
 */
export async function PUT(request: Request) {
  try {
    const body: { paths: string[] } = await request.json()

    if (!body.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
      return NextResponse.json(
        { error: 'Paths array is required' },
        { status: 400 }
      )
    }

    // Limit batch size to prevent abuse
    if (body.paths.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 paths per batch' },
        { status: 400 }
      )
    }

    const supabase = createServerSupabaseClient()

    const results = await Promise.all(
      body.paths.map(async (path) => {
        const sanitizedPath = sanitizePath(path)

        if (!sanitizedPath) {
          return { path: path, error: 'Invalid path' }
        }

        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUploadUrl(sanitizedPath)

        if (error) {
          return { path: sanitizedPath, error: error.message }
        }

        return {
          path: data.path,
          signedUrl: data.signedUrl,
          token: data.token,
        }
      })
    )

    return NextResponse.json({ urls: results })
  } catch (error) {
    console.error('Batch presigned URL API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate upload URLs' },
      { status: 500 }
    )
  }
}
