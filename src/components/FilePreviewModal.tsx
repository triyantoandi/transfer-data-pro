import React, { useEffect } from 'react';
import { FileRecord } from '../types';
import { formatFileSize, formatTime } from '../utils/formatters';
import { 
  X, 
  Download, 
  HardDrive, 
  Smartphone, 
  Calendar, 
  FileText, 
  Image as ImageIcon, 
  Video as VideoIcon, 
  Music, 
  CheckCircle2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface FilePreviewModalProps {
  file: FileRecord | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasMultipleFiles?: boolean;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ 
  file, 
  onClose,
  onNext,
  onPrev,
  hasMultipleFiles = false
}) => {
  // Keyboard listener for Escape and Arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!file) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && onNext) {
        onNext();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        onPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [file, onClose, onNext, onPrev]);

  if (!file) return null;

  return (
    <div
      id="preview-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="preview-modal-card"
        className="relative w-full max-w-4xl glass-panel rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-white/20"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60 backdrop-blur-xl">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {file.category === 'photo' && <ImageIcon className="w-5 h-5" />}
              {file.category === 'video' && <VideoIcon className="w-5 h-5" />}
              {file.category === 'audio' && <Music className="w-5 h-5" />}
              {file.category !== 'photo' && file.category !== 'video' && file.category !== 'audio' && (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div className="truncate">
              <h3 className="text-base font-bold text-white truncate" title={file.originalName}>
                {file.originalName}
              </h3>
              <p className="text-xs text-slate-300 flex items-center gap-2">
                <span>{formatFileSize(file.size)}</span>
                <span>•</span>
                <span className="uppercase font-bold text-sky-400">{file.extension}</span>
                {file.isHeic && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                    HEIC Utuh
                  </span>
                )}
                {file.isMov && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-bold">
                    MOV 4K Utuh
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              id="modal-download-btn"
              href={file.downloadUrl}
              download={file.originalName}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-sky-400 to-teal-400 hover:from-sky-300 hover:to-teal-300 rounded-xl transition shadow-md shadow-sky-500/20 border border-white/20 cursor-pointer"
            >
              <Download className="w-4 h-4 text-slate-950 stroke-[2.2]" />
              Download
            </a>
            <button
              id="modal-close-btn"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer with Next/Prev navigation */}
        <div className="flex-1 overflow-y-auto p-6 flex items-center justify-center bg-slate-950/40 min-h-[340px] relative group">
          {/* Prev button */}
          {hasMultipleFiles && onPrev && (
            <button
              onClick={onPrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-2xl bg-slate-950/70 hover:bg-sky-500/80 text-white transition border border-white/15 shadow-xl z-20 cursor-pointer"
              title="File Sebelumnya (Panah Kiri)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          {/* Next button */}
          {hasMultipleFiles && onNext && (
            <button
              onClick={onNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-2xl bg-slate-950/70 hover:bg-sky-500/80 text-white transition border border-white/15 shadow-xl z-20 cursor-pointer"
              title="File Selanjutnya (Panah Kanan)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}

          {file.category === 'photo' ? (
            file.isHeic ? (
              <div className="flex flex-col items-center justify-center text-center p-8 glass-card rounded-2xl border border-amber-500/30 max-w-md shadow-xl">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center mb-4 border border-amber-500/30">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <h4 className="font-bold text-white mb-1">Format Foto Apple HEIC / HEIF</h4>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  File ini tersimpan dalam format mentah <strong className="text-sky-300">Apple High Efficiency (HEIC)</strong> kualitas 100% asli dari iPhone tanpa dikompresi.
                </p>
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Keutuhan File Terjamin (Lossless)
                </div>
                <a
                  href={file.downloadUrl}
                  download={file.originalName}
                  className="px-4 py-2 bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 rounded-xl text-xs font-bold hover:from-sky-300 hover:to-teal-300 transition shadow-md"
                >
                  Download File Asli ke PC
                </a>
              </div>
            ) : (
              <img
                src={file.url}
                alt={file.originalName}
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
              />
            )
          ) : file.category === 'video' ? (
            <video
              src={file.url}
              controls
              autoPlay
              className="max-h-[60vh] max-w-full rounded-xl shadow-2xl bg-black border border-white/10"
            >
              Browser Anda tidak mendukung tag video.
            </video>
          ) : file.category === 'audio' ? (
            <div className="w-full max-w-md glass-card p-6 rounded-2xl text-center border border-white/15">
              <div className="w-16 h-16 bg-amber-500/20 text-amber-300 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
                <Music className="w-8 h-8" />
              </div>
              <p className="font-semibold text-white text-sm mb-4">{file.originalName}</p>
              <audio src={file.url} controls className="w-full" />
            </div>
          ) : (
            <div className="text-center p-8 glass-card rounded-2xl border border-white/15 max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-sky-500/20 text-sky-300 flex items-center justify-center mx-auto mb-4 border border-sky-500/30">
                <FileText className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-white mb-1">{file.originalName}</h4>
              <p className="text-xs text-slate-300 mb-4">{formatFileSize(file.size)} • {file.mimetype}</p>
              <a
                href={file.downloadUrl}
                download={file.originalName}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-400 to-teal-400 text-slate-950 text-xs font-bold rounded-xl hover:from-sky-300 hover:to-teal-300 transition shadow-md"
              >
                <Download className="w-4 h-4 text-slate-950" />
                Unduh Dokumen
              </a>
            </div>
          )}
        </div>

        {/* Metadata Footer */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-6 py-4 border-t border-white/10 bg-slate-900/60 backdrop-blur-xl text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-slate-400 block">Sumber Perangkat</span>
              <span className="font-semibold text-slate-100 truncate block">{file.device}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-300">
            <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Tanggal / Jam</span>
              <span className="font-semibold text-slate-100 block">
                {file.dateGroup} ({formatTime(file.uploadedAt)})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-300">
            <HardDrive className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Ukuran Presisi</span>
              <span className="font-semibold text-slate-100 block">{formatFileSize(file.size)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-[10px] text-slate-400 block">Status Kualitas</span>
              <span className="font-semibold text-emerald-300 block">100% Original Utuh</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
