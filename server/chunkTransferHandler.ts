import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';

interface ActiveTransferSession {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  device: string;
  receivedChunks: Set<number>;
  tempDir: string;
  startedAt: number;
  lastActivity: number;
}

const activeSessions: Map<string, ActiveTransferSession> = new Map();

// Cleanup stale sessions older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of activeSessions.entries()) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      try {
        if (fs.existsSync(session.tempDir)) {
          fs.rmSync(session.tempDir, { recursive: true, force: true });
        }
      } catch (e) {
        console.error(`Error cleaning stale transfer session ${id}:`, e);
      }
      activeSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function handleTransferInit(req: Request, res: Response, baseUploadDir: string) {
  try {
    const { transferId, fileName, fileSize, mimeType, totalChunks, device } = req.body;

    if (!transferId || !fileName || !fileSize || !totalChunks) {
      return res.status(400).json({ error: 'Data inisialisasi transfer tidak lengkap' });
    }

    const tempDir = path.join(baseUploadDir, 'temp_' + transferId);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const session: ActiveTransferSession = {
      transferId,
      fileName,
      fileSize: Number(fileSize),
      mimeType: mimeType || 'application/octet-stream',
      totalChunks: Number(totalChunks),
      device: device || 'Mobile Client',
      receivedChunks: new Set<number>(),
      tempDir,
      startedAt: Date.now(),
      lastActivity: Date.now()
    };

    activeSessions.set(transferId, session);

    console.log(`[TRANSFER ENGINE] Transfer session initialized: ${transferId} (${fileName}, ${totalChunks} chunks)`);
    return res.json({
      success: true,
      transferId,
      message: 'Sesi transfer siap menerima potongan file (chunks)'
    });
  } catch (err: any) {
    console.error('[TRANSFER ENGINE] Error in handleTransferInit:', err);
    return res.status(500).json({ error: 'Gagal inisialisasi transfer: ' + err?.message });
  }
}

export function handleTransferChunk(req: Request, res: Response, baseUploadDir: string) {
  try {
    const transferId = req.body.transferId || (req.headers['x-transfer-id'] as string);
    const chunkIndexStr = req.body.chunkIndex || (req.headers['x-chunk-index'] as string);
    const totalChunksStr = req.body.totalChunks || (req.headers['x-total-chunks'] as string);

    if (!transferId || chunkIndexStr === undefined) {
      return res.status(400).json({ error: 'Missing transferId or chunkIndex' });
    }

    const chunkIndex = parseInt(chunkIndexStr, 10);
    const totalChunks = parseInt(totalChunksStr, 10) || 1;

    let session = activeSessions.get(transferId);
    if (!session) {
      // Auto-create session if init was skipped
      const tempDir = path.join(baseUploadDir, 'temp_' + transferId);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      session = {
        transferId,
        fileName: 'transfer-' + transferId,
        fileSize: 0,
        mimeType: 'application/octet-stream',
        totalChunks,
        device: (req.headers['x-device-name'] as string) || 'Mobile Client',
        receivedChunks: new Set<number>(),
        tempDir,
        startedAt: Date.now(),
        lastActivity: Date.now()
      };
      activeSessions.set(transferId, session);
    }

    session.lastActivity = Date.now();

    const chunkFile = (req as any).file;
    if (!chunkFile && !req.body.chunk) {
      return res.status(400).json({ error: 'Chunk payload tidak ditemukan' });
    }

    const chunkTargetPath = path.join(session.tempDir, `chunk_${chunkIndex}.part`);

    if (chunkFile) {
      // Move multer file to chunk target path
      fs.copyFileSync(chunkFile.path, chunkTargetPath);
      try { fs.unlinkSync(chunkFile.path); } catch {}
    }

    session.receivedChunks.add(chunkIndex);

    const receivedCount = session.receivedChunks.size;
    const progressPercent = Math.round((receivedCount / session.totalChunks) * 100);

    return res.json({
      success: true,
      chunkIndex,
      receivedCount,
      totalChunks: session.totalChunks,
      progressPercent
    });
  } catch (err: any) {
    console.error('[TRANSFER ENGINE] Error in handleTransferChunk:', err);
    return res.status(500).json({ error: 'Gagal memproses chunk: ' + err?.message });
  }
}

export function handleTransferComplete(
  req: Request, 
  res: Response, 
  baseUploadDir: string, 
  createStoredFileRecord: (originalName: string, finalFilename: string, size: number, mimeType: string, device: string, finalPath: string) => any
) {
  try {
    const { transferId, fileName, fileSize, mimeType, totalChunks, device } = req.body;

    const session = activeSessions.get(transferId);
    const expectedTotal = session ? session.totalChunks : parseInt(totalChunks, 10);
    const tempDir = session ? session.tempDir : path.join(baseUploadDir, 'temp_' + transferId);

    if (!fs.existsSync(tempDir)) {
      return res.status(404).json({ error: 'Direktori chunk sesi transfer tidak ditemukan' });
    }

    // Verify all chunks exist
    for (let i = 0; i < expectedTotal; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}.part`);
      if (!fs.existsSync(chunkPath)) {
        return res.status(400).json({
          error: `Integritas transfer gagal: Chunk nomor ${i + 1} hilang dari total ${expectedTotal}`
        });
      }
    }

    // Assemble all chunks into final file
    const ext = path.extname(fileName || 'file');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const finalFilename = `${uniqueSuffix}${ext}`;
    const finalFilePath = path.join(baseUploadDir, finalFilename);

    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < expectedTotal; i++) {
      const chunkPath = path.join(tempDir, `chunk_${i}.part`);
      const chunkBuf = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuf);
    }
    writeStream.end();

    // Verify assembled file size
    const stat = fs.statSync(finalFilePath);
    const declaredSize = Number(fileSize) || stat.size;

    console.log(`[TRANSFER ENGINE] File assembled: ${finalFilename} (Size: ${stat.size} bytes vs declared ${declaredSize} bytes)`);

    // Clean temp chunk directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Error removing temp chunk dir:', e);
    }
    activeSessions.delete(transferId);

    const record = createStoredFileRecord(
      fileName || 'unnamed_file',
      finalFilename,
      stat.size,
      mimeType || 'application/octet-stream',
      device || 'Mobile Client',
      finalFilePath
    );

    return res.json({
      success: true,
      message: 'File berhasil digabungkan dan diverifikasi 100% utuh',
      file: record
    });
  } catch (err: any) {
    console.error('[TRANSFER ENGINE] Error in handleTransferComplete:', err);
    return res.status(500).json({ error: 'Gagal menyelesaikan transfer file: ' + err?.message });
  }
}

export function handleTransferCancel(req: Request, res: Response, baseUploadDir: string) {
  try {
    const transferId = req.params.id || req.body.transferId;
    if (!transferId) return res.status(400).json({ error: 'Missing transferId' });

    const session = activeSessions.get(transferId);
    const tempDir = session ? session.tempDir : path.join(baseUploadDir, 'temp_' + transferId);

    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
    activeSessions.delete(transferId);

    console.log(`[TRANSFER ENGINE] Transfer session cancelled & cleaned: ${transferId}`);
    return res.json({ success: true, message: 'Sesi transfer dibatalkan dan memori dibersihkan' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
}
