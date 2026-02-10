'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ImagePlus, X, Upload } from 'lucide-react';
import Image from 'next/image';

interface ReferencePhoto {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
}

interface ReferencePhotosProps {
  photos: ReferencePhoto[];
  onPhotosChange: (photos: ReferencePhoto[]) => void;
  maxPhotos?: number;
  sessionId: string | null;
}

export function ReferencePhotos({
  photos,
  onPhotosChange,
  maxPhotos = 7, // kie.ai allows 8 total, 1 is used by source image
  sessionId,
}: ReferencePhotosProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (!sessionId) {
        alert('Please upload source images first');
        return;
      }

      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/')
      );

      if (files.length === 0) return;

      // Limit to max photos
      const remainingSlots = maxPhotos - photos.length;
      const filesToAdd = files.slice(0, remainingSlots);

      if (filesToAdd.length < files.length) {
        alert(`Only ${remainingSlots} more reference photo(s) allowed (max ${maxPhotos})`);
      }

      // Create preview objects
      const newPhotos: ReferencePhoto[] = filesToAdd.map((file) => ({
        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      const updatedPhotos = [...photos, ...newPhotos];
      onPhotosChange(updatedPhotos);

      // Upload to Supabase
      setIsUploading(true);
      try {
        for (const photo of newPhotos) {
          const uploadedUrl = await uploadReferencePhoto(photo.file, sessionId);
          photo.uploadedUrl = uploadedUrl;
        }
        onPhotosChange([...updatedPhotos]); // Trigger re-render with URLs
      } catch (error) {
        console.error('Failed to upload reference photo:', error);
        alert('Failed to upload reference photo');
      } finally {
        setIsUploading(false);
      }
    },
    [photos, onPhotosChange, maxPhotos, sessionId]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleRemove = useCallback(
    (id: string) => {
      const photo = photos.find((p) => p.id === id);
      if (photo) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      onPhotosChange(photos.filter((p) => p.id !== id));
    },
    [photos, onPhotosChange]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !sessionId) return;

      const files = Array.from(e.target.files).filter((f) =>
        f.type.startsWith('image/')
      );

      if (files.length === 0) return;

      const remainingSlots = maxPhotos - photos.length;
      const filesToAdd = files.slice(0, remainingSlots);

      const newPhotos: ReferencePhoto[] = filesToAdd.map((file) => ({
        id: `ref-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));

      const updatedPhotos = [...photos, ...newPhotos];
      onPhotosChange(updatedPhotos);

      // Upload to Supabase
      setIsUploading(true);
      try {
        for (const photo of newPhotos) {
          const uploadedUrl = await uploadReferencePhoto(photo.file, sessionId);
          photo.uploadedUrl = uploadedUrl;
        }
        onPhotosChange([...updatedPhotos]);
      } catch (error) {
        console.error('Failed to upload reference photo:', error);
      } finally {
        setIsUploading(false);
      }

      // Reset input
      e.target.value = '';
    },
    [photos, onPhotosChange, maxPhotos, sessionId]
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ImagePlus className="w-4 h-4" />
          Reference Photos
          <span className="text-sm font-normal text-muted-foreground">
            ({photos.length}/{maxPhotos})
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Add reference photos for face swapping, style matching, etc. These will be used across all generations.
        </p>
      </CardHeader>
      <CardContent>
        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            relative border-2 border-dashed rounded-lg p-4 text-center transition-colors
            ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
            ${photos.length >= maxPhotos ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
          `}
        >
          {photos.length === 0 ? (
            <label className="relative block py-4 cursor-pointer">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop reference photos here
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                or click to browse
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileInput}
                className="hidden"
                disabled={photos.length >= maxPhotos}
              />
            </label>
          ) : (
            <div className="space-y-3">
              {/* Photo grid */}
              <div className="flex flex-wrap gap-2">
                {photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="relative group w-20 h-20 rounded-md overflow-hidden border bg-muted"
                  >
                    <Image
                      src={photo.previewUrl}
                      alt="Reference"
                      fill
                      className="object-cover"
                    />
                    {!photo.uploadedUrl && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    <button
                      onClick={() => handleRemove(photo.id)}
                      className="absolute top-1 right-1 p-1 bg-black/70 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}

                {/* Add more button */}
                {photos.length < maxPhotos && (
                  <label className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/25 flex items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
                    <ImagePlus className="w-6 h-6 text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleFileInput}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {isUploading && (
                <p className="text-xs text-muted-foreground">Uploading...</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to upload reference photo to Supabase
async function uploadReferencePhoto(file: File, sessionId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', sessionId);

  const response = await fetch('/api/upload/reference', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(errorData.error || 'Failed to upload reference photo');
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Upload failed');
  }

  return data.url;
}

export type { ReferencePhoto };
