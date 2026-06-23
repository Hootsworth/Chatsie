"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5001;
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['GET', 'POST']
}));
app.use(express_1.default.json());
// Basic health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
});
// Memory storage for active rooms
// RoomID -> Array of Participants
const rooms = new Map();
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // 1. Join Room
    socket.on('join-room', (data) => {
        const { roomId, userId, username, role, isWaiting } = data;
        socket.join(roomId);
        const newParticipant = {
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
        }
        else {
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
        }
        else {
            // Notify the host(s) in the room about a new waiting room participant
            socket.to(roomId).emit('waiting-room-list-update', {
                participants: roomParticipants.filter(p => p.isWaiting)
            });
            // Let the client know they are in the waiting room
            socket.emit('waiting-status', { status: 'waiting' });
        }
    });
    // 2. Signaling (Offer, Answer, ICE Candidates)
    socket.on('signal', (data) => {
        const { targetId, signal } = data;
        // Unicast signal to specific peer target
        io.to(targetId).emit('signal', {
            senderId: socket.id,
            signal
        });
    });
    // 3. Chat Message
    socket.on('send-chat', (data) => {
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
    socket.on('waiting-room-action', (data) => {
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
            }
            else {
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
    socket.on('mute-peer', (data) => {
        const { roomId, targetSocketId, type } = data;
        // Send mute command to target socket
        io.to(targetSocketId).emit('mute-command', { type });
        // Update memory status
        const roomParticipants = rooms.get(roomId) || [];
        const participant = roomParticipants.find(p => p.socketId === targetSocketId);
        if (participant) {
            if (type === 'audio')
                participant.isMutedAudio = true;
            if (type === 'video')
                participant.isMutedVideo = true;
            rooms.set(roomId, roomParticipants);
        }
        // Broadcast status update to room
        io.to(roomId).emit('peer-muted-status', { socketId: targetSocketId, type, isMuted: true });
    });
    // 6. Raise Hand
    socket.on('raise-hand', (data) => {
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
    socket.on('toggle-media-status', (data) => {
        const { roomId, type, isMuted } = data;
        const roomParticipants = rooms.get(roomId) || [];
        const participant = roomParticipants.find(p => p.socketId === socket.id);
        if (participant) {
            if (type === 'audio')
                participant.isMutedAudio = isMuted;
            if (type === 'video')
                participant.isMutedVideo = isMuted;
            rooms.set(roomId, roomParticipants);
        }
        io.to(roomId).emit('peer-muted-status', { socketId: socket.id, type, isMuted });
    });
    // 8. Kick Participant (Host action)
    socket.on('kick-peer', (data) => {
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
                }
                else {
                    rooms.set(roomId, updatedParticipants);
                    if (!participant.isWaiting) {
                        // Notify others in room
                        socket.to(roomId).emit('peer-left', { socketId: socket.id });
                    }
                    else {
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
