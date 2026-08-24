import React, { useState, useRef } from 'react';
import { UploadProgressItem, FileRecord, TextNote } from '../types';
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
  Trash2
} from 'lucide-react';

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
  const [uploadQueue, setUploadQueue] = useState<UploadProgressItem[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'files_on_pc' | 'notes' | 'tips'>('upload');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
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

  const handleFilesSelected = async (files: FileList | null, isFromFilesApp: boolean = false) => {
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newItems: UploadProgressItem[] = fileList.map((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isHeic = ext === 'heic' || ext === 'heif';
      const isMov = ext === 'mov';
      let category: UploadProgressItem['category'] = 'other';
      if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext) || file.type.startsWith('image/')) {
        category = 'photo';
      } else if (['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm'].includes(ext) || file.type.startsWith('video/')) {
        category = 'video';
      } else if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt'].includes(ext)) {
        category = 'document';
      } else if (file.type.startsWith('audio/')) {
        category = 'audio';
      }

      return {
        id: Math.random().toString(36).substring(2, 9),
        name: file.name,
        size: file.size,
        progress: 0,
        speed: 'Memulai...',
        status: 'queued',
        category,
        isHeic,
        isMov
      };
    });

    setUploadQueue((prev) => [...newItems, ...prev]);

    // Send files to server via XMLHttpRequest to get accurate live upload progress
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const item = newItems[i];

      await uploadSingleFile(file, item.id, isFromFilesApp);
    }

    onUploadSuccess();
    showNotification(`${fileList.length} file berhasil terkirim ke PC!`, 'success');
  };

  const uploadSingleFile = (file: File, itemId: string, isFromFilesApp: boolean): Promise<void> => {
    return new Promise((resolve) => {
      const formData = new FormData();
      formData.append('files', file);
      formData.append('deviceName', deviceName + (isFromFilesApp ? ' (via Files App)' : ''));

      const xhr = new XMLHttpRequest();
      const startTime = Date.now();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
          const speedMBs = (e.loaded / (1024 * 1024) / elapsedSec).toFixed(1);

          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === itemId
                ? {
                    ...q,
                    progress: Math.min(percent, 99),
                    speed: `${speedMBs} MB/s`,
                    status: 'uploading',
                  }
                : q
            )
          );
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === itemId
                ? {
                    ...q,
                    progress: 100,
                    speed: 'Selesai',
                    status: 'completed',
                  }
                : q
            )
          );
        } else {
          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === itemId
                ? {
                    ...q,
                    status: 'error',
                    errorMsg: 'Gagal mengunggah',
                  }
                : q
            )
          );
        }
        resolve();
      });

      xhr.addEventListener('error', () => {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === itemId
              ? {
                  ...q,
                  status: 'error',
                  errorMsg: 'Koneksi terputus',
                }
              : q
          )
        );
        resolve();
      });

      xhr.open('POST', '/api/upload');
      xhr.setRequestHeader('x-device-name', deviceName);
      xhr.send(formData);
    });
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
        onChange={(e) => handleFilesSelected(e.target.files, false)}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="*/*"
        className="hidden"
        onChange={(e) => handleFilesSelected(e.target.files, true)}
      />

      {/* Top Mobile Status Header */}
      <div className="bg-gradient-to-b from-slate-900/90 to-slate-900/60 backdrop-blur-xl text-white px-5 pt-5 pb-6 border-b border-white/10 relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
            </span>
            <span className="text-xs font-bold tracking-wide uppercase text-sky-300 flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5" /> WiFi Lokal Terhubung
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs glass-pill px-2.5 py-1 rounded-full border border-white/15">
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
        <div className="glass-card rounded-2xl p-4 text-left flex items-start gap-3.5 border border-sky-400/30 shadow-lg shadow-sky-500/5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center text-slate-950 shrink-0 shadow-md font-bold border border-white/20">
            <FolderOpen className="w-6 h-6 text-slate-950" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-white leading-tight flex items-center gap-1.5">
              Transfer File ke PC
            </h1>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Backup foto, video &amp; dokumen lewat WiFi — cepat &amp; utuh.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 gap-1.5 mt-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'upload'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            📤 Kirim
          </button>
          <button
            onClick={() => setActiveTab('files_on_pc')}
            className={`py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'files_on_pc'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            💻 PC ({serverFiles.length})
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'notes'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
          >
            💬 Teks ({notes.length})
          </button>
          <button
            onClick={() => setActiveTab('tips')}
            className={`py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'tips'
                ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 shadow-md shadow-sky-500/20'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
            }`}
            title="Tips iOS & Android"
          >
            💡 Tips
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 p-5 space-y-4 overflow-y-auto">
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
                <span>Pilih Foto / Video</span>
              </button>

              <button
                id="btn-choose-files"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-5 glass-card glass-card-hover active:scale-[0.99] text-sky-300 border border-sky-400/40 rounded-2xl font-bold text-sm shadow-md flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                <FolderOpen className="w-5 h-5 text-sky-400" />
                <span>Pilih File (dari app Files)</span>
              </button>

              <p className="text-center text-xs text-slate-400 pt-1">
                Bisa pilih banyak file sekaligus. File langsung terkirim ke PC saat dipilih.
              </p>
            </div>

            {/* iOS / RAW UTUH Tips Card */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 space-y-2 backdrop-blur-md">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Agar foto/video iPhone benar-benar UTUH (HEIC/MOV asli):</span>
              </div>
              <ol className="list-decimal pl-5 space-y-1.5 text-[11px] leading-relaxed text-amber-200/90">
                <li>
                  Buka <strong>Settings &gt; Photos</strong> &gt; bagian <em>Transfer to Mac or PC</em> pilih{' '}
                  <span className="font-semibold text-amber-300 underline">Keep Originals</span>.
                </li>
                <li>
                  Untuk hasil paling aman, kirim lewat tombol <strong>"Pilih File"</strong> lalu masuk ke app{' '}
                  <strong>Files</strong> (bukan galeri) — file dikirim mentah tanpa diubah iOS.
                </li>
              </ol>
            </div>

            {/* Live Upload Queue / Status */}
            {uploadQueue.length > 0 && (
              <div className="glass-card rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                    Status Pengiriman ({uploadQueue.length})
                  </h3>
                  <button
                    onClick={() => setUploadQueue([])}
                    className="text-[11px] text-slate-400 hover:text-sky-300 font-medium transition"
                  >
                    Bersihkan
                  </button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="bg-slate-950/60 rounded-xl p-3 border border-white/10 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="truncate pr-2 font-medium text-slate-200 max-w-[200px]">
                          {item.name}
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          {formatFileSize(item.size)}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            item.status === 'completed'
                              ? 'bg-emerald-400'
                              : item.status === 'error'
                              ? 'bg-rose-500'
                              : 'bg-gradient-to-r from-sky-400 to-teal-400 animate-pulse'
                          }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 flex items-center gap-1">
                          {item.status === 'uploading' && (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-sky-400" />
                              <span className="text-sky-300">{item.speed}</span>
                            </>
                          )}
                          {item.status === 'completed' && (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Tersimpan di PC!
                            </span>
                          )}
                          {item.status === 'error' && (
                            <span className="text-rose-400 font-semibold">{item.errorMsg}</span>
                          )}
                          {item.status === 'queued' && <span>Menunggu...</span>}
                        </span>

                        <span className="font-bold text-slate-200">{item.progress}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Tab: Files on PC */}
        {activeTab === 'files_on_pc' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                File yang Ada di PC
              </h3>
              <span className="text-xs text-slate-400">{serverFiles.length} file</span>
            </div>

            {serverFiles.length === 0 ? (
              <div className="text-center py-10 glass-card rounded-2xl p-6">
                <FolderOpen className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                <p className="text-xs font-medium text-slate-300">Belum ada file di PC</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Kirim foto atau video pertama Anda lewat tab Kirim File!
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

        {/* Tab: Quick Notes / Clipboard sync */}
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
                          className="text-[11px] text-slate-300 hover:text-sky-300 flex items-center gap-1"
                        >
                          {copiedNoteId === note.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          Salin
                        </button>
                        {onDeleteNote && (
                          <button
                            onClick={() => onDeleteNote(note.id)}
                            className="text-[11px] text-slate-400 hover:text-rose-400 flex items-center gap-1"
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

        {/* Tab: Detailed Tips */}
        {activeTab === 'tips' && (
          <div className="space-y-3 text-xs text-slate-300 glass-card p-4 rounded-2xl">
            <h4 className="font-bold text-white text-sm">💡 Panduan Backup Kualitas Penuh</h4>
            <div className="space-y-2 text-[11px] text-slate-300 leading-relaxed">
              <p>
                <strong>📱 iPhone (iOS):</strong> Saat transfer lewat browser, iOS kadang mengonversi HEIC ke JPEG atau MOV ke MP4 secara otomatis. Agar tetap mentah:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Gunakan opsi <strong>"Pilih File"</strong> &gt; pilih file dari folder <em>Files / On My iPhone</em>.</li>
                <li>Atur di Settings iOS &gt; Photos &gt; Transfer to Mac/PC &gt; <strong>Keep Originals</strong>.</li>
              </ul>
              <p className="pt-2">
                <strong>🤖 Android:</strong> Dapat langsung memilih banyak foto/video dari Galeri atau File Manager tanpa kompresi sama sekali.
              </p>
              <p className="pt-2">
                <strong>🔒 Keamanan:</strong> Transfer terjadi 100% lokal di dalam jaringan WiFi Anda, tanpa diunggah ke internet atau server luar.
              </p>
            </div>
          </div>
        )}

        {/* Bottom Feature Badges */}
        <div className="pt-3 border-t border-white/10">
          <div className="flex flex-wrap gap-1.5 justify-center">
            <span className="px-2.5 py-1 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              Tanpa Pasang Aplikasi
            </span>
            <span className="px-2.5 py-1 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              Foto &amp; Video Utuh
            </span>
            <span className="px-2.5 py-1 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              Sangat Cepat
            </span>
            <span className="px-2.5 py-1 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              iPhone &amp; Android
            </span>
            <span className="px-2.5 py-1 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              Tanpa Internet
            </span>
            <span className="px-2.5 py-1 rounded-full glass-pill text-sky-300 text-[10px] font-semibold">
              Privat
            </span>
          </div>

          <div className="text-center mt-3 text-[10px] text-slate-400 font-medium">
            RK Jaya Tech — Transfer File WiFi Lokal
          </div>
        </div>
      </div>
    </div>
  );
};
