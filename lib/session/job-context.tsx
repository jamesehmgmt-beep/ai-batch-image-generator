'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { DropResult } from '@/lib/types/upload';
import type { ParsedJob, ConversationMessage, ConversationState } from '@/lib/types/job';

export interface ReferencePhoto {
  id: string;
  file: File;
  previewUrl: string;
  uploadedUrl?: string;
}

// Session storage key for persisting data
const SESSION_KEY = 'bulkImageGen_jobSession';

// Serializable session data (without File objects)
interface SerializedSession {
  uploadSessionId: string | null;
  dropResult: DropResult | null;
  folders: string[];
  fileCountByFolder: Record<string, number>;
  conversationState: ConversationState;
  messages: ConversationMessage[];
  parsedJob: ParsedJob | null;
  referencePhotoUrls: string[]; // Only store uploaded URLs, not File objects
}

interface JobSession {
  // Upload data
  uploadSessionId: string | null;
  dropResult: DropResult | null;
  folders: string[];
  fileCountByFolder: Record<string, number>;

  // Reference photos (for face swapping, style matching, etc.)
  referencePhotos: ReferencePhoto[];

  // Conversation data
  conversationState: ConversationState;
  messages: ConversationMessage[];
  parsedJob: ParsedJob | null;

  // Actions
  setUploadData: (sessionId: string, dropResult: DropResult) => void;
  setConversationState: (state: ConversationState) => void;
  addMessage: (message: ConversationMessage) => void;
  setMessages: (messages: ConversationMessage[]) => void;
  setParsedJob: (job: ParsedJob | null) => void;
  updateParsedJob: (updater: (job: ParsedJob) => ParsedJob) => void;
  setReferencePhotos: (photos: ReferencePhoto[]) => void;
  reset: () => void;
}

const JobContext = createContext<JobSession | null>(null);

// Helper to load from sessionStorage
function loadSession(): SerializedSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('[JobContext] Failed to load session:', e);
  }
  return null;
}

// Helper to save to sessionStorage
function saveSession(data: SerializedSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('[JobContext] Failed to save session:', e);
  }
}

export function JobContextProvider({ children }: { children: ReactNode }) {
  // Initialize state from sessionStorage if available
  const [isHydrated, setIsHydrated] = useState(false);
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null);
  const [dropResult, setDropResult] = useState<DropResult | null>(null);
  const [folders, setFolders] = useState<string[]>([]);
  const [fileCountByFolder, setFileCountByFolder] = useState<Record<string, number>>({});
  const [referencePhotos, setReferencePhotos] = useState<ReferencePhoto[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState>('awaiting_prompt');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [parsedJob, setParsedJob] = useState<ParsedJob | null>(null);

  // Hydrate from sessionStorage on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setUploadSessionId(saved.uploadSessionId);
      setDropResult(saved.dropResult);
      setFolders(saved.folders);
      setFileCountByFolder(saved.fileCountByFolder);
      setConversationState(saved.conversationState);
      setMessages(saved.messages);
      setParsedJob(saved.parsedJob);
      // Restore reference photos from URLs only (no File objects)
      if (saved.referencePhotoUrls?.length) {
        setReferencePhotos(saved.referencePhotoUrls.map((url, i) => ({
          id: `restored-${i}`,
          file: new File([], 'restored'), // Placeholder, won't be used
          previewUrl: url,
          uploadedUrl: url,
        })));
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to sessionStorage whenever key data changes
  useEffect(() => {
    if (!isHydrated) return; // Don't save during hydration

    const sessionData: SerializedSession = {
      uploadSessionId,
      dropResult,
      folders,
      fileCountByFolder,
      conversationState,
      messages,
      parsedJob,
      referencePhotoUrls: referencePhotos.filter(p => p.uploadedUrl).map(p => p.uploadedUrl!),
    };
    saveSession(sessionData);
  }, [isHydrated, uploadSessionId, dropResult, folders, fileCountByFolder, conversationState, messages, parsedJob, referencePhotos]);

  const setUploadData = useCallback((sessionId: string, result: DropResult) => {
    setUploadSessionId(sessionId);
    setDropResult(result);

    // Extract folder names and file counts from folder tree
    const extractedFolders: string[] = [];
    const counts: Record<string, number> = {};

    function traverse(nodes: typeof result.folderTree, basePath: string = '') {
      for (const node of nodes) {
        if (node.type === 'folder') {
          const folderPath = basePath ? `${basePath}/${node.name}` : node.name;
          extractedFolders.push(folderPath);

          // Count files in this folder (direct children only)
          const fileCount = node.children?.filter(c => c.type === 'file').length || 0;
          counts[folderPath] = fileCount;

          // Recurse into subfolders
          if (node.children) {
            traverse(node.children, folderPath);
          }
        }
      }
    }

    traverse(result.folderTree);

    // If no nested folders, use root-level file count
    if (extractedFolders.length === 0 && result.totalCount > 0) {
      extractedFolders.push('uploads');
      counts['uploads'] = result.totalCount;
    }

    setFolders(extractedFolders);
    setFileCountByFolder(counts);
  }, []);

  const addMessage = useCallback((message: ConversationMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  const updateParsedJob = useCallback((updater: (job: ParsedJob) => ParsedJob) => {
    setParsedJob(prev => prev ? updater(prev) : null);
  }, []);

  const reset = useCallback(() => {
    setUploadSessionId(null);
    setDropResult(null);
    setFolders([]);
    setFileCountByFolder({});
    setReferencePhotos([]);
    setConversationState('awaiting_prompt');
    setMessages([]);
    setParsedJob(null);
    // Clear sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }, []);

  return (
    <JobContext.Provider
      value={{
        uploadSessionId,
        dropResult,
        folders,
        fileCountByFolder,
        referencePhotos,
        conversationState,
        messages,
        parsedJob,
        setUploadData,
        setConversationState,
        addMessage,
        setMessages,
        setParsedJob,
        updateParsedJob,
        setReferencePhotos,
        reset,
      }}
    >
      {children}
    </JobContext.Provider>
  );
}

export function useJobContext() {
  const context = useContext(JobContext);
  if (!context) {
    throw new Error('useJobContext must be used within JobContextProvider');
  }
  return context;
}
