// components/job/format-selector.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image, FileImage } from 'lucide-react';

interface FormatSelectorProps {
  format: 'PNG' | 'JPG';
  onChange: (format: 'PNG' | 'JPG') => void;
}

const FORMAT_INFO = {
  PNG: {
    label: 'PNG',
    description: 'Lossless quality, larger file size',
    icon: Image,
    details: 'Best for images with transparency or sharp details',
  },
  JPG: {
    label: 'JPEG',
    description: 'Compressed, smaller file size',
    icon: FileImage,
    details: 'Good for photos, no transparency support',
  },
} as const;

export function FormatSelector({ format, onChange }: FormatSelectorProps) {
  const currentInfo = FORMAT_INFO[format];
  const Icon = currentInfo.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="w-4 h-4" />
          Output Format
        </CardTitle>
        <CardDescription>
          Choose the file format for generated images
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Format explanation */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          {(['PNG', 'JPG'] as const).map(fmt => {
            const info = FORMAT_INFO[fmt];
            const FormatIcon = info.icon;
            return (
              <div key={fmt} className="p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 font-medium">
                  <FormatIcon className="w-4 h-4" />
                  {info.label}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{info.description}</p>
                <p className="text-xs text-muted-foreground italic mt-0.5">{info.details}</p>
              </div>
            );
          })}
        </div>

        {/* Format selection */}
        <div className="flex items-center justify-between p-3 border rounded-lg">
          <div className="flex items-center gap-3">
            <div className="font-medium">Selected Format</div>
          </div>

          <Select
            value={format}
            onValueChange={(value) => onChange(value as 'PNG' | 'JPG')}
          >
            <SelectTrigger className="w-[150px]">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" />
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PNG">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4" />
                  PNG
                </div>
              </SelectItem>
              <SelectItem value="JPG">
                <div className="flex items-center gap-2">
                  <FileImage className="w-4 h-4" />
                  JPEG
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
