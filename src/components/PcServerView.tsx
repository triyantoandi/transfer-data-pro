import React, { useState, useMemo, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { FileRecord, ServerStatus, TextNote } from '../types';
import { formatFileSize, formatTime, getFileCategoryColor } from '../utils/formatters';
import { 
  Wifi, 
  Download, 
  FolderArchive, 
  Trash2, 
  Search, 
  HardDrive, 
  Smartphone, 
  Laptop, 
  Calendar, 
  CheckCircle2, 
  Copy, 
  Check, 
  UploadCloud, 
  FileText, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Music, 
  Eye, 
  ExternalLink,
  ShieldCheck,
  Layers,
  Sparkles,
  Maximize2,
  X,
  Send,
  Link,
  MessageSquare,
  CheckSquare,
  Square,
  ArrowUpDown,
  Database
} from 'lucide-react';

interface PcServerViewProps {
  status: ServerStatus | null;
  files: FileRecord[];
  notes?: TextNote[];
  onFileSelect: (file: FileRecord) => void;
  onRefresh: () => void;
  onUploadFromPc: (files: FileList | null) => void;
  onDeleteFile: (id: string) => void;
  onBatchDelete?: (ids: string[]) => void;
  onClearAll: () => void;
  onAddNote?: (content: string, sender: string) => void;
  onDeleteNote?: (id: string) => void;
  onClearNotes?: () => void;
}

export const PcServerView: React.FC<PcServerViewProps> = ({
  status,
  files,
  notes = [],
  onFileSelect,
  onRefresh,
  onUploadFromPc,
  onDeleteFile,
  onBatchDelete,
  onClearAll,
  onAddNote,
  onDeleteNote,
  onClearNotes
}) => {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<'date' | 'category' | 'device'>('date');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'size_desc' | 'name_asc'>('newest');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedIpIndex, setSelectedIpIndex] = useState<number>(0);
  const [newNoteText, setNewNoteText] = useState('');

  const pcFileInputRef = useRef<HTMLInputElement>(null);

  // Determine current active client URL based on selected local IP
  const availableIps = status?.localIps && status.localIps.length > 0 ? status.localIps : ['127.0.0.1'];
  const currentIp = availableIps[selectedIpIndex] || availableIps[0];
  const activePort = status?.port || 3000;
  
  const clientUrl = status?.clientUrl || (typeof window !== 'undefined' ? `${window.location.origin}/?mode=mobile` : '');
  const ipBasedClientUrl = `http://${currentIp}:${activePort}/?mode=mobile`;

  const handleCopy = (text: string, isNote: boolean = false, noteId?: string) => {
    navigator.clipboard.writeText(text);
    if (isNote && noteId) {
      setCopiedNoteId(noteId);
      setTimeout(() => setCopiedNoteId(null), 2000);
    } else {
      setCopiedUrl(text);
      setTimeout(() => setCopiedUrl(null), 2500);
    }
  };

  const handleSendNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteText.trim() || !onAddNote) return;
    onAddNote(newNoteText.trim(), 'PC Komputer');
    setNewNoteText('');
  };

  // Toggle selection
  const handleToggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedFileIds.length === filteredFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(filteredFiles.map((f) => f.id));
    }
  };

  const handleBatchDeleteClick = () => {
    if (selectedFileIds.length === 0) return;
    if (window.confirm(`Hapus ${selectedFileIds.length} file yang dipilih dari PC?`)) {
      if (onBatchDelete) {
        onBatchDelete(selectedFileIds);
      } else {
        selectedFileIds.forEach((id) => onDeleteFile(id));
      }
      setSelectedFileIds([]);
    }
  };

  // Filtered & Sorted files
  const filteredFiles = useMemo(() => {
    const list = files.filter(file => {
      const matchesSearch = file.originalName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            file.device.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            file.dateGroup.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || file.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    return list.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
      if (sortBy === 'oldest') return new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime();
      if (sortBy === 'size_desc') return b.size - a.size;
      if (sortBy === 'name_asc') return a.originalName.localeCompare(b.originalName);
      return 0;
    });
  }, [files, searchQuery, selectedCategory, sortBy]);

  // Grouped files
  const groupedFiles = useMemo(() => {
    const groups: { [key: string]: FileRecord[] } = {};
    for (const f of filteredFiles) {
      let groupKey = f.dateGroup;
      if (groupBy === 'category') {
        groupKey = f.category.toUpperCase();
      } else if (groupBy === 'device') {
        groupKey = f.device;
      }
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(f);
    }
    return groups;
  }, [filteredFiles, groupBy]);

  const totalSizeFormatted = useMemo(() => {
    const total = files.reduce((acc, f) => acc + f.size, 0);
    return formatFileSize(total);
  }, [files]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      onUploadFromPc(e.dataTransfer.files);
    }
  };

  return (
    <div
      id="pc-server-container"
      className="max-w-7xl mx-auto space-y-6 pb-12 font-sans"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Top Banner: Local WiFi Server & Quick Connect */}
      <div className="glass-panel rounded-3xl p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column: Heading & 3-Step Guide */}
          <div className="lg:col-span-8 space-y-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
                </span>
                Server WiFi Aktif di PC
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                Firebase Firestore Terhubung
              </span>
              <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-medium">
                Port {status?.port || 3000}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-semibold">
                iPhone &amp; Android Ready
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Transfer File WiFi <span className="text-sky-400">— Backup HP ke PC</span>
              </h1>
              <p className="text-sm sm:text-base text-slate-300 mt-2 max-w-2xl leading-relaxed">
                Pindahkan foto, video 4K, dan dokumen dari iPhone atau Android langsung ke PC lewat jaringan WiFi lokal. 
                <strong className="text-white font-semibold"> Tanpa perlu instal aplikasi di HP</strong>, kualitas 100% utuh (HEIC &amp; MOV asli), dan rapi otomatis per tanggal.
              </p>
            </div>

            {/* 3 Step Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl glass-card">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 text-slate-950 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-md">
                  1
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Scan QR / Buka Link</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Buka di browser Safari atau Chrome HP</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl glass-card">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 text-slate-950 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-md">
                  2
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Pilih Foto / Video</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Langsung dari galeri atau app Files</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl glass-card">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 text-slate-950 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-md">
                  3
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">Tersimpan di PC</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Otomatis rapi per tanggal dan utuh</p>
                </div>
              </div>
            </div>

            {/* Link Copy Box & IP selector */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-slate-950/60 px-3.5 py-2 rounded-xl border border-white/10 text-xs font-mono text-slate-200 flex-1 min-w-[240px]">
                  <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="truncate">{clientUrl}</span>
                </div>
                <button
                  onClick={() => handleCopy(clientUrl)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-400 to-teal-400 hover:from-sky-300 hover:to-teal-300 text-slate-950 text-xs font-bold rounded-xl transition shadow-lg shadow-sky-500/20 cursor-pointer"
                >
                  {copiedUrl === clientUrl ? (
                    <>
                      <Check className="w-4 h-4 text-slate-950 stroke-[3]" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-950" />
                      <span>Salin Link HP</span>
                    </>
                  )}
                </button>
              </div>

              {availableIps.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Pilih IP WiFi:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {availableIps.map((ip, idx) => (
                      <button
                        key={ip}
                        onClick={() => setSelectedIpIndex(idx)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                          selectedIpIndex === idx
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold'
                            : 'bg-white/5 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {ip}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: QR Code Card */}
          <div className="lg:col-span-4 flex flex-col items-center justify-center glass-card p-6 rounded-2xl text-center relative group">
            <div 
              onClick={() => setShowQrModal(true)}
              className="p-3.5 bg-white rounded-2xl shadow-xl border-2 border-sky-400/30 mb-3 cursor-pointer hover:scale-105 transition-transform relative"
              title="Klik untuk perbesar QR Code"
            >
              <QRCodeSVG
                value={clientUrl}
                size={150}
                level="M"
                includeMargin={false}
              />
              <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 rounded-2xl flex items-center justify-center transition-opacity text-white">
                <Maximize2 className="w-6 h-6 text-white drop-shadow" />
              </div>
            </div>
            <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-sky-400" />
              Scan dengan Kamera iPhone / Android
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              Klik QR Code untuk memperbesar layar penuh.
            </p>
          </div>
        </div>
      </div>

      {/* Cross-Device Quick Notes / Clipboard & Text Sharing Bar */}
      <div className="glass-panel rounded-3xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Kirim Teks / Link / Catatan Cepat (Clipboard Sync)</h3>
              <p className="text-[11px] text-slate-400">Kirim teks, link website, password WiFi, atau kode verifikasi antara HP dan PC secara instan.</p>
            </div>
          </div>
          {notes.length > 0 && onClearNotes && (
            <button
              onClick={() => {
                if (window.confirm('Bersihkan semua catatan teks?')) onClearNotes();
              }}
              className="text-[11px] text-slate-400 hover:text-rose-400 transition flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Bersihkan Catatan
            </button>
          )}
        </div>

        {/* Input form */}
        <form onSubmit={handleSendNote} className="flex gap-2">
          <input
            type="text"
            placeholder="Ketik atau tempel teks / link di sini untuk dikirim ke HP..."
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            className="flex-1 glass-input px-4 py-2.5 rounded-xl text-xs placeholder-slate-400 outline-none text-slate-100"
          />
          <button
            type="submit"
            disabled={!newNoteText.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-sky-400 to-teal-400 hover:from-sky-300 hover:to-teal-300 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl transition cursor-pointer shrink-0"
          >
            <Send className="w-3.5 h-3.5 text-slate-950" />
            Kirim Teks
          </button>
        </form>

        {/* Recent notes list */}
        {notes.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 max-h-48 overflow-y-auto">
            {notes.map((note) => (
              <div key={note.id} className="glass-card p-3 rounded-xl flex items-start justify-between gap-2 border border-white/10 text-xs">
                <div className="truncate flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-1">
                    <span className="font-semibold text-sky-300">{note.sender}</span>
                    <span>•</span>
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
                    <p className="text-slate-200 select-all line-clamp-2">{note.content}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(note.content, true, note.id)}
                    className="p-1 text-slate-400 hover:text-sky-300 hover:bg-white/5 rounded-lg transition"
                    title="Salin Teks"
                  >
                    {copiedNoteId === note.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {onDeleteNote && (
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6 Keunggulan Highlight Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-card glass-card-hover p-5 rounded-2xl flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold flex items-center justify-center text-sm shrink-0">
            1
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Tanpa Pasang Aplikasi di HP</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Cukup scan QR atau buka alamat di browser. Tidak ribet instal dari App Store / Play Store.
            </p>
          </div>
        </div>

        <div className="glass-card glass-card-hover p-5 rounded-2xl flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold flex items-center justify-center text-sm shrink-0">
            2
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Foto &amp; Video Tetap Utuh</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              HEIC dan MOV asli terkirim mentah. Kualitas tidak turun sedikit pun (100% loss-less).
            </p>
          </div>
        </div>

        <div className="glass-card glass-card-hover p-5 rounded-2xl flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold flex items-center justify-center text-sm shrink-0">
            3
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Transfer Sangat Cepat</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Lewat WiFi lokal berkecepatan tinggi, bukan internet. Video 4K ukuran besar ikut kilat.
            </p>
          </div>
        </div>

        <div className="glass-card glass-card-hover p-5 rounded-2xl flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold flex items-center justify-center text-sm shrink-0">
            4
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Aman dan Privat</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Data langsung masuk ke penyimpanan PC Anda sendiri, tidak lewat server cloud pihak ketiga.
            </p>
          </div>
        </div>

        <div className="glass-card glass-card-hover p-5 rounded-2xl flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold flex items-center justify-center text-sm shrink-0">
            5
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">iPhone dan Android</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Satu sistem untuk semua smartphone di rumah maupun kantor ke PC / Laptop Windows, Mac, atau Linux.
            </p>
          </div>
        </div>

        <div className="glass-card glass-card-hover p-5 rounded-2xl flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-extrabold flex items-center justify-center text-sm shrink-0">
            6
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-100">Rapi Otomatis per Tanggal</h4>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              File masuk langsung tersusun rapi per tanggal upload/pengambilan, tinggal pakai dan arsip.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Summary & Action Bar */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
          {/* Stats Badges */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-2.5 glass-card px-3.5 py-2 rounded-xl">
              <HardDrive className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">Total Penyimpanan</span>
                <span className="font-bold text-white">{totalSizeFormatted}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 glass-card px-3.5 py-2 rounded-xl">
              <Layers className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">Jumlah File</span>
                <span className="font-bold text-white">{files.length} file</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 glass-card px-3.5 py-2 rounded-xl">
              <Smartphone className="w-4 h-4 text-sky-400" />
              <div>
                <span className="text-slate-400 block text-[10px]">Perangkat Terhubung</span>
                <span className="font-bold text-white">{status?.connectedClients || 1} aktif</span>
              </div>
            </div>
          </div>

          {/* Batch Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={pcFileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => onUploadFromPc(e.target.files)}
            />
            <button
              onClick={() => pcFileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-xl transition cursor-pointer"
              title="Upload file dari PC untuk dikirim ke HP"
            >
              <UploadCloud className="w-4 h-4" />
              Upload dari PC
            </button>

            {/* If files selected, show Selected actions */}
            {selectedFileIds.length > 0 ? (
              <>
                <a
                  href={`/api/download-zip?ids=${selectedFileIds.join(',')}`}
                  download={`Backup_Terpilih_${selectedFileIds.length}_file.zip`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 rounded-xl transition shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  <FolderArchive className="w-4 h-4 text-slate-950" />
                  Download ZIP Terpilih ({selectedFileIds.length})
                </a>
                <button
                  onClick={handleBatchDeleteClick}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-xl transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Terpilih ({selectedFileIds.length})
                </button>
                <button
                  onClick={() => setSelectedFileIds([])}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Batal
                </button>
              </>
            ) : (
              <a
                id="btn-download-all-zip"
                href="/api/download-zip"
                download="Backup_WiFi_Transfer.zip"
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-sky-400 to-teal-400 hover:from-sky-300 hover:to-teal-300 rounded-xl transition shadow-md shadow-sky-500/20 ${
                  files.length === 0 ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <FolderArchive className="w-4 h-4 text-slate-950" />
                Download Semua (.ZIP)
              </a>
            )}

            {files.length > 0 && selectedFileIds.length === 0 && (
              <button
                onClick={() => {
                  if (window.confirm('Yakin ingin menghapus semua file dari PC?')) {
                    onClearAll();
                  }
                }}
                className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 rounded-xl transition border border-transparent hover:border-rose-500/30 cursor-pointer"
                title="Bersihkan Semua File"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filters, Search, Select All, and Sorting */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama file, nama HP, atau tanggal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 glass-input rounded-xl text-xs placeholder-slate-400 outline-none transition"
            />
          </div>

          {/* Select All button & Category Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {filteredFiles.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition"
              >
                {selectedFileIds.length === filteredFiles.length ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                    <span>Batalkan Semua</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>Pilih Semua</span>
                  </>
                )}
              </button>
            )}

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  selectedCategory === 'all'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                }`}
              >
                Semua ({files.length})
              </button>
              <button
                onClick={() => setSelectedCategory('photo')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  selectedCategory === 'photo'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                }`}
              >
                Foto / HEIC
              </button>
              <button
                onClick={() => setSelectedCategory('video')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  selectedCategory === 'video'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                }`}
              >
                Video / MOV
              </button>
              <button
                onClick={() => setSelectedCategory('document')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  selectedCategory === 'document'
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                }`}
              >
                Dokumen
              </button>
            </div>
          </div>

          {/* Grouping & Sorting Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sort */}
            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl text-xs text-slate-300 border border-white/10">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-slate-200 text-xs px-2 py-1 outline-none cursor-pointer"
              >
                <option value="newest" className="bg-slate-900">Terbaru</option>
                <option value="oldest" className="bg-slate-900">Terlama</option>
                <option value="size_desc" className="bg-slate-900">Ukuran Terbesar</option>
                <option value="name_asc" className="bg-slate-900">Nama (A-Z)</option>
              </select>
            </div>

            {/* Group Toggle */}
            <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl text-xs font-medium text-slate-300 border border-white/10">
              <button
                onClick={() => setGroupBy('date')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  groupBy === 'date' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold shadow-xs' : 'hover:text-white'
                }`}
              >
                Tanggal
              </button>
              <button
                onClick={() => setGroupBy('category')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  groupBy === 'category' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold shadow-xs' : 'hover:text-white'
                }`}
              >
                Kategori
              </button>
              <button
                onClick={() => setGroupBy('device')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  groupBy === 'device' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 font-bold shadow-xs' : 'hover:text-white'
                }`}
              >
                Perangkat
              </button>
            </div>
          </div>
        </div>

        {/* Drag & Drop Hint */}
        {isDragging && (
          <div className="p-8 border-2 border-dashed border-sky-400 rounded-2xl bg-sky-500/10 text-center animate-pulse">
            <UploadCloud className="w-10 h-10 text-sky-400 mx-auto mb-2" />
            <p className="font-bold text-sky-200 text-sm">Lepaskan file di sini untuk menyimpan ke PC</p>
          </div>
        )}

        {/* File Groups Display */}
        {filteredFiles.length === 0 ? (
          <div className="text-center py-16 px-4 glass-card rounded-2xl border border-dashed border-white/15">
            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs text-slate-400 border border-white/10">
              <UploadCloud className="w-8 h-8 text-sky-400" />
            </div>
            <h3 className="text-base font-bold text-white">Belum ada file yang diterima</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              Scan QR Code di atas dengan iPhone atau Android Anda, lalu pilih foto/video untuk mulai backup super cepat via WiFi lokal.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedFiles).map(([groupTitle, items]) => {
              const groupItems = items as FileRecord[];
              const groupTotalBytes = groupItems.reduce((a, b) => a + b.size, 0);

              return (
                <div key={groupTitle} className="space-y-3">
                  {/* Group Header Banner */}
                  <div className="flex items-center justify-between glass-card px-4 py-2.5 rounded-xl border border-white/10">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold text-slate-100">{groupTitle}</span>
                      <span className="text-[11px] text-slate-400">
                        ({groupItems.length} file • {formatFileSize(groupTotalBytes)})
                      </span>
                    </div>

                    <a
                      href={`/api/download-zip?ids=${groupItems.map(g => g.id).join(',')}`}
                      download={`Backup_${groupTitle}.zip`}
                      className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
                    >
                      <FolderArchive className="w-3.5 h-3.5" />
                      Download Folder ({groupItems.length})
                    </a>
                  </div>

                  {/* Grid Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {groupItems.map((file) => {
                      const isSelected = selectedFileIds.includes(file.id);

                      return (
                        <div
                          key={file.id}
                          className={`glass-card glass-card-hover rounded-2xl p-3.5 flex flex-col justify-between space-y-3 group transition-all relative ${
                            isSelected ? 'ring-2 ring-sky-400 bg-sky-950/30' : ''
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <button
                            onClick={(e) => handleToggleSelect(file.id, e)}
                            className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-slate-950/80 hover:bg-sky-500/80 transition text-white border border-white/15"
                            title={isSelected ? 'Batalkan pilihan' : 'Pilih file'}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-sky-300" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 hover:text-white" />
                            )}
                          </button>

                          {/* Top Thumbnail / Icon Area */}
                          <div
                            onClick={() => onFileSelect(file)}
                            className="relative h-36 bg-slate-950/60 rounded-xl overflow-hidden cursor-pointer flex items-center justify-center group-hover:opacity-95 transition border border-white/5"
                          >
                            {file.category === 'photo' && !file.isHeic ? (
                              <img
                                src={file.url}
                                alt={file.originalName}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            ) : file.category === 'video' ? (
                              <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
                                <video
                                  src={file.url}
                                  className="w-full h-full object-cover opacity-70"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-10 h-10 rounded-full bg-sky-500/90 text-slate-950 flex items-center justify-center shadow-lg">
                                    <VideoIcon className="w-5 h-5" />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                                {file.category === 'photo' && file.isHeic && (
                                  <ImageIcon className="w-10 h-10 text-amber-400 mb-1" />
                                )}
                                {file.category === 'audio' && (
                                  <Music className="w-10 h-10 text-amber-400 mb-1" />
                                )}
                                {file.category === 'document' && (
                                  <FileText className="w-10 h-10 text-sky-400 mb-1" />
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">
                                  {file.extension}
                                </span>
                              </div>
                            )}

                            {/* Floating Badges */}
                            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                              {file.isHeic && (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-500/90 text-slate-950 font-bold text-[9px] shadow-sm">
                                  HEIC Utuh
                                </span>
                              )}
                              {file.isMov && (
                                <span className="px-1.5 py-0.5 rounded-md bg-purple-500 text-white font-bold text-[9px] shadow-sm">
                                  MOV 4K
                                </span>
                              )}
                            </div>

                            <div className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur-sm text-slate-200 text-[10px] px-2 py-0.5 rounded-md font-mono border border-white/10">
                              {formatFileSize(file.size)}
                            </div>
                          </div>

                          {/* Details */}
                          <div className="space-y-1">
                            <h4
                              onClick={() => onFileSelect(file)}
                              className="text-xs font-bold text-slate-100 truncate hover:text-sky-300 cursor-pointer"
                              title={file.originalName}
                            >
                              {file.originalName}
                            </h4>

                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="flex items-center gap-1 truncate max-w-[140px]">
                                <Smartphone className="w-3 h-3 text-sky-400 shrink-0" />
                                <span className="truncate">{file.device}</span>
                              </span>
                              <span>{formatTime(file.uploadedAt)}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                            <button
                              onClick={() => onFileSelect(file)}
                              className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 text-[11px] transition cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Preview
                            </button>

                            <div className="flex items-center gap-1">
                              <a
                                href={file.downloadUrl}
                                download={file.originalName}
                                className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-white/5 rounded-lg transition"
                                title="Download ke PC"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </a>
                              <button
                                onClick={() => onDeleteFile(file.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                                title="Hapus File"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Large Fullscreen QR Modal */}
      {showQrModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="glass-panel p-8 rounded-3xl max-w-sm w-full text-center space-y-5 border border-white/20 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-extrabold text-white">Scan QR Code dari HP</h3>
            <p className="text-xs text-slate-300">
              Arahkan kamera iPhone atau Android Anda ke kode ini untuk langsung terhubung:
            </p>

            <div className="p-4 bg-white rounded-3xl inline-block shadow-2xl border-4 border-sky-400/40">
              <QRCodeSVG
                value={clientUrl}
                size={220}
                level="Q"
                includeMargin={false}
              />
            </div>

            <div className="text-xs font-mono bg-slate-950/70 p-2.5 rounded-xl border border-white/10 text-sky-300 break-all select-all">
              {clientUrl}
            </div>

            <button
              onClick={() => handleCopy(clientUrl)}
              className="w-full py-2.5 bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-md cursor-pointer"
            >
              {copiedUrl === clientUrl ? 'Link Tersalin!' : 'Salin Alamat URL'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
