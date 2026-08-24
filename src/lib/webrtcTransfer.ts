import { db } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  addDoc, 
  getDoc,
  getDocs,
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { TransferLogger, CHUNK_SIZE } from './transferManager';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' }
  ]
};

export interface WebRTCConnectionState {
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  state: 'idle' | 'connecting' | 'open' | 'closed' | 'error';
  sessionId: string;
  isHost: boolean;
}

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private channel: RTCDataChannel | null = null;
  private currentSessionId: string = 'global-wifi-session';
  private logger: TransferLogger;
  private onDataReceivedCallback: ((data: ArrayBuffer | string) => void) | null = null;
  private onStateChangeCallback: ((state: string) => void) | null = null;

  constructor(logger: TransferLogger) {
    this.logger = logger;
  }

  setOnDataReceived(cb: (data: ArrayBuffer | string) => void) {
    this.onDataReceivedCallback = cb;
  }

  setOnStateChange(cb: (state: string) => void) {
    this.onStateChangeCallback = cb;
  }

  getState(): string {
    if (!this.channel) return 'closed';
    return this.channel.readyState;
  }

  isChannelOpen(): boolean {
    return this.channel !== null && this.channel.readyState === 'open';
  }

  /**
   * Setup Receiver (PC Host)
   */
  async initHostReceiver(sessionId: string = 'global-wifi-session') {
    this.currentSessionId = sessionId;
    this.cleanup();

    this.logger.log('WEBRTC_HOST', `Menginisialisasi Host WebRTC Receiver (Session: ${sessionId})`, 'info');

    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);

      // Create DataChannel on Host
      this.channel = this.pc.createDataChannel('file-transfer', {
        ordered: true
      });
      this.channel.binaryType = 'arraybuffer';
      this.setupDataChannelEvents(this.channel, 'PC Receiver');

      // Handle remote channels if any
      this.pc.ondatachannel = (event) => {
        this.logger.log('WEBRTC_HOST', 'Menerima Remote DataChannel dari HP', 'info');
        this.channel = event.channel;
        this.channel.binaryType = 'arraybuffer';
        this.setupDataChannelEvents(this.channel, 'PC Receiver (Remote)');
      };

      // Handle ICE candidates
      const sessionDocRef = doc(db, 'signaling_sessions', sessionId);
      const callerCandidatesCol = collection(sessionDocRef, 'callerCandidates');

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(callerCandidatesCol, event.candidate.toJSON()).catch((e) => {
            this.logger.log('SIGNALING', `Gagal menyimpan caller ICE candidate: ${e?.message}`, 'warn');
          });
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        this.logger.log('WEBRTC_HOST', `ICE Connection State: ${this.pc?.iceConnectionState}`, 'info');
        if (this.onStateChangeCallback) this.onStateChangeCallback(this.pc?.iceConnectionState || 'unknown');
      };

      // Create Offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      await setDoc(sessionDocRef, {
        sessionId,
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      this.logger.log('SIGNALING', 'Offer WebRTC dibuat dan disimpan di Firestore Signaling', 'success');

      // Listen for Answer from Mobile
      const unsubscribe = onSnapshot(sessionDocRef, (snapshot) => {
        const data = snapshot.data();
        if (data?.answer && this.pc && !this.pc.currentRemoteDescription) {
          this.logger.log('SIGNALING', 'Menerima Answer WebRTC dari HP!', 'success');
          const rtcAnswer = new RTCSessionDescription(data.answer);
          this.pc.setRemoteDescription(rtcAnswer).catch((e) => {
            this.logger.log('WEBRTC_HOST', `Error setRemoteDescription: ${e?.message}`, 'error');
          });
        }
      });

      // Listen for Callee ICE Candidates
      const calleeCandidatesCol = collection(sessionDocRef, 'calleeCandidates');
      onSnapshot(calleeCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            this.pc?.addIceCandidate(candidate).catch((e) => {
              this.logger.log('SIGNALING', `Error add Callee ICE: ${e?.message}`, 'warn');
            });
          }
        });
      });
    } catch (err: any) {
      this.logger.log('WEBRTC_HOST', `Error init Host WebRTC: ${err?.message}`, 'error');
    }
  }

  /**
   * Setup Mobile Sender (HP Client)
   */
  async initClientSender(sessionId: string = 'global-wifi-session') {
    this.currentSessionId = sessionId;
    this.cleanup();

    this.logger.log('WEBRTC_CLIENT', `HP menghubungkan ke Host PC (Session: ${sessionId})`, 'info');

    try {
      this.pc = new RTCPeerConnection(RTC_CONFIG);

      this.pc.ondatachannel = (event) => {
        this.logger.log('WEBRTC_CLIENT', 'DataChannel terdeteksi dari PC Host', 'success');
        this.channel = event.channel;
        this.channel.binaryType = 'arraybuffer';
        this.setupDataChannelEvents(this.channel, 'HP Sender');
      };

      const sessionDocRef = doc(db, 'signaling_sessions', sessionId);
      const calleeCandidatesCol = collection(sessionDocRef, 'calleeCandidates');

      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(calleeCandidatesCol, event.candidate.toJSON()).catch((e) => {
            this.logger.log('SIGNALING', `Gagal menyimpan callee ICE: ${e?.message}`, 'warn');
          });
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        this.logger.log('WEBRTC_CLIENT', `ICE Connection State: ${this.pc?.iceConnectionState}`, 'info');
        if (this.onStateChangeCallback) this.onStateChangeCallback(this.pc?.iceConnectionState || 'unknown');
      };

      // Read Offer from Firestore
      const sessionSnap = await getDoc(sessionDocRef);
      if (sessionSnap.exists() && sessionSnap.data().offer) {
        const offerData = sessionSnap.data().offer;
        this.logger.log('SIGNALING', 'Membaca Offer dari PC Host di Firestore', 'info');
        await this.pc.setRemoteDescription(new RTCSessionDescription(offerData));

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        await setDoc(sessionDocRef, {
          answer: {
            type: answer.type,
            sdp: answer.sdp
          },
          updatedAt: new Date().toISOString()
        }, { merge: true });

        this.logger.log('SIGNALING', 'Answer WebRTC terkirim ke Firestore!', 'success');
      } else {
        this.logger.log('SIGNALING', 'Menunggu Offer dari PC Host di Firestore...', 'info');
        const unsub = onSnapshot(sessionDocRef, async (snap) => {
          const d = snap.data();
          if (d?.offer && this.pc && !this.pc.currentRemoteDescription) {
            unsub();
            await this.pc.setRemoteDescription(new RTCSessionDescription(d.offer));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await setDoc(sessionDocRef, {
              answer: {
                type: answer.type,
                sdp: answer.sdp
              },
              updatedAt: new Date().toISOString()
            }, { merge: true });
            this.logger.log('SIGNALING', 'Answer WebRTC dibuat dan disimpan!', 'success');
          }
        });
      }

      // Listen for Caller ICE
      const callerCandidatesCol = collection(sessionDocRef, 'callerCandidates');
      onSnapshot(callerCandidatesCol, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            this.pc?.addIceCandidate(candidate).catch((e) => {
              this.logger.log('SIGNALING', `Error add Caller ICE: ${e?.message}`, 'warn');
            });
          }
        });
      });
    } catch (err: any) {
      this.logger.log('WEBRTC_CLIENT', `Error init HP Client WebRTC: ${err?.message}`, 'error');
    }
  }

  private setupDataChannelEvents(channel: RTCDataChannel, peerRole: string) {
    channel.onopen = () => {
      this.logger.log('DATA_CHANNEL', `DataChannel [${peerRole}] status: OPEN (Siap transfer P2P)`, 'success');
      if (this.onStateChangeCallback) this.onStateChangeCallback('open');
    };

    channel.onclose = () => {
      this.logger.log('DATA_CHANNEL', `DataChannel [${peerRole}] status: CLOSED`, 'warn');
      if (this.onStateChangeCallback) this.onStateChangeCallback('closed');
    };

    channel.onerror = (err) => {
      this.logger.log('DATA_CHANNEL', `DataChannel [${peerRole}] error: ${err}`, 'error');
    };

    channel.onmessage = (event) => {
      if (this.onDataReceivedCallback) {
        this.onDataReceivedCallback(event.data);
      }
    };
  }

  /**
   * Send binary file via WebRTC DataChannel with Backpressure flow control
   */
  async sendFileP2P(
    file: File, 
    onProgress: (percent: number, speedMBs: string, chunkCur: number, chunkTot: number) => void,
    signalAbort?: AbortSignal
  ): Promise<boolean> {
    if (!this.channel || this.channel.readyState !== 'open') {
      throw new Error('DataChannel belum terbuka atau tidak dalam status open');
    }

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const transferId = 'p2p-' + Date.now().toString(36);

    // 1. Send Header Metadata
    const headerMsg = JSON.stringify({
      type: 'FILE_HEADER',
      transferId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      totalChunks
    });
    this.channel.send(headerMsg);

    this.logger.log('P2P_TRANSFER', `Mengirim file "${file.name}" via WebRTC DataChannel (Total Chunks: ${totalChunks})`, 'info');

    const startTime = Date.now();
    let bytesSent = 0;

    for (let i = 0; i < totalChunks; i++) {
      if (signalAbort?.aborted) {
        this.channel.send(JSON.stringify({ type: 'TRANSFER_CANCEL', transferId }));
        throw new Error('Transfer dibatalkan oleh pengguna');
      }

      const start = i * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const slice = file.slice(start, end);
      const buffer = await slice.arrayBuffer();

      // Backpressure Check: wait if bufferedAmount exceeds threshold
      while (this.channel.bufferedAmount > 64 * 1024 * 8) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Send chunk with header wrapper or raw buffer
      this.channel.send(buffer);
      bytesSent += buffer.byteLength;

      const percent = Math.round((bytesSent / file.size) * 100);
      const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
      const speed = (bytesSent / (1024 * 1024) / elapsedSec).toFixed(1);

      onProgress(percent, `${speed} MB/s`, i + 1, totalChunks);
    }

    // Send Completion trailer
    this.channel.send(JSON.stringify({ type: 'FILE_COMPLETE', transferId, totalChunks }));
    this.logger.log('P2P_TRANSFER', `Semua ${totalChunks} chunks terkirim via WebRTC DataChannel!`, 'success');
    return true;
  }

  cleanup() {
    if (this.channel) {
      try { this.channel.close(); } catch {}
      this.channel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
  }
}
