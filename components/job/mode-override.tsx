// components/job/mode-override.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FolderOperation, PhotoMode } from '@/lib/types/job';
import { Camera, Eye, Wand2 } from 'lucide-react';

interface ModeOverrideProps {
  folders: FolderOperation[];
  onChange: (index: number, mode: PhotoMode) => void;
}

const MODE_INFO = {
  reference: {
    label: 'Reference',
    description: 'Photo used directly in generation',
    icon: Camera,
    example: 'Use this face, keep this pose',
  },
  analysis: {
    label: 'Analysis',
    description: 'AI examines photo content first',
    icon: Eye,
    example: 'Understand the dress, analyze the product',
  },
};

export function ModeOverride({ folders, onChange }: ModeOverrideProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wand2 className="w-4 h-4" />
          Photo Mode
        </CardTitle>
        <CardDescription>
          How source images are used in generation. AI inferred these modes - you can override if needed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode explanation */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(['reference', 'analysis'] as const).map(mode => {
            const info = MODE_INFO[mode];
            const Icon = info.icon;
            return (
              <div key={mode} className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 font-medium">
                  <Icon className="w-4 h-4" />
                  {info.label}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
                <p className="text-xs text-muted-foreground italic mt-0.5">e.g., &quot;{info.example}&quot;</p>
              </div>
            );
          })}
        </div>

        {/* Per-folder mode selection */}
        <div className="space-y-3">
          {folders.map((folder, index) => {
            const currentInfo = MODE_INFO[folder.photoMode];
            const Icon = currentInfo.icon;

            return (
              <div
                key={`${folder.folderPath}-${index}`}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="font-medium">{folder.folderPath}</div>
                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                    {folder.operation}
                  </span>
                </div>

                <Select
                  value={folder.photoMode}
                  onValueChange={(value) => onChange(index, value as PhotoMode)}
                >
                  <SelectTrigger className="w-[150px]">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reference">
                      <div className="flex items-center gap-2">
                        <Camera className="w-4 h-4" />
                        Reference
                      </div>
                    </SelectItem>
                    <SelectItem value="analysis">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4" />
                        Analysis
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
