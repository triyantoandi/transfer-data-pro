import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  collection, 
  writeBatch,
  serverTimestamp,
  Firestore 
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let dbInstance: Firestore | null = null;
let firebaseInitialized = false;

try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    
    if (config.apiKey && config.projectId) {
      const app = getApps().length === 0 ? initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId
      }) : getApp();

      dbInstance = config.firestoreDatabaseId
        ? getFirestore(app, config.firestoreDatabaseId)
        : getFirestore(app);

      firebaseInitialized = true;
      console.log(`[Firebase] Firestore connected successfully to project: ${config.projectId}`);
    }
  }
} catch (err) {
  console.error('[Firebase] Initialization error:', err);
}

export function isFirebaseConnected(): boolean {
  return firebaseInitialized && dbInstance !== null;
}

export async function syncFileToFirestore(file: {
  id: string;
  originalName: string;
  filename: string;
  size: number;
  mimetype: string;
  extension: string;
  uploadedAt: string;
  dateGroup: string;
  category: string;
  device: string;
  isHeic: boolean;
  isMov: boolean;
}) {
  if (!dbInstance) return;
  try {
    const ref = doc(dbInstance, 'files', file.id);
    await setDoc(ref, {
      ...file,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error(`[Firebase] Error syncing file ${file.id} to Firestore:`, err);
  }
}

export async function deleteFileFromFirestore(id: string) {
  if (!dbInstance) return;
  try {
    const ref = doc(dbInstance, 'files', id);
    await deleteDoc(ref);
  } catch (err) {
    console.error(`[Firebase] Error deleting file ${id} from Firestore:`, err);
  }
}

export async function batchDeleteFilesFromFirestore(ids: string[]) {
  if (!dbInstance || ids.length === 0) return;
  try {
    const batch = writeBatch(dbInstance);
    for (const id of ids) {
      const ref = doc(dbInstance, 'files', id);
      batch.delete(ref);
    }
    await batch.commit();
  } catch (err) {
    console.error('[Firebase] Error batch deleting files from Firestore:', err);
  }
}

export async function clearAllFilesFromFirestore() {
  if (!dbInstance) return;
  try {
    const snap = await getDocs(collection(dbInstance, 'files'));
    const batch = writeBatch(dbInstance);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('[Firebase] Error clearing all files from Firestore:', err);
  }
}

export async function syncNoteToFirestore(note: {
  id: string;
  content: string;
  sender: string;
  timestamp: string;
  isLink: boolean;
}) {
  if (!dbInstance) return;
  try {
    const ref = doc(dbInstance, 'notes', note.id);
    await setDoc(ref, {
      ...note,
      syncedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.error(`[Firebase] Error syncing note ${note.id} to Firestore:`, err);
  }
}

export async function deleteNoteFromFirestore(id: string) {
  if (!dbInstance) return;
  try {
    const ref = doc(dbInstance, 'notes', id);
    await deleteDoc(ref);
  } catch (err) {
    console.error(`[Firebase] Error deleting note ${id} from Firestore:`, err);
  }
}

export async function clearNotesFromFirestore() {
  if (!dbInstance) return;
  try {
    const snap = await getDocs(collection(dbInstance, 'notes'));
    const batch = writeBatch(dbInstance);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch (err) {
    console.error('[Firebase] Error clearing notes from Firestore:', err);
  }
}

export async function logSystemActivityToFirestore(action: string, details: string) {
  if (!dbInstance) return;
  try {
    const logId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ref = doc(dbInstance, 'system_logs', logId);
    await setDoc(ref, {
      action,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Firebase] Error writing system log to Firestore:', err);
  }
}
