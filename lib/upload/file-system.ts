import { FileWithPath, FolderNode, DropResult } from '@/lib/types/upload'

// Accepted image MIME types
const ACCEPTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]

// Max file size: 30MB
const MAX_FILE_SIZE = 30 * 1024 * 1024

function isAcceptedImage(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) && file.size <= MAX_FILE_SIZE
}

/**
 * Extract files from a drag-drop event, preserving folder structure
 * Uses File System Access API for folder traversal with webkitGetAsEntry fallback
 * IMPORTANT: Maintains original drag-and-drop order of folders
 */
export async function extractFilesFromDrop(
  dataTransfer: DataTransfer
): Promise<DropResult> {
  const files: FileWithPath[] = []
  const folderTree: FolderNode[] = []

  // Track original drop order for each top-level item
  const dropOrderMap = new Map<string, number>()

  const items = [...dataTransfer.items]

  // Process all items in parallel for better multi-folder support
  // Each promise resolves with { index, node } to preserve order
  const processPromises: Promise<{ index: number; node: FolderNode | null }>[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const dropIndex = i

    if (item.kind !== 'file') {
      processPromises.push(Promise.resolve({ index: dropIndex, node: null }))
      continue
    }

    // Try File System Access API first (best folder support)
    if ('getAsFileSystemHandle' in item) {
      const promise = (async (): Promise<{ index: number; node: FolderNode | null }> => {
        try {
          const handle = await (item as any).getAsFileSystemHandle()
          if (!handle) return { index: dropIndex, node: null }

          if (handle.kind === 'directory') {
            const folderNode: FolderNode = {
              name: handle.name,
              path: handle.name,
              type: 'folder',
              children: [],
            }
            await traverseDirectory(handle, handle.name, files, folderNode.children!)
            // Sort children alphabetically for consistent ordering within folder
            sortFolderChildren(folderNode.children!)
            dropOrderMap.set(handle.name, dropIndex)
            return { index: dropIndex, node: folderNode }
          } else if (handle.kind === 'file') {
            const file = await handle.getFile()
            if (isAcceptedImage(file)) {
              files.push({ file, path: handle.name })
              const fileNode: FolderNode = {
                name: handle.name,
                path: handle.name,
                type: 'file',
                file,
                size: file.size,
              }
              dropOrderMap.set(handle.name, dropIndex)
              return { index: dropIndex, node: fileNode }
            }
          }
          return { index: dropIndex, node: null }
        } catch (error) {
          console.warn('File System Access API error, trying webkitGetAsEntry:', error)
          // Fallback to webkitGetAsEntry for better multi-folder support
          const node = await processWebkitEntryWithReturn(item, files, dropOrderMap, dropIndex)
          return { index: dropIndex, node }
        }
      })()
      processPromises.push(promise)
    } else {
      // Use webkitGetAsEntry as fallback (supports multiple folders better)
      const promise = (async (): Promise<{ index: number; node: FolderNode | null }> => {
        const node = await processWebkitEntryWithReturn(item, files, dropOrderMap, dropIndex)
        return { index: dropIndex, node }
      })()
      processPromises.push(promise)
    }
  }

  // Wait for all items to be processed
  const results = await Promise.all(processPromises)

  // Sort by original drop order and filter out nulls
  results
    .sort((a, b) => a.index - b.index)
    .forEach(result => {
      if (result.node) {
        folderTree.push(result.node)
      }
    })

  const totalSize = files.reduce((sum, f) => sum + f.file.size, 0)

  return {
    files,
    folderTree,
    totalSize,
    totalCount: files.length,
  }
}

/**
 * Sort folder children alphabetically for consistent ordering
 */
function sortFolderChildren(nodes: FolderNode[]): void {
  nodes.sort((a, b) => a.name.localeCompare(b.name))
  // Recursively sort children of subfolders
  for (const node of nodes) {
    if (node.type === 'folder' && node.children) {
      sortFolderChildren(node.children)
    }
  }
}

/**
 * Process a DataTransferItem using webkitGetAsEntry (fallback for multi-folder)
 * Returns the FolderNode for order-preserving collection
 */
async function processWebkitEntryWithReturn(
  item: DataTransferItem,
  files: FileWithPath[],
  dropOrderMap: Map<string, number>,
  dropIndex: number
): Promise<FolderNode | null> {
  const entry = item.webkitGetAsEntry?.()

  if (!entry) {
    // Final fallback - just get the file
    const file = item.getAsFile()
    if (file && isAcceptedImage(file)) {
      files.push({ file, path: file.name })
      dropOrderMap.set(file.name, dropIndex)
      return {
        name: file.name,
        path: file.name,
        type: 'file',
        file,
        size: file.size,
      }
    }
    return null
  }

  if (entry.isDirectory) {
    const folderNode: FolderNode = {
      name: entry.name,
      path: entry.name,
      type: 'folder',
      children: [],
    }
    await traverseWebkitDirectory(entry as FileSystemDirectoryEntry, entry.name, files, folderNode.children!)
    // Sort children alphabetically for consistent ordering within folder
    sortFolderChildren(folderNode.children!)
    dropOrderMap.set(entry.name, dropIndex)
    return folderNode
  } else if (entry.isFile) {
    const file = await getFileFromEntry(entry as FileSystemFileEntry)
    if (file && isAcceptedImage(file)) {
      files.push({ file, path: entry.name })
      dropOrderMap.set(entry.name, dropIndex)
      return {
        name: entry.name,
        path: entry.name,
        type: 'file',
        file,
        size: file.size,
      }
    }
  }
  return null
}

/**
 * Get File object from FileSystemFileEntry
 */
function getFileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

/**
 * Traverse directory using webkit API (fallback)
 */
async function traverseWebkitDirectory(
  dirEntry: FileSystemDirectoryEntry,
  basePath: string,
  files: FileWithPath[],
  treeNodes: FolderNode[]
): Promise<void> {
  const reader = dirEntry.createReader()

  // Read all entries (may require multiple reads)
  const readEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject)
    })
  }

  let entries: FileSystemEntry[] = []
  let batch: FileSystemEntry[]

  // Keep reading until we get an empty batch
  do {
    batch = await readEntries()
    entries = entries.concat(batch)
  } while (batch.length > 0)

  // Sort entries alphabetically before processing for consistent ordering
  entries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const entryPath = `${basePath}/${entry.name}`

    if (entry.isFile) {
      const file = await getFileFromEntry(entry as FileSystemFileEntry)
      if (isAcceptedImage(file)) {
        files.push({ file, path: entryPath })
        treeNodes.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
          file,
          size: file.size,
        })
      }
    } else if (entry.isDirectory) {
      const folderNode: FolderNode = {
        name: entry.name,
        path: entryPath,
        type: 'folder',
        children: [],
      }
      treeNodes.push(folderNode)
      await traverseWebkitDirectory(entry as FileSystemDirectoryEntry, entryPath, files, folderNode.children!)
    }
  }
}

/**
 * Recursively traverse a directory and collect image files
 * Entries are sorted alphabetically for consistent ordering
 */
async function traverseDirectory(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string,
  files: FileWithPath[],
  treeNodes: FolderNode[]
): Promise<void> {
  // Type assertion for FileSystemDirectoryHandle.values() which is not yet in TypeScript lib
  const entriesIterator = (dirHandle as any).values() as AsyncIterableIterator<FileSystemHandle>

  // Collect all entries first so we can sort them
  const entries: FileSystemHandle[] = []
  for await (const entry of entriesIterator) {
    entries.push(entry)
  }

  // Sort alphabetically for consistent ordering
  entries.sort((a, b) => a.name.localeCompare(b.name))

  for (const entry of entries) {
    const entryPath = `${basePath}/${entry.name}`

    if (entry.kind === 'file') {
      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()

      if (isAcceptedImage(file)) {
        files.push({ file, path: entryPath })
        treeNodes.push({
          name: entry.name,
          path: entryPath,
          type: 'file',
          file,
          size: file.size,
        })
      }
    } else if (entry.kind === 'directory') {
      const folderNode: FolderNode = {
        name: entry.name,
        path: entryPath,
        type: 'folder',
        children: [],
      }
      treeNodes.push(folderNode)

      const childDirHandle = entry as FileSystemDirectoryHandle
      await traverseDirectory(childDirHandle, entryPath, files, folderNode.children!)
    }
  }
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Check if File System Access API is supported
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'DataTransferItem' in window && 'getAsFileSystemHandle' in DataTransferItem.prototype
}
