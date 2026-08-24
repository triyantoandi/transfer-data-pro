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
}

export interface UploadProgressItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  speed: string;
  status: 'queued' | 'uploading' | 'completed' | 'error';
  category: 'photo' | 'video' | 'document' | 'audio' | 'other';
  errorMsg?: string;
  isHeic?: boolean;
  isMov?: boolean;
}

export interface TextNote {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  isLink: boolean;
}

export type ViewMode = 'pc' | 'mobile' | 'dual';
