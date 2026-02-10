'use client';

import { formatCost } from '@/lib/job/cost-estimation';
import type { PreExecutionSummary } from '@/lib/job/pre-execution-summary';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Folder, Clock, DollarSign, Image, Camera, Eye, AlertTriangle } from 'lucide-react';

interface PreExecutionSummaryCardProps {
  summary: PreExecutionSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isExecuting?: boolean;
}

export function PreExecutionSummaryCard({
  summary,
  onConfirm,
  onCancel,
  isExecuting = false,
}: PreExecutionSummaryCardProps) {
  const showHighCostWarning = summary.estimatedCost > 50;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Confirm Job Execution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {/* Total Photos */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
              <Image className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Total Photos</div>
              <div className="text-2xl font-semibold">{summary.totalPhotoCount}</div>
            </div>
          </div>

          {/* Estimated Cost */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 dark:bg-green-500/20">
              <DollarSign className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Estimated Cost</div>
              <div className="text-2xl font-semibold">{formatCost(summary.estimatedCost)}</div>
            </div>
          </div>

          {/* Estimated Time */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 dark:bg-purple-500/20">
              <Clock className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Estimated Time</div>
              <div className="text-2xl font-semibold">{summary.estimatedDurationFormatted}</div>
            </div>
          </div>

          {/* Folders */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 dark:bg-orange-500/20">
              <Folder className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Folders</div>
              <div className="text-2xl font-semibold">{summary.folderBreakdown.length}</div>
            </div>
          </div>
        </div>

        {/* Resolution Breakdown */}
        <div>
          <h3 className="mb-3 text-sm font-medium">Resolution Breakdown</h3>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(summary.resolutionBreakdown) as [keyof typeof summary.resolutionBreakdown, number][])
              .filter(([_, count]) => count > 0)
              .map(([resolution, count]) => {
                const costPer = resolution === '4K' ? 0.24 : 0.134;
                return (
                  <div key={resolution} className="flex flex-col gap-1">
                    <Badge variant="secondary" className="text-sm">
                      {resolution}: {count}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatCost(costPer)} per image
                    </span>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Aspect Ratio Breakdown */}
        <div>
          <h3 className="mb-3 text-sm font-medium">Aspect Ratio Breakdown</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.aspectRatioBreakdown)
              .filter(([_, count]) => count > 0)
              .map(([ratio, count]) => (
                <Badge key={ratio} variant="outline" className="text-sm">
                  {ratio}: {count}
                </Badge>
              ))}
          </div>
        </div>

        {/* Per-Folder Breakdown */}
        <div>
          <h3 className="mb-3 text-sm font-medium">Per-Folder Breakdown</h3>
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-lg border p-4">
            {summary.folderBreakdown.map((folder, index) => (
              <div
                key={index}
                className="rounded-md border border-border/50 bg-card p-3 dark:bg-card/50"
              >
                <div className="mb-2 font-semibold">{folder.folderPath}</div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div>Photos: {folder.photoCount}</div>
                  <div>Resolution: {folder.resolution}</div>
                  <div>Aspect Ratio: {folder.aspectRatio}</div>
                  <div className="flex items-center gap-1">
                    Mode:
                    <Badge variant="outline" className="ml-1 gap-1">
                      {folder.photoMode === 'reference' ? (
                        <>
                          <Camera className="h-3 w-3" />
                          Reference
                        </>
                      ) : (
                        <>
                          <Eye className="h-3 w-3" />
                          Analysis
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 text-sm font-medium">
                  Folder Cost: {formatCost(folder.folderCost)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* High Cost Warning */}
        {showHighCostWarning && (
          <div className="flex items-center gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 dark:bg-yellow-500/20">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <div>
              <div className="font-medium text-yellow-700 dark:text-yellow-500">
                High Cost Job
              </div>
              <div className="text-sm text-yellow-600 dark:text-yellow-400">
                Please verify before executing
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <Button
            onClick={onConfirm}
            disabled={isExecuting}
            className="flex-1"
          >
            {isExecuting ? 'Executing...' : 'Confirm & Start'}
          </Button>
          <Button
            onClick={onCancel}
            disabled={isExecuting}
            variant="outline"
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
