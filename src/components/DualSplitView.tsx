import React from 'react';
import { MobileClientView } from './MobileClientView';
import { PcServerView } from './PcServerView';
import { FileRecord, ServerStatus, TextNote } from '../types';
import { Smartphone, Laptop, Sparkles, ArrowRight } from 'lucide-react';

interface DualSplitViewProps {
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

export const DualSplitView: React.FC<DualSplitViewProps> = ({
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
  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Simulation Banner */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 border border-sky-400/30 shadow-lg shadow-sky-500/10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-500/20 rounded-xl border border-sky-500/30">
            <Sparkles className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Mode Simulasi Interaktif (PC &amp; HP Berdampingan)</h3>
            <p className="text-xs text-slate-300">
              Pilih foto di layar HP di sebelah kanan, dan saksikan file masuk ke layar PC di sebelah kiri secara real-time!
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold glass-pill text-sky-300 px-3 py-1.5 rounded-xl border border-sky-500/40">
          <span>HP Client</span>
          <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
          <span>PC Server</span>
        </div>
      </div>

      {/* Split Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Side: PC Receiver View (Takes 7 cols) */}
        <div className="xl:col-span-7 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-300 uppercase tracking-wider px-1">
            <Laptop className="w-4 h-4 text-sky-400" />
            <span>Layar Komputer (Receiver &amp; Organizer)</span>
          </div>
          <div className="glass-panel p-4 rounded-3xl border border-white/10 shadow-inner">
            <PcServerView
              status={status}
              files={files}
              notes={notes}
              onFileSelect={onFileSelect}
              onRefresh={onRefresh}
              onUploadFromPc={onUploadFromPc}
              onDeleteFile={onDeleteFile}
              onBatchDelete={onBatchDelete}
              onClearAll={onClearAll}
              onAddNote={onAddNote}
              onDeleteNote={onDeleteNote}
              onClearNotes={onClearNotes}
            />
          </div>
        </div>

        {/* Right Side: Phone Mockup Frame (Takes 5 cols) */}
        <div className="xl:col-span-5 space-y-3 sticky top-20">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-300 uppercase tracking-wider px-1">
            <Smartphone className="w-4 h-4 text-sky-400" />
            <span>Layar HP (iPhone / Android Client)</span>
          </div>

          {/* Smartphone Bezel Wrapper with Frosted Glass look */}
          <div className="bg-slate-950/80 backdrop-blur-2xl p-3 sm:p-4 rounded-[40px] shadow-2xl border-4 border-slate-700/80 max-w-sm mx-auto">
            {/* Notch / Dynamic Island */}
            <div className="w-24 h-4 bg-black rounded-full mx-auto mb-2 flex items-center justify-end px-2 border border-white/10">
              <span className="w-2 h-2 rounded-full bg-slate-800" />
            </div>

            <div className="rounded-[28px] overflow-hidden">
              <MobileClientView
                serverOnline={status?.online || true}
                onUploadSuccess={onRefresh}
                serverFiles={files}
                notes={notes}
                onAddNote={onAddNote}
                onDeleteNote={onDeleteNote}
                isEmbedded={true}
              />
            </div>

            {/* Home Indicator bar */}
            <div className="w-32 h-1 bg-slate-600 rounded-full mx-auto mt-2.5" />
          </div>
        </div>
      </div>
    </div>
  );
};
