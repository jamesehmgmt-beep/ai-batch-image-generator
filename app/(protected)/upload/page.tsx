'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Dropzone } from '@/components/upload/dropzone'
import { ThumbnailGrid } from '@/components/upload/thumbnail-grid'
import { FolderTree } from '@/components/upload/folder-tree'
import { UploadProgressBar } from '@/components/upload/upload-progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DropResult, UploadProgress } from '@/lib/types/upload'
import { formatBytes } from '@/lib/upload/file-system'
import { uploadBatch, generateSessionId } from '@/lib/upload/batch-uploader'
import { useJobContext } from '@/lib/session/job-context'
import { Grid3x3, FolderTree as FolderTreeIcon, AlertCircle, ArrowRight } from 'lucide-react'

type UploadState = 'idle' | 'ready' | 'uploading' | 'complete' | 'error'
type ViewMode = 'thumbnails' | 'tree'

interface FailedUpload {
  path: string
  error: string
}

export default function UploadPage() {
  const router = useRouter()
  const { setUploadData } = useJobContext()
  const [dropResult, setDropResult] = useState<DropResult | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [viewMode, setViewMode] = useState<ViewMode>('thumbnails')
  const [progress, setProgress] = useState<UploadProgress>({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
  })
  const [error, setError] = useState<string | null>(null)
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([])

  const handleDrop = useCallback((result: DropResult) => {
    setDropResult(result)
    setUploadState('ready')
    setProgress({
      total: result.totalCount,
      completed: 0,
      failed: 0,
      inProgress: 0,
    })
    setError(null)
    setFailedUploads([])
  }, [])

  const handleClear = useCallback(() => {
    setDropResult(null)
    setUploadState('idle')
    setProgress({ total: 0, completed: 0, failed: 0, inProgress: 0 })
    setError(null)
    setFailedUploads([])
  }, [])

  const handleUpload = useCallback(async () => {
    if (!dropResult) return

    setUploadState('uploading')
    setError(null)
    setFailedUploads([])

    try {
      const sessionId = generateSessionId()

      const results = await uploadBatch(dropResult.files, {
        sessionId,
        onProgress: (p) => setProgress({ ...p }),
        onFileComplete: (result) => {
          if (!result.success) {
            console.error(`Upload failed: ${result.path}`, result.error)
            setFailedUploads(prev => [...prev, { path: result.path, error: result.error || 'Unknown error' }])
          }
        },
      })

      // Check if any failed
      const failures = results.filter(r => !r.success)
      if (failures.length > 0) {
        setUploadState('complete') // Still complete, but with failures
      } else {
        setUploadState('complete')
      }

      // Store upload data in context for job creation
      setUploadData(sessionId, dropResult)
    } catch (err) {
      setUploadState('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
      console.error('Batch upload error:', err)
    }
  }, [dropResult, setUploadData])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Upload Images</h2>
        <p className="text-muted-foreground">
          Drag and drop folders containing your images
        </p>
      </div>

      {uploadState === 'idle' && (
        <Dropzone onDrop={handleDrop} />
      )}

      {dropResult && uploadState !== 'idle' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {uploadState === 'complete' ? 'Upload Complete' :
                   uploadState === 'uploading' ? 'Uploading...' :
                   uploadState === 'error' ? 'Upload Error' :
                   'Ready to Upload'}
                </CardTitle>
                <CardDescription>
                  {dropResult.totalCount} images ({formatBytes(dropResult.totalSize)})
                </CardDescription>
              </div>

              {/* View mode toggle */}
              <div className="flex gap-1 border rounded-lg p-1">
                <Button
                  variant={viewMode === 'thumbnails' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('thumbnails')}
                  disabled={uploadState === 'uploading'}
                >
                  <Grid3x3 className="w-4 h-4 mr-1.5" />
                  Thumbnails
                </Button>
                <Button
                  variant={viewMode === 'tree' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('tree')}
                  disabled={uploadState === 'uploading'}
                >
                  <FolderTreeIcon className="w-4 h-4 mr-1.5" />
                  Folders
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress */}
            <UploadProgressBar
              progress={progress}
              isUploading={uploadState === 'uploading'}
            />

            {/* Error message */}
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            {/* Failed uploads list */}
            {failedUploads.length > 0 && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <p className="text-sm font-medium text-red-500">
                    {failedUploads.length} file(s) failed to upload
                  </p>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {failedUploads.slice(0, 10).map((f, i) => (
                    <div key={i} className="text-xs text-red-400">
                      <span className="font-mono">{f.path}</span>
                      <span className="text-red-300 ml-2">— {f.error}</span>
                    </div>
                  ))}
                  {failedUploads.length > 10 && (
                    <p className="text-xs text-red-300">
                      ... and {failedUploads.length - 10} more
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* View: Thumbnails or Tree */}
            {viewMode === 'thumbnails' ? (
              <ThumbnailGrid files={dropResult.files} maxVisible={50} />
            ) : (
              <FolderTree folderTree={dropResult.folderTree} />
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleClear}
                variant="outline"
                disabled={uploadState === 'uploading'}
              >
                {uploadState === 'complete' ? 'Upload More' : 'Clear'}
              </Button>
              {uploadState === 'ready' && (
                <Button onClick={handleUpload}>
                  Start Upload
                </Button>
              )}
              {uploadState === 'error' && (
                <Button onClick={handleUpload}>
                  Retry Upload
                </Button>
              )}
              {uploadState === 'complete' && progress.failed === 0 && (
                <Button onClick={() => router.push('/create-job')}>
                  Create Generation Job
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
