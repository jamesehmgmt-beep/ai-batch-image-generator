'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InterpretationSummary } from '@/components/job/interpretation-summary';
import { PerImageAssignments } from '@/components/job/per-image-assignments';
import { FolderExclusions } from '@/components/job/folder-exclusions';
import { useJobContext } from '@/lib/session/job-context';
import type { ImageOperation } from '@/lib/types/job';
import { ArrowLeft, Eye, Edit, Check } from 'lucide-react';
import Link from 'next/link';

export default function ConfirmPage() {
  const router = useRouter();
  const { parsedJob, fileCountByFolder, updateParsedJob } = useJobContext();
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  // Handle image operations changes
  const handleImageOperationsChange = useCallback((folderIndex: number, updated: ImageOperation[]) => {
    updateParsedJob((job) => {
      if (!job.job) return job;
      const newFolders = [...job.job.folders];
      newFolders[folderIndex] = {
        ...newFolders[folderIndex],
        imageOperations: updated,
      };
      return { ...job, job: { ...job.job, folders: newFolders } };
    });
  }, [updateParsedJob]);

  // Handle exclusion removal
  const handleExclusionsRemove = useCallback((folderIndex: number, fileName: string) => {
    updateParsedJob((job) => {
      if (!job.job) return job;
      const newFolders = [...job.job.folders];
      const folder = newFolders[folderIndex];
      newFolders[folderIndex] = {
        ...folder,
        excludedFiles: folder.excludedFiles?.filter(f => f !== fileName) || [],
      };
      return { ...job, job: { ...job.job, folders: newFolders } };
    });
  }, [updateParsedJob]);

  // Handle exclusion add
  const handleExclusionsAdd = useCallback((folderIndex: number, fileName: string) => {
    updateParsedJob((job) => {
      if (!job.job) return job;
      const newFolders = [...job.job.folders];
      const folder = newFolders[folderIndex];
      newFolders[folderIndex] = {
        ...folder,
        excludedFiles: [...(folder.excludedFiles || []), fileName],
      };
      return { ...job, job: { ...job.job, folders: newFolders } };
    });
  }, [updateParsedJob]);

  // Handle navigation
  const handleEditPrompt = useCallback(() => {
    router.push('/job/review');
  }, [router]);

  const handleContinue = useCallback(() => {
    router.push('/job/cost');
  }, [router]);

  // Empty state
  if (!parsedJob?.job) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No interpretation to confirm. Please create a job first.</p>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/job/review">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold">Confirm Interpretation</h2>
            <p className="text-muted-foreground">
              {mode === 'view' ? 'Review AI interpretation before continuing' : 'Edit interpretation details'}
            </p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <Button
            variant={mode === 'view' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('view')}
          >
            <Eye className="w-4 h-4 mr-2" />
            View
          </Button>
          <Button
            variant={mode === 'edit' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('edit')}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      {/* AI Interpretation Text - always visible, sticky in edit mode */}
      {parsedJob.interpretation && (
        <Card className={mode === 'edit' ? 'sticky top-4 z-10' : ''}>
          <CardHeader>
            <CardTitle className="text-base">AI Interpretation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{parsedJob.interpretation}</p>
          </CardContent>
        </Card>
      )}

      {/* Interpretation Summary */}
      <InterpretationSummary job={parsedJob.job} fileCountByFolder={fileCountByFolder} />

      {/* Per-folder details */}
      <Card>
        <CardHeader>
          <CardTitle>Folder Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {parsedJob.job.folders.map((folder, folderIndex) => (
            <div key={folderIndex} className="space-y-3">
              {/* Folder path header */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <h3 className="font-mono text-sm font-semibold">{folder.folderPath}</h3>
                <Badge variant="secondary" className="text-xs">
                  {folder.model || 'nano-banana-pro'}
                </Badge>
              </div>

              {/* Per-image assignments (if exists) */}
              {folder.imageOperations && folder.imageOperations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Per-Image Assignments</h4>
                  <PerImageAssignments
                    folderPath={folder.folderPath}
                    imageOperations={folder.imageOperations}
                    isEditable={mode === 'edit'}
                    onChange={(updated) => handleImageOperationsChange(folderIndex, updated)}
                  />
                </div>
              )}

              {/* Folder exclusions (if exists and no imageOperations) */}
              {(!folder.imageOperations || folder.imageOperations.length === 0) && folder.excludedFiles && folder.excludedFiles.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Excluded Files</h4>
                  <FolderExclusions
                    folderPath={folder.folderPath}
                    excludedFiles={folder.excludedFiles}
                    isEditable={mode === 'edit'}
                    onRemove={(fileName) => handleExclusionsRemove(folderIndex, fileName)}
                    onAdd={(fileName) => handleExclusionsAdd(folderIndex, fileName)}
                  />
                </div>
              )}

              {/* Operation text preview */}
              {folder.operation && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">Operation</h4>
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm">{folder.operation}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={handleEditPrompt}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Edit Prompt
        </Button>
        <Button onClick={handleContinue} size="lg">
          <Check className="w-4 h-4 mr-2" />
          Approve & Continue
        </Button>
      </div>
    </div>
  );
}
