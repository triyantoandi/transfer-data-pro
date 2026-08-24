import React from 'react';
import { ViewMode, ServerStatus } from '../types';
import { Wifi, Laptop, Smartphone, SplitSquareVertical, Radio } from 'lucide-react';

interface HeaderProps {
  currentMode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  status: ServerStatus | null;
}

export const Header: React.FC<HeaderProps> = ({ currentMode, onModeChange, status }) => {
  return (
    <header className="sticky top-0 z-40 glass-panel border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-sky-400 to-teal-500 text-slate-950 flex items-center justify-center shadow-lg shadow-sky-500/20 font-bold border border-white/20">
            <Wifi className="w-5 h-5 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                Transfer File WiFi
              </span>
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[10px] font-bold">
                Local P2P
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Backup Foto &amp; Video Asli Utuh (iPhone &amp; Android ke PC)
            </p>
          </div>
        </div>

        {/* Mode Switcher Pill */}
        <div className="flex items-center bg-slate-900/60 p-1 rounded-2xl border border-white/10 text-xs font-semibold backdrop-blur-md">
          <button
            onClick={() => onModeChange('pc')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
              currentMode === 'pc'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Layar PC</span>
            <span className="sm:hidden">PC</span>
          </button>

          <button
            onClick={() => onModeChange('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
              currentMode === 'mobile'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Layar HP</span>
            <span className="sm:hidden">HP</span>
          </button>

          <button
            onClick={() => onModeChange('dual')}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition ${
              currentMode === 'dual'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Simulasi Interaktif: Buka PC dan HP berdampingan untuk tes transfer langsung"
          >
            <SplitSquareVertical className="w-3.5 h-3.5 text-sky-400" />
            <span>Simulasi Split (PC + HP)</span>
          </button>
        </div>

        {/* Live Network Status Pill */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-300 glass-pill px-3 py-1.5 rounded-xl border border-white/10">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-mono text-slate-200 font-medium">
            {status?.localIps?.[0] || '127.0.0.1'}:{status?.port || 3000}
          </span>
        </div>
      </div>
    </header>
  );
};
