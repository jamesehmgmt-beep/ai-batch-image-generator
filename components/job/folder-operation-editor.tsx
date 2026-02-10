'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { FolderOperation, PhotoMode, Resolution, AspectRatio } from '@/lib/types/job';
import { X, Plus, Folder, ChevronDown, ChevronUp } from 'lucide-react';

interface FolderOperationEditorProps {
  operation: FolderOperation;
  index: number;
  onChange: (index: number, updated: FolderOperation) => void;
  onRemove?: (index: number) => void;
}

const RESOLUTIONS: ('1K' | '2K' | '4K')[] = ['1K', '2K', '4K'];
const ASPECT_RATIOS: AspectRatio[] = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9', 'auto'];
const PHOTO_MODES: PhotoMode[] = ['reference', 'analysis'];

export function FolderOperationEditor({
  operation,
  index,
  onChange,
  onRemove,
}: FolderOperationEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newExcludedFile, setNewExcludedFile] = useState('');

  const updateField = <K extends keyof FolderOperation>(
    field: K,
    value: FolderOperation[K]
  ) => {
    onChange(index, { ...operation, [field]: value });
  };

  const addExcludedFile = () => {
    const trimmed = newExcludedFile.trim();
    if (trimmed && !operation.excludedFiles?.includes(trimmed)) {
      updateField('excludedFiles', [...(operation.excludedFiles || []), trimmed]);
      setNewExcludedFile('');
    }
  };

  const removeExcludedFile = (file: string) => {
    updateField(
      'excludedFiles',
      operation.excludedFiles?.filter(f => f !== file) || []
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle
            className="text-base font-medium flex items-center gap-2 cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Folder className="w-4 h-4" />
            {operation.folderPath}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </CardTitle>
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(index)}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Operation prompt */}
          <div className="space-y-2">
            <Label htmlFor={`op-${index}`}>Operation</Label>
            <Textarea
              id={`op-${index}`}
              value={operation.operation}
              onChange={e => updateField('operation', e.target.value)}
              placeholder="Describe what to do with images in this folder..."
              rows={2}
            />
          </div>

          {/* Settings row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Photo Mode</Label>
              <Select
                value={operation.photoMode}
                onValueChange={v => updateField('photoMode', v as PhotoMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHOTO_MODES.map(mode => (
                    <SelectItem key={mode} value={mode}>
                      {mode === 'reference' ? 'Reference (use as-is)' : 'Analysis (examine content)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select
                value={operation.resolution || '2K'}
                onValueChange={v => updateField('resolution', v as Resolution)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map(res => (
                    <SelectItem key={res} value={res}>{res}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <Select
                value={operation.aspectRatio}
                onValueChange={v => updateField('aspectRatio', v as AspectRatio)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASPECT_RATIOS.map(ratio => (
                    <SelectItem key={ratio} value={ratio}>{ratio}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Excluded files */}
          <div className="space-y-2">
            <Label>Excluded Files</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {operation.excludedFiles?.map(file => (
                <Badge
                  key={file}
                  variant="secondary"
                  className="flex items-center gap-1"
                >
                  {file}
                  <button
                    onClick={() => removeExcludedFile(file)}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newExcludedFile}
                onChange={e => setNewExcludedFile(e.target.value)}
                placeholder="filename.jpg"
                onKeyDown={e => e.key === 'Enter' && addExcludedFile()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={addExcludedFile}
                disabled={!newExcludedFile.trim()}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
