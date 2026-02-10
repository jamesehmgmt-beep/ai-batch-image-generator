'use client';

import { useState, memo, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from './status-badge';
import { ChevronDown, ChevronUp, Save, ImageIcon, Edit2, X, Plus, Upload, Trash2 } from 'lucide-react';
import { NANO_BANANA_CAPABILITIES, SEEDREAM_CAPABILITIES } from '@/lib/models/types';
import type { ModelId } from '@/lib/models/types';

interface EditableGenerationItemProps {
  generation: {
    id: string;
    state: 'pending' | 'processing' | 'completed' | 'failed';
    operation: string;
    prompt?: string; // Per-generation prompt (v4.0+)
    sourceFileName: string;
    referenceImageUrls: string[];
    resolution: string;
    aspectRatio: string;
    photoMode: string;
    folderPath: string;
    model?: string;
    quality?: string | null;
    imageSize?: string | null;
  };
  onSave: (id: string, updates: {
    operation?: string;
    prompt?: string; // Per-generation prompt (v4.0+)
    resolution?: string;
    aspectRatio?: string;
    photoMode?: string;
    referenceImageUrls?: string[];
    model?: string;
    quality?: string | null;
    imageSize?: string | null;
  }) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  sessionId?: string; // For uploading new reference photos
}

export const EditableGenerationItem = memo(function EditableGenerationItem({
  generation,
  onSave,
  onDelete,
  sessionId,
}: EditableGenerationItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Local edit state - use prompt if available, fall back to operation
  const displayPrompt = generation.prompt || generation.operation;
  const [editedOperation, setEditedOperation] = useState(displayPrompt);
  const [editedResolution, setEditedResolution] = useState(generation.resolution);
  const [editedAspectRatio, setEditedAspectRatio] = useState(generation.aspectRatio);
  const [editedPhotoMode, setEditedPhotoMode] = useState(generation.photoMode);
  const [editedReferenceUrls, setEditedReferenceUrls] = useState<string[]>(generation.referenceImageUrls || []);
  const [editedModel, setEditedModel] = useState<string>(generation.model || 'nano-banana-pro');
  const [editedQuality, setEditedQuality] = useState<string>(generation.quality || 'basic');
  const [editedImageSize, setEditedImageSize] = useState<string>(generation.imageSize || 'landscape_16_9');

  const canEdit = generation.state === 'pending';
  const isNanoBanana = editedModel === 'nano-banana-pro';

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!onDelete || !canEdit) return;
    if (!confirm('Are you sure you want to delete this generation?')) return;

    setIsDeleting(true);
    try {
      await onDelete(generation.id);
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete, canEdit, generation.id]);

  // Handle model change - also update dependent fields
  const handleModelChange = useCallback((newModel: string) => {
    setEditedModel(newModel);
    if (newModel === 'nano-banana-pro') {
      setEditedResolution('2K');
    } else {
      setEditedQuality('basic');
      setEditedImageSize('landscape_16_9');
    }
  }, []);

  // Upload a reference photo to Supabase
  const uploadReferencePhoto = useCallback(async (file: File): Promise<string | null> => {
    if (!sessionId) {
      console.error('No sessionId for upload');
      return null;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', sessionId);
    formData.append('path', `ref-${generation.id}-${Date.now()}-${file.name}`);

    try {
      const res = await fetch('/api/upload/reference', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error('Upload failed');
      }

      const data = await res.json();
      return data.url;
    } catch (error) {
      console.error('Failed to upload reference photo:', error);
      return null;
    }
  }, [sessionId, generation.id]);

  // Handle file drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (!canEdit) return;

    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map(uploadReferencePhoto);
      const urls = await Promise.all(uploadPromises);
      const validUrls = urls.filter((url): url is string => url !== null);

      if (validUrls.length > 0) {
        const newUrls = [...editedReferenceUrls, ...validUrls];
        setEditedReferenceUrls(newUrls);
        // Auto-save when adding photos
        await onSave(generation.id, { referenceImageUrls: newUrls });
      }
    } finally {
      setIsUploading(false);
    }
  }, [canEdit, editedReferenceUrls, uploadReferencePhoto, onSave, generation.id]);

  // Handle file input change
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadPromises = files.map(uploadReferencePhoto);
      const urls = await Promise.all(uploadPromises);
      const validUrls = urls.filter((url): url is string => url !== null);

      if (validUrls.length > 0) {
        const newUrls = [...editedReferenceUrls, ...validUrls];
        setEditedReferenceUrls(newUrls);
        // Auto-save when adding photos
        await onSave(generation.id, { referenceImageUrls: newUrls });
      }
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [editedReferenceUrls, uploadReferencePhoto, onSave, generation.id]);

  // Remove a reference photo
  const handleRemoveReference = useCallback(async (index: number) => {
    const newUrls = editedReferenceUrls.filter((_, i) => i !== index);
    setEditedReferenceUrls(newUrls);
    // Auto-save when removing photos
    await onSave(generation.id, { referenceImageUrls: newUrls });
  }, [editedReferenceUrls, onSave, generation.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Note: resolution and aspect_ratio are NOT NULL in DB, so always provide values
      // quality and image_size are nullable (Seedream-only fields)
      // v4.0+: Save to 'prompt' field (per-generation prompt) instead of 'operation'
      const updates = {
        prompt: editedOperation, // Save to prompt field (what kie.ai uses)
        resolution: editedResolution, // Keep value even for Seedream (column is NOT NULL)
        aspectRatio: editedAspectRatio,
        photoMode: editedPhotoMode,
        referenceImageUrls: editedReferenceUrls,
        model: editedModel,
        quality: !isNanoBanana ? editedQuality : null,
        imageSize: !isNanoBanana ? editedImageSize : null,
      };
      // console.log('[EditableGenerationItem] Saving updates:', generation.id, updates);
      await onSave(generation.id, updates);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert(`Failed to save changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedOperation(generation.prompt || generation.operation);
    setEditedResolution(generation.resolution);
    setEditedAspectRatio(generation.aspectRatio);
    setEditedPhotoMode(generation.photoMode);
    setEditedReferenceUrls(generation.referenceImageUrls || []);
    setEditedModel(generation.model || 'nano-banana-pro');
    setEditedQuality(generation.quality || 'basic');
    setEditedImageSize(generation.imageSize || 'landscape_16_9');
    setIsEditing(false);
  };

  return (
    <Card className="border-gray-800 bg-gray-900/50">
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-md bg-gray-800">
              <ImageIcon className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={generation.sourceFileName}>
                {generation.sourceFileName}
              </p>
              <p className="text-xs text-muted-foreground">
                {generation.folderPath} • {generation.resolution} • {generation.aspectRatio}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Show reference photo count badge if any */}
            {(generation.referenceImageUrls?.length || 0) > 0 && (
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                {generation.referenceImageUrls.length} ref
              </span>
            )}
            {/* Model badge */}
            <span className={`text-xs px-2 py-0.5 rounded ${
              (generation.model || 'nano-banana-pro') === 'nano-banana-pro'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-green-500/20 text-green-400'
            }`}>
              {(generation.model || 'nano-banana-pro') === 'nano-banana-pro' ? 'Nano' : 'Seedream'}
            </span>
            <StatusBadge state={generation.state} />
            {canEdit && !isEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsExpanded(true);
                  setIsEditing(true);
                }}
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            )}
            {canEdit && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
            {/* Prompt */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Prompt
              </label>
              {isEditing ? (
                <Textarea
                  value={editedOperation}
                  onChange={(e) => setEditedOperation(e.target.value)}
                  className="min-h-[80px] bg-gray-800 border-gray-700"
                />
              ) : (
                <p className="text-sm bg-gray-800 rounded p-2">
                  {generation.prompt || generation.operation}
                </p>
              )}
            </div>

            {/* Settings row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Model */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Model
                </label>
                {isEditing ? (
                  <Select value={editedModel} onValueChange={handleModelChange}>
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nano-banana-pro">Nano Banana Pro</SelectItem>
                      <SelectItem value="seedream-4.5-edit">Seedream 4.5 Edit</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{(generation.model || 'nano-banana-pro') === 'nano-banana-pro' ? 'Nano Banana' : 'Seedream'}</p>
                )}
              </div>

              {/* Resolution (Nano Banana) or Quality (Seedream) */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {isNanoBanana ? 'Resolution' : 'Quality'}
                </label>
                {isEditing ? (
                  isNanoBanana ? (
                    <Select value={editedResolution} onValueChange={setEditedResolution}>
                      <SelectTrigger className="bg-gray-800 border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1K">1K</SelectItem>
                        <SelectItem value="2K">2K</SelectItem>
                        <SelectItem value="4K">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={editedQuality} onValueChange={setEditedQuality}>
                      <SelectTrigger className="bg-gray-800 border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="basic">Basic</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <p className="text-sm">{isNanoBanana ? generation.resolution : (generation.quality || 'basic')}</p>
                )}
              </div>

              {/* Aspect Ratio (Nano) or Image Size (Seedream) */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {isNanoBanana ? 'Aspect Ratio' : 'Image Size'}
                </label>
                {isEditing ? (
                  isNanoBanana ? (
                    <Select value={editedAspectRatio} onValueChange={setEditedAspectRatio}>
                      <SelectTrigger className="bg-gray-800 border-gray-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto</SelectItem>
                        <SelectItem value="1:1">1:1</SelectItem>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                        <SelectItem value="3:2">3:2</SelectItem>
                        <SelectItem value="2:3">2:3</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={editedImageSize} onValueChange={setEditedImageSize}>
                      <SelectTrigger className="bg-gray-800 border-gray-700">
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
                  )
                ) : (
                  <p className="text-sm">{isNanoBanana ? generation.aspectRatio : (generation.imageSize || 'landscape_16_9')}</p>
                )}
              </div>

              {/* Photo Mode */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Photo Mode
                </label>
                {isEditing ? (
                  <Select value={editedPhotoMode} onValueChange={setEditedPhotoMode}>
                    <SelectTrigger className="bg-gray-800 border-gray-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="reference">Reference</SelectItem>
                      <SelectItem value="analysis">Analysis</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm capitalize">{generation.photoMode}</p>
                )}
              </div>
            </div>

            {/* Reference images with add/remove */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Reference Images ({editedReferenceUrls.length})
                {canEdit && (
                  <span className="text-muted-foreground/60 ml-2">
                    (First image is the source file)
                  </span>
                )}
              </label>

              {/* Drag and drop zone */}
              {canEdit && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-3 mb-2 transition-colors ${
                    isDragOver
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Drop images here or{' '}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-blue-400 hover:text-blue-300 underline"
                        >
                          browse
                        </button>
                      </>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}

              {/* Reference image thumbnails */}
              <div className="flex gap-2 overflow-x-auto pb-2 flex-wrap">
                {editedReferenceUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Reference ${index + 1}`}
                      className={`w-16 h-16 object-cover rounded border ${
                        index === 0 ? 'border-blue-500' : 'border-gray-700'
                      }`}
                      title={index === 0 ? 'Source file (primary)' : `Reference ${index}`}
                    />
                    {canEdit && index > 0 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveReference(index)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove reference"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    )}
                    {index === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-blue-500/80 text-[10px] text-center text-white py-0.5">
                        Source
                      </span>
                    )}
                  </div>
                ))}

                {/* Add button */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 border-2 border-dashed border-gray-700 rounded flex items-center justify-center hover:border-gray-500 hover:bg-gray-800/50 transition-colors"
                    title="Add reference image"
                  >
                    <Plus className="w-5 h-5 text-gray-500" />
                  </button>
                )}
              </div>
            </div>

            {/* Edit actions */}
            {isEditing && (
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
