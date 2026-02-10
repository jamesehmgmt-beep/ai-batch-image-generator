'use client';

import { useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Folder } from 'lucide-react';
import { useJobContext } from '@/lib/session/job-context';

export function PerFolderPrompts() {
  const { folders, fileCountByFolder, parsedJob, updateParsedJob } = useJobContext();

  // Early return if not in per-folder mode
  if (parsedJob?.job?.promptMode !== 'per-folder') {
    return null;
  }

  const updateFolderPrompt = (folderPath: string, newPrompt: string) => {
    updateParsedJob((prev) => {
      if (!prev.job) return prev;

      const existingFolders = prev.job.folders ?? [];
      const folderIndex = existingFolders.findIndex(f => f.folderPath === folderPath);

      if (folderIndex >= 0) {
        // Folder exists - update operation field
        const updatedFolders = [...existingFolders];
        updatedFolders[folderIndex] = {
          ...updatedFolders[folderIndex],
          operation: newPrompt,
        };

        return {
          ...prev,
          job: {
            ...prev.job,
            folders: updatedFolders,
          },
        };
      } else {
        // Folder doesn't exist yet - add new folder entry
        const newFolder: any = {
          folderPath,
          operation: newPrompt,
          model: prev.job.model ?? 'nano-banana-pro',
          aspectRatio: 'auto' as const,
          photoMode: 'reference' as const,
        };

        // Add model-specific defaults based on job.model
        if (prev.job.model === 'seedream-4.5-edit') {
          newFolder.quality = 'basic';
          newFolder.imageSize = 'landscape_16_9';
        } else {
          // nano-banana-pro
          newFolder.resolution = '2K';
        }

        return {
          ...prev,
          job: {
            ...prev.job,
            folders: [...existingFolders, newFolder],
          },
        };
      }
    });
  };

  // Show validation warning if any folder has empty operation
  const hasEmptyFolders = folders.some(folderPath => {
    const parsedFolder = parsedJob?.job?.folders?.find(f => f.folderPath === folderPath);
    return !parsedFolder?.operation?.trim();
  });

  return (
    <div className="space-y-4">
      {hasEmptyFolders && (
        <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-md p-3">
          Some folders have empty prompts. Each folder needs a prompt to proceed.
        </div>
      )}

      <div className="space-y-3">
        {folders.map((folderPath) => {
          const parsedFolder = parsedJob?.job?.folders?.find(f => f.folderPath === folderPath);
          const currentPrompt = parsedFolder?.operation ?? '';
          const fileCount = fileCountByFolder[folderPath] ?? 0;
          const isEmpty = !currentPrompt.trim();

          return (
            <FolderPromptCard
              key={folderPath}
              folderPath={folderPath}
              fileCount={fileCount}
              prompt={currentPrompt}
              isEmpty={isEmpty}
              onPromptChange={(newPrompt) => updateFolderPrompt(folderPath, newPrompt)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface FolderPromptCardProps {
  folderPath: string;
  fileCount: number;
  prompt: string;
  isEmpty: boolean;
  onPromptChange: (prompt: string) => void;
}

function FolderPromptCard({
  folderPath,
  fileCount,
  prompt,
  isEmpty,
  onPromptChange,
}: FolderPromptCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  return (
    <Card className={isEmpty ? 'border-amber-200 dark:border-amber-900' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Folder className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{folderPath}</span>
          <Badge variant="secondary" className="ml-auto">
            {fileCount} image{fileCount !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={`Enter prompt for ${folderPath}...`}
          className={`min-h-[80px] max-h-[200px] resize-none ${isEmpty ? 'border-amber-200 dark:border-amber-900' : ''}`}
          rows={3}
        />
        {isEmpty && (
          <p className="text-xs text-amber-600 mt-2">
            This folder needs a prompt
          </p>
        )}
      </CardContent>
    </Card>
  );
}
