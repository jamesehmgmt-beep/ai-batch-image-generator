'use client'

import { useState } from 'react'
import { FolderNode } from '@/lib/types/upload'
import { formatBytes } from '@/lib/upload/file-system'
import { ChevronRight, ChevronDown, Folder, FileImage } from 'lucide-react'

interface FolderTreeProps {
  folderTree: FolderNode[]
}

interface TreeNodeProps {
  node: FolderNode
  depth: number
  defaultExpanded?: boolean
}

// Count total files and size in a folder (recursive)
function countFiles(node: FolderNode): { count: number; size: number } {
  if (node.type === 'file') {
    return { count: 1, size: node.size || 0 }
  }

  let count = 0
  let size = 0

  if (node.children) {
    for (const child of node.children) {
      const stats = countFiles(child)
      count += stats.count
      size += stats.size
    }
  }

  return { count, size }
}

function TreeNode({ node, depth, defaultExpanded = false }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const isFolder = node.type === 'folder'

  const stats = isFolder ? countFiles(node) : { count: 1, size: node.size || 0 }

  const toggleExpand = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 hover:bg-accent rounded-md transition-colors ${
          isFolder ? 'cursor-pointer' : 'cursor-default'
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={toggleExpand}
      >
        {/* Expand/collapse icon */}
        {isFolder && (
          <div className="w-4 h-4 flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        )}
        {!isFolder && <div className="w-4 h-4 flex-shrink-0" />}

        {/* Folder/file icon */}
        {isFolder ? (
          <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
        ) : (
          <FileImage className="w-4 h-4 text-green-500 flex-shrink-0" />
        )}

        {/* Name */}
        <span className="flex-1 truncate text-sm">{node.name}</span>

        {/* Stats */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
          {isFolder && (
            <span>
              {stats.count} {stats.count === 1 ? 'file' : 'files'}
            </span>
          )}
          <span>{formatBytes(stats.size)}</span>
        </div>
      </div>

      {/* Children (when expanded) */}
      {isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child, i) => (
            <TreeNode
              key={`${child.path}-${i}`}
              node={child}
              depth={depth + 1}
              defaultExpanded={depth < 1} // Auto-expand first 2 levels
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FolderTree({ folderTree }: FolderTreeProps) {
  if (folderTree.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No folders to display
      </div>
    )
  }

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      <div className="max-h-[600px] overflow-y-auto">
        {folderTree.map((node, i) => (
          <TreeNode
            key={`${node.path}-${i}`}
            node={node}
            depth={0}
            defaultExpanded={true} // Auto-expand root level
          />
        ))}
      </div>
    </div>
  )
}
