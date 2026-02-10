'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Download,
  FolderDown,
  Loader2,
  XCircle,
  Image as ImageIcon,
  ExternalLink,
  Trash2
} from 'lucide-react';

interface Generation {
  id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  sourceFileName: string;
  resultUrl?: string;
  folderPath: string;
  errorMessage?: string;
}

interface ResultsPageProps {
  params: Promise<{ jobId: string }>;
}

export default function ResultsPage({ params }: ResultsPageProps) {
  const { jobId } = use(params);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [outputFormat, setOutputFormat] = useState<'PNG' | 'JPG'>('PNG');
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch generations and job data on mount
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch generations
        const genRes = await fetch(`/api/job/${jobId}/generations`);
        if (!genRes.ok) {
          throw new Error('Failed to fetch generations');
        }
        const genData = await genRes.json();
        setGenerations(genData.generations);

        // Fetch job for outputFormat
        const jobRes = await fetch(`/api/job/${jobId}`);
        if (jobRes.ok) {
          const jobData = await jobRes.json();
          if (jobData.job?.outputFormat) {
            setOutputFormat(jobData.job.outputFormat as 'PNG' | 'JPG');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [jobId]);

  // Get completed generations grouped by folder
  const completedByFolder = generations
    .filter(g => g.state === 'completed' && g.resultUrl)
    .reduce((acc, g) => {
      const folder = g.folderPath || 'default';
      if (!acc[folder]) acc[folder] = [];
      acc[folder].push(g);
      return acc;
    }, {} as Record<string, Generation[]>);

  const completedCount = Object.values(completedByFolder).flat().length;
  const failedCount = generations.filter(g => g.state === 'failed').length;

  // Download a single image via server-side proxy to avoid CORS
  const downloadSingleImage = useCallback(async (generation: Generation) => {
    if (!generation.resultUrl) return;

    try {
      // Use server-side proxy to fetch image
      const response = await fetch(`/api/image/proxy?url=${encodeURIComponent(generation.resultUrl)}`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Use correct extension based on outputFormat
      const extension = outputFormat.toLowerCase();
      a.download = `${generation.sourceFileName.replace(/\.[^/.]+$/, '')}_generated.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download image:', err);
      setError('Failed to download image');
    }
  }, [outputFormat]);

  // Download all images as ZIP via server-side API
  const downloadAllAsZip = useCallback(async () => {
    setIsDownloading(true);
    setError(null);

    try {
      // Server-side ZIP creation avoids CORS issues
      const response = await fetch(`/api/job/${jobId}/download`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Download failed');
      }

      // Get the blob and trigger download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `job-${jobId.slice(0, 8)}-results.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download:', err);
      setError(err instanceof Error ? err.message : 'Failed to download images');
    } finally {
      setIsDownloading(false);
    }
  }, [jobId]);

  // Download a single folder as ZIP via server-side API
  const downloadFolderAsZip = useCallback(async (folderPath: string) => {
    setIsDownloading(true);
    setError(null);

    try {
      // Server-side ZIP creation with folder filter
      const response = await fetch(`/api/job/${jobId}/download?folder=${encodeURIComponent(folderPath)}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Download failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderPath.replace(/\//g, '_')}-results.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to download folder');
    } finally {
      setIsDownloading(false);
    }
  }, [jobId]);

  // Delete a generation with confirmation
  const handleDelete = useCallback(async (generation: Generation) => {
    const confirmed = confirm(
      `Delete "${generation.sourceFileName}"?\n\n` +
      'This will remove it from your results and downloads.\n' +
      'This action cannot be undone.'
    );

    if (!confirmed) return;

    setDeletingIds(prev => new Set(prev).add(generation.id));
    setError(null);

    try {
      const res = await fetch(`/api/generation/${generation.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      // Remove from local state
      setGenerations(prev => prev.filter(g => g.id !== generation.id));
    } catch (err) {
      console.error('Failed to delete:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete generation');
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(generation.id);
        return next;
      });
    }
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/job/progress/${jobId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">Generation Results</h2>
              <Badge variant="outline" className="text-xs">
                {outputFormat}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {completedCount} images generated
              {failedCount > 0 && `, ${failedCount} failed`}
            </p>
          </div>
        </div>

        {/* Download All Button */}
        {completedCount > 0 && (
          <Button
            onClick={downloadAllAsZip}
            disabled={isDownloading}
            size="lg"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Preparing Download...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download All ({completedCount})
              </>
            )}
          </Button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Results by folder */}
      {Object.entries(completedByFolder).map(([folderPath, folderGenerations]) => (
        <Card key={folderPath}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FolderDown className="w-5 h-5" />
                {folderPath}
                <span className="text-sm font-normal text-muted-foreground">
                  ({folderGenerations.length} images)
                </span>
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadFolderAsZip(folderPath)}
                disabled={isDownloading}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Folder
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {folderGenerations.map((generation) => (
                <div
                  key={generation.id}
                  className="relative group rounded-lg overflow-hidden border border-gray-800 bg-gray-900"
                >
                  {generation.resultUrl ? (
                    <>
                      <img
                        src={generation.resultUrl}
                        alt={generation.sourceFileName}
                        className="w-full aspect-square object-cover"
                        loading="lazy"
                      />
                      {/* Overlay with actions */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => downloadSingleImage(generation)}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => window.open(generation.resultUrl, '_blank')}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(generation)}
                          disabled={deletingIds.has(generation.id)}
                        >
                          {deletingIds.has(generation.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-600" />
                    </div>
                  )}
                  {/* Filename label */}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-1">
                    <p className="text-xs truncate text-center">
                      {generation.sourceFileName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Failed generations */}
      {failedCount > 0 && (
        <Card className="border-red-500/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-red-400">
              <XCircle className="w-5 h-5" />
              Failed Generations ({failedCount})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {generations
                .filter(g => g.state === 'failed')
                .map(g => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-2 rounded bg-red-500/10 border border-red-500/20"
                  >
                    <span className="text-sm">{g.sourceFileName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400">{g.errorMessage || 'Unknown error'}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleDelete(g)}
                        disabled={deletingIds.has(g.id)}
                      >
                        {deletingIds.has(g.id) ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* No results - show detailed state breakdown */}
      {completedCount === 0 && failedCount === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            {generations.length === 0 ? (
              <>
                <p className="text-muted-foreground mb-2">No generations found for this job.</p>
                <p className="text-sm text-muted-foreground">The job may not have been created properly or was deleted.</p>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-4">No completed results yet.</p>
                <div className="text-sm text-muted-foreground space-y-1 mb-4">
                  <p>Generation status breakdown:</p>
                  <p>• Pending: {generations.filter(g => g.state === 'pending').length}</p>
                  <p>• Processing: {generations.filter(g => g.state === 'processing').length}</p>
                  <p>• Completed: {generations.filter(g => g.state === 'completed').length}</p>
                  <p>• Failed: {generations.filter(g => g.state === 'failed').length}</p>
                </div>
              </>
            )}
            <Link href={`/job/progress/${jobId}`}>
              <Button className="mt-4">View Progress</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Link href={`/job/progress/${jobId}`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Progress
          </Button>
        </Link>
        <Link href="/create-job">
          <Button>
            Start New Job
          </Button>
        </Link>
      </div>
    </div>
  );
}
