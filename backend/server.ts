import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { AccessToken } from 'livekit-server-sdk';
import { clerkMiddleware, requireAuth } from '@clerk/express';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Setup Clerk globally for any authenticated routes
app.use(clerkMiddleware());

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateRoomCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
  const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * 26)]).join('');
  const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
  return `${part1}-${part2}-${part3}`;
}

// LiveKit Token Generation Endpoint
app.post('/api/livekit/token', requireAuth(), async (req, res) => {
  const { roomName, participantName } = req.body;
  const participantIdentity = (req as any).auth.userId;

  if (!roomName || !participantIdentity) {
    return res.status(400).json({ error: 'roomName and participantIdentity are required' });
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return res.status(500).json({ error: 'LiveKit API credentials are not configured on the server' });
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: participantName || participantIdentity,
    });
    
    at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
    
    const token = await at.toJwt();
    res.json({ token });
  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// GET: List User's Scheduled Meetings
app.get('/api/meetings', requireAuth(), async (req, res) => {
  try {
    const userId = (req as any).auth.userId;
    const listHistory = req.query.history === 'true';

    let query = supabase
      .from('meetings')
      .select('*')
      .eq('host_id', userId);

    if (listHistory) {
      query = query.lt('scheduled_start', new Date().toISOString());
    } else {
      query = query.or(`scheduled_start.gte.${new Date().toISOString()},scheduled_start.is.null`);
    }

    const { data: meetings, error: dbError } = await query.order('scheduled_start', { ascending: true });

    if (dbError) {
      return res.status(500).json({ error: 'Failed to fetch meetings', details: dbError.message });
    }

    res.status(200).json({ meetings });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// POST: Create a New Meeting
app.post('/api/meetings', requireAuth(), async (req, res) => {
  try {
    const userId = (req as any).auth.userId;
    const { title, passcode, isWaitingRoomEnabled, scheduledStart, duration, code: customCode } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let code = customCode || generateRoomCode();
    let isUnique = false;
    let checkAttempts = 0;

    // Only check for uniqueness if we are generating a random code
    if (customCode) {
      isUnique = true; 
    }

    while (!isUnique && checkAttempts < 5) {
      const { data: existing } = await supabase
        .from('meetings')
        .select('id')
        .eq('code', code)
        .maybeSingle();

      if (!existing) {
        isUnique = true;
      } else {
        code = generateRoomCode();
        checkAttempts++;
      }
    }

    const { data: newMeeting, error: insertError } = await supabase
      .from('meetings')
      .insert({
        code,
        title,
        host_id: userId,
        passcode: passcode || null,
        is_waiting_room_enabled: !!isWaitingRoomEnabled,
        scheduled_start: scheduledStart || null,
        duration: duration ? parseInt(duration, 10) : null
      })
      .select()
      .single();

    if (insertError) {
      return res.status(500).json({ error: 'Failed to create meeting', details: insertError.message });
    }

    res.status(201).json({ meeting: newMeeting });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// GET: Fetch Meeting by Code (and its chat history)
app.get('/api/meetings/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: meeting, error: dbError } = await supabase
      .from('meetings')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    if (dbError) {
      return res.status(500).json({ error: 'Failed to query meeting', details: dbError.message });
    }

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Load chat history
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('meeting_id', meeting.id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('Failed to fetch chat history:', msgError);
    }

    res.status(200).json({ meeting, messages: messages || [] });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// POST: Insert Chat Message
app.post('/api/meetings/:code/chat', requireAuth(), async (req, res) => {
  try {
    const { code } = req.params;
    const userId = (req as any).auth.userId;
    const { message, senderName } = req.body;

    if (!message || !senderName) {
      return res.status(400).json({ error: 'Message and senderName are required' });
    }

    // First get the meeting ID
    const { data: meeting } = await supabase
      .from('meetings')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const { error } = await supabase
      .from('chat_messages')
      .insert({
        meeting_id: meeting.id,
        user_id: userId,
        sender_name: senderName,
        message
      });

    if (error) {
      return res.status(500).json({ error: 'Failed to insert chat message', details: error.message });
    }

    res.status(201).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});
app.patch('/api/meetings/:code/close', requireAuth(), async (req, res) => {
  try {
    const { code } = req.params;
    const userId = (req as any).auth.userId;

    const { data: meeting } = await supabase
      .from('meetings')
      .select('host_id')
      .eq('code', code)
      .maybeSingle();

    if (!meeting || meeting.host_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { error } = await supabase
      .from('meetings')
      .update({ is_active: false })
      .eq('code', code);

    if (error) {
      return res.status(500).json({ error: 'Failed to close meeting', details: error.message });
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});
// We use clerkMiddleware() globally, so requireAuth is not added here so unauthenticated users can access it if needed (but currently they might need to sign in to access the room). 
// Since requireAuth() is NOT passed here, it allows guests if we ever support them.
app.post('/api/verify-passcode', async (req, res) => {
  try {
    const { code, passcode } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Meeting code is required' });
    }

    const { data: meeting, error: dbError } = await supabase
      .from('meetings')
      .select('id, passcode')
      .eq('code', code)
      .maybeSingle();

    if (dbError) {
      return res.status(500).json({ error: 'Failed to query meeting', details: dbError.message });
    }

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    if (meeting.passcode && meeting.passcode !== passcode) {
      return res.status(401).json({ success: false, error: 'Incorrect passcode' });
    }

    res.status(200).json({ success: true, meetingId: meeting.id });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// GET: Turn Credentials
app.get('/api/turn-credentials', async (req, res) => {
  try {
    let iceServers: any[] = [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:openrelay.metered.ca:80'
        ]
      },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    if (twilioSid && twilioAuthToken) {
      try {
        const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Tokens.json`;
        const auth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Basic ${auth}` }
        });

        if (response.ok) {
          const data: any = await response.json();
          if (data.ice_servers) {
            iceServers = data.ice_servers;
          }
        }
      } catch (twilioErr) {
        console.error('Error fetching Twilio TURN credentials:', twilioErr);
      }
    } else {
      const staticTurnUrl = process.env.STATIC_TURN_URL;
      const staticTurnUser = process.env.STATIC_TURN_USERNAME;
      const staticTurnCred = process.env.STATIC_TURN_CREDENTIAL;

      if (staticTurnUrl && staticTurnUser && staticTurnCred) {
        iceServers.push({
          urls: staticTurnUrl,
          username: staticTurnUser,
          credential: staticTurnCred
        });
      }
    }

    res.status(200).json({ iceServers });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

interface Participant {
  socketId: string;
  userId: string;
  username: string;
  role: 'host' | 'participant';
  isWaiting: boolean;
  isHandRaised: boolean;
  isMutedAudio: boolean;
  isMutedVideo: boolean;
}

// Memory storage for active rooms: RoomID -> Array of Participants
const rooms = new Map<string, Participant[]>();

// Disconnect timeouts map: userId -> Timeout ID
const disconnectTimeouts = new Map<string, NodeJS.Timeout>();

io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Join Room
  socket.on('join-room', (data: { roomId: string; userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean }) => {
    const { roomId, userId, username, role, isWaiting } = data;
    
    // Attach identifiers to socket instance
    (socket as any).userId = userId;
    (socket as any).roomId = roomId;
    
    // Clear any pending disconnect timeout for this user
    const pendingTimeout = disconnectTimeouts.get(userId);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      disconnectTimeouts.delete(userId);
      console.log(`User ${username} (${userId}) reconnected. Cleared disconnect grace timer.`);
    }

    socket.join(roomId);
    
    const newParticipant: Participant = {
      socketId: socket.id,
      userId,
      username,
      role,
      isWaiting,
      isHandRaised: false,
      isMutedAudio: false,
      isMutedVideo: false
    };

    let roomParticipants = rooms.get(roomId) || [];
    
    // Check if participant already exists and update their socketId
    const existingIndex = roomParticipants.findIndex(p => p.userId === userId);
    if (existingIndex > -1) {
      const existing = roomParticipants[existingIndex];
      roomParticipants[existingIndex] = {
        ...existing,
        socketId: socket.id,
        isWaiting // Update waiting room status if needed
      };
      console.log(`Updated socket ID for existing participant: ${username} (${userId}) -> socket: ${socket.id}`);
    } else {
      roomParticipants.push(newParticipant);
      console.log(`Added new participant: ${username} (${userId}) -> socket: ${socket.id}`);
    }
    
    rooms.set(roomId, roomParticipants);

    // If joining as an active participant, notify others and send active list
    if (!isWaiting) {
      // Send current active participants list to the joiner
      const activeParticipants = roomParticipants.filter(p => !p.isWaiting && p.userId !== userId);
      socket.emit('room-participants', { participants: activeParticipants });

      // Notify others in the room
      socket.to(roomId).emit('peer-joined', {
        socketId: socket.id,
        userId,
        username,
        role,
        isHandRaised: false,
        isMutedAudio: false,
        isMutedVideo: false
      });
    } else {
      // Notify host(s) about the new waiting room participant
      socket.to(roomId).emit('waiting-room-list-update', {
        participants: roomParticipants.filter(p => p.isWaiting)
      });
      
      // Let the waiting client know
      socket.emit('waiting-status', { status: 'waiting' });
    }
  });

  // 2. Signaling (Offer, Answer, ICE Candidates routed by targetUserId)
  socket.on('signal', (data: { targetUserId: string; signal: any }) => {
    const { targetUserId, signal } = data;
    const roomId = (socket as any).roomId;
    const senderUserId = (socket as any).userId;
    
    if (!roomId || !senderUserId) return;
    
    const roomParticipants = rooms.get(roomId) || [];
    const target = roomParticipants.find(p => p.userId === targetUserId);
    
    if (target) {
      io.to(target.socketId).emit('signal', {
        senderUserId,
        signal
      });
    }
  });

  // 3. Chat Message
  socket.on('send-chat', (data: { roomId: string; username: string; text: string; userId: string }) => {
    const { roomId, username, text, userId } = data;
    const msg = {
      id: `${userId}-${Date.now()}`,
      senderId: userId,
      userId,
      username,
      text,
      timestamp: Date.now()
    };
    
    io.to(roomId).emit('chat-received', msg);
  });

  // 4. Host Waiting Room Approval
  socket.on('waiting-room-action', (data: { roomId: string; targetUserId: string; action: 'approve' | 'deny' }) => {
    const { roomId, targetUserId, action } = data;
    
    let roomParticipants = rooms.get(roomId) || [];
    const participantIndex = roomParticipants.findIndex(p => p.userId === targetUserId);

    if (participantIndex > -1) {
      const participant = roomParticipants[participantIndex];
      
      if (action === 'approve') {
        participant.isWaiting = false;
        rooms.set(roomId, roomParticipants);

        // Tell the target user they are approved
        io.to(participant.socketId).emit('waiting-status', { status: 'approved' });

        // Send active list to the approved user
        const activeParticipants = roomParticipants.filter(p => !p.isWaiting && p.userId !== targetUserId);
        io.to(participant.socketId).emit('room-participants', { participants: activeParticipants });
        
        // Notify others that this peer joined
        io.to(roomId).emit('peer-joined', {
          socketId: participant.socketId,
          userId: participant.userId,
          username: participant.username,
          role: participant.role,
          isHandRaised: false,
          isMutedAudio: participant.isMutedAudio,
          isMutedVideo: participant.isMutedVideo
        });
      } else {
        // Deny entry and remove participant
        roomParticipants.splice(participantIndex, 1);
        rooms.set(roomId, roomParticipants);
        
        io.to(participant.socketId).emit('waiting-status', { status: 'denied' });
      }

      // Update waiting room list for hosts
      io.to(roomId).emit('waiting-room-list-update', {
        participants: roomParticipants.filter(p => p.isWaiting)
      });
    }
  });

  // 5. Mute Peer (Host action)
  socket.on('mute-peer', (data: { roomId: string; targetUserId: string; type: 'audio' | 'video' }) => {
    const { roomId, targetUserId, type } = data;
    
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.userId === targetUserId);
    
    if (participant) {
      io.to(participant.socketId).emit('mute-command', { type });
      
      if (type === 'audio') participant.isMutedAudio = true;
      if (type === 'video') participant.isMutedVideo = true;
      rooms.set(roomId, roomParticipants);

      io.to(roomId).emit('peer-muted-status', { userId: targetUserId, type, isMuted: true });
    }
  });

  // 6. Raise Hand
  socket.on('raise-hand', (data: { roomId: string; isRaised: boolean }) => {
    const { roomId, isRaised } = data;
    const userId = (socket as any).userId;
    if (!userId) return;
    
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.userId === userId);
    if (participant) {
      participant.isHandRaised = isRaised;
      rooms.set(roomId, roomParticipants);
    }

    io.to(roomId).emit('hand-raised', {
      userId,
      isRaised
    });
  });

  // 7. Toggle own media status in backend memory
  socket.on('toggle-media-status', (data: { roomId: string; type: 'audio' | 'video'; isMuted: boolean }) => {
    const { roomId, type, isMuted } = data;
    const userId = (socket as any).userId;
    if (!userId) return;
    
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.userId === userId);
    if (participant) {
      if (type === 'audio') participant.isMutedAudio = isMuted;
      if (type === 'video') participant.isMutedVideo = isMuted;
      rooms.set(roomId, roomParticipants);
    }
    io.to(roomId).emit('peer-muted-status', { userId, type, isMuted });
  });

  // 8. Kick Participant (Host action)
  socket.on('kick-peer', (data: { roomId: string; targetUserId: string }) => {
    const { roomId, targetUserId } = data;
    
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.userId === targetUserId);
    
    if (participant) {
      io.to(participant.socketId).emit('kicked-command');
      
      const updatedParticipants = roomParticipants.filter(p => p.userId !== targetUserId);
      rooms.set(roomId, updatedParticipants);

      console.log(`User kicked: ${targetUserId} from room ${roomId}`);

      io.to(roomId).emit('peer-left', { userId: targetUserId, socketId: participant.socketId });
      io.to(roomId).emit('waiting-room-list-update', {
        participants: updatedParticipants.filter(p => p.isWaiting)
      });
    }
  });

  // 9. Caption
  socket.on('caption', (data: { roomId: string; text: string; isFinal: boolean }) => {
    const { roomId, text, isFinal } = data;
    const userId = (socket as any).userId;
    if (!roomId || !userId) return;
    
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.userId === userId);
    if (participant) {
      io.to(roomId).emit('caption', {
        senderUserId: userId,
        username: participant.username,
        text,
        isFinal
      });
    }
  });

  // 10. Reaction
  socket.on('reaction', (data: { roomId: string; type: string }) => {
    const { roomId, type } = data;
    const userId = (socket as any).userId;
    if (!roomId || !userId) return;
    
    io.to(roomId).emit('reaction', {
      senderUserId: userId,
      type
    });
  });

  // 11. Disconnect (with 5-second grace period)
  socket.on('disconnect', () => {
    const userId = (socket as any).userId;
    const roomId = (socket as any).roomId;
    
    if (!userId || !roomId) return;
    
    console.log(`User socket disconnected: ${socket.id} (User ID: ${userId}). Starting 5s grace period.`);
    
    const timeout = setTimeout(() => {
      disconnectTimeouts.delete(userId);
      
      let roomParticipants = rooms.get(roomId) || [];
      const participantIndex = roomParticipants.findIndex(p => p.userId === userId);
      
      if (participantIndex > -1) {
        const participant = roomParticipants[participantIndex];
        const updatedParticipants = roomParticipants.filter(p => p.userId !== userId);
        
        if (updatedParticipants.length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} is now empty. Deleting.`);
        } else {
          rooms.set(roomId, updatedParticipants);
          
          if (!participant.isWaiting) {
            // Notify others in room
            io.to(roomId).emit('peer-left', { userId, socketId: socket.id });
          } else {
            // Notify hosts about updated waiting room list
            io.to(roomId).emit('waiting-room-list-update', {
              participants: updatedParticipants.filter(p => p.isWaiting)
            });
          }
        }
        console.log(`User ${participant.username} (${userId}) officially left after timeout.`);
      }
    }, 5000);
    
    disconnectTimeouts.set(userId, timeout);
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
