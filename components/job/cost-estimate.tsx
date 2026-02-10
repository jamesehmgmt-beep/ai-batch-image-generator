// components/job/cost-estimate.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { CostBreakdown } from '@/lib/job/cost-estimation';
import { formatCost } from '@/lib/job/cost-estimation';
import { DollarSign, Image, Folder, Info, Layers } from 'lucide-react';

interface CostEstimateProps {
  breakdown: CostBreakdown;
}

function getModelDisplayName(modelId: string): string {
  return modelId === 'nano-banana-pro' ? 'Nano Banana Pro' : 'Seedream 4.5 Edit';
}

export function CostEstimate({ breakdown }: CostEstimateProps) {
  const { totalImages, byResolution, estimatedCost, perImageCost, byFolder, byModel } = breakdown;

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Estimated Cost
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{formatCost(estimatedCost)}</span>
            <span className="text-muted-foreground">for {totalImages} images</span>
          </div>
        </CardContent>
      </Card>

      {/* By Model breakdown - only show if multiple models used */}
      {byModel.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" />
              By Model
            </CardTitle>
            <CardDescription>Cost breakdown by generation model</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {byModel.map((model, index) => (
              <div key={index} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{getModelDisplayName(model.model)}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">{model.imageCount} images</span>
                  <span className="text-muted-foreground">@ {formatCost(model.costPerImage)}/image</span>
                  <span className="font-medium">{formatCost(model.totalCost)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Resolution breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="w-4 h-4" />
            By Resolution
          </CardTitle>
          <CardDescription>Cost varies by output resolution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {(['1K', '2K', '4K'] as const).map(res => (
              <div key={res} className="text-center p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">{res}</div>
                <div className="text-2xl font-semibold">{byResolution[res]}</div>
                <div className="text-xs text-muted-foreground">
                  @ {formatCost(perImageCost[res])}/image
                </div>
                <div className="text-sm font-medium mt-1">
                  {formatCost(byResolution[res] * perImageCost[res])}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-folder breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Folder className="w-4 h-4" />
            By Folder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byFolder.map((folder, index) => (
            <div key={index} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <span className="font-medium">{folder.folderPath}</span>
                <Badge variant="outline">{folder.tier}</Badge>
                {byModel.length > 1 && (
                  <Badge variant="secondary" className="text-xs">
                    {getModelDisplayName(folder.model)}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">{folder.imageCount} images</span>
                <span className="font-medium">{formatCost(folder.folderCost)}</span>
              </div>
            </div>
          ))}

          <Separator />

          <div className="flex items-center justify-between pt-2">
            <span className="font-semibold">Total</span>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">{totalImages} images</span>
              <span className="font-bold text-lg">{formatCost(estimatedCost)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Cost estimate based on kie.ai pricing varies by model. Actual cost may vary
          based on your subscription tier. Nano Banana Pro: $0.134-$0.24/image, Seedream 4.5 Edit: $0.032/image.
        </p>
      </div>
    </div>
  );
}
