import React, { useState, useEffect, useCallback } from 'react';
import { ViewMode, ServerStatus, FileRecord, TextNote } from './types';
import { Header } from './components/Header';
import { PcServerView } from './components/PcServerView';
import { MobileClientView } from './components/MobileClientView';
import { DualSplitView } from './components/DualSplitView';
import { FilePreviewModal } from './components/FilePreviewModal';

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('pc');
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [notes, setNotes] = useState<TextNote[]>([]);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Detect URL parameter ?mode=mobile or mobile User-Agent
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode') as ViewMode;

    if (modeParam && ['pc', 'mobile', 'dual'].includes(modeParam)) {
      setViewMode(modeParam);
    } else {
      const isMobileUA = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobileUA) {
        setViewMode('mobile');
      } else if (window.innerWidth < 768) {
        setViewMode('mobile');
      } else {
        setViewMode('pc');
      }
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (err) {
      console.error('Error fetching server status:', err);
    }
  }, []);

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch('/api/notes');
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    }
  }, []);

  // Connect to SSE (Server-Sent Events) for real-time live sync
  useEffect(() => {
    fetchStatus();
    fetchFiles();
    fetchNotes();

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (
            parsed.type === 'files_uploaded' ||
            parsed.type === 'file_deleted' ||
            parsed.type === 'files_deleted_batch' ||
            parsed.type === 'all_files_cleared'
          ) {
            fetchFiles();
            fetchStatus();
          } else if (
            parsed.type === 'note_created' ||
            parsed.type === 'note_deleted' ||
            parsed.type === 'notes_cleared'
          ) {
            fetchNotes();
          }
        } catch (e) {
          console.error('Error parsing SSE event', e);
        }
      };
      eventSource.onerror = () => {
        // SSE reconnection handled automatically by browser
      };
    } catch (err) {
      console.error('EventSource initialization error', err);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchStatus, fetchFiles, fetchNotes]);

  const handleUploadFromPc = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const formData = new FormData();
    for (let i = 0; i < fileList.length; i++) {
      formData.append('files', fileList[i]);
    }
    formData.append('deviceName', 'PC Local');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        fetchFiles();
        fetchStatus();
      }
    } catch (err) {
      console.error('PC Upload Error:', err);
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== id));
        if (previewFile?.id === id) {
          setPreviewFile(null);
        }
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleBatchDelete = async (ids: string[]) => {
    try {
      const res = await fetch('/api/files/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
        if (previewFile && ids.includes(previewFile.id)) {
          setPreviewFile(null);
        }
        fetchStatus();
      }
    } catch (err) {
      console.error('Batch delete error:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      const res = await fetch('/api/files', {
        method: 'DELETE',
      });
      if (res.ok) {
        setFiles([]);
        setPreviewFile(null);
        fetchStatus();
      }
    } catch (err) {
      console.error('Clear all error:', err);
    }
  };

  const handleAddNote = async (content: string, sender: string) => {
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, sender }),
      });
      if (res.ok) {
        fetchNotes();
      }
    } catch (err) {
      console.error('Add note error:', err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotes((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error('Delete note error:', err);
    }
  };

  const handleClearNotes = async () => {
    try {
      const res = await fetch('/api/notes', {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotes([]);
      }
    } catch (err) {
      console.error('Clear notes error:', err);
    }
  };

  // Navigate next/prev in preview modal
  const handleNavigatePreview = (direction: 'next' | 'prev') => {
    if (!previewFile || files.length <= 1) return;
    const currentIndex = files.findIndex((f) => f.id === previewFile.id);
    if (currentIndex === -1) return;

    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % files.length;
      setPreviewFile(files[nextIndex]);
    } else {
      const prevIndex = (currentIndex - 1 + files.length) % files.length;
      setPreviewFile(files[prevIndex]);
    }
  };

  return (
    <div className="min-h-screen text-slate-100 flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-200 relative">
      {/* Dynamic Frosted Gradient Mesh Background */}
      <div className="mesh-bg" />

      {/* Top Header */}
      <Header
        currentMode={viewMode}
        onModeChange={setViewMode}
        status={serverStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 relative z-10">
        {viewMode === 'pc' && (
          <PcServerView
            status={serverStatus}
            files={files}
            notes={notes}
            onFileSelect={setPreviewFile}
            onRefresh={fetchFiles}
            onUploadFromPc={handleUploadFromPc}
            onDeleteFile={handleDeleteFile}
            onBatchDelete={handleBatchDelete}
            onClearAll={handleClearAll}
            onAddNote={handleAddNote}
            onDeleteNote={handleDeleteNote}
            onClearNotes={handleClearNotes}
          />
        )}

        {viewMode === 'mobile' && (
          <div className="py-2">
            <MobileClientView
              serverOnline={serverStatus?.online || true}
              onUploadSuccess={fetchFiles}
              serverFiles={files}
              notes={notes}
              onAddNote={handleAddNote}
              onDeleteNote={handleDeleteNote}
            />
          </div>
        )}

        {viewMode === 'dual' && (
          <DualSplitView
            status={serverStatus}
            files={files}
            notes={notes}
            onFileSelect={setPreviewFile}
            onRefresh={fetchFiles}
            onUploadFromPc={handleUploadFromPc}
            onDeleteFile={handleDeleteFile}
            onBatchDelete={handleBatchDelete}
            onClearAll={handleClearAll}
            onAddNote={handleAddNote}
            onDeleteNote={handleDeleteNote}
            onClearNotes={handleClearNotes}
          />
        )}
      </main>

      {/* Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        onNext={() => handleNavigatePreview('next')}
        onPrev={() => handleNavigatePreview('prev')}
        hasMultipleFiles={files.length > 1}
      />
    </div>
  );
}
