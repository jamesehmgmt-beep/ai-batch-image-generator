'use client'

import { Progress } from '@/components/ui/progress'
import { UploadProgress as UploadProgressType } from '@/lib/types/upload'

interface UploadProgressProps {
  progress: UploadProgressType
  isUploading: boolean
}

export function UploadProgressBar({ progress, isUploading }: UploadProgressProps) {
  // Calculate percentage based on completed + failed (total processed)
  const processed = progress.completed + progress.failed
  const percentage = progress.total > 0
    ? Math.round((processed / progress.total) * 100)
    : 0

  // Determine status text
  const getStatusText = () => {
    if (isUploading) {
      return 'Uploading...'
    }
    if (processed === 0) {
      return 'Ready'
    }
    if (processed === progress.total) {
      if (progress.failed > 0) {
        return `Done with ${progress.failed} failed`
      }
      return 'Complete!'
    }
    // Partial completion (stopped early)
    return `Stopped at ${processed}/${progress.total}`
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className={progress.failed > 0 && !isUploading ? 'text-yellow-500' : ''}>
          {getStatusText()}
        </span>
        <span>{progress.completed} / {progress.total}</span>
      </div>

      <Progress value={percentage} className="h-2" />

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {progress.inProgress > 0 && `${progress.inProgress} in progress`}
        </span>
        <span>
          {progress.failed > 0 && (
            <span className="text-red-500">{progress.failed} failed</span>
          )}
        </span>
      </div>
    </div>
  )
}
