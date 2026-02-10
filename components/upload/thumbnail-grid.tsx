'use client'

import { useEffect, useState, memo } from 'react'
import { FileWithPath } from '@/lib/types/upload'
import { formatBytes } from '@/lib/upload/file-system'

interface ThumbnailGridProps {
  files: FileWithPath[]
  maxVisible?: number
}

// Memoized single thumbnail to prevent re-renders
const Thumbnail = memo(function Thumbnail({ file }: { file: File }) {
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

  if (!url) {
    return (
      <div className="aspect-square bg-muted animate-pulse rounded-lg" />
    )
  }

  return (
    <div className="group relative aspect-square rounded-lg overflow-hidden bg-muted">
      <img
        src={url}
        alt={file.name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-white truncate">{file.name}</p>
        <p className="text-xs text-white/70">{formatBytes(file.size)}</p>
      </div>
    </div>
  )
})

export function ThumbnailGrid({ files, maxVisible = 50 }: ThumbnailGridProps) {
  const visibleFiles = files.slice(0, maxVisible)
  const hiddenCount = files.length - visibleFiles.length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
        {visibleFiles.map((f, i) => (
          <Thumbnail key={`${f.path}-${i}`} file={f.file} />
        ))}
        {hiddenCount > 0 && (
          <div className="aspect-square rounded-lg bg-muted flex items-center justify-center">
            <span className="text-sm text-muted-foreground">
              +{hiddenCount} more
            </span>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground text-center">
        Showing {visibleFiles.length} of {files.length} images
        {hiddenCount > 0 && ' (scroll thumbnails load on demand)'}
      </p>
    </div>
  )
}
