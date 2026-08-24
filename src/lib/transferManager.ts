import { 
  TransferState, 
  TransferProgressItem, 
  DebugLogEntry, 
  FileRecord 
} from '../types';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  addDoc, 
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';

export const CHUNK_SIZE = 64 * 1024; // 64 KB per chunk for high reliability
export const BUFFER_THRESHOLD = 64 * 1024 * 16; // 1 MB buffer high-water mark for backpressure

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export type LogCallback = (entry: DebugLogEntry) => void;

export class TransferLogger {
  private listeners: LogCallback[] = [];
  private logs: DebugLogEntry[] = [];

  subscribe(cb: LogCallback) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  log(stage: string, message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info', details?: any) {
    const entry: DebugLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      stage,
      message,
      level,
      details,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();

    console.log(`[TRANSFER] [${stage}] ${message}`, details || '');
    this.listeners.forEach((cb) => cb(entry));
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }
}

export const transferLogger = new TransferLogger();

export interface ChunkMetadata {
  transferId: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Execute robust chunked transfer to PC local receiver with full validation and backpressure
 */
export async function sendFileViaChunkedProtocol(
  file: File,
  transferItem: TransferProgressItem,
  onProgress: (updated: Partial<TransferProgressItem>) => void,
  logger: TransferLogger,
  signalAbort?: AbortSignal
): Promise<{ success: boolean; fileRecord?: FileRecord; error?: string }> {
  const transferId = transferItem.transferId || 'tr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
  
  logger.log('VALIDATION', `Memvalidasi file: "${file.name}"`, 'info', {
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    lastModified: new Date(file.lastModified).toLocaleString(),
  });

  if (!file || file.size === 0) {
    const err = 'File kosong atau ukuran 0 byte tidak dapat ditransfer';
    logger.log('VALIDATION', err, 'error');
    throw new Error(err);
  }

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  logger.log('PREPARATION', `Inisialisasi sesi transfer (Total Chunks: ${totalChunks}, Chunk Size: 64 KB)`, 'info', {
    transferId,
    totalChunks,
    chunkSize: CHUNK_SIZE
  });

  onProgress({
    status: 'preparing',
    chunkTotal: totalChunks,
    chunkCurrent: 0,
    progress: 0,
    speed: 'Menghubungkan ke PC...',
    channelType: 'http-chunked'
  });

  // 1. Initialize transfer session on PC server
  let initSuccess = false;
  try {
    const initRes = await fetch('/api/transfer/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transferId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        totalChunks,
        device: transferItem.id || 'Mobile Client',
      }),
      signal: signalAbort,
    });

    if (initRes.ok) {
      const data = await initRes.json();
      logger.log('SESSION', `Sesi transfer dibuat di PC (Session ID: ${transferId})`, 'success', data);
      initSuccess = true;
    } else {
      const errText = await initRes.text();
      logger.log('SESSION', `Gagal inisialisasi sesi di PC (${initRes.status}): ${errText}`, 'warn');
    }
  } catch (err: any) {
    if (signalAbort?.aborted) {
      logger.log('CANCEL', 'Transfer dibatalkan oleh pengguna', 'warn');
      onProgress({ status: 'cancelled' });
      return { success: false, error: 'Dibatalkan' };
    }
    logger.log('SESSION', `Fallback ke direct transfer: ${err?.message}`, 'warn');
  }

  // 2. Transfer chunks sequentially with backpressure flow control
  onProgress({
    status: 'transferring',
    speed: 'Mentransfer chunk...'
  });

  const startTime = Date.now();
  let bytesTransferred = 0;

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    if (signalAbort?.aborted) {
      logger.log('CANCEL', `Transfer dihentikan pada chunk ${chunkIndex + 1}/${totalChunks}`, 'warn');
      // notify server to cleanup
      fetch(`/api/transfer/cancel/${transferId}`, { method: 'POST' }).catch(() => {});
      onProgress({ status: 'cancelled' });
      return { success: false, error: 'Dibatalkan' };
    }

    const startByte = chunkIndex * CHUNK_SIZE;
    const endByte = Math.min(file.size, startByte + CHUNK_SIZE);
    const chunkBlob = file.slice(startByte, endByte);

    let chunkSent = false;
    let retries = 0;

    while (!chunkSent && retries < 3) {
      try {
        const formData = new FormData();
        formData.append('chunk', chunkBlob, file.name);
        formData.append('transferId', transferId);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());

        const chunkRes = await fetch('/api/transfer/chunk', {
          method: 'POST',
          body: formData,
          signal: signalAbort,
        });

        if (!chunkRes.ok) {
          throw new Error(`HTTP ${chunkRes.status} saat mengirim chunk ${chunkIndex + 1}`);
        }

        chunkSent = true;
        bytesTransferred += (endByte - startByte);

        const percent = Math.round((bytesTransferred / file.size) * 100);
        const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
        const speedMBs = (bytesTransferred / (1024 * 1024) / elapsedSec).toFixed(1);

        onProgress({
          chunkCurrent: chunkIndex + 1,
          progress: Math.min(percent, 99),
          speed: `${speedMBs} MB/s`,
          status: 'transferring'
        });

        if (chunkIndex === 0 || chunkIndex === totalChunks - 1 || (chunkIndex + 1) % 20 === 0) {
          logger.log('TRANSFER', `Mengirim chunk ${chunkIndex + 1}/${totalChunks} (${percent}%) - Kecepatan: ${speedMBs} MB/s`, 'info');
        }
      } catch (err: any) {
        retries++;
        logger.log('RETRY', `Gagal mengirim chunk ${chunkIndex + 1} (Percobaan ${retries}/3): ${err?.message}`, 'warn');
        if (retries >= 3) {
          throw new Error(`Gagal mengirim chunk ${chunkIndex + 1} setelah 3 percobaan: ${err?.message}`);
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  // 3. Finalize & assemble chunks on PC
  logger.log('FINALIZING', 'Semua chunk terkirim, PC sedang menggabungkan & memvalidasi file...', 'info');
  onProgress({
    status: 'finalizing',
    speed: 'Memverifikasi keutuhan file...'
  });

  const completeRes = await fetch('/api/transfer/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transferId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      totalChunks,
      device: transferItem.id || 'Mobile Client'
    }),
    signal: signalAbort,
  });

  if (!completeRes.ok) {
    const errText = await completeRes.text();
    logger.log('FINALIZING', `Gagal finalisasi transfer di PC: ${errText}`, 'error');
    throw new Error(`PC gagal memverifikasi file: ${errText}`);
  }

  const completeData = await completeRes.json();
  logger.log('COMPLETED', `Transfer file "${file.name}" berhasil 100% utuh tanpa kompresi!`, 'success', completeData);

  onProgress({
    status: 'completed',
    progress: 100,
    speed: 'Selesai',
    chunkCurrent: totalChunks
  });

  return { success: true, fileRecord: completeData.file };
}
