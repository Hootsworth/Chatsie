import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

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

// Memory storage for active rooms
// RoomID -> Array of Participants
const rooms = new Map<string, Participant[]>();

io.on('connection', (socket: Socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Join Room
  socket.on('join-room', (data: { roomId: string; userId: string; username: string; role: 'host' | 'participant'; isWaiting: boolean }) => {
    const { roomId, userId, username, role, isWaiting } = data;
    
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
    
    // Check if participant already exists and update
    const existingIndex = roomParticipants.findIndex(p => p.userId === userId);
    if (existingIndex > -1) {
      roomParticipants[existingIndex] = { ...roomParticipants[existingIndex], socketId: socket.id, isWaiting };
    } else {
      roomParticipants.push(newParticipant);
    }
    
    rooms.set(roomId, roomParticipants);

    console.log(`User ${username} (${role}) joined room: ${roomId}. Waiting: ${isWaiting}`);

    // If joining as an active participant (not waiting room), notify existing participants
    if (!isWaiting) {
      // Send the list of existing active participants to the new joiner
      const activeParticipants = roomParticipants.filter(p => !p.isWaiting && p.socketId !== socket.id);
      socket.emit('room-participants', { participants: activeParticipants });

      // Notify other active participants in the room
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
      // Notify the host(s) in the room about a new waiting room participant
      socket.to(roomId).emit('waiting-room-list-update', {
        participants: roomParticipants.filter(p => p.isWaiting)
      });
      
      // Let the client know they are in the waiting room
      socket.emit('waiting-status', { status: 'waiting' });
    }
  });

  // 2. Signaling (Offer, Answer, ICE Candidates)
  socket.on('signal', (data: { targetId: string; signal: any }) => {
    const { targetId, signal } = data;
    // Unicast signal to specific peer target
    io.to(targetId).emit('signal', {
      senderId: socket.id,
      signal
    });
  });

  // 3. Chat Message
  socket.on('send-chat', (data: { roomId: string; username: string; text: string; userId: string }) => {
    const { roomId, username, text, userId } = data;
    const msg = {
      id: `${socket.id}-${Date.now()}`,
      senderId: socket.id,
      userId,
      username,
      text,
      timestamp: Date.now()
    };
    
    // Broadcast message to everyone in the room
    io.to(roomId).emit('chat-received', msg);
  });

  // 4. Host Waiting Room Approval
  socket.on('waiting-room-action', (data: { roomId: string; targetSocketId: string; action: 'approve' | 'deny' }) => {
    const { roomId, targetSocketId, action } = data;
    
    let roomParticipants = rooms.get(roomId) || [];
    const participantIndex = roomParticipants.findIndex(p => p.socketId === targetSocketId);

    if (participantIndex > -1) {
      const participant = roomParticipants[participantIndex];
      
      if (action === 'approve') {
        participant.isWaiting = false;
        rooms.set(roomId, roomParticipants);

        // Tell the target user they are approved
        io.to(targetSocketId).emit('waiting-status', { status: 'approved' });

        // Let other active participants know they joined
        const activeParticipants = roomParticipants.filter(p => !p.isWaiting && p.socketId !== targetSocketId);
        io.to(targetSocketId).emit('room-participants', { participants: activeParticipants });
        
        io.to(targetSocketId).to(roomId).emit('peer-joined', {
          socketId: targetSocketId,
          userId: participant.userId,
          username: participant.username,
          role: participant.role,
          isHandRaised: false,
          isMutedAudio: participant.isMutedAudio,
          isMutedVideo: participant.isMutedVideo
        });
      } else {
        // Deny entry
        roomParticipants.splice(participantIndex, 1);
        rooms.set(roomId, roomParticipants);
        
        io.to(targetSocketId).emit('waiting-status', { status: 'denied' });
      }

      // Send updated waiting room list to everyone (mainly hosts look at this)
      io.to(roomId).emit('waiting-room-list-update', {
        participants: roomParticipants.filter(p => p.isWaiting)
      });
    }
  });

  // 5. Mute Participant (Host action)
  socket.on('mute-peer', (data: { roomId: string; targetSocketId: string; type: 'audio' | 'video' }) => {
    const { roomId, targetSocketId, type } = data;
    
    // Send mute command to target socket
    io.to(targetSocketId).emit('mute-command', { type });
    
    // Update memory status
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.socketId === targetSocketId);
    if (participant) {
      if (type === 'audio') participant.isMutedAudio = true;
      if (type === 'video') participant.isMutedVideo = true;
      rooms.set(roomId, roomParticipants);
    }
    
    // Broadcast status update to room
    io.to(roomId).emit('peer-muted-status', { socketId: targetSocketId, type, isMuted: true });
  });

  // 6. Raise Hand
  socket.on('raise-hand', (data: { roomId: string; isRaised: boolean }) => {
    const { roomId, isRaised } = data;
    
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.socketId === socket.id);
    if (participant) {
      participant.isHandRaised = isRaised;
      rooms.set(roomId, roomParticipants);
    }

    // Broadcast event to everyone in the room
    io.to(roomId).emit('hand-raised', {
      socketId: socket.id,
      isRaised
    });
  });

  // 7. Toggle own media mute state in backend memory (so new participants get correct state)
  socket.on('toggle-media-status', (data: { roomId: string; type: 'audio' | 'video'; isMuted: boolean }) => {
    const { roomId, type, isMuted } = data;
    const roomParticipants = rooms.get(roomId) || [];
    const participant = roomParticipants.find(p => p.socketId === socket.id);
    if (participant) {
      if (type === 'audio') participant.isMutedAudio = isMuted;
      if (type === 'video') participant.isMutedVideo = isMuted;
      rooms.set(roomId, roomParticipants);
    }
    io.to(roomId).emit('peer-muted-status', { socketId: socket.id, type, isMuted });
  });

  // 8. Kick Participant (Host action)
  socket.on('kick-peer', (data: { roomId: string; targetSocketId: string }) => {
    const { roomId, targetSocketId } = data;
    
    io.to(targetSocketId).emit('kicked-command');
    
    // Remove participant from room
    let roomParticipants = rooms.get(roomId) || [];
    roomParticipants = roomParticipants.filter(p => p.socketId !== targetSocketId);
    rooms.set(roomId, roomParticipants);

    console.log(`User kicked: ${targetSocketId} from room ${roomId}`);

    // Notify others
    io.to(roomId).emit('peer-left', { socketId: targetSocketId });
    io.to(roomId).emit('waiting-room-list-update', {
      participants: roomParticipants.filter(p => p.isWaiting)
    });
  });

  // 9. Disconnect
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find room the socket belonged to
    for (const [roomId, roomParticipants] of rooms.entries()) {
      const participantIndex = roomParticipants.findIndex(p => p.socketId === socket.id);
      
      if (participantIndex > -1) {
        const participant = roomParticipants[participantIndex];
        const updatedParticipants = roomParticipants.filter(p => p.socketId !== socket.id);
        
        if (updatedParticipants.length === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} is now empty. Deleting.`);
        } else {
          rooms.set(roomId, updatedParticipants);
          
          if (!participant.isWaiting) {
            // Notify others in room
            socket.to(roomId).emit('peer-left', { socketId: socket.id });
          } else {
            // Notify hosts about updated waiting room list
            socket.to(roomId).emit('waiting-room-list-update', {
              participants: updatedParticipants.filter(p => p.isWaiting)
            });
          }
        }
        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});
