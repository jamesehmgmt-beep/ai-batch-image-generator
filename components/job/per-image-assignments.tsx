// components/job/per-image-assignments.tsx
'use client';

import { ImageOperation } from '@/lib/types/job';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { X, Plus } from 'lucide-react';
import { useState } from 'react';

// Format Seedream imageSize for display
function formatSeedreamSize(size: string | undefined): string {
  if (!size) return 'Default';
  // 'landscape_16_9' -> 'Landscape 16:9'
  const [orientation, ratio] = size.split('_');
  if (!ratio) return size;
  const formattedRatio = ratio.replace('_', ':');
  return `${orientation.charAt(0).toUpperCase()}${orientation.slice(1)} ${formattedRatio}`;
}

// Format model name for display
function formatModelName(model: string): string {
  switch (model) {
    case 'nano-banana-pro': return 'Nano Banana Pro';
    case 'seedream-4.5-edit': return 'Seedream 4.5';
    default: return model;
  }
}

interface PerImageAssignmentsProps {
  folderPath: string;
  imageOperations: ImageOperation[];
  isEditable: boolean;
  onChange?: (updated: ImageOperation[]) => void;
}

export function PerImageAssignments({
  folderPath,
  imageOperations,
  isEditable,
  onChange,
}: PerImageAssignmentsProps) {
  const [newFileName, setNewFileName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Empty state - return null in view mode, show add button in edit mode
  if (imageOperations.length === 0) {
    if (!isEditable) return null;

    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          No per-image assignments. Click to add specific model assignments for individual files.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Image Assignment
        </Button>
        {showAddForm && (
          <Card>
            <CardContent className="pt-4">
              <AddImageOperationForm
                onAdd={(newOp) => {
                  onChange?.([newOp]);
                  setShowAddForm(false);
                  setNewFileName('');
                }}
                onCancel={() => {
                  setShowAddForm(false);
                  setNewFileName('');
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const handleModelChange = (index: number, newModel: 'nano-banana-pro' | 'seedream-4.5-edit') => {
    const updated = [...imageOperations];
    const currentOp = updated[index];

    // Reset model-specific params based on new model
    if (newModel === 'nano-banana-pro') {
      updated[index] = {
        fileName: currentOp.fileName,
        operation: currentOp.operation,
        model: 'nano-banana-pro',
        resolution: '2K',
        quality: undefined,
        imageSize: undefined,
      };
    } else {
      updated[index] = {
        fileName: currentOp.fileName,
        operation: currentOp.operation,
        model: 'seedream-4.5-edit',
        quality: 'basic',
        imageSize: 'landscape_16_9',
        resolution: undefined,
      };
    }

    onChange?.(updated);
  };

  const handleParamChange = (index: number, field: string, value: any) => {
    const updated = [...imageOperations];
    updated[index] = {
      ...updated[index],
      [field]: value,
    } as ImageOperation;
    onChange?.(updated);
  };

  const handleRemove = (index: number) => {
    const updated = imageOperations.filter((_, i) => i !== index);
    onChange?.(updated);
  };

  const handleAdd = (newOp: ImageOperation) => {
    onChange?.([...imageOperations, newOp]);
    setShowAddForm(false);
    setNewFileName('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {imageOperations.map((imageOp, index) => (
          <Card key={index}>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {/* File name and model */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{imageOp.fileName}</span>
                      {!isEditable && (
                        <Badge variant="secondary">
                          {formatModelName(imageOp.model)}
                        </Badge>
                      )}
                    </div>
                    {imageOp.operation && (
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {imageOp.operation}
                      </p>
                    )}
                  </div>
                  {isEditable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {/* Model selector (edit mode) */}
                {isEditable && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Model</label>
                    <Select
                      value={imageOp.model}
                      onValueChange={(value) =>
                        handleModelChange(index, value as 'nano-banana-pro' | 'seedream-4.5-edit')
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
                        <SelectItem value="seedream-4.5-edit">Seedream 4.5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Model-specific params */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Nano Banana Pro params */}
                  {imageOp.model === 'nano-banana-pro' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Resolution</label>
                        {isEditable ? (
                          <Select
                            value={imageOp.resolution || '2K'}
                            onValueChange={(value) => handleParamChange(index, 'resolution', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1K">1K</SelectItem>
                              <SelectItem value="2K">2K</SelectItem>
                              <SelectItem value="4K">4K</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm">{imageOp.resolution || '2K'}</div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Seedream 4.5 Edit params */}
                  {imageOp.model === 'seedream-4.5-edit' && (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Quality</label>
                        {isEditable ? (
                          <Select
                            value={imageOp.quality || 'basic'}
                            onValueChange={(value) => handleParamChange(index, 'quality', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="basic">Basic</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm capitalize">{imageOp.quality || 'basic'}</div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium">Image Size</label>
                        {isEditable ? (
                          <Select
                            value={imageOp.imageSize || 'landscape_16_9'}
                            onValueChange={(value) => handleParamChange(index, 'imageSize', value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="square_1_1">Square (1:1)</SelectItem>
                              <SelectItem value="portrait_3_4">Portrait (3:4)</SelectItem>
                              <SelectItem value="portrait_9_16">Portrait (9:16)</SelectItem>
                              <SelectItem value="landscape_4_3">Landscape (4:3)</SelectItem>
                              <SelectItem value="landscape_16_9">Landscape (16:9)</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="text-sm">{formatSeedreamSize(imageOp.imageSize)}</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Add new image operation */}
      {isEditable && (
        <div>
          {!showAddForm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Image Assignment
            </Button>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <AddImageOperationForm
                  onAdd={handleAdd}
                  onCancel={() => {
                    setShowAddForm(false);
                    setNewFileName('');
                  }}
                />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// Form for adding new image operations
interface AddImageOperationFormProps {
  onAdd: (newOp: ImageOperation) => void;
  onCancel: () => void;
}

function AddImageOperationForm({ onAdd, onCancel }: AddImageOperationFormProps) {
  const [fileName, setFileName] = useState('');
  const [model, setModel] = useState<'nano-banana-pro' | 'seedream-4.5-edit'>('nano-banana-pro');

  const handleSubmit = () => {
    if (!fileName.trim()) return;

    const newOp: ImageOperation = model === 'nano-banana-pro'
      ? {
          fileName: fileName.trim(),
          model: 'nano-banana-pro',
          resolution: '2K',
          quality: undefined,
          imageSize: undefined,
        }
      : {
          fileName: fileName.trim(),
          model: 'seedream-4.5-edit',
          quality: 'basic',
          imageSize: 'landscape_16_9',
          resolution: undefined,
        };

    onAdd(newOp);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label className="text-xs font-medium">File Name</label>
        <Input
          placeholder="e.g., product-1.jpg"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium">Model</label>
        <Select
          value={model}
          onValueChange={(value) => setModel(value as 'nano-banana-pro' | 'seedream-4.5-edit')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
            <SelectItem value="seedream-4.5-edit">Seedream 4.5</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} size="sm" disabled={!fileName.trim()}>
          Add
        </Button>
        <Button onClick={onCancel} size="sm" variant="outline">
          Cancel
        </Button>
      </div>
    </div>
  );
}
