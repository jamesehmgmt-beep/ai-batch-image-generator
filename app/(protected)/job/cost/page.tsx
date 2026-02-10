// app/(protected)/job/cost/page.tsx
'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CostEstimate } from '@/components/job/cost-estimate';
import { ModeOverride } from '@/components/job/mode-override';
import { ReferencePhotos } from '@/components/job/reference-photos';
import { FormatSelector } from '@/components/job/format-selector';
import { PromptModeSelector } from '@/components/job/prompt-mode-selector';
import { useJobContext } from '@/lib/session/job-context';
import type { PhotoMode } from '@/lib/types/job';
import type { FolderNode } from '@/lib/types/upload';
import { calculateCostEstimate, type CostBreakdown } from '@/lib/job/cost-estimation';
import { sanitizeStoragePath } from '@/lib/upload/batch-uploader';
import { NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES } from '@/lib/models/types';
import { ArrowLeft, Eye, AlertTriangle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function CostPage() {
  const router = useRouter();
  const { parsedJob, fileCountByFolder, updateParsedJob, uploadSessionId, dropResult, referencePhotos, setReferencePhotos, messages } = useJobContext();
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate cost breakdown
  const costBreakdown = useMemo<CostBreakdown | null>(() => {
    if (!parsedJob?.job) return null;
    return calculateCostEstimate(parsedJob.job.folders, fileCountByFolder);
  }, [parsedJob?.job, fileCountByFolder]);

  // Calculate max reference photos based on model
  const maxPhotos = parsedJob?.job?.model === 'seedream-4.5-edit'
    ? SEEDREAM_CAPABILITIES.maxReferenceImages
    : NANO_BANANA_CAPABILITIES.maxReferenceImages;

  // Get model display name for descriptions
  const modelDisplayName = parsedJob?.job?.model === 'seedream-4.5-edit'
    ? SEEDREAM_CAPABILITIES.displayName
    : NANO_BANANA_CAPABILITIES.displayName;

  // Handle mode override
  const handleModeChange = useCallback((index: number, mode: PhotoMode) => {
    updateParsedJob((job) => {
      if (!job.job) return job;
      const newFolders = [...job.job.folders];
      newFolders[index] = { ...newFolders[index], photoMode: mode };
      return {
        ...job,
        job: {
          ...job.job,
          folders: newFolders,
        },
      };
    });
  }, [updateParsedJob]);

  // Handle format change
  const handleFormatChange = useCallback((format: 'PNG' | 'JPG') => {
    updateParsedJob((job) => {
      if (!job.job) return job;
      return {
        ...job,
        job: {
          ...job.job,
          outputFormat: format,
        },
      };
    });
  }, [updateParsedJob]);

  // Build filesByFolder mapping from dropResult
  const filesByFolder = useMemo(() => {
    // console.log('[Cost Page] Building filesByFolder - dropResult:', dropResult);
    // console.log('[Cost Page] Building filesByFolder - uploadSessionId:', uploadSessionId);

    if (!dropResult || !uploadSessionId) {
      // console.log('[Cost Page] filesByFolder returning empty - missing dropResult or uploadSessionId');
      return {};
    }

    const mapping: Record<string, string[]> = {};
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    // console.log('[Cost Page] Supabase URL:', supabaseUrl);

    function traverse(nodes: FolderNode[], basePath: string = '') {
      for (const node of nodes) {
        if (node.type === 'folder') {
          const folderPath = basePath ? `${basePath}/${node.name}` : node.name;
          mapping[folderPath] = [];

          // Get file URLs in this folder
          if (node.children) {
            for (const child of node.children) {
              if (child.type === 'file') {
                // Sanitize the path to match how files were uploaded
                const sanitizedPath = sanitizeStoragePath(`${folderPath}/${child.name}`);
                // Build the Supabase storage public URL
                const fileUrl = `${supabaseUrl}/storage/v1/object/public/images/${uploadSessionId}/${sanitizedPath}`;
                mapping[folderPath].push(fileUrl);
              }
            }
            // Recurse into subfolders
            traverse(node.children, folderPath);
          }
        }
      }
    }

    if (dropResult.folderTree) {
      // console.log('[Cost Page] Traversing folderTree:', dropResult.folderTree);
      traverse(dropResult.folderTree);
    } else {
      // console.log('[Cost Page] No folderTree in dropResult');
    }

    // console.log('[Cost Page] Final filesByFolder mapping:', mapping);
    // console.log('[Cost Page] Total files:', Object.values(mapping).flat().length);
    return mapping;
  }, [dropResult, uploadSessionId]);

  // Handle preview navigation - create job and navigate to preview page
  const handlePreviewGenerations = useCallback(async () => {
    if (!parsedJob || !uploadSessionId) {
      setError('Missing job data or session');
      return;
    }

    // Comprehensive debugging for file mapping issues
    // console.log('[Cost Page] ========== handlePreviewGenerations START ==========');
    // console.log('[Cost Page] uploadSessionId:', uploadSessionId);
    // console.log('[Cost Page] dropResult:', dropResult);
    // console.log('[Cost Page] dropResult.folderTree:', dropResult?.folderTree);

    // Debug filesByFolder
    // console.log('[Cost Page] filesByFolder keys:', Object.keys(filesByFolder));
    const filesPerFolder = Object.entries(filesByFolder).map(([k, v]) => `${k}: ${(v as string[]).length} files`);
    // console.log('[Cost Page] filesByFolder breakdown:', filesPerFolder);

    // Check for folder mismatches (case-insensitive to match job create API)
    const parsedPaths = parsedJob.job?.folders.map(f => f.folderPath) || [];
    const availablePaths = Object.keys(filesByFolder);
    const availablePathsLower = availablePaths.map(p => p.toLowerCase());
    const missingFolders = parsedPaths.filter(p => !availablePathsLower.includes(p.toLowerCase()));
    if (missingFolders.length > 0) {
      console.warn('[Cost Page] WARNING: Parsed folders not in filesByFolder:', missingFolders);
    }

    // Check if filesByFolder is empty
    const totalFiles = Object.values(filesByFolder).flat().length;
    if (totalFiles === 0) {
      const parsedFolders = parsedJob.job?.folders.map(f => f.folderPath).join(', ') || 'none';
      const availableFolders = Object.keys(filesByFolder).join(', ') || 'none';
      setError(`No files found. Session data may have been lost. Try re-uploading your images.\n\nParsed folders: ${parsedFolders}\nAvailable folders: ${availableFolders}\ndropResult: ${dropResult ? 'exists' : 'null'}\nuploadSessionId: ${uploadSessionId || 'null'}`);
      return;
    }

    // Check for folder mismatches before making API call
    if (missingFolders.length > 0) {
      setError(`Folder mismatch: AI referenced folders that don't exist in uploads.\n\nMissing: ${missingFolders.join(', ')}\nAvailable: ${availablePaths.join(', ')}\n\nPlease check your prompt matches the folder names.`);
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      // Get reference photo URLs (only uploaded ones)
      const referencePhotoUrls = referencePhotos
        .filter(p => p.uploadedUrl)
        .map(p => p.uploadedUrl as string);

      // Extract user's original prompt from conversation messages
      // This is needed for Phase 26 intent analysis (variations detection)
      const userPrompt = messages
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join('\n');

      // Step 1: Create the job (this now also creates generation records with reference URLs)
      const createResponse = await fetch('/api/job/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: uploadSessionId,
          parsedJob,
          fileCountByFolder,
          filesByFolder, // Required for generation creation
          referencePhotoUrls, // IMPORTANT: Include reference photos for preview
          userPrompt, // Phase 26: For intent analysis (variations detection)
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || 'Failed to create job');
      }

      const createData = await createResponse.json();
      const { job } = createData;
      // console.log('Job created:', job);
      // console.log('Job creation response:', createData);

      // Verify job has generations before navigating
      if (!job?.id) {
        throw new Error('Job creation succeeded but no job ID returned');
      }

      if (job.totalGenerations === 0) {
        throw new Error(`Job created but has 0 generations. This indicates a folder mismatch. Check that folder names in your prompt match uploaded folders.`);
      }

      // console.log(`[Cost Page] Job ${job.id} created with ${job.totalGenerations} generations`);
      // console.log(`[Cost Page] Job ID type: ${typeof job.id}, value: "${job.id}"`);

      // Step 2: Navigate to preview page (NOT execute)
      const previewUrl = `/job/preview/${job.id}`;
      // console.log(`[Cost Page] Navigating to: ${previewUrl}`);
      router.push(previewUrl);

    } catch (err) {
      console.error('Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create job');
      setIsExecuting(false);
    }
    // Note: Don't set isExecuting to false on success - we're navigating away
  }, [parsedJob, uploadSessionId, fileCountByFolder, filesByFolder, referencePhotos, messages, router]);

  if (!parsedJob?.job || !costBreakdown) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No job to estimate. Please create a job first.</p>
            <Link href="/create-job">
              <Button className="mt-4">Create Job</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/job/confirm">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Cost Estimation</h2>
          <p className="text-muted-foreground">
            Review cost and photo mode before execution
          </p>
        </div>
      </div>

      {/* Prompt Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt Configuration</CardTitle>
          <CardDescription>Choose global prompt or per-folder prompts</CardDescription>
        </CardHeader>
        <CardContent>
          <PromptModeSelector />
        </CardContent>
      </Card>

      {/* Cost breakdown */}
      <CostEstimate breakdown={costBreakdown} />

      {/* Mode override */}
      <ModeOverride
        folders={parsedJob.job.folders}
        onChange={handleModeChange}
      />

      {/* Reference photos */}
      <ReferencePhotos
        photos={referencePhotos}
        onPhotosChange={setReferencePhotos}
        sessionId={uploadSessionId}
        maxPhotos={maxPhotos}
      />

      {/* Format selector */}
      <FormatSelector
        format={parsedJob.job.outputFormat || 'PNG'}
        onChange={handleFormatChange}
      />

      {/* Warning for high costs */}
      {costBreakdown.estimatedCost > 50 && (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0" />
            <div>
              <p className="font-medium text-yellow-500">High Cost Warning</p>
              <p className="text-sm text-muted-foreground">
                This job will cost approximately ${costBreakdown.estimatedCost.toFixed(2)}.
                Consider reducing the number of images or using a lower resolution.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error display */}
      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
            <div>
              <p className="font-medium text-red-500">Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-between pt-4">
        <Link href="/job/confirm">
          <Button variant="outline" disabled={isExecuting}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Confirm
          </Button>
        </Link>
        <Button onClick={handlePreviewGenerations} size="lg" disabled={isExecuting}>
          {isExecuting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating Job...
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" />
              Preview Generations ({costBreakdown.totalImages} images)
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
