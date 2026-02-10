export interface FileWithPath {
  file: File
  path: string // e.g., "folder1/subfolder/image.jpg"
}

export interface FolderNode {
  name: string
  path: string
  type: 'folder' | 'file'
  children?: FolderNode[]
  file?: File
  size?: number
}

export interface UploadProgress {
  total: number
  completed: number
  failed: number
  inProgress: number
}

export interface PresignedUrl {
  signedUrl: string
  path: string
  token: string
}

export interface PresignedUrlRequest {
  path: string // e.g., "folder1/subfolder/image.jpg"
}

export interface PresignedUrlResponse {
  signedUrl: string
  path: string
  token: string
}

export interface BatchPresignedUrlRequest {
  paths: string[]
}

export interface BatchPresignedUrlResponse {
  urls: Array<PresignedUrl | { path: string; error: string }>
}

export interface DropResult {
  files: FileWithPath[]
  folderTree: FolderNode[]
  totalSize: number
  totalCount: number
}
