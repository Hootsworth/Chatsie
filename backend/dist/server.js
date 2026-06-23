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
const livekit_server_sdk_1 = require("livekit-server-sdk");
const express_2 = require("@clerk/express");
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
// Setup Clerk globally for any authenticated routes
app.use((0, express_2.clerkMiddleware)());
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
function generateRoomCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    return `${part1}-${part2}-${part3}`;
}
// LiveKit Token Generation Endpoint
app.post('/api/livekit/token', (0, express_2.requireAuth)(), async (req, res) => {
    const { roomName, participantName } = req.body;
    const participantIdentity = req.auth.userId;
    if (!roomName || !participantIdentity) {
        return res.status(400).json({ error: 'roomName and participantIdentity are required' });
    }
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!apiKey || !apiSecret) {
        return res.status(500).json({ error: 'LiveKit API credentials are not configured on the server' });
    }
    try {
        const at = new livekit_server_sdk_1.AccessToken(apiKey, apiSecret, {
            identity: participantIdentity,
            name: participantName || participantIdentity,
        });
        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
        const token = await at.toJwt();
        res.json({ token });
    }
    catch (error) {
        console.error('Error generating LiveKit token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
    }
});
// GET: List User's Scheduled Meetings
app.get('/api/meetings', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const userId = req.auth.userId;
        const listHistory = req.query.history === 'true';
        let query = supabase
            .from('meetings')
            .select('*')
            .eq('host_id', userId);
        if (listHistory) {
            query = query.lt('scheduled_start', new Date().toISOString());
        }
        else {
            query = query.or(`scheduled_start.gte.${new Date().toISOString()},scheduled_start.is.null`);
        }
        const { data: meetings, error: dbError } = await query.order('scheduled_start', { ascending: true });
        if (dbError) {
            return res.status(500).json({ error: 'Failed to fetch meetings', details: dbError.message });
        }
        res.status(200).json({ meetings });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// POST: Create a New Meeting
app.post('/api/meetings', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const userId = req.auth.userId;
        const { title, passcode, isWaitingRoomEnabled, scheduledStart, duration } = req.body;
        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        let code = generateRoomCode();
        let isUnique = false;
        let checkAttempts = 0;
        while (!isUnique && checkAttempts < 5) {
            const { data: existing } = await supabase
                .from('meetings')
                .select('id')
                .eq('code', code)
                .maybeSingle();
            if (!existing) {
                isUnique = true;
            }
            else {
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// POST: Verify Meeting Passcode
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// GET: Turn Credentials
app.get('/api/turn-credentials', async (req, res) => {
    try {
        let iceServers = [
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
                    const data = await response.json();
                    if (data.ice_servers) {
                        iceServers = data.ice_servers;
                    }
                }
            }
            catch (twilioErr) {
                console.error('Error fetching Twilio TURN credentials:', twilioErr);
            }
        }
        else {
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
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
// Memory storage for active rooms: RoomID -> Array of Participants
const rooms = new Map();
// Disconnect timeouts map: userId -> Timeout ID
const disconnectTimeouts = new Map();
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // 1. Join Room
    socket.on('join-room', (data) => {
        const { roomId, userId, username, role, isWaiting } = data;
        // Attach identifiers to socket instance
        socket.userId = userId;
        socket.roomId = roomId;
        // Clear any pending disconnect timeout for this user
        const pendingTimeout = disconnectTimeouts.get(userId);
        if (pendingTimeout) {
            clearTimeout(pendingTimeout);
            disconnectTimeouts.delete(userId);
            console.log(`User ${username} (${userId}) reconnected. Cleared disconnect grace timer.`);
        }
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
        }
        else {
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
        }
        else {
            // Notify host(s) about the new waiting room participant
            socket.to(roomId).emit('waiting-room-list-update', {
                participants: roomParticipants.filter(p => p.isWaiting)
            });
            // Let the waiting client know
            socket.emit('waiting-status', { status: 'waiting' });
        }
    });
    // 2. Signaling (Offer, Answer, ICE Candidates routed by targetUserId)
    socket.on('signal', (data) => {
        const { targetUserId, signal } = data;
        const roomId = socket.roomId;
        const senderUserId = socket.userId;
        if (!roomId || !senderUserId)
            return;
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
    socket.on('send-chat', (data) => {
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
    socket.on('waiting-room-action', (data) => {
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
            }
            else {
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
    socket.on('mute-peer', (data) => {
        const { roomId, targetUserId, type } = data;
        const roomParticipants = rooms.get(roomId) || [];
        const participant = roomParticipants.find(p => p.userId === targetUserId);
        if (participant) {
            io.to(participant.socketId).emit('mute-command', { type });
            if (type === 'audio')
                participant.isMutedAudio = true;
            if (type === 'video')
                participant.isMutedVideo = true;
            rooms.set(roomId, roomParticipants);
            io.to(roomId).emit('peer-muted-status', { userId: targetUserId, type, isMuted: true });
        }
    });
    // 6. Raise Hand
    socket.on('raise-hand', (data) => {
        const { roomId, isRaised } = data;
        const userId = socket.userId;
        if (!userId)
            return;
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
    socket.on('toggle-media-status', (data) => {
        const { roomId, type, isMuted } = data;
        const userId = socket.userId;
        if (!userId)
            return;
        const roomParticipants = rooms.get(roomId) || [];
        const participant = roomParticipants.find(p => p.userId === userId);
        if (participant) {
            if (type === 'audio')
                participant.isMutedAudio = isMuted;
            if (type === 'video')
                participant.isMutedVideo = isMuted;
            rooms.set(roomId, roomParticipants);
        }
        io.to(roomId).emit('peer-muted-status', { userId, type, isMuted });
    });
    // 8. Kick Participant (Host action)
    socket.on('kick-peer', (data) => {
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
    socket.on('caption', (data) => {
        const { roomId, text, isFinal } = data;
        const userId = socket.userId;
        if (!roomId || !userId)
            return;
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
    socket.on('reaction', (data) => {
        const { roomId, type } = data;
        const userId = socket.userId;
        if (!roomId || !userId)
            return;
        io.to(roomId).emit('reaction', {
            senderUserId: userId,
            type
        });
    });
    // 11. Disconnect (with 5-second grace period)
    socket.on('disconnect', () => {
        const userId = socket.userId;
        const roomId = socket.roomId;
        if (!userId || !roomId)
            return;
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
                }
                else {
                    rooms.set(roomId, updatedParticipants);
                    if (!participant.isWaiting) {
                        // Notify others in room
                        io.to(roomId).emit('peer-left', { userId, socketId: socket.id });
                    }
                    else {
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
