'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileX, X } from 'lucide-react';

interface FolderExclusionsProps {
  folderPath: string;
  excludedFiles: string[];
  isEditable?: boolean;
  onRemove?: (fileName: string) => void;
  onAdd?: (fileName: string) => void;
}

export function FolderExclusions({
  folderPath,
  excludedFiles,
  isEditable = false,
  onRemove,
  onAdd,
}: FolderExclusionsProps) {
  const [inputValue, setInputValue] = useState('');

  // If nothing to show and not editable, return null
  if (excludedFiles.length === 0 && !isEditable) {
    return null;
  }

  const handleAdd = () => {
    if (inputValue.trim() && onAdd) {
      onAdd(inputValue.trim());
      setInputValue(''); // Clear input after adding
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-2">
      {/* Header with icon and count */}
      {excludedFiles.length > 0 && (
        <>
          <span className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <FileX className="w-3 h-3" />
            Excluded Files ({excludedFiles.length})
          </span>

          {/* Display excluded files as badges */}
          <div className="flex flex-wrap gap-1">
            {excludedFiles.map((file, i) => (
              <Badge key={i} variant="destructive" className="text-xs">
                {file}
                {isEditable && onRemove && (
                  <button
                    onClick={() => onRemove(file)}
                    className="ml-1 hover:bg-destructive-foreground/20 rounded-full p-0.5"
                    aria-label={`Remove ${file}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        </>
      )}

      {/* Add input (only in edit mode) */}
      {isEditable && (
        <div className="flex gap-2 pt-1">
          <Input
            type="text"
            placeholder="Add file to exclude..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-xs h-8"
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={!inputValue.trim()}
            className="h-8"
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
