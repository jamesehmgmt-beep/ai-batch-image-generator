'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { extractFilesFromDrop, formatBytes, isFileSystemAccessSupported } from '@/lib/upload/file-system'
import { DropResult } from '@/lib/types/upload'

interface DropzoneProps {
  onDrop: (result: DropResult) => void
  disabled?: boolean
}

export function Dropzone({ onDrop, disabled = false }: DropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fsApiSupported, setFsApiSupported] = useState<boolean | null>(null)

  // Check browser support after hydration to avoid SSR mismatch
  useEffect(() => {
    setFsApiSupported(isFileSystemAccessSupported())
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      setIsDragOver(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (disabled) return

    setIsProcessing(true)

    try {
      const result = await extractFilesFromDrop(e.dataTransfer)

      if (result.files.length === 0) {
        // Could show a toast here - no valid images found
        console.warn('No valid image files found in drop')
      }

      onDrop(result)
    } catch (error) {
      console.error('Error processing dropped files:', error)
    } finally {
      setIsProcessing(false)
    }
  }, [onDrop, disabled])

  return (
    <Card
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed transition-colors cursor-pointer
        ${isDragOver
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isProcessing ? 'animate-pulse' : ''}
      `}
    >
      <CardContent className="flex flex-col items-center justify-center py-16 px-8 text-center">
        {isProcessing ? (
          <>
            <div className="w-12 h-12 mb-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-lg font-medium">Processing files...</p>
            <p className="text-sm text-muted-foreground mt-1">
              Reading folder structure
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mb-4 rounded-full bg-muted flex items-center justify-center">
              <svg
                className="w-8 h-8 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <p className="text-lg font-medium">
              {isDragOver ? 'Drop folders here' : 'Drag & drop folders here'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Supports PNG, JPG, JPEG, WebP, GIF up to 30MB each
            </p>
            {fsApiSupported !== null && (
              <p className="text-xs text-muted-foreground mt-4">
                {fsApiSupported
                  ? 'Folder structure will be preserved'
                  : 'Note: Your browser may not preserve folder structure'
                }
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
