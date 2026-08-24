export type TransferState = 
  | 'idle'
  | 'selecting'
  | 'connecting'
  | 'connected'
  | 'preparing'
  | 'transferring'
  | 'paused'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FileRecord {
  id: string;
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  extension: string;
  uploadedAt: string; // ISO date string
  dateGroup: string; // e.g. "24 Agustus 2026"
  category: 'photo' | 'video' | 'document' | 'audio' | 'archive' | 'other';
  device: string;
  isHeic: boolean;
  isMov: boolean;
  url: string;
  downloadUrl: string;
}

export interface ServerStatus {
  online: boolean;
  hostname: string;
  localIps: string[];
  port: number;
  serverUrl: string;
  clientUrl: string;
  totalFiles: number;
  totalSizeBytes: number;
  connectedClients: number;
  serverStartTime: string;
  firebaseConnected?: boolean;
  firebaseProjectId?: string;
  webrtcSupported?: boolean;
}

export interface TransferProgressItem {
  id: string;
  transferId: string;
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  progress: number;
  speed: string;
  status: TransferState;
  category: 'photo' | 'video' | 'document' | 'audio' | 'other';
  channelType: 'webrtc' | 'http-chunked' | 'direct';
  chunkCurrent: number;
  chunkTotal: number;
  errorDetail?: {
    stage: string;
    message: string;
    code?: string;
  };
  isHeic?: boolean;
  isMov?: boolean;
}

// Alias for backward compatibility
export type UploadProgressItem = TransferProgressItem;

export interface DebugLogEntry {
  id: string;
  timestamp: string;
  stage: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
  details?: any;
}

export interface TextNote {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  isLink: boolean;
}

export type ViewMode = 'pc' | 'mobile' | 'dual';

