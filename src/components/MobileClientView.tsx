import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  TransferProgressItem, 
  FileRecord, 
  TextNote, 
  TransferState, 
  DebugLogEntry 
} from '../types';
import { formatFileSize, formatTime } from '../utils/formatters';
import { 
  Camera, 
  FolderOpen, 
  CheckCircle, 
  AlertCircle, 
  Wifi, 
  ShieldCheck, 
  Zap, 
  Smartphone, 
  Check,
  RefreshCw,
  Eye,
  Download,
  Info,
  MessageSquare,
  Send,
  Copy,
  Link,
  Trash2,
  Terminal,
  Activity,
  XCircle,
  RotateCcw,
  PlayCircle,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Cpu
} from 'lucide-react';
import { 
  transferLogger, 
  sendFileViaChunkedProtocol, 
  CHUNK_SIZE 
} from '../lib/transferManager';
import { WebRTCManager } from '../lib/webrtcTransfer';

interface MobileClientViewProps {
  serverOnline: boolean;
  onUploadSuccess: () => void;
  serverFiles?: FileRecord[];
  notes?: TextNote[];
  onAddNote?: (content: string, sender: string) => void;
  onDeleteNote?: (id: string) => void;
  isEmbedded?: boolean;
}

export const MobileClientView: React.FC<MobileClientViewProps> = ({
  serverOnline,
  onUploadSuccess,
  serverFiles = [],
  notes = [],
  onAddNote,
  onDeleteNote,
  isEmbedded = false
}) => {
  const [deviceName, setDeviceName] = useState<string>('iPhone / Android');
  const [isEditingDevice, setIsEditingDevice] = useState<boolean>(false);
  const [transferQueue, setTransferQueue] = useState<TransferProgressItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'test' | 'files_on_pc' | 'notes' | 'debug'>('upload');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  
  // Debug & diagnostics state
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [webrtcState, setWebrtcState] = useState<string>('idle');
  const [connectionTestResult, setConnectionTestResult] = useState<{
    tested: boolean;
    pingMs?: number;
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  // File Inspector Modal / State
  const [selectedFileMeta, setSelectedFileMeta] = useState<{
    name: string;
    size: number;
    type: string;
    lastModified: string;
  } | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  // Subscribe to transfer logger
  useEffect(() => {
    setDebugLogs(transferLogger.getLogs());
    const unsub = transferLogger.subscribe((entry) => {
      setDebugLogs((prev) => [entry, ...prev.slice(0, 100)]);
    });

    // Initialize WebRTC client
    const webrtc = new WebRTCManager(transferLogger);
    webrtc.setOnStateChange((st) => setWebrtcState(st));
    webrtc.initClientSender('global-wifi-session');
    webrtcManagerRef.current = webrtc;

    return () => {
      unsub();
      webrtc.cleanup();
    };
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const handleSendMobileNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim() || !onAddNote) return;
    onAddNote(noteInput.trim(), deviceName || 'HP Mobile');
    setNoteInput('');
    showNotification('Teks terkirim ke PC!', 'success');
  };

  const handleCopyNote = (text: string, noteId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNoteId(noteId);
    setTimeout(() => setCopiedNoteId(null), 2000);
    showNotification('Teks disalin ke clipboard', 'success');
  };

  /**
   * Run Connection Test
   */
  const handleTestConnection = async () => {
    transferLogger.log('TEST_CONN', 'Memulai pengujian koneksi ke PC Server...', 'info');
    setConnectionTestResult({
      tested: true,
      success: false,
      message: 'Menguji respons jaringan lokal PC...'
    });

    const start = performance.now();
    try {
      const res = await fetch('/api/transfer/test-ping', { cache: 'no-store' });
      const elapsed = Math.round(performance.now() - start);

      if (res.ok) {
        const data = await res.json();
        transferLogger.log('TEST_CONN', `Koneksi PC Server OK (${elapsed} ms)`, 'success', data);
        setConnectionTestResult({
          tested: true,
          pingMs: elapsed,
          success: true,
          message: `Koneksi Terhubung! Respons PC: ${elapsed} ms`,
          details: `Hostname: ${data.hostname || 'PC Server'} | Waktu: ${data.serverTime}`
        });
        showNotification(`Koneksi PC Normal (${elapsed} ms)`, 'success');
      } else {
        throw new Error(`PC merespons dengan kode HTTP ${res.status}`);
      }
    } catch (err: any) {
      transferLogger.log('TEST_CONN', `Koneksi PC Gagal: ${err?.message}`, 'error');
      setConnectionTestResult({
        tested: true,
        success: false,
        message: 'Koneksi ke PC Server Gagal',
        details: err?.message || 'Pastikan PC dan HP dalam satu jaringan WiFi.'
      });
      showNotification('Gagal terhubung ke PC', 'error');
    }
  };

  /**
   * Run Multi-tier Synthetic Transfer Test (1KB, 10KB, 1MB, 10MB, 100MB)
   */
  const handleRunTierTest = async (sizeBytes: number, label: string) => {
    transferLogger.log('TIER_TEST', `Membuat data pengujian sintetis: ${label} (${sizeBytes} bytes)`, 'info');
    
    // Generate synthetic dummy file
    const chunkPattern = '0123456789ABCDEF';
    const repeatCount = Math.ceil(Math.min(sizeBytes, 1024 * 1024) / chunkPattern.length);
    const seed = chunkPattern.repeat(repeatCount).substring(0, Math.min(sizeBytes, 1024 * 1024));
    
    const parts: BlobPart[] = [];
    let remaining = sizeBytes;
    while (remaining > 0) {
      const thisSize = Math.min(remaining, seed.length);
      parts.push(seed.substring(0, thisSize));
      remaining -= thisSize;
    }

    const testFile = new File(parts, `TEST_${label.replace(/\s+/g, '_')}_${Date.now()}.bin`, {
      type: 'application/octet-stream',
      lastModified: Date.now()
    });

    handleStartTransfer([testFile]);
  };

  /**
   * Process Selected Files with Comprehensive Validation & State Machine
   */
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    handleStartTransfer(fileList);
  };

  const handleStartTransfer = async (fileList: File[]) => {
    if (fileList.length === 0) return;

    transferLogger.log('QUEUE', `Menerima ${fileList.length} file untuk ditransfer`, 'info');

    // 1. Validate all files first
    const validItems: { file: File; item: TransferProgressItem }[] = [];

    for (const file of fileList) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isHeic = ext === 'heic' || ext === 'heif';
      const isMov = ext === 'mov';
      let category: TransferProgressItem['category'] = 'other';
      if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext) || file.type.startsWith('image/')) {
        category = 'photo';
      } else if (['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'].includes(ext) || file.type.startsWith('video/')) {
        category = 'video';
      } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(ext)) {
        category = 'document';
      } else if (file.type.startsWith('audio/')) {
        category = 'audio';
      }

      // Record validation in inspector
      setSelectedFileMeta({
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        lastModified: new Date(file.lastModified).toLocaleString()
      });

      transferLogger.log('FILE_CHECK', `File: ${file.name} | Ukuran: ${formatFileSize(file.size)} | MIME: ${file.type || 'binary'}`, 'info');

      // Check empty files
      if (file.size === 0) {
        transferLogger.log('VALIDATION_ERROR', `File "${file.name}" ditolak karena ukuran 0 byte (kosong)`, 'error');
        showNotification(`File "${file.name}" tidak dapat dikirim karena kosong (0 KB)`, 'error');
        continue;
      }

      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const itemId = Math.random().toString(36).substring(2, 9);
      const transferId = 'tr-' + Date.now().toString(36) + '-' + itemId;

      const progressItem: TransferProgressItem = {
        id: itemId,
        transferId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        progress: 0,
        speed: 'Menghubungkan ke PC...',
        status: 'connecting',
        category,
        channelType: 'http-chunked',
        chunkCurrent: 0,
        chunkTotal: totalChunks,
        isHeic,
        isMov
      };

      validItems.push({ file, item: progressItem });
    }

    if (validItems.length === 0) return;

    // Add to UI queue
    setTransferQueue((prev) => [...validItems.map((v) => v.item), ...prev]);

    // Sequential transfer execution
    for (const { file, item } of validItems) {
      await executeSingleTransfer(file, item);
    }

    onUploadSuccess();
  };

  /**
   * Execute transfer for a single item with AbortController, Retry & Error Capture
   */
  const executeSingleTransfer = async (file: File, item: TransferProgressItem) => {
    const abortController = new AbortController();
    abortControllersRef.current.set(item.id, abortController);

    // Update status to preparing
    updateQueueItem(item.id, { status: 'preparing', speed: 'Menyiapkan transfer...' });
    transferLogger.log('TRANSFER_START', `Memulai transfer file: "${file.name}" (ID: ${item.transferId})`, 'info');

    try {
      // Execute resilient chunked transfer protocol
      const result = await sendFileViaChunkedProtocol(
        file,
        item,
        (progressUpdate) => {
          updateQueueItem(item.id, progressUpdate);
        },
        transferLogger,
        abortController.signal
      );

      if (result.success) {
        updateQueueItem(item.id, {
          status: 'completed',
          progress: 100,
          speed: 'Transfer berhasil',
          chunkCurrent: item.chunkTotal
        });
        showNotification(`Transfer "${file.name}" berhasil ke PC!`, 'success');
      }
    } catch (err: any) {
      if (abortController.signal.aborted) {
        transferLogger.log('CANCELLED', `Transfer "${file.name}" dibatalkan oleh pengguna`, 'warn');
        updateQueueItem(item.id, {
          status: 'cancelled',
          speed: 'Dibatalkan',
          errorDetail: { stage: 'User Action', message: 'Transfer dibatalkan oleh pengguna' }
        });
        showNotification(`Transfer "${file.name}" dibatalkan`, 'info');
      } else {
        const stage = 'Chunk Transfer / PC Assembly';
        const msg = err?.message || 'Gagal mengirim file ke PC';
        transferLogger.log('TRANSFER_ERROR', `[TRANSFER ERROR] Stage: ${stage} | Error: ${msg}`, 'error', {
          stack: err?.stack,
          name: err?.name
        });

        updateQueueItem(item.id, {
          status: 'failed',
          speed: 'Transfer gagal',
          errorDetail: { stage, message: msg }
        });
        showNotification(`Transfer "${file.name}" gagal: ${msg}`, 'error');
      }
    } finally {
      abortControllersRef.current.delete(item.id);
    }
  };

  /**
   * Cancel Active Transfer
   */
  const handleCancelTransfer = (itemId: string) => {
    const controller = abortControllersRef.current.get(itemId);
    if (controller) {
      controller.abort();
      transferLogger.log('CANCEL_REQ', `Menghentikan proses transfer item ${itemId}`, 'warn');
    }
  };

  /**
   * Retry Failed Transfer
   */
  const handleRetryTransfer = async (item: TransferProgressItem) => {
    transferLogger.log('RETRY_SESSION', `Membersihkan sesi lama & membuat sesi transfer baru untuk "${item.name}"`, 'info');

    // Create fresh transfer item
    const newTransferId = 'tr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 7);
    const updatedItem: TransferProgressItem = {
      ...item,
      transferId: newTransferId,
      status: 'connecting',
      progress: 0,
      speed: 'Menghubungkan kembali...',
      errorDetail: undefined,
      chunkCurrent: 0
    };

    updateQueueItem(item.id, updatedItem);

    // We need file reference; if it was synthetic test, recreate it
    let fileObj: File | null = null;
    if (item.name.startsWith('TEST_')) {
      fileObj = new File([new ArrayBuffer(Math.min(item.size, 1024 * 1024))], item.name, {
        type: item.type,
        lastModified: Date.now()
      });
    }

    if (fileObj) {
      await executeSingleTransfer(fileObj, updatedItem);
    } else {
      showNotification('Silakan pilih ulang file Anda untuk transfer ulang.', 'info');
      if (item.category === 'photo' || item.category === 'video') {
        photoInputRef.current?.click();
      } else {
        fileInputRef.current?.click();
      }
    }
  };

  const updateQueueItem = (id: string, update: Partial<TransferProgressItem>) => {
    setTransferQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...update } : q))
    );
  };

  const getStatusBadge = (status: TransferState) => {
    switch (status) {
      case 'idle':
        return <span className="text-slate-400">Siap</span>;
      case 'selecting':
        return <span className="text-sky-300">Memilih file...</span>;
      case 'connecting':
        return <span className="text-amber-300 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Menghubungkan ke PC</span>;
      case 'connected':
        return <span className="text-emerald-300">Terhubung ke PC</span>;
      case 'preparing':
        return <span className="text-sky-300 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Menyiapkan chunk</span>;
      case 'transferring':
        return <span className="text-sky-300 flex items-center gap-1"><Activity className="w-3 h-3 animate-pulse" /> Mentransfer...</span>;
      case 'finalizing':
        return <span className="text-teal-300 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Memverifikasi di PC</span>;
      case 'completed':
        return <span className="text-emerald-400 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Transfer berhasil</span>;
      case 'failed':
        return <span className="text-rose-400 font-bold flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Transfer gagal</span>;
      case 'cancelled':
        return <span className="text-slate-400 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Dibatalkan</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div
      id="mobile-client-container"
      className={`w-full ${isEmbedded ? 'max-w-md' : 'max-w-md'} mx-auto glass-panel min-h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden font-sans border border-white/15`}
    >
      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        multiple
        accept="image/*,video/*,.heic,.heif,.mov,.mp4,.jpg,.jpeg,.png,.dng,.raw"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files)}
      />

      {/* Top Mobile Status Header */}
      <div className="bg-gradient-to-b from-slate-900/95 to-slate-900/70 backdrop-blur-xl text-white px-5 pt-5 pb-5 border-b border-white/10 relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
            <span className="text-xs font-bold tracking-wide uppercase text-sky-300 flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-sky-400" /> WiFi Transfer Aktif
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs glass-pill px-2.5 py-1 rounded-full border border-white/15">
            <Smartphone className="w-3.5 h-3.5 text-sky-400" />
            {isEditingDevice ? (
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                onBlur={() => setIsEditingDevice(false)}
                onKeyDown={(e) => e.key === 'Enter' && setIsEditingDevice(false)}
                autoFocus
                className="bg-transparent border-b border-sky-400 text-white text-xs w-28 outline-none px-1"
              />
            ) : (
              <span
                onClick={() => setIsEditingDevice(true)}
                className="cursor-pointer hover:text-sky-300 truncate max-w-[120px] font-medium"
                title="Klik untuk mengubah nama perangkat"
              >
                {deviceName}
              </span>
            )}
          </div>
        </div>

        {/* Brand Card in Header */}
        <div className="glass-card rounded-2xl p-3.5 text-left flex items-start gap-3 border border-sky-400/30 shadow-lg shadow-sky-500/5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center text-slate-950 shrink-0 shadow-md font-bold border border-white/20">
            <FolderOpen className="w-5 h-5 text-slate-950" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h1 className="text-base font-extrabold text-white leading-tight">
                Transfer File WiFi
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Lokal Lossless
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Kirim foto, video HEIC &amp; MOV asli ke PC secara instan.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-5 gap-1 mt-3.5">
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-2 text-[11px] font-bold rounded-xl transition ${
              activeTab === 'upload'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            📤 Kirim
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`py-2 text-[11px] font-bold rounded-xl transition ${
              activeTab === 'test'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            ⚡ Test
          </button>
          <button
            onClick={() => setActiveTab('files_on_pc')}
            className={`py-2 text-[11px] font-bold rounded-xl transition ${
              activeTab === 'files_on_pc'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            💻 PC ({serverFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-2 text-[11px] font-bold rounded-xl transition ${
              activeTab === 'notes'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            💬 Teks ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`py-2 text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-0.5 ${
              activeTab === 'debug'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            <Terminal className="w-3 h-3" /> Log
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : notification.type === 'error'
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
              : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* Tab 1: Upload / Transfer */}
        {activeTab === 'upload' && (
          <>
            {/* Primary Action Buttons */}
            <div className="space-y-3">
              <button
                id="btn-choose-photos"
                onClick={() => photoInputRef.current?.click()}
                className="w-full py-4 px-5 bg-gradient-to-r from-sky-400 to-teal-400 hover:from-sky-300 hover:to-teal-300 active:scale-[0.99] text-slate-950 rounded-2xl font-extrabold text-base shadow-lg shadow-sky-500/25 flex items-center justify-center gap-3 transition-all cursor-pointer border border-white/20"
              >
                <Camera className="w-6 h-6 text-slate-950 stroke-[2.2]" />
                <span>Pilih Foto &amp; Video HP</span>
              </button>

              <button
                id="btn-choose-files"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-5 glass-card glass-card-hover active:scale-[0.99] text-sky-300 border border-sky-400/40 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                <FolderOpen className="w-5 h-5 text-sky-400" />
                <span>Pilih Dokumen / File Lain</span>
              </button>

              <p className="text-center text-xs text-slate-400 pt-0.5">
                Bisa pilih banyak file sekaligus. File otomatis dipecah menjadi potongan (*chunk 64KB*) terverifikasi.
              </p>
            </div>

            {/* Selected File Details Inspector */}
            {selectedFileMeta && (
              <div className="glass-card rounded-2xl p-3.5 border border-sky-400/30 text-xs space-y-1.5 bg-slate-950/50">
                <div className="flex items-center justify-between text-sky-300 font-bold">
                  <span className="flex items-center gap-1.5">
                    <FileCheck className="w-4 h-4 text-sky-400" /> File Terpilih Terakhir
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Status: Valid</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 text-slate-300">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Nama:</span>
                    <span className="font-semibold text-white truncate block">{selectedFileMeta.name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Ukuran Presisi:</span>
                    <span className="font-semibold text-white block">{formatFileSize(selectedFileMeta.size)} ({selectedFileMeta.size.toLocaleString()} bytes)</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Tipe / MIME:</span>
                    <span className="font-semibold text-sky-300 truncate block">{selectedFileMeta.type}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Modifikasi:</span>
                    <span className="font-semibold text-slate-200 block truncate">{selectedFileMeta.lastModified}</span>
                  </div>
                </div>
              </div>
            )}

            {/* iOS / RAW UTUH Tips Card */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-xs text-amber-200 space-y-1.5 backdrop-blur-md">
              <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Tips Format Asli Apple HEIC &amp; MOV 4K:</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Di iPhone: Buka <strong>Settings &gt; Photos</strong> &gt; bagian <em>Transfer to Mac or PC</em> pilih <strong>Keep Originals</strong> agar foto/video tidak dikonversi otomatis oleh iOS.
              </p>
            </div>

            {/* Live Transfer Queue / Status */}
            {transferQueue.length > 0 && (
              <div className="glass-card rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-sky-400" />
                    Antrean Transfer ({transferQueue.length})
                  </h3>
                  <button
                    onClick={() => setTransferQueue([])}
                    className="text-[11px] text-slate-400 hover:text-sky-300 font-medium transition cursor-pointer"
                  >
                    Bersihkan
                  </button>
                </div>

                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {transferQueue.map((item) => (
                    <div key={item.id} className="bg-slate-950/70 rounded-xl p-3 border border-white/10 space-y-2">
                      <div className="flex items-start justify-between text-xs gap-2">
                        <div className="truncate flex-1">
                          <p className="font-semibold text-slate-100 truncate">{item.name}</p>
                          <p className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>{formatFileSize(item.size)}</span>
                            <span>•</span>
                            <span>Chunk {item.chunkCurrent}/{item.chunkTotal}</span>
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-200 ${
                            item.status === 'completed'
                              ? 'bg-emerald-400'
                              : item.status === 'failed'
                              ? 'bg-rose-500'
                              : item.status === 'cancelled'
                              ? 'bg-slate-500'
                              : 'bg-gradient-to-r from-sky-400 to-teal-400 animate-pulse'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      {/* Speed & Actions footer */}
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          {item.status === 'transferring' && (
                            <span className="text-sky-300 font-medium">Kecepatan: {item.speed}</span>
                          )}
                          {item.status === 'finalizing' && (
                            <span className="text-teal-300 font-medium">Menggabungkan chunk di PC...</span>
                          )}
                          {item.status === 'failed' && item.errorDetail && (
                            <span className="text-rose-400 font-medium truncate block max-w-[200px]" title={item.errorDetail.message}>
                              {item.errorDetail.message}
                            </span>
                          )}
                          {item.status === 'completed' && (
                            <span className="text-emerald-400 font-semibold">Tersimpan di PC</span>
                          )}
                        </span>

                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">{item.progress}%</span>

                          {/* Cancel Button during transfer */}
                          {(item.status === 'connecting' || item.status === 'preparing' || item.status === 'transferring') && (
                            <button
                              onClick={() => handleCancelTransfer(item.id)}
                              className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-bold border border-rose-500/30 transition cursor-pointer"
                            >
                              Batalkan
                            </button>
                          )}

                          {/* Retry Button on failure */}
                          {(item.status === 'failed' || item.status === 'cancelled') && (
                            <button
                              onClick={() => handleRetryTransfer(item)}
                              className="px-2.5 py-0.5 rounded bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 text-[10px] font-bold border border-sky-500/30 transition flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" /> Coba Lagi
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab 2: Test Connection & Multi-Tier Transfer Tests */}
        {activeTab === 'test' && (
          <div className="space-y-4">
            {/* Connection Test Section */}
            <div className="glass-card rounded-2xl p-4 border border-sky-400/30 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Uji Koneksi (Test Connection)
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">Ping Server</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Tekan tombol di bawah untuk memeriksa apakah HP dapat menjangkau server PC di jaringan WiFi lokal.
              </p>

              <button
                id="btn-test-connection"
                onClick={handleTestConnection}
                className="w-full py-3 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4 text-slate-950 fill-current" />
                TEST CONNECTION (UJI RESPON PC)
              </button>

              {connectionTestResult && (
                <div
                  className={`p-3 rounded-xl text-xs space-y-1 ${
                    connectionTestResult.success
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {connectionTestResult.success ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                    <span>{connectionTestResult.message}</span>
                  </div>
                  {connectionTestResult.details && (
                    <p className="text-[11px] text-slate-300">{connectionTestResult.details}</p>
                  )}
                </div>
              )}
            </div>

            {/* Multi-Tier Synthetic Transfer Tests */}
            <div className="glass-card rounded-2xl p-4 border border-white/15 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-400" />
                  Uji Transfer Bertingkat (Test Transfer)
                </h3>
                <span className="text-[10px] text-sky-300 font-semibold">Validasi Chunk</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Kirim data pengujian berukuran kecil hingga besar untuk memvalidasi performa &amp; kestabilan chunking transfer:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => handleRunTierTest(1024, '1 KB Text')}
                  className="p-2.5 glass-card glass-card-hover rounded-xl border border-sky-400/30 text-left space-y-1 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">Test 1: Teks Kecil</span>
                    <span className="text-[10px] font-mono text-sky-300">1 KB</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Uji verifikasi protokol dasar</p>
                </button>

                <button
                  onClick={() => handleRunTierTest(10 * 1024, '10 KB File')}
                  className="p-2.5 glass-card glass-card-hover rounded-xl border border-sky-400/30 text-left space-y-1 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">Test 2: Dokumen Kecil</span>
                    <span className="text-[10px] font-mono text-sky-300">10 KB</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Uji 1 single chunk</p>
                </button>

                <button
                  onClick={() => handleRunTierTest(1024 * 1024, '1 MB Dummy')}
                  className="p-2.5 glass-card glass-card-hover rounded-xl border border-sky-400/30 text-left space-y-1 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">Test 3: Foto 1 MB</span>
                    <span className="text-[10px] font-mono text-sky-300">1 MB (16 chunks)</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Uji multi-chunk assembly</p>
                </button>

                <button
                  onClick={() => handleRunTierTest(10 * 1024 * 1024, '10 MB File')}
                  className="p-2.5 glass-card glass-card-hover rounded-xl border border-sky-400/30 text-left space-y-1 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">Test 4: Media 10 MB</span>
                    <span className="text-[10px] font-mono text-amber-300">10 MB (160 chunks)</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Uji flow control &amp; buffer</p>
                </button>

                <button
                  onClick={() => handleRunTierTest(100 * 1024 * 1024, '100 MB Video')}
                  className="p-2.5 glass-card glass-card-hover rounded-xl border border-teal-400/40 text-left space-y-1 transition cursor-pointer col-span-1 sm:col-span-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">Test 5: Video Besar (100 MB)</span>
                    <span className="text-[10px] font-mono text-emerald-300">100 MB (1,600 chunks)</span>
                  </div>
                  <p className="text-[10px] text-slate-400">Uji ketahanan streaming chunk skala besar tanpa drop</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Files on PC */}
        {activeTab === 'files_on_pc' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                File Tersimpan di PC
              </h3>
              <span className="text-xs text-slate-400">{serverFiles.length} file</span>
            </div>

            {serverFiles.length === 0 ? (
              <div className="text-center py-10 glass-card rounded-2xl p-6">
                <FolderOpen className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-300">Belum ada file di PC</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Kirim foto atau video pertama Anda lewat tab Kirim!
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {serverFiles.map((file) => (
                  <div
                    key={file.id}
                    className="glass-card p-3 rounded-xl flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="truncate flex-1">
                      <p className="text-xs font-semibold text-slate-100 truncate">{file.originalName}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatFileSize(file.size)} • {file.dateGroup}
                      </p>
                    </div>
                    <a
                      href={file.downloadUrl}
                      download={file.originalName}
                      className="p-2 bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded-lg hover:bg-sky-500/25 transition shrink-0"
                      title="Download ke HP"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Quick Notes / Clipboard sync */}
        {activeTab === 'notes' && (
          <div className="space-y-4">
            <form onSubmit={handleSendMobileNote} className="space-y-2">
              <textarea
                rows={3}
                placeholder="Tulis pesan, link URL, password WiFi, atau teks apa saja untuk dikirim ke PC..."
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                className="w-full glass-input p-3 rounded-xl text-xs placeholder-slate-400 outline-none text-slate-100 resize-none"
              />
              <button
                type="submit"
                disabled={!noteInput.trim()}
                className="w-full py-2.5 bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Kirim Teks ke PC
              </button>
            </form>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-200">Riwayat Catatan ({notes.length})</h4>
              {notes.length === 0 ? (
                <div className="text-center py-6 glass-card rounded-xl text-xs text-slate-400">
                  Belum ada catatan atau teks yang dikirim.
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="glass-card p-3 rounded-xl text-xs space-y-1.5 border border-white/10">
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span className="font-semibold text-sky-300">{note.sender}</span>
                        <span>{formatTime(note.timestamp)}</span>
                      </div>
                      {note.isLink ? (
                        <a
                          href={note.content}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-300 hover:underline flex items-center gap-1 truncate font-medium"
                        >
                          <Link className="w-3 h-3 shrink-0" />
                          <span className="truncate">{note.content}</span>
                        </a>
                      ) : (
                        <p className="text-slate-100 select-all whitespace-pre-wrap">{note.content}</p>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                        <button
                          onClick={() => handleCopyNote(note.content, note.id)}
                          className="text-[11px] text-slate-300 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                        >
                          {copiedNoteId === note.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Salin
                        </button>
                        {onDeleteNote && (
                          <button
                            onClick={() => onDeleteNote(note.id)}
                            className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 5: Live Debug Console Log */}
        {activeTab === 'debug' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Live Debug &amp; Diagnostics Log
              </h3>
              <button
                onClick={() => transferLogger.clear()}
                className="text-[10px] text-slate-400 hover:text-sky-300 font-medium cursor-pointer"
              >
                Hapus Log
              </button>
            </div>

            <div className="bg-slate-950 rounded-2xl p-3 border border-white/10 font-mono text-[11px] text-slate-300 max-h-[380px] overflow-y-auto space-y-1.5">
              {debugLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  Belum ada log aktivitas transfer.
                </div>
              ) : (
                debugLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-1.5 rounded border-l-2 text-[10px] leading-relaxed ${
                      log.level === 'error'
                        ? 'border-rose-500 bg-rose-500/10 text-rose-200'
                        : log.level === 'warn'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                        : log.level === 'success'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
                        : 'border-sky-500 bg-sky-500/5 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] text-slate-400">
                      <span className="font-bold uppercase tracking-wider text-sky-400">[{log.stage}]</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <div className="mt-0.5">{log.message}</div>
                    {log.details && (
                      <pre className="text-[9px] text-slate-400 mt-1 overflow-x-auto p-1 bg-black/40 rounded">
                        {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                      </pre>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Bottom Feature Badges */}
        <div className="pt-3 border-t border-white/10">
          <div className="flex flex-wrap gap-1.5 justify-center">
            <span className="px-2.5 py-0.5 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              Chunk Stream 64KB
            </span>
            <span className="px-2.5 py-0.5 rounded-full glass-pill text-emerald-300 text-[10px] font-semibold">
              Auto Backpressure
            </span>
            <span className="px-2.5 py-0.5 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              HEIC &amp; MOV 4K Lossless
            </span>
            <span className="px-2.5 py-0.5 rounded-full glass-pill text-amber-300 text-[10px] font-semibold">
              Firestore Signaling
            </span>
          </div>

          <div className="text-center mt-2.5 text-[10px] text-slate-400 font-medium">
            Transfer File WiFi Lokal — Bebas Kuota &amp; Kualitas Asli
          </div>
        </div>
      </div>
    </div>
  );
};
