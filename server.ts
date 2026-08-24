import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import multer from "multer";
import JSZip from "jszip";
import { createServer as createViteServer } from "vite";
import {
  handleTransferInit,
  handleTransferChunk,
  handleTransferComplete,
  handleTransferCancel
} from "./server/chunkTransferHandler";
import {
  syncFileToFirestore,
  deleteFileFromFirestore,
  batchDeleteFilesFromFirestore,
  clearAllFilesFromFirestore,
  syncNoteToFirestore,
  deleteNoteFromFirestore,
  clearNotesFromFirestore,
  isFirebaseConnected,
  logSystemActivityToFirestore
} from "./server/firebaseSync";

interface StoredFile {
  id: string;
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  extension: string;
  uploadedAt: string;
  dateGroup: string;
  category: 'photo' | 'video' | 'document' | 'audio' | 'archive' | 'other';
  device: string;
  isHeic: boolean;
  isMov: boolean;
  filePath: string;
}

interface TextNote {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  isLink: boolean;
}

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const MANIFEST_PATH = path.join(UPLOAD_DIR, "manifest.json");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage memory database with disk persistence
let fileRecords: StoredFile[] = [];
let textNotes: TextNote[] = [];
const sseClients: Response[] = [];

// Load manifest from disk if available
try {
  if (fs.existsSync(MANIFEST_PATH)) {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.files)) {
      fileRecords = parsed.files.filter((f: StoredFile) => fs.existsSync(f.filePath));
    }
    if (Array.isArray(parsed.notes)) {
      textNotes = parsed.notes;
    }
  }
} catch (e) {
  console.error("Error loading manifest:", e);
}

function saveManifest() {
  try {
    fs.writeFileSync(
      MANIFEST_PATH,
      JSON.stringify({ files: fileRecords, notes: textNotes }, null, 2),
      "utf-8"
    );
  } catch (e) {
    console.error("Error saving manifest:", e);
  }
}

// Helper to determine category
function getCategory(ext: string, mimetype: string): StoredFile['category'] {
  const cleanExt = ext.toLowerCase().replace('.', '');
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'svg', 'dng', 'raw', 'cr2', 'nef'].includes(cleanExt) || mimetype.startsWith('image/')) {
    return 'photo';
  }
  if (['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm', '3gp', 'wmv'].includes(cleanExt) || mimetype.startsWith('video/')) {
    return 'video';
  }
  if (['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'].includes(cleanExt) || mimetype.startsWith('audio/')) {
    return 'audio';
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(cleanExt) || mimetype.includes('zip') || mimetype.includes('compressed')) {
    return 'archive';
  }
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md'].includes(cleanExt) || mimetype.includes('pdf') || mimetype.includes('document')) {
    return 'document';
  }
  return 'other';
}

function formatDateIndo(date: Date): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const k in interfaces) {
    const netList = interfaces[k];
    if (netList) {
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
  }
  return addresses.length > 0 ? addresses : ['127.0.0.1'];
}

function detectDevice(userAgent: string = '', headerDevice: string = ''): string {
  if (headerDevice && headerDevice.trim() !== '') return headerDevice.trim();
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'Apple iPhone';
  if (ua.includes('ipad')) return 'Apple iPad';
  if (ua.includes('samsung')) return 'Samsung Galaxy';
  if (ua.includes('android')) return 'Android Phone';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac PC';
  if (ua.includes('windows')) return 'Windows PC';
  if (ua.includes('linux')) return 'Linux PC';
  return 'Perangkat Lain';
}

function broadcastEvent(eventType: string, data: any) {
  const payload = `data: ${JSON.stringify({ type: eventType, data, timestamp: new Date().toISOString() })}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024 * 5, // 5GB limit per file
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // CORS configuration for LAN WiFi cross-origin access
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Name', 'X-Requested-With', 'Range', 'Accept'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition']
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Official Standard Health Check endpoint
  app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: "transfer-file-wifi",
      device: "pc",
      hostname: os.hostname(),
      port: PORT,
      serverTime: new Date().toISOString()
    });
  });

  // Pairing endpoint for mobile handshake
  app.post("/api/pair", (req: Request, res: Response) => {
    const clientDevice = detectDevice(req.get('user-agent'), req.body.deviceName || (req.headers['x-device-name'] as string));
    res.status(200).json({
      ok: true,
      paired: true,
      service: "transfer-file-wifi",
      server: "pc",
      device: clientDevice,
      hostname: os.hostname(),
      message: `Perangkat ${clientDevice} berhasil dipasangkan dengan PC Server`,
      timestamp: new Date().toISOString()
    });
  });

  // SSE endpoint for live sync
  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseClients.push(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', clientsCount: sseClients.length })}\n\n`);

    req.on("close", () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // Server status and network IP
  app.get("/api/status", (req: Request, res: Response) => {
    const localIps = getLocalIpAddresses();
    const hostHeader = req.get("host") || `localhost:${PORT}`;
    const protocol = req.protocol === "https" || req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    const totalSizeBytes = fileRecords.reduce((acc, f) => acc + f.size, 0);

    res.json({
      online: true,
      hostname: os.hostname(),
      localIps,
      port: PORT,
      serverUrl: `${protocol}://${hostHeader}`,
      clientUrl: `${protocol}://${hostHeader}/?mode=mobile`,
      totalFiles: fileRecords.length,
      totalSizeBytes,
      connectedClients: Math.max(1, sseClients.length),
      serverStartTime: new Date().toISOString(),
      firebaseConnected: isFirebaseConnected(),
      firebaseProjectId: "indigo-gear-cds98"
    });
  });

  // Get all files
  app.get("/api/files", (_req: Request, res: Response) => {
    const formatted = fileRecords.map(f => ({
      id: f.id,
      originalName: f.originalName,
      filename: f.filename,
      size: f.size,
      mimetype: f.mimetype,
      extension: f.extension,
      uploadedAt: f.uploadedAt,
      dateGroup: f.dateGroup,
      category: f.category,
      device: f.device,
      isHeic: f.isHeic,
      isMov: f.isMov,
      url: `/api/files/${f.id}/view`,
      downloadUrl: `/api/files/${f.id}/download`,
    }));
    res.json({ files: formatted });
  });

  // Connection test ping endpoint
  app.get("/api/transfer/test-ping", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      serverTime: new Date().toISOString(),
      hostname: os.hostname(),
      message: "Koneksi ke PC Server Aktif dan Siap Menerima File"
    });
  });

  // Chunked Transfer Endpoints
  const chunkUpload = multer({ dest: path.join(UPLOAD_DIR, 'chunks_temp') });

  app.post("/api/transfer/init", (req: Request, res: Response) => {
    handleTransferInit(req, res, UPLOAD_DIR);
  });

  app.post("/api/transfer/chunk", chunkUpload.single("chunk"), (req: Request, res: Response) => {
    handleTransferChunk(req, res, UPLOAD_DIR);
  });

  app.post("/api/transfer/complete", (req: Request, res: Response) => {
    handleTransferComplete(req, res, UPLOAD_DIR, (originalName, finalFilename, size, mimeType, device, finalPath) => {
      const ext = path.extname(originalName).toLowerCase();
      const isHeic = ext === '.heic' || ext === '.heif';
      const isMov = ext === '.mov';
      const category = getCategory(ext, mimeType);
      const now = new Date();
      const dateGroup = formatDateIndo(now);

      const record: StoredFile = {
        id: Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36),
        originalName: Buffer.from(originalName, 'latin1').toString('utf8'),
        filename: finalFilename,
        size,
        mimetype: mimeType || 'application/octet-stream',
        extension: ext.replace('.', ''),
        uploadedAt: now.toISOString(),
        dateGroup,
        category,
        device: detectDevice('', device),
        isHeic,
        isMov,
        filePath: finalPath
      };

      fileRecords.unshift(record);
      saveManifest();

      // SSE Broadcast
      broadcastEvent('files_uploaded', {
        count: 1,
        device: record.device,
        files: [{
          id: record.id,
          originalName: record.originalName,
          size: record.size,
          category: record.category,
          isHeic: record.isHeic,
          isMov: record.isMov
        }]
      });

      // Firebase Sync
      syncFileToFirestore({
        id: record.id,
        originalName: record.originalName,
        filename: record.filename,
        size: record.size,
        mimetype: record.mimetype,
        extension: record.extension,
        uploadedAt: record.uploadedAt,
        dateGroup: record.dateGroup,
        category: record.category,
        device: record.device,
        isHeic: record.isHeic,
        isMov: record.isMov
      }).catch(e => console.error("Firestore sync error:", e));

      logSystemActivityToFirestore("transfer_chunked", `File ${record.originalName} (${(record.size / 1024 / 1024).toFixed(2)} MB) berhasil ditransfer dari ${record.device}`).catch(() => {});

      return {
        ...record,
        url: `/api/files/${record.id}/view`,
        downloadUrl: `/api/files/${record.id}/download`
      };
    });
  });

  app.post("/api/transfer/cancel/:id", (req: Request, res: Response) => {
    handleTransferCancel(req, res, UPLOAD_DIR);
  });

  // Upload files endpoint (Legacy Direct Fallback)
  app.post("/api/upload", upload.array("files", 100), (req: Request, res: Response) => {
    try {
      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        return res.status(400).json({ error: "Tidak ada file yang diunggah" });
      }

      const clientDevice = detectDevice(req.get('user-agent'), req.body.deviceName || (req.headers['x-device-name'] as string));
      const now = new Date();
      const dateGroup = formatDateIndo(now);

      const addedRecords: StoredFile[] = [];

      for (const file of uploadedFiles) {
        const ext = path.extname(file.originalname).toLowerCase();
        const isHeic = ext === '.heic' || ext === '.heif';
        const isMov = ext === '.mov';
        const category = getCategory(ext, file.mimetype);

        const record: StoredFile = {
          id: Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36),
          originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'), // fix UTF8 character names
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype || 'application/octet-stream',
          extension: ext.replace('.', ''),
          uploadedAt: now.toISOString(),
          dateGroup,
          category,
          device: clientDevice,
          isHeic,
          isMov,
          filePath: file.path
        };

        fileRecords.unshift(record);
        addedRecords.push(record);
      }

      broadcastEvent('files_uploaded', {
        count: addedRecords.length,
        device: clientDevice,
        files: addedRecords.map(f => ({
          id: f.id,
          originalName: f.originalName,
          size: f.size,
          category: f.category,
          isHeic: f.isHeic,
          isMov: f.isMov
        }))
      });

      saveManifest();

      // Async sync to Firebase Firestore
      for (const rec of addedRecords) {
        syncFileToFirestore({
          id: rec.id,
          originalName: rec.originalName,
          filename: rec.filename,
          size: rec.size,
          mimetype: rec.mimetype,
          extension: rec.extension,
          uploadedAt: rec.uploadedAt,
          dateGroup: rec.dateGroup,
          category: rec.category,
          device: rec.device,
          isHeic: rec.isHeic,
          isMov: rec.isMov
        }).catch(e => console.error("Firestore sync error:", e));
      }
      logSystemActivityToFirestore("upload", `${addedRecords.length} file diupload dari ${clientDevice}`).catch(() => {});

      res.json({
        success: true,
        message: `${addedRecords.length} file berhasil diterima dan disimpan di PC`,
        count: addedRecords.length,
        files: addedRecords
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      res.status(500).json({ error: "Gagal memproses file upload: " + err.message });
    }
  });

  // View / Stream file content
  app.get("/api/files/:id/view", (req: Request, res: Response) => {
    const record = fileRecords.find(f => f.id === req.params.id);
    if (!record || !fs.existsSync(record.filePath)) {
      return res.status(404).send("File tidak ditemukan");
    }

    const stat = fs.statSync(record.filePath);
    const range = req.headers.range;

    // Handle range requests for smooth video playback (MOV / MP4)
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(record.filePath, { start, end });
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": record.mimetype,
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": record.mimetype,
        "Content-Disposition": `inline; filename="${encodeURIComponent(record.originalName)}"`,
      });
      fs.createReadStream(record.filePath).pipe(res);
    }
  });

  // Download single file
  app.get("/api/files/:id/download", (req: Request, res: Response) => {
    const record = fileRecords.find(f => f.id === req.params.id);
    if (!record || !fs.existsSync(record.filePath)) {
      return res.status(404).send("File tidak ditemukan");
    }
    res.download(record.filePath, record.originalName);
  });

  // Batch delete files
  app.post("/api/files/batch-delete", (req: Request, res: Response) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Daftar ID tidak valid" });
    }

    let deletedCount = 0;
    for (const id of ids) {
      const index = fileRecords.findIndex(f => f.id === id);
      if (index !== -1) {
        const [deleted] = fileRecords.splice(index, 1);
        if (fs.existsSync(deleted.filePath)) {
          try {
            fs.unlinkSync(deleted.filePath);
          } catch (e) {
            console.error("Error unlinking file:", e);
          }
        }
        deletedCount++;
      }
    }

    saveManifest();
    batchDeleteFilesFromFirestore(ids).catch(() => {});
    logSystemActivityToFirestore("batch_delete", `Dihapus ${deletedCount} file`).catch(() => {});
    broadcastEvent('files_deleted_batch', { ids });
    res.json({ success: true, count: deletedCount });
  });

  // Delete single file
  app.delete("/api/files/:id", (req: Request, res: Response) => {
    const index = fileRecords.findIndex(f => f.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "File tidak ditemukan" });
    }

    const [deleted] = fileRecords.splice(index, 1);
    if (fs.existsSync(deleted.filePath)) {
      try {
        fs.unlinkSync(deleted.filePath);
      } catch (e) {
        console.error("Error unlinking file:", e);
      }
    }

    saveManifest();
    deleteFileFromFirestore(req.params.id).catch(() => {});
    logSystemActivityToFirestore("delete_file", `File ${deleted.originalName} dihapus`).catch(() => {});
    broadcastEvent('file_deleted', { id: req.params.id });
    res.json({ success: true, message: "File berhasil dihapus" });
  });

  // Clear all files
  app.delete("/api/files", (_req: Request, res: Response) => {
    for (const file of fileRecords) {
      if (fs.existsSync(file.filePath)) {
        try {
          fs.unlinkSync(file.filePath);
        } catch (e) {
          console.error("Error unlinking file:", e);
        }
      }
    }
    fileRecords = [];
    saveManifest();
    clearAllFilesFromFirestore().catch(() => {});
    logSystemActivityToFirestore("clear_all", "Semua file dibersihkan").catch(() => {});
    broadcastEvent('all_files_cleared', {});
    res.json({ success: true, message: "Semua file berhasil dibersihkan" });
  });

  // Quick Notes & Clipboard sharing API
  app.get("/api/notes", (_req: Request, res: Response) => {
    res.json({ notes: textNotes });
  });

  app.post("/api/notes", (req: Request, res: Response) => {
    const { content, sender } = req.body;
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: "Konten teks tidak boleh kosong" });
    }

    const trimmed = content.trim();
    const isLink = /^(http|https):\/\/[^ "]+$/.test(trimmed);
    const newNote: TextNote = {
      id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
      content: trimmed,
      sender: sender || 'Perangkat',
      timestamp: new Date().toISOString(),
      isLink
    };

    textNotes.unshift(newNote);
    if (textNotes.length > 50) textNotes = textNotes.slice(0, 50); // limit 50 notes
    saveManifest();

    syncNoteToFirestore(newNote).catch(() => {});
    broadcastEvent('note_created', newNote);
    res.json({ success: true, note: newNote });
  });

  app.delete("/api/notes/:id", (req: Request, res: Response) => {
    const index = textNotes.findIndex(n => n.id === req.params.id);
    if (index !== -1) {
      textNotes.splice(index, 1);
      saveManifest();
      deleteNoteFromFirestore(req.params.id).catch(() => {});
      broadcastEvent('note_deleted', { id: req.params.id });
    }
    res.json({ success: true });
  });

  app.delete("/api/notes", (_req: Request, res: Response) => {
    textNotes = [];
    saveManifest();
    clearNotesFromFirestore().catch(() => {});
    broadcastEvent('notes_cleared', {});
    res.json({ success: true });
  });

  // Download ZIP archive organized by date folders
  app.get("/api/download-zip", async (req: Request, res: Response) => {
    try {
      if (fileRecords.length === 0) {
        return res.status(400).send("Tidak ada file untuk di-download");
      }

      const fileIdsParam = req.query.ids as string;
      const targetRecords = fileIdsParam
        ? fileRecords.filter(f => fileIdsParam.split(',').includes(f.id))
        : fileRecords;

      if (targetRecords.length === 0) {
        return res.status(400).send("Tidak ada file yang cocok untuk di-download");
      }

      const zip = new JSZip();

      for (const rec of targetRecords) {
        if (fs.existsSync(rec.filePath)) {
          const content = fs.readFileSync(rec.filePath);
          // Group inside folder per date: "24 Agustus 2026/nama_file.jpg"
          const safeDateFolder = rec.dateGroup.replace(/[\/\\:*?"<>|]/g, "_");
          const safeFileName = rec.originalName.replace(/[\/\\:*?"<>|]/g, "_");
          zip.folder(safeDateFolder)?.file(safeFileName, content);
        }
      }

      const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const timestamp = new Date().toISOString().slice(0, 10);
      const zipName = `Backup_WiFi_Transfer_${timestamp}.zip`;

      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Content-Length": zipBuffer.length,
      });
      res.end(zipBuffer);
    } catch (err: any) {
      console.error("ZIP Error:", err);
      res.status(500).send("Gagal membuat file ZIP: " + err.message);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
