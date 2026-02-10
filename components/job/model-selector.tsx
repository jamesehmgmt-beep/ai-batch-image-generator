// components/job/model-selector.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJobContext } from '@/lib/session/job-context';
import { NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES } from '@/lib/models/types';
import type { ModelId } from '@/lib/models/types';
import { Sparkles } from 'lucide-react';

export function ModelSelector() {
  const { parsedJob, updateParsedJob } = useJobContext();

  if (!parsedJob?.job) return null;

  const models = [NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES];
  const currentModel = parsedJob.job.model;

  const handleModelChange = (newModelId: ModelId) => {
    updateParsedJob((prev) => {
      if (!prev.job) return prev;

      // Update job-level model
      const updatedJob = {
        ...prev.job,
        model: newModelId,
      };

      // Update ALL folders to new model with proper defaults
      // CRITICAL: Must explicitly set unused fields to undefined for discriminated union validation
      const updatedFolders = prev.job.folders.map((folder) => {
        if (newModelId === 'nano-banana-pro') {
          // Switching to Nano Banana Pro
          return {
            ...folder,
            model: 'nano-banana-pro' as const,
            resolution: '2K' as const,
            // Clear Seedream-specific fields
            quality: undefined,
            imageSize: undefined,
          };
        } else {
          // Switching to Seedream 4.5 Edit
          return {
            ...folder,
            model: 'seedream-4.5-edit' as const,
            quality: 'basic' as const,
            imageSize: 'landscape_16_9' as const,
            // Clear Nano Banana-specific fields
            resolution: undefined,
          };
        }
      });

      return {
        ...prev,
        job: {
          ...updatedJob,
          folders: updatedFolders,
        },
      };
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Model Selection
        </CardTitle>
        <CardDescription>
          Choose the AI model for image generation
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="font-medium">Current Model</div>
          </div>

          <Select
            value={currentModel}
            onValueChange={(value) => handleModelChange(value as ModelId)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((cap) => (
                <SelectItem key={cap.id} value={cap.id}>
                  <div className="flex flex-col">
                    <span className="font-medium">{cap.displayName}</span>
                    <span className="text-muted-foreground text-xs">
                      {cap.id === 'nano-banana-pro'
                        ? `3 resolutions, ${cap.supportedAspectRatios.length} aspect ratios`
                        : `${Object.keys(cap.costPerGeneration).length} quality tiers, ${cap.supportedAspectRatios.length} sizes`}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
