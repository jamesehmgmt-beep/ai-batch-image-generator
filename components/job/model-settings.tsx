// components/job/model-settings.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useJobContext } from '@/lib/session/job-context';
import { NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES } from '@/lib/models/types';
import { Settings } from 'lucide-react';

/**
 * Seedream image size options matching the schema.
 * Uses UI-friendly values that get mapped to API values in the strategy.
 */
const SEEDREAM_IMAGE_SIZES = [
  { value: 'square_1_1', label: 'Square (1:1)' },
  { value: 'portrait_3_4', label: 'Portrait (3:4)' },
  { value: 'portrait_9_16', label: 'Portrait (9:16)' },
  { value: 'landscape_4_3', label: 'Landscape (4:3)' },
  { value: 'landscape_16_9', label: 'Landscape (16:9)' },
];

export function ModelSettings() {
  const { parsedJob, updateParsedJob } = useJobContext();

  if (!parsedJob?.job) return null;

  const currentModel = parsedJob.job.model;
  const folders = parsedJob.job.folders;

  // Use first folder for display values (all folders should have same settings in global mode)
  const firstFolder = folders[0];
  if (!firstFolder) return null;

  /**
   * Update a field across ALL folders.
   * For global settings mode - all folders should have the same model-specific parameters.
   */
  const updateAllFolders = (field: string, value: any) => {
    updateParsedJob((prev) => {
      if (!prev.job) return prev;

      const updatedFolders = prev.job.folders.map((folder) => ({
        ...folder,
        [field]: value,
      }));

      return {
        ...prev,
        job: {
          ...prev.job,
          folders: updatedFolders,
        },
      };
    });
  };

  // Render Nano Banana Pro settings
  if (currentModel === 'nano-banana-pro') {
    const resolution = firstFolder.model === 'nano-banana-pro' ? firstFolder.resolution : '2K';
    const aspectRatio = firstFolder.aspectRatio;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Model Settings
          </CardTitle>
          <CardDescription>
            Configure Nano Banana Pro generation parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Resolution selector */}
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Select
                value={resolution}
                onValueChange={(value) => updateAllFolders('resolution', value)}
              >
                <SelectTrigger id="resolution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1K">
                    <div className="flex flex-col">
                      <span className="font-medium">1K</span>
                      <span className="text-xs text-muted-foreground">
                        ${NANO_BANANA_CAPABILITIES.costPerGeneration['1K']} per image
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="2K">
                    <div className="flex flex-col">
                      <span className="font-medium">2K</span>
                      <span className="text-xs text-muted-foreground">
                        ${NANO_BANANA_CAPABILITIES.costPerGeneration['2K']} per image
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="4K">
                    <div className="flex flex-col">
                      <span className="font-medium">4K</span>
                      <span className="text-xs text-muted-foreground">
                        ${NANO_BANANA_CAPABILITIES.costPerGeneration['4K']} per image
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Aspect Ratio selector */}
            <div className="space-y-2">
              <Label htmlFor="aspectRatio">Aspect Ratio</Label>
              <Select
                value={aspectRatio}
                onValueChange={(value) => updateAllFolders('aspectRatio', value)}
              >
                <SelectTrigger id="aspectRatio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NANO_BANANA_CAPABILITIES.supportedAspectRatios.map((ratio) => (
                    <SelectItem key={ratio} value={ratio}>
                      {ratio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render Seedream 4.5 Edit settings
  if (currentModel === 'seedream-4.5-edit') {
    const quality = firstFolder.model === 'seedream-4.5-edit' ? firstFolder.quality : 'basic';
    const imageSize = firstFolder.model === 'seedream-4.5-edit' ? firstFolder.imageSize : 'landscape_16_9';

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Model Settings
          </CardTitle>
          <CardDescription>
            Configure Seedream 4.5 Edit generation parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Quality selector */}
            <div className="space-y-2">
              <Label htmlFor="quality">Quality</Label>
              <Select
                value={quality}
                onValueChange={(value) => updateAllFolders('quality', value)}
              >
                <SelectTrigger id="quality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">
                    <div className="flex flex-col">
                      <span className="font-medium">Basic</span>
                      <span className="text-xs text-muted-foreground">
                        ${SEEDREAM_CAPABILITIES.costPerGeneration['basic']} per image
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="high">
                    <div className="flex flex-col">
                      <span className="font-medium">High</span>
                      <span className="text-xs text-muted-foreground">
                        ${SEEDREAM_CAPABILITIES.costPerGeneration['high']} per image
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Image Size selector */}
            <div className="space-y-2">
              <Label htmlFor="imageSize">Image Size</Label>
              <Select
                value={imageSize}
                onValueChange={(value) => updateAllFolders('imageSize', value)}
              >
                <SelectTrigger id="imageSize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEEDREAM_IMAGE_SIZES.map((size) => (
                    <SelectItem key={size.value} value={size.value}>
                      {size.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
