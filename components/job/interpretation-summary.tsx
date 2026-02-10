'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Folder } from 'lucide-react';
import type { ParsedJob } from '@/lib/types/job';
import { calculateGenerationCount } from '@/lib/job/generation-count';

interface InterpretationSummaryProps {
  job: NonNullable<ParsedJob['job']>;
  fileCountByFolder: Record<string, number>;
}

export function InterpretationSummary({ job, fileCountByFolder }: InterpretationSummaryProps) {
  // Calculate total generation count across all folders
  const totalGenerations = job.folders.reduce((sum, folder) => {
    const fileCount = fileCountByFolder[folder.folderPath] || 0;
    return sum + calculateGenerationCount(folder, fileCount);
  }, 0);

  // Group by model and calculate count per model
  const modelBreakdown = job.folders.reduce((acc, folder) => {
    const fileCount = fileCountByFolder[folder.folderPath] || 0;
    const count = calculateGenerationCount(folder, fileCount);
    const model = folder.model || 'nano-banana-pro'; // Default model

    acc[model] = (acc[model] || 0) + count;
    return acc;
  }, {} as Record<string, number>);

  // Calculate folder breakdown
  const folderBreakdown = job.folders.map(folder => ({
    folderPath: folder.folderPath,
    count: calculateGenerationCount(folder, fileCountByFolder[folder.folderPath] || 0),
    model: folder.model || 'nano-banana-pro'
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Interpretation Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total generation count */}
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Total Generations</p>
          <p className="text-2xl font-bold">{totalGenerations}</p>
        </div>

        {/* Model breakdown */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Model Breakdown</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(modelBreakdown).map(([model, count]) => (
              <Badge key={model} variant="outline" className="text-sm">
                {model}: {count}
              </Badge>
            ))}
          </div>
        </div>

        {/* Per-folder breakdown */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Folder Breakdown</p>
          <div className="space-y-2">
            {folderBreakdown.map((folder, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-xs">{folder.folderPath}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {folder.model}
                  </Badge>
                  <span className="font-semibold">{folder.count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
