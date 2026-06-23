import { io, Socket } from 'socket.io-client';
import { RealtimeChannel } from '@supabase/supabase-js';
import supabase from './supabase';

export interface SignalingEventMap {
  'peer-joined': (data: {
    socketId: string;
    userId: string;
    username: string;
    role: 'host' | 'participant';
    isMutedAudio: boolean;
    isMutedVideo: boolean;
    isHandRaised: boolean;
  }) => void;
  'peer-left': (data: { socketId: string }) => void;
  'signal': (data: { senderId: string; signal: any }) => void;
  'chat-received': (data: {
    id: string;
    senderId: string;
    userId: string;
    username: string;
    text: string;
    timestamp: number;
  }) => void;
  'hand-raised': (data: { socketId: string; isRaised: boolean }) => void;
  'peer-muted-status': (data: { socketId: string; type: 'audio' | 'video'; isMuted: boolean }) => void;
  'mute-command': (data: { type: 'audio' | 'video' }) => void;
  'kicked-command': () => void;
  'waiting-status': (data: { status: 'waiting' | 'approved' | 'denied' }) => void;
  'waiting-room-list-update': (data: { participants: Array<{ socketId: string; userId: string; username: string }> }) => void;
  'room-participants': (data: { participants: Array<any> }) => void;
  'caption': (data: { senderId: string; username: string; text: string; isFinal: boolean }) => void;
  'reaction': (data: { senderId: string; type: string }) => void;
}

export interface ISignalingClient {
  connect(roomId: string, user: { userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean }): void;
  disconnect(): void;
  sendSignal(targetId: string, signal: any): void;
  sendChat(text: string): void;
  raiseHand(isRaised: boolean): void;
  mutePeer(targetSocketId: string, type: 'audio' | 'video'): void;
  toggleMediaStatus(type: 'audio' | 'video', isMuted: boolean): void;
  kickPeer(targetSocketId: string): void;
  waitingRoomAction(targetSocketId: string, action: 'approve' | 'deny'): void;
  on<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void;
  off<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void;
  getSocketId(): string;
  sendCaption(text: string, isFinal?: boolean): void;
  sendReaction(type: string): void;
}

// ----------------------------------------------------
// 1. SOCKET.IO SIGNALING CLIENT IMPLEMENTATION
// ----------------------------------------------------
class SocketIOSignalingClient implements ISignalingClient {
  private socket: Socket | null = null;
  private listeners = new Map<string, Function[]>();
  private serverUrl: string;
  private roomId: string = '';
  private user: { userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean } | null = null;

  constructor() {
    this.serverUrl = import.meta.env.VITE_SIGNALING_SERVER_URL || 'http://localhost:5001';
  }

  connect(roomId: string, user: { userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean }): void {
    if (this.socket) this.disconnect();
    this.roomId = roomId;
    this.user = user;

    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      autoConnect: true
    });

    this.socket.on('connect', () => {
      console.log('Socket.IO Connected! ID:', this.socket?.id);
      this.socket?.emit('join-room', {
        roomId,
        userId: user.userId,
        username: user.username,
        role: user.role,
        isWaiting: user.isWaiting
      });
    });

    // Wire up Socket.IO listeners and relay to local listeners
    this.socket.on('room-participants', (data) => this.emit('room-participants', data));
    this.socket.on('peer-joined', (data) => this.emit('peer-joined', data));
    this.socket.on('peer-left', (data) => this.emit('peer-left', data));
    this.socket.on('signal', (data) => this.emit('signal', data));
    this.socket.on('chat-received', (data) => this.emit('chat-received', data));
    this.socket.on('hand-raised', (data) => this.emit('hand-raised', data));
    this.socket.on('peer-muted-status', (data) => this.emit('peer-muted-status', data));
    this.socket.on('mute-command', (data) => this.emit('mute-command', data));
    this.socket.on('kicked-command', () => this.emit('kicked-command'));
    this.socket.on('waiting-status', (data) => this.emit('waiting-status', data));
    this.socket.on('waiting-room-list-update', (data) => this.emit('waiting-room-list-update', data));
    this.socket.on('caption', (data) => this.emit('caption', data));
    this.socket.on('reaction', (data) => this.emit('reaction', data));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendSignal(targetId: string, signal: any): void {
    this.socket?.emit('signal', { targetId, signal });
  }

  sendChat(text: string): void {
    if (this.socket && this.user) {
      this.socket.emit('send-chat', {
        roomId: this.roomId,
        username: this.user.username,
        text,
        userId: this.user.userId
      });
    }
  }

  raiseHand(isRaised: boolean): void {
    if (this.socket) {
      this.socket.emit('raise-hand', { roomId: this.roomId, isRaised });
    }
  }

  mutePeer(targetSocketId: string, type: 'audio' | 'video'): void {
    if (this.socket) {
      this.socket.emit('mute-peer', { roomId: this.roomId, targetSocketId, type });
    }
  }

  toggleMediaStatus(type: 'audio' | 'video', isMuted: boolean): void {
    if (this.socket) {
      this.socket.emit('toggle-media-status', { roomId: this.roomId, type, isMuted });
    }
  }

  kickPeer(targetSocketId: string): void {
    if (this.socket) {
      this.socket.emit('kick-peer', { roomId: this.roomId, targetSocketId });
    }
  }

  waitingRoomAction(targetSocketId: string, action: 'approve' | 'deny'): void {
    if (this.socket) {
      this.socket.emit('waiting-room-action', { roomId: this.roomId, targetSocketId, action });
    }
  }

  sendCaption(text: string, isFinal: boolean = true): void {
    if (this.socket) {
      this.socket.emit('caption', { roomId: this.roomId, text, isFinal });
    }
  }

  sendReaction(type: string): void {
    if (this.socket) {
      this.socket.emit('reaction', { roomId: this.roomId, type });
    }
  }

  on<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  off<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter(l => l !== listener));
  }

  getSocketId(): string {
    return this.socket?.id || '';
  }

  private emit(event: string, ...args: any[]): void {
    const list = this.listeners.get(event) || [];
    list.forEach(listener => listener(...args));
  }
}


// ----------------------------------------------------
// 2. SUPABASE REALTIME SIGNALING CLIENT IMPLEMENTATION
// ----------------------------------------------------
class SupabaseSignalingClient implements ISignalingClient {
  private channel: RealtimeChannel | null = null;
  private listeners = new Map<string, Function[]>();
  private clientSocketId: string;
  private user: { userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean } | null = null;
  
  // Track local states to syncrealtime changes
  private localStates = {
    isHandRaised: false,
    isMutedAudio: false,
    isMutedVideo: false
  };

  constructor() {
    // Generate a unique random client socket ID
    this.clientSocketId = 'sb-' + Math.random().toString(36).substring(2, 15);
  }

  connect(roomId: string, user: { userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean }): void {
    if (this.channel) this.disconnect();
    
    this.user = user;

    console.log('Supabase Realtime Signaling Connecting... ID:', this.clientSocketId);

    this.channel = supabase.channel(`meeting-room:${roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.clientSocketId }
      }
    });

    // 1. Broadcast Listeners (Signals, Chat, Mutes)
    this.channel
      .on('broadcast', { event: 'signal' }, (payload) => {
        const { senderId, targetId, signal } = payload.payload;
        if (targetId === this.clientSocketId) {
          this.emit('signal', { senderId, signal });
        }
      })
      .on('broadcast', { event: 'chat' }, (payload) => {
        this.emit('chat-received', payload.payload);
      })
      .on('broadcast', { event: 'mute-command' }, (payload) => {
        const { targetSocketId, type } = payload.payload;
        if (targetSocketId === this.clientSocketId) {
          this.emit('mute-command', { type });
        }
      })
      .on('broadcast', { event: 'kicked-command' }, (payload) => {
        const { targetSocketId } = payload.payload;
        if (targetSocketId === this.clientSocketId) {
          this.emit('kicked-command');
        }
      })
      .on('broadcast', { event: 'waiting-room-action' }, (payload) => {
        const { targetSocketId, action } = payload.payload;
        if (targetSocketId === this.clientSocketId) {
          this.emit('waiting-status', { status: action === 'approve' ? 'approved' : 'denied' });
        }
      })
      .on('broadcast', { event: 'caption' }, (payload) => {
        this.emit('caption', payload.payload);
      })
      .on('broadcast', { event: 'reaction' }, (payload) => {
        this.emit('reaction', payload.payload);
      });

    // 2. Presence synchronization (Tracks active list of users and waiting room)
    this.channel.on('presence', { event: 'sync' }, () => {
      if (!this.channel) return;

      const state = this.channel.presenceState();
      const participants: any[] = [];
      const waitingList: any[] = [];

      Object.keys(state).forEach((socketId) => {
        const userPresence = state[socketId][0] as any;
        if (userPresence) {
          const formattedParticipant = {
            socketId,
            userId: userPresence.userId,
            username: userPresence.username,
            role: userPresence.role,
            isWaiting: userPresence.isWaiting,
            isHandRaised: userPresence.isHandRaised || false,
            isMutedAudio: userPresence.isMutedAudio || false,
            isMutedVideo: userPresence.isMutedVideo || false
          };

          if (userPresence.isWaiting) {
            waitingList.push(formattedParticipant);
          } else {
            participants.push(formattedParticipant);
          }
        }
      });

      // Update room-participants for active ones (excluding ourselves)
      const otherActiveParticipants = participants.filter(p => p.socketId !== this.clientSocketId);
      this.emit('room-participants', { participants: otherActiveParticipants });

      // Update waiting list for hosts
      if (this.user?.role === 'host') {
        this.emit('waiting-room-list-update', { participants: waitingList });
      }
    });

    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      newPresences.forEach((presence: any) => {
        if (key !== this.clientSocketId && !presence.isWaiting) {
          this.emit('peer-joined', {
            socketId: key,
            userId: presence.userId,
            username: presence.username,
            role: presence.role,
            isHandRaised: presence.isHandRaised || false,
            isMutedAudio: presence.isMutedAudio || false,
            isMutedVideo: presence.isMutedVideo || false
          });
        }
      });
    });

    this.channel.on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== this.clientSocketId) {
        this.emit('peer-left', { socketId: key });
      }
    });

    // 3. Subscribe & Track
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.channel) {
        console.log('Supabase Realtime Channel subscribed successfully');
        
        // Track presence
        await this.channel.track({
          userId: user.userId,
          username: user.username,
          role: user.role,
          isWaiting: user.isWaiting,
          ...this.localStates
        });

        if (user.isWaiting) {
          this.emit('waiting-status', { status: 'waiting' });
        }
      }
    });
  }

  disconnect(): void {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }

  sendSignal(targetId: string, signal: any): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        senderId: this.clientSocketId,
        targetId,
        signal
      }
    });
  }

  sendChat(text: string): void {
    // Send to other peers
    if (!this.user) return;
    
    const msg = {
      id: `${this.clientSocketId}-${Date.now()}`,
      senderId: this.clientSocketId,
      userId: this.user.userId,
      username: this.user.username,
      text,
      timestamp: Date.now()
    };

    this.channel?.send({
      type: 'broadcast',
      event: 'chat',
      payload: msg
    });

    // Broadcast to ourselves locally as well
    this.emit('chat-received', msg);
  }

  sendCaption(text: string, isFinal: boolean = true): void {
    if (!this.user) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'caption',
      payload: {
        senderId: this.clientSocketId,
        username: this.user.username,
        text,
        isFinal
      }
    });
    this.emit('caption', { senderId: this.clientSocketId, username: this.user.username, text, isFinal });
  }

  sendReaction(type: string): void {
    if (!this.user) return;
    const payload = {
      senderId: this.clientSocketId,
      type
    };
    this.channel?.send({
      type: 'broadcast',
      event: 'reaction',
      payload
    });
    // Also emit locally so the sender sees their own reaction
    this.emit('reaction', payload);
  }

  raiseHand(isRaised: boolean): void {
    this.localStates.isHandRaised = isRaised;
    this.updatePresence();

    this.channel?.send({
      type: 'broadcast',
      event: 'hand-raised',
      payload: {
        socketId: this.clientSocketId,
        isRaised
      }
    });
    this.emit('hand-raised', { socketId: this.clientSocketId, isRaised });
  }

  mutePeer(targetSocketId: string, type: 'audio' | 'video'): void {
    // Send command to specific target
    this.channel?.send({
      type: 'broadcast',
      event: 'mute-command',
      payload: {
        targetSocketId,
        type
      }
    });
  }

  toggleMediaStatus(type: 'audio' | 'video', isMuted: boolean): void {
    if (type === 'audio') this.localStates.isMutedAudio = isMuted;
    if (type === 'video') this.localStates.isMutedVideo = isMuted;
    
    this.updatePresence();

    // Notify other peers
    this.channel?.send({
      type: 'broadcast',
      event: 'peer-muted-status',
      payload: {
        socketId: this.clientSocketId,
        type,
        isMuted
      }
    });
    this.emit('peer-muted-status', { socketId: this.clientSocketId, type, isMuted });
  }

  kickPeer(targetSocketId: string): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'kicked-command',
      payload: {
        targetSocketId
      }
    });
  }

  waitingRoomAction(targetSocketId: string, action: 'approve' | 'deny'): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'waiting-room-action',
      payload: {
        targetSocketId,
        action
      }
    });
  }

  on<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  off<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter(l => l !== listener));
  }

  getSocketId(): string {
    return this.clientSocketId;
  }

  private emit(event: string, ...args: any[]): void {
    const list = this.listeners.get(event) || [];
    list.forEach(listener => listener(...args));
  }

  private async updatePresence(): Promise<void> {
    if (this.channel && this.user) {
      await this.channel.track({
        userId: this.user.userId,
        username: this.user.username,
        role: this.user.role,
        isWaiting: this.user.isWaiting,
        ...this.localStates
      });
    }
  }
}

// ----------------------------------------------------
// 3. FACTORY AND GLOBAL INSTANCE EXPORT
// ----------------------------------------------------
export const getSignalingClient = (): ISignalingClient => {
  const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
  console.log(`Initializing signaling provider: ${provider}`);
  
  if (provider === 'socketio') {
    return new SocketIOSignalingClient();
  }
  
  return new SupabaseSignalingClient();
};

export const signalingClient = getSignalingClient();
export default signalingClient;
