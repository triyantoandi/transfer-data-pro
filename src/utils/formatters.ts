export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '--:--';
  }
}

export function getFileCategoryColor(category: string): { bg: string; text: string; border: string } {
  switch (category) {
    case 'photo':
      return { bg: 'bg-emerald-500/15 text-emerald-300', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'video':
      return { bg: 'bg-purple-500/15 text-purple-300', text: 'text-purple-400', border: 'border-purple-500/30' };
    case 'document':
      return { bg: 'bg-sky-500/15 text-sky-300', text: 'text-sky-400', border: 'border-sky-500/30' };
    case 'audio':
      return { bg: 'bg-amber-500/15 text-amber-300', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'archive':
      return { bg: 'bg-rose-500/15 text-rose-300', text: 'text-rose-400', border: 'border-rose-500/30' };
    default:
      return { bg: 'bg-slate-500/15 text-slate-300', text: 'text-slate-400', border: 'border-slate-500/30' };
  }
}
