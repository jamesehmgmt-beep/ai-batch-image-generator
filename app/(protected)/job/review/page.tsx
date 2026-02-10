'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ParsedJobReview } from '@/components/job/parsed-job-review';
import { FolderOperationEditor } from '@/components/job/folder-operation-editor';
import { ModelSelector } from '@/components/job/model-selector';
import { ModelSettings } from '@/components/job/model-settings';
import { useJobContext } from '@/lib/session/job-context';
import type { ParsedJob, FolderOperation } from '@/lib/types/job';
import { ArrowLeft, Edit, Eye, Check, RotateCcw } from 'lucide-react';
import Link from 'next/link';

export default function JobReviewPage() {
  const router = useRouter();
  const { parsedJob, setParsedJob } = useJobContext();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  // Keep original job for reset functionality
  const [originalJob] = useState<ParsedJob | null>(parsedJob);

  const handleOperationChange = useCallback((index: number, updated: FolderOperation) => {
    if (!parsedJob?.job) return;

    const newFolders = [...parsedJob.job.folders];
    newFolders[index] = updated;

    setParsedJob({
      ...parsedJob,
      job: {
        ...parsedJob.job,
        folders: newFolders,
      },
    });
  }, [parsedJob, setParsedJob]);

  const handleOperationRemove = useCallback((index: number) => {
    if (!parsedJob?.job) return;

    setParsedJob({
      ...parsedJob,
      job: {
        ...parsedJob.job,
        folders: parsedJob.job.folders.filter((_, i) => i !== index),
      },
    });
  }, [parsedJob, setParsedJob]);

  const handleReset = useCallback(() => {
    if (originalJob) {
      setParsedJob(originalJob);
    }
  }, [originalJob, setParsedJob]);

  const handleConfirm = useCallback(() => {
    // Navigate to confirmation page
    // console.log('Navigating to confirm page:', parsedJob);
    router.push('/job/confirm');
  }, [parsedJob, router]);

  if (!parsedJob?.job) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No job to review. Please create a job first.</p>
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
          <Link href="/create-job">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h2 className="text-2xl font-bold">Review Job</h2>
            <p className="text-muted-foreground">
              {mode === 'view' ? 'Review the AI interpretation' : 'Edit job settings'}
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

      {/* Model Selection - shown in edit mode */}
      {mode === 'edit' && <ModelSelector />}

      {/* Model Settings - shown in edit mode */}
      {mode === 'edit' && <ModelSettings />}

      {/* Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {parsedJob.job.folders.length} Folder Operation{parsedJob.job.folders.length !== 1 ? 's' : ''}
              </CardTitle>
              <CardDescription>
                Output format: {parsedJob.job.outputFormat}
              </CardDescription>
            </div>
            {mode === 'edit' && (
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Changes
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {mode === 'view' ? (
            <ParsedJobReview
              job={parsedJob.job}
              interpretation={parsedJob.interpretation}
            />
          ) : (
            <div className="space-y-4">
              {/* Interpretation */}
              {parsedJob.interpretation && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">{parsedJob.interpretation}</p>
                </div>
              )}

              {/* Editable folder operations */}
              {parsedJob.job.folders.map((op, index) => (
                <FolderOperationEditor
                  key={`${op.folderPath}-${index}`}
                  operation={op}
                  index={index}
                  onChange={handleOperationChange}
                  onRemove={parsedJob.job!.folders.length > 1 ? handleOperationRemove : undefined}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Link href="/create-job">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Conversation
          </Button>
        </Link>
        <Button onClick={handleConfirm}>
          <Eye className="w-4 h-4 mr-2" />
          Review Interpretation
        </Button>
      </div>
    </div>
  );
}
