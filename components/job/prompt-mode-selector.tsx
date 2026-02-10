'use client';

import { useEffect, useRef } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Globe, Folders } from 'lucide-react';
import { useJobContext } from '@/lib/session/job-context';
import { PerFolderPrompts } from './per-folder-prompts';

export function PromptModeSelector() {
  const { parsedJob, updateParsedJob, folders } = useJobContext();

  // Default to 'global' mode if not set
  const currentMode = parsedJob?.job?.promptMode ?? 'global';
  const globalPrompt = parsedJob?.job?.globalPrompt ?? '';

  const handleModeChange = (value: string) => {
    const newMode = value as 'global' | 'per-folder';

    updateParsedJob((prev) => {
      if (!prev.job) return prev;

      const updates: any = {
        ...prev,
        job: {
          ...prev.job,
          promptMode: newMode,
        },
      };

      // If switching TO per-folder mode AND there's a global prompt
      // Copy it to each folder as a starting point
      if (newMode === 'per-folder' && prev.job.globalPrompt?.trim()) {
        const existingFolders = prev.job.folders ?? [];
        const globalPromptValue = prev.job.globalPrompt;
        const jobModel = prev.job.model ?? 'nano-banana-pro';

        // For each uploaded folder, if it doesn't have a folder entry yet,
        // create one with the global prompt as the operation
        updates.job.folders = folders.map((folderPath) => {
          const existingFolder = existingFolders.find(f => f.folderPath === folderPath);

          if (existingFolder) {
            // Folder exists - keep it as is, or update operation if empty
            return existingFolder.operation?.trim()
              ? existingFolder
              : { ...existingFolder, operation: globalPromptValue };
          } else {
            // Folder doesn't exist - create new entry with global prompt
            return {
              folderPath,
              operation: globalPromptValue,
              model: jobModel,
              aspectRatio: 'auto' as const,
              photoMode: 'reference' as const,
              ...(jobModel === 'seedream-4.5-edit'
                ? { quality: 'basic' as const, imageSize: 'landscape_16_9' as const }
                : { resolution: '2K' as const })
            };
          }
        });
      }

      // If switching TO global mode, keep folder operations (user might switch back)
      // Don't clear them

      return updates;
    });
  };

  return (
    <Tabs value={currentMode} onValueChange={handleModeChange}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="global" className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Global Prompt
        </TabsTrigger>
        <TabsTrigger value="per-folder" className="flex items-center gap-2">
          <Folders className="h-4 w-4" />
          Per-Folder Prompts
        </TabsTrigger>
      </TabsList>

      <TabsContent value="global">
        <GlobalPromptInput />
      </TabsContent>

      <TabsContent value="per-folder">
        <PerFolderPrompts />
      </TabsContent>
    </Tabs>
  );
}

function GlobalPromptInput() {
  const { parsedJob, updateParsedJob, folders } = useJobContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const globalPrompt = parsedJob?.job?.globalPrompt ?? '';
  const folderCount = folders.length;

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [globalPrompt]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    updateParsedJob((prev) => {
      if (!prev.job) return prev;
      return {
        ...prev,
        job: {
          ...prev.job,
          globalPrompt: newValue,
        },
      };
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global Prompt</CardTitle>
        <CardDescription>
          Applied to all {folderCount} folder{folderCount !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          ref={textareaRef}
          value={globalPrompt}
          onChange={handleChange}
          placeholder="Enter a prompt to apply to all folders..."
          className="min-h-[80px] max-h-[200px] resize-none"
          rows={3}
        />
      </CardContent>
    </Card>
  );
}
