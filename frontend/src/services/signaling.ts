import { io, Socket } from 'socket.io-client';
import { RealtimeChannel } from '@supabase/supabase-js';
import supabase from './supabase';
import { useMeetingStore } from '../stores/meetingStore';
import type { Poll, Question } from '../stores/meetingStore';

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
  'peer-left': (data: { userId: string; socketId: string }) => void;
  'signal': (data: { senderUserId: string; signal: any }) => void;
  'chat-received': (data: {
    id: string;
    senderId: string;
    userId: string;
    username: string;
    text: string;
    timestamp: number;
  }) => void;
  'hand-raised': (data: { userId: string; isRaised: boolean }) => void;
  'lower-hands-command': () => void;
  'peer-muted-status': (data: { userId: string; type: 'audio' | 'video'; isMuted: boolean }) => void;
  'mute-command': (data: { type: 'audio' | 'video' }) => void;
  'kicked-command': () => void;
  'waiting-status': (data: { status: 'waiting' | 'approved' | 'denied' }) => void;
  'waiting-room-list-update': (data: { participants: Array<{ socketId: string; userId: string; username: string }> }) => void;
  'room-participants': (data: { participants: Array<any> }) => void;
  'caption': (data: { senderUserId: string; username: string; text: string; isFinal: boolean }) => void;
  'reaction': (data: { senderUserId: string; type: string }) => void;
  'whiteboard-draw': (data: { x1: number; y1: number; x2: number; y2: number; color: string; thickness: number }) => void;
  'whiteboard-clear': () => void;
  'breakout-started': (data: { assignments: Record<string, string>; durationSeconds: number }) => void;
  'breakout-ended': () => void;
  'room-lock-toggled': (data: { isLocked: boolean }) => void;
  'moderation-policy-updated': (data: { isChatLocked?: boolean; isScreenShareLocked?: boolean }) => void;
  'waiting-doodle-draw': (data: { x1: number; y1: number; x2: number; y2: number; color: string; thickness: number }) => void;
  'waiting-doodle-clear': () => void;
  'soundboard-play': (data: { userId: string; soundId: string }) => void;
  'multiplayer-cursors-toggled': (data: { enabled: boolean }) => void;
  'screenshare-cursor-moved': (data: { userId: string; username: string; x: number; y: number }) => void;
  
  // Interactive Polls & Q&A
  'polls-history': (data: { polls: Poll[] }) => void;
  'poll-created': (data: { poll: Poll }) => void;
  'poll-voted': (data: { pollId: string; optionId: string; voterId: string }) => void;
  'poll-closed': (data: { pollId: string }) => void;
  'poll-deleted': (data: { pollId: string }) => void;
  'questions-history': (data: { questions: Question[] }) => void;
  'question-created': (data: { question: Question }) => void;
  'question-upvoted': (data: { questionId: string; voterId: string; isUpvote: boolean }) => void;
  'question-answered': (data: { questionId: string; isAnswered: boolean }) => void;
  'question-deleted': (data: { questionId: string }) => void;
}

export interface ISignalingClient {
  connect(roomId: string, user: { userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean }): void;
  disconnect(): void;
  sendSignal(targetUserId: string, signal: any): void;
  sendChat(text: string): void;
  raiseHand(isRaised: boolean): void;
  sendLowerAllHands(): void;
  mutePeer(targetUserId: string, type: 'audio' | 'video'): void;
  toggleMediaStatus(type: 'audio' | 'video', isMuted: boolean): void;
  kickPeer(targetUserId: string): void;
  waitingRoomAction(targetUserId: string, action: 'approve' | 'deny'): void;
  on<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void;
  off<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void;
  getSocketId(): string;
  sendCaption(text: string, isFinal?: boolean): void;
  sendReaction(type: string): void;
  sendDraw(x1: number, y1: number, x2: number, y2: number, color: string, thickness: number): void;
  sendClearWhiteboard(): void;
  sendStartBreakout(assignments: Record<string, string>, durationSeconds: number): void;
  sendEndBreakout(): void;
  sendRoomLockToggle(isLocked: boolean): void;
  sendModerationPolicy(policy: { isChatLocked?: boolean; isScreenShareLocked?: boolean }): void;
  sendWaitingDoodleDraw(x1: number, y1: number, x2: number, y2: number, color: string, thickness: number): void;
  sendWaitingDoodleClear(): void;
  sendSoundboardPlay(soundId: string): void;
  sendMultiplayerCursorsToggle(enabled: boolean): void;
  sendScreenshareCursorMove(x: number, y: number): void;
  
  // Interactive Polls & Q&A
  sendCreatePoll(question: string, options: string[]): void;
  sendVotePoll(pollId: string, optionId: string): void;
  sendClosePoll(pollId: string): void;
  sendDeletePoll(pollId: string): void;
  sendCreateQuestion(text: string, username: string): void;
  sendUpvoteQuestion(questionId: string, isUpvote: boolean): void;
  sendAnswerQuestion(questionId: string, isAnswered: boolean): void;
  sendDeleteQuestion(questionId: string): void;
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
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
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
    this.socket.on('lower-hands-command', () => this.emit('lower-hands-command'));
    this.socket.on('peer-muted-status', (data) => this.emit('peer-muted-status', data));
    this.socket.on('mute-command', (data) => this.emit('mute-command', data));
    this.socket.on('kicked-command', () => this.emit('kicked-command'));
    this.socket.on('waiting-status', (data) => this.emit('waiting-status', data));
    this.socket.on('waiting-room-list-update', (data) => this.emit('waiting-room-list-update', data));
    this.socket.on('caption', (data) => this.emit('caption', data));
    this.socket.on('reaction', (data) => this.emit('reaction', data));
    this.socket.on('whiteboard-draw', (data) => this.emit('whiteboard-draw', data));
    this.socket.on('whiteboard-clear', () => this.emit('whiteboard-clear'));
    this.socket.on('breakout-started', (data) => this.emit('breakout-started', data));
    this.socket.on('breakout-ended', () => this.emit('breakout-ended'));
    this.socket.on('room-lock-toggled', (data) => this.emit('room-lock-toggled', data));
    this.socket.on('moderation-policy-updated', (data) => this.emit('moderation-policy-updated', data));
    this.socket.on('waiting-doodle-draw', (data) => this.emit('waiting-doodle-draw', data));
    this.socket.on('waiting-doodle-clear', () => this.emit('waiting-doodle-clear'));
    this.socket.on('soundboard-play', (data) => this.emit('soundboard-play', data));
    this.socket.on('multiplayer-cursors-toggled', (data) => this.emit('multiplayer-cursors-toggled', data));
    this.socket.on('screenshare-cursor-moved', (data) => this.emit('screenshare-cursor-moved', data));
    
    // Polls & Q&A
    this.socket.on('polls-history', (data) => this.emit('polls-history', data));
    this.socket.on('poll-created', (data) => this.emit('poll-created', data));
    this.socket.on('poll-voted', (data) => this.emit('poll-voted', data));
    this.socket.on('poll-closed', (data) => this.emit('poll-closed', data));
    this.socket.on('poll-deleted', (data) => this.emit('poll-deleted', data));
    this.socket.on('questions-history', (data) => this.emit('questions-history', data));
    this.socket.on('question-created', (data) => this.emit('question-created', data));
    this.socket.on('question-upvoted', (data) => this.emit('question-upvoted', data));
    this.socket.on('question-answered', (data) => this.emit('question-answered', data));
    this.socket.on('question-deleted', (data) => this.emit('question-deleted', data));
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendSignal(targetUserId: string, signal: any): void {
    this.socket?.emit('signal', { targetUserId, signal });
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

  sendLowerAllHands(): void {
    if (this.socket) {
      this.socket.emit('lower-all-hands', { roomId: this.roomId });
    }
  }

  mutePeer(targetUserId: string, type: 'audio' | 'video'): void {
    if (this.socket) {
      this.socket.emit('mute-peer', { roomId: this.roomId, targetUserId, type });
    }
  }

  toggleMediaStatus(type: 'audio' | 'video', isMuted: boolean): void {
    if (this.socket) {
      this.socket.emit('toggle-media-status', { roomId: this.roomId, type, isMuted });
    }
  }

  kickPeer(targetUserId: string): void {
    if (this.socket) {
      this.socket.emit('kick-peer', { roomId: this.roomId, targetUserId });
    }
  }

  waitingRoomAction(targetUserId: string, action: 'approve' | 'deny'): void {
    if (this.socket) {
      this.socket.emit('waiting-room-action', { roomId: this.roomId, targetUserId, action });
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

  sendDraw(x1: number, y1: number, x2: number, y2: number, color: string, thickness: number): void {
    if (this.socket) {
      this.socket.emit('whiteboard-draw', { roomId: this.roomId, x1, y1, x2, y2, color, thickness });
    }
  }

  sendClearWhiteboard(): void {
    if (this.socket) {
      this.socket.emit('whiteboard-clear', { roomId: this.roomId });
    }
  }

  sendStartBreakout(assignments: Record<string, string>, durationSeconds: number): void {
    if (this.socket) {
      this.socket.emit('start-breakout', { roomId: this.roomId, assignments, durationSeconds });
    }
  }

  sendEndBreakout(): void {
    if (this.socket) {
      this.socket.emit('end-breakout', { roomId: this.roomId });
    }
  }

  sendRoomLockToggle(isLocked: boolean): void {
    if (this.socket) {
      this.socket.emit('toggle-room-lock', { roomId: this.roomId, isLocked });
    }
  }

  sendModerationPolicy(policy: { isChatLocked?: boolean; isScreenShareLocked?: boolean }): void {
    if (this.socket) {
      this.socket.emit('moderation-policy', { roomId: this.roomId, policy });
      this.emit('moderation-policy-updated', policy);
    }
  }

  sendMultiplayerCursorsToggle(enabled: boolean): void {
    if (this.socket) {
      this.socket.emit('toggle-multiplayer-cursors', { roomId: this.roomId, enabled });
      this.emit('multiplayer-cursors-toggled', { enabled });
    }
  }

  sendScreenshareCursorMove(x: number, y: number): void {
    if (this.socket && this.user) {
      this.socket.emit('screenshare-cursor-move', {
        roomId: this.roomId,
        userId: this.user.userId,
        username: this.user.username,
        x,
        y
      });
    }
  }

  sendWaitingDoodleDraw(x1: number, y1: number, x2: number, y2: number, color: string, thickness: number): void {
    if (this.socket) {
      this.socket.emit('waiting-doodle-draw', { roomId: this.roomId, x1, y1, x2, y2, color, thickness });
    }
  }

  sendWaitingDoodleClear(): void {
    if (this.socket) {
      this.socket.emit('waiting-doodle-clear', { roomId: this.roomId });
    }
  }

  sendSoundboardPlay(soundId: string): void {
    if (this.socket) {
      this.socket.emit('soundboard-play', { roomId: this.roomId, soundId });
    }
  }

  sendCreatePoll(question: string, options: string[]): void {
    if (this.socket) {
      this.socket.emit('create-poll', { roomId: this.roomId, question, options });
    }
  }

  sendVotePoll(pollId: string, optionId: string): void {
    if (this.socket) {
      this.socket.emit('vote-poll', { roomId: this.roomId, pollId, optionId });
    }
  }

  sendClosePoll(pollId: string): void {
    if (this.socket) {
      this.socket.emit('close-poll', { roomId: this.roomId, pollId });
    }
  }

  sendDeletePoll(pollId: string): void {
    if (this.socket) {
      this.socket.emit('delete-poll', { roomId: this.roomId, pollId });
    }
  }

  sendCreateQuestion(text: string, username: string): void {
    if (this.socket) {
      this.socket.emit('create-question', { roomId: this.roomId, text, username });
    }
  }

  sendUpvoteQuestion(questionId: string, isUpvote: boolean): void {
    if (this.socket) {
      this.socket.emit('upvote-question', { roomId: this.roomId, questionId, isUpvote });
    }
  }

  sendAnswerQuestion(questionId: string, isAnswered: boolean): void {
    if (this.socket) {
      this.socket.emit('answer-question', { roomId: this.roomId, questionId, isAnswered });
    }
  }

  sendDeleteQuestion(questionId: string): void {
    if (this.socket) {
      this.socket.emit('delete-question', { roomId: this.roomId, questionId });
    }
  }

  on<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  off<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    list.forEach((l, index) => {
      if (l === listener) {
        list.splice(index, 1);
      }
    });
    this.listeners.set(event, list);
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
  
  // Track local states to sync realtime changes
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
        const { senderUserId, targetUserId, signal } = payload.payload;
        if (targetUserId === this.user?.userId) {
          this.emit('signal', { senderUserId, signal });
        }
      })
      .on('broadcast', { event: 'chat' }, (payload) => {
        this.emit('chat-received', payload.payload);
      })
      .on('broadcast', { event: 'mute-command' }, (payload) => {
        const { targetUserId, type } = payload.payload;
        if (targetUserId === this.user?.userId) {
          this.emit('mute-command', { type });
        }
      })
      .on('broadcast', { event: 'kicked-command' }, (payload) => {
        const { targetUserId } = payload.payload;
        if (targetUserId === this.user?.userId) {
          this.emit('kicked-command');
        }
      })
      .on('broadcast', { event: 'waiting-room-action' }, (payload) => {
        const { targetUserId, action } = payload.payload;
        if (targetUserId === this.user?.userId) {
          if (action === 'approve' && this.user) {
            this.user.isWaiting = false;
            this.updatePresence();
          }
          this.emit('waiting-status', { status: action === 'approve' ? 'approved' : 'denied' });
        }
      })
      .on('broadcast', { event: 'caption' }, (payload) => {
        this.emit('caption', payload.payload);
      })
      .on('broadcast', { event: 'lower-hands-command' }, () => {
        this.emit('lower-hands-command');
      })
      .on('broadcast', { event: 'reaction' }, (payload) => {
        this.emit('reaction', payload.payload);
      })
      .on('broadcast', { event: 'whiteboard-draw' }, (payload) => {
        this.emit('whiteboard-draw', payload.payload);
      })
      .on('broadcast', { event: 'whiteboard-clear' }, () => {
        this.emit('whiteboard-clear');
      })
      .on('broadcast', { event: 'breakout-started' }, (payload) => {
        this.emit('breakout-started', payload.payload);
      })
      .on('broadcast', { event: 'breakout-ended' }, () => {
        this.emit('breakout-ended');
      })
      .on('broadcast', { event: 'room-lock-toggled' }, (payload) => {
        this.emit('room-lock-toggled', payload.payload);
      })
      .on('broadcast', { event: 'moderation-policy-updated' }, (payload) => {
        this.emit('moderation-policy-updated', payload.payload);
      })
      .on('broadcast', { event: 'waiting-doodle-draw' }, (payload) => {
        this.emit('waiting-doodle-draw', payload.payload);
      })
      .on('broadcast', { event: 'waiting-doodle-clear' }, () => {
        this.emit('waiting-doodle-clear');
      })
      .on('broadcast', { event: 'soundboard-play' }, (payload) => {
        this.emit('soundboard-play', payload.payload);
      })
      .on('broadcast', { event: 'multiplayer-cursors-toggled' }, (payload) => {
        this.emit('multiplayer-cursors-toggled', payload.payload);
      })
      .on('broadcast', { event: 'screenshare-cursor-moved' }, (payload) => {
        this.emit('screenshare-cursor-moved', payload.payload);
      })
      .on('broadcast', { event: 'poll-created' }, (payload) => {
        this.emit('poll-created', payload.payload);
      })
      .on('broadcast', { event: 'poll-voted' }, (payload) => {
        this.emit('poll-voted', payload.payload);
      })
      .on('broadcast', { event: 'poll-closed' }, (payload) => {
        this.emit('poll-closed', payload.payload);
      })
      .on('broadcast', { event: 'poll-deleted' }, (payload) => {
        this.emit('poll-deleted', payload.payload);
      })
      .on('broadcast', { event: 'question-created' }, (payload) => {
        this.emit('question-created', payload.payload);
      })
      .on('broadcast', { event: 'question-upvoted' }, (payload) => {
        this.emit('question-upvoted', payload.payload);
      })
      .on('broadcast', { event: 'question-answered' }, (payload) => {
        this.emit('question-answered', payload.payload);
      })
      .on('broadcast', { event: 'question-deleted' }, (payload) => {
        this.emit('question-deleted', payload.payload);
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
      const otherActiveParticipants = participants.filter(p => p.userId !== this.user?.userId);
      this.emit('room-participants', { participants: otherActiveParticipants });

      // Update waiting list for hosts
      if (this.user?.role === 'host') {
        this.emit('waiting-room-list-update', { participants: waitingList });
      }
    });

    this.channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      newPresences.forEach((presence: any) => {
        if (presence.userId !== this.user?.userId && !presence.isWaiting) {
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
        // Resolve socketId (key) to userId by searching the participants store
        const participant = useMeetingStore.getState().participants.find(p => p.socketId === key);
        if (participant) {
          this.emit('peer-left', { userId: participant.userId, socketId: key });
        }
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
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  sendSignal(targetUserId: string, signal: any): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'signal',
      payload: {
        senderUserId: this.user?.userId,
        targetUserId,
        signal
      }
    });
  }

  sendChat(text: string): void {
    if (!this.user) return;
    
    const msg = {
      id: `${this.user.userId}-${Date.now()}`,
      senderId: this.user.userId,
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
        senderUserId: this.user.userId,
        username: this.user.username,
        text,
        isFinal
      }
    });
    this.emit('caption', { senderUserId: this.user.userId, username: this.user.username, text, isFinal });
  }

  sendReaction(type: string): void {
    if (!this.user) return;
    const payload = {
      senderUserId: this.user.userId,
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
        userId: this.user?.userId,
        isRaised
      }
    });
    this.emit('hand-raised', { userId: this.user?.userId || '', isRaised });
  }

  sendLowerAllHands(): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'lower-hands-command',
      payload: {}
    });
    this.emit('lower-hands-command');
  }

  mutePeer(targetUserId: string, type: 'audio' | 'video'): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'mute-command',
      payload: {
        targetUserId,
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
        userId: this.user?.userId,
        type,
        isMuted
      }
    });
    this.emit('peer-muted-status', { userId: this.user?.userId || '', type, isMuted });
  }

  kickPeer(targetUserId: string): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'kicked-command',
      payload: {
        targetUserId
      }
    });
  }

  waitingRoomAction(targetUserId: string, action: 'approve' | 'deny'): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'waiting-room-action',
      payload: {
        targetUserId,
        action
      }
    });
  }

  sendDraw(x1: number, y1: number, x2: number, y2: number, color: string, thickness: number): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'whiteboard-draw',
      payload: { x1, y1, x2, y2, color, thickness }
    });
  }

  sendClearWhiteboard(): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'whiteboard-clear',
      payload: {}
    });
  }

  sendStartBreakout(assignments: Record<string, string>, durationSeconds: number): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'breakout-started',
      payload: { assignments, durationSeconds }
    });
  }

  sendEndBreakout(): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'breakout-ended',
      payload: {}
    });
  }

  sendRoomLockToggle(isLocked: boolean): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'room-lock-toggled',
      payload: { isLocked }
    });
  }

  sendModerationPolicy(policy: { isChatLocked?: boolean; isScreenShareLocked?: boolean }): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'moderation-policy-updated',
      payload: policy
    });
    this.emit('moderation-policy-updated', policy);
  }

  sendMultiplayerCursorsToggle(enabled: boolean): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'multiplayer-cursors-toggled',
      payload: { enabled }
    });
    this.emit('multiplayer-cursors-toggled', { enabled });
  }

  sendScreenshareCursorMove(x: number, y: number): void {
    if (this.channel && this.user) {
      this.channel.send({
        type: 'broadcast',
        event: 'screenshare-cursor-moved',
        payload: {
          userId: this.user.userId,
          username: this.user.username,
          x,
          y
        }
      });
    }
  }

  sendWaitingDoodleDraw(x1: number, y1: number, x2: number, y2: number, color: string, thickness: number): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'waiting-doodle-draw',
      payload: { x1, y1, x2, y2, color, thickness }
    });
  }

  sendWaitingDoodleClear(): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'waiting-doodle-clear',
      payload: {}
    });
  }

  sendSoundboardPlay(soundId: string): void {
    if (!this.user) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'soundboard-play',
      payload: {
        userId: this.user.userId,
        soundId
      }
    });
  }

  sendCreatePoll(question: string, options: string[]): void {
    if (!this.user) return;
    const poll: Poll = {
      id: `poll-${Date.now()}`,
      creatorId: this.user.userId,
      creatorName: this.user.username,
      question,
      options: options.map((opt, idx) => ({ id: `opt-${idx}`, text: opt, votes: [] })),
      isActive: true,
      createdAt: Date.now()
    };
    this.channel?.send({
      type: 'broadcast',
      event: 'poll-created',
      payload: { poll }
    });
    this.emit('poll-created', { poll });
  }

  sendVotePoll(pollId: string, optionId: string): void {
    if (!this.user) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'poll-voted',
      payload: { pollId, optionId, voterId: this.user.userId }
    });
    this.emit('poll-voted', { pollId, optionId, voterId: this.user.userId });
  }

  sendClosePoll(pollId: string): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'poll-closed',
      payload: { pollId }
    });
    this.emit('poll-closed', { pollId });
  }

  sendDeletePoll(pollId: string): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'poll-deleted',
      payload: { pollId }
    });
    this.emit('poll-deleted', { pollId });
  }

  sendCreateQuestion(text: string, username: string): void {
    if (!this.user) return;
    const question: Question = {
      id: `q-${Date.now()}`,
      userId: this.user.userId,
      username: username || 'Anonymous',
      text,
      upvotes: [],
      isAnswered: false,
      createdAt: Date.now()
    };
    this.channel?.send({
      type: 'broadcast',
      event: 'question-created',
      payload: { question }
    });
    this.emit('question-created', { question });
  }

  sendUpvoteQuestion(questionId: string, isUpvote: boolean): void {
    if (!this.user) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'question-upvoted',
      payload: { questionId, voterId: this.user.userId, isUpvote }
    });
    this.emit('question-upvoted', { questionId, voterId: this.user.userId, isUpvote });
  }

  sendAnswerQuestion(questionId: string, isAnswered: boolean): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'question-answered',
      payload: { questionId, isAnswered }
    });
    this.emit('question-answered', { questionId, isAnswered });
  }

  sendDeleteQuestion(questionId: string): void {
    this.channel?.send({
      type: 'broadcast',
      event: 'question-deleted',
      payload: { questionId }
    });
    this.emit('question-deleted', { questionId });
  }

  on<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  off<K extends keyof SignalingEventMap>(event: K, listener: SignalingEventMap[K]): void {
    const list = this.listeners.get(event) || [];
    list.forEach((l, index) => {
      if (l === listener) {
        list.splice(index, 1);
      }
    });
    this.listeners.set(event, list);
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
