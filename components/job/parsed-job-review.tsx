'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ParsedJob, FolderOperation } from '@/lib/types/job';
import { Folder, Settings, FileX } from 'lucide-react';

interface ParsedJobReviewProps {
  job: NonNullable<ParsedJob['job']>;
  interpretation?: string;
}

export function ParsedJobReview({ job, interpretation }: ParsedJobReviewProps) {
  return (
    <div className="space-y-4">
      {/* Interpretation summary */}
      {interpretation && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">AI Understanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{interpretation}</p>
          </CardContent>
        </Card>
      )}

      {/* Global settings */}
      {job.globalPrompt && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Global Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Global Prompt:</span>
              <span className="text-sm">{job.globalPrompt}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Output Format:</span>
              <Badge variant="outline">{job.outputFormat}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Folder operations */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Folder className="w-4 h-4" />
          Folder Operations ({job.folders.length})
        </h3>

        {job.folders.map((op, index) => (
          <FolderOperationCard key={index} operation={op} />
        ))}
      </div>
    </div>
  );
}

function FolderOperationCard({ operation }: { operation: FolderOperation }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            {operation.folderPath}
          </CardTitle>
          <div className="flex gap-2">
            <Badge variant="secondary">{operation.resolution}</Badge>
            <Badge variant="outline">{operation.aspectRatio}</Badge>
            <Badge variant={operation.photoMode === 'reference' ? 'default' : 'secondary'}>
              {operation.photoMode}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Operation</span>
          <p className="text-sm mt-1">{operation.operation}</p>
        </div>

        {operation.excludedFiles && operation.excludedFiles.length > 0 && (
          <div>
            <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <FileX className="w-3 h-3" />
              Excluded Files ({operation.excludedFiles.length})
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {operation.excludedFiles.map((file, i) => (
                <Badge key={i} variant="destructive" className="text-xs">
                  {file}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
