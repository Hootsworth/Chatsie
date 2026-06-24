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
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
}));
app.use(express_1.default.json());
// Basic health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});
app.get('/api/test-supabase', async (req, res) => {
    try {
        const { data, error } = await supabase.from('meetings').select('*').limit(1);
        if (error) {
            return res.status(500).json({ error: 'Supabase query failed', details: error.message });
        }
        return res.json({ success: true, count: data?.length || 0 });
    }
    catch (err) {
        return res.status(500).json({ error: 'Exception thrown', details: err.message });
    }
});
// Setup Clerk globally for any authenticated routes
app.use((0, express_2.clerkMiddleware)());
const supabase_js_1 = require("@supabase/supabase-js");
const ws_1 = __importDefault(require("ws"));
const cross_fetch_1 = __importDefault(require("cross-fetch"));
global.WebSocket = ws_1.default;
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
let supabase;
try {
    supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
        global: { fetch: cross_fetch_1.default }
    });
}
catch (err) {
    console.error('FATAL ERROR: Failed to initialize Supabase Client. Check SUPABASE_URL formatting:', err.message);
    // Create a dummy proxy that always rejects so the server doesn't crash on startup
    supabase = {
        from: () => ({
            select: () => Promise.reject(new Error(`Supabase failed to initialize: ${err.message}`)),
            insert: () => Promise.reject(new Error(`Supabase failed to initialize: ${err.message}`)),
            update: () => Promise.reject(new Error(`Supabase failed to initialize: ${err.message}`)),
            delete: () => Promise.reject(new Error(`Supabase failed to initialize: ${err.message}`))
        })
    };
}
function generateRoomCode() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    return `${part1}-${part2}-${part3}`;
}
// LiveKit Token Generation Endpoint (Public, but guest identity verified against database)
app.post('/api/livekit/token', async (req, res) => {
    const { roomName, participantName, participantIdentity: clientIdentity } = req.body;
    const clerkAuth = (0, express_2.getAuth)(req);
    let participantIdentity = clerkAuth?.userId;
    if (!roomName) {
        return res.status(400).json({ error: 'roomName is required' });
    }
    if (!participantIdentity) {
        // Guest flow
        if (!clientIdentity) {
            return res.status(400).json({ error: 'participantIdentity is required for guests' });
        }
        // Verify roomName exists and is active in Supabase to prevent arbitrary room spin-ups
        try {
            const { data: meeting, error: dbError } = await supabase
                .from('meetings')
                .select('id, is_active')
                .eq('code', roomName)
                .maybeSingle();
            if (dbError || !meeting) {
                return res.status(403).json({ error: 'Invalid or inactive meeting room' });
            }
        }
        catch (e) {
            return res.status(500).json({ error: 'Database verification failed', details: e.message });
        }
        participantIdentity = clientIdentity;
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
        const userId = (0, express_2.getAuth)(req).userId;
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
        const userId = (0, express_2.getAuth)(req).userId;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// POST: Insert Chat Message
app.post('/api/meetings/:code/chat', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const { code } = req.params;
        const userId = (0, express_2.getAuth)(req).userId;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
app.patch('/api/meetings/:code/close', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const { code } = req.params;
        const userId = (0, express_2.getAuth)(req).userId;
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
app.patch('/api/meetings/:code/lock', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const { code } = req.params;
        const { isLocked } = req.body;
        const userId = (0, express_2.getAuth)(req).userId;
        const { data: meeting } = await supabase
            .from('meetings')
            .select('host_id')
            .eq('code', code)
            .maybeSingle();
        if (!meeting || meeting.host_id !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { data: updatedMeeting, error } = await supabase
            .from('meetings')
            .update({ is_locked: !!isLocked })
            .eq('code', code)
            .select()
            .single();
        if (error) {
            return res.status(500).json({ error: 'Failed to update lock status', details: error.message });
        }
        // If socket.io has rooms active, broadcast lock toggled
        io.to(code).emit('room-lock-toggled', { isLocked: !!isLocked });
        res.status(200).json({ success: true, meeting: updatedMeeting });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// GET: Lookup User by Email via Clerk
app.get('/api/users/lookup', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const { email } = req.query;
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'Email query parameter is required' });
        }
        const cleanEmail = email.trim().toLowerCase();
        // Query users list from Clerk matching the email address
        const response = await express_2.clerkClient.users.getUserList({
            emailAddress: [cleanEmail],
            limit: 1
        });
        const user = response.data[0];
        if (user) {
            const name = user.fullName || user.username || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Chatsie User';
            return res.status(200).json({
                exists: true,
                name,
                imageUrl: user.imageUrl
            });
        }
        // Fallback initials avatar seed
        const fallbackSeed = encodeURIComponent(cleanEmail);
        const imageUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${fallbackSeed}`;
        return res.status(200).json({
            exists: false,
            name: cleanEmail,
            imageUrl
        });
    }
    catch (error) {
        console.error('Error looking up user in Clerk:', error);
        res.status(500).json({ error: 'Failed to lookup user', details: error.message });
    }
});
// POST: Invite User via Email using Brevo REST API
app.post('/api/meetings/:code/invite', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const { code } = req.params;
        const { email } = req.body;
        const userId = (0, express_2.getAuth)(req).userId; // Host user ID
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        // Fetch the host's details from Clerk to get their name
        const hostUser = await express_2.clerkClient.users.getUser(userId);
        const hostName = hostUser.fullName || hostUser.username || `${hostUser.firstName || ''} ${hostUser.lastName || ''}`.trim() || 'A Chatsie Host';
        // Fetch the meeting details
        const { data: meeting, error: dbError } = await supabase
            .from('meetings')
            .select('*')
            .eq('code', code)
            .maybeSingle();
        if (dbError || !meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        const brevoApiKey = process.env.BREVO_API_KEY;
        if (!brevoApiKey) {
            return res.status(500).json({ error: 'Brevo API key is not configured on the server' });
        }
        const joinLink = `https://chatsie.singulr.tech/room/${code}`;
        // Craft a premium responsive HTML email
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Meeting Invitation</title>
  <style>
    body {
      background-color: #0c0a09;
      color: #fafaf9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
    }
    .wrapper {
      padding: 40px 20px;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background-color: #1c1917;
      border: 1px solid #2e2a24;
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    .header-logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.05em;
      color: #6366f1;
      margin-bottom: 24px;
    }
    .title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #ffffff;
      line-height: 1.4;
    }
    .subtitle {
      font-size: 14px;
      color: #a8a29e;
      margin-bottom: 28px;
      line-height: 1.6;
    }
    .meeting-card {
      background-color: #292524;
      border: 1px solid #44403c;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 32px;
      text-align: left;
    }
    .meeting-label {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 700;
      color: #a8a29e;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .meeting-title {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 8px;
    }
    .meeting-code {
      font-family: monospace;
      font-size: 13px;
      color: #6366f1;
      font-weight: 700;
    }
    .btn {
      display: inline-block;
      background-color: #6366f1;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 700;
      font-size: 14px;
      padding: 12px 32px;
      border-radius: 10px;
      box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.3);
      margin-bottom: 24px;
    }
    .footer {
      font-size: 11px;
      color: #78716c;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header-logo">Chatsie</div>
      <div class="title">You're invited!</div>
      <div class="subtitle"><strong>${hostName}</strong> has invited you to join a secure live video meeting.</div>
      
      <div class="meeting-card">
        <div class="meeting-label">Meeting Room</div>
        <div class="meeting-title">${meeting.title}</div>
        <div class="meeting-label">Code</div>
        <div class="meeting-code">${code}</div>
      </div>
      
      <a href="${joinLink}" class="btn" target="_blank">Join Meeting</a>
      
      <div class="footer">
        If the button above does not work, copy and paste this URL into your browser:<br>
        <span style="color: #6366f1; word-break: break-all;">${joinLink}</span>
      </div>
    </div>
  </div>
</body>
</html>
    `;
        // Make API request to Brevo Transactional Email REST endpoint
        const response = await (0, cross_fetch_1.default)('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'api-key': brevoApiKey,
                'content-type': 'application/json',
                'accept': 'application/json'
            },
            body: JSON.stringify({
                sender: {
                    name: 'Chatsie Meetings',
                    email: 'invites@adityapdixit.me'
                },
                to: [
                    {
                        email: email
                    }
                ],
                subject: `Join ${hostName} in a Chatsie Meeting`,
                htmlContent: htmlContent
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Brevo API error response:', errorText);
            return res.status(500).json({ error: 'Failed to send email via Brevo', details: errorText });
        }
        const responseData = await response.json();
        return res.status(200).json({ success: true, messageId: responseData.messageId });
    }
    catch (error) {
        console.error('Error sending meeting invitation:', error);
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
                const response = await (0, cross_fetch_1.default)(endpoint, {
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
    // Whiteboard drawing socket handlers
    socket.on('whiteboard-draw', (data) => {
        const { roomId, x1, y1, x2, y2, color, thickness } = data;
        socket.to(roomId).emit('whiteboard-draw', { x1, y1, x2, y2, color, thickness });
    });
    socket.on('whiteboard-clear', (data) => {
        const { roomId } = data;
        io.to(roomId).emit('whiteboard-clear');
    });
    // Waiting room doodle socket handlers
    socket.on('waiting-doodle-draw', (data) => {
        const { roomId, x1, y1, x2, y2, color, thickness } = data;
        socket.to(roomId).emit('waiting-doodle-draw', { x1, y1, x2, y2, color, thickness });
    });
    socket.on('waiting-doodle-clear', (data) => {
        const { roomId } = data;
        io.to(roomId).emit('waiting-doodle-clear');
    });
    // Toggle Room Lock handler
    socket.on('toggle-room-lock', (data) => {
        const { roomId, isLocked } = data;
        socket.to(roomId).emit('room-lock-toggled', { isLocked });
    });
    // Breakout rooms socket handlers
    socket.on('start-breakout', (data) => {
        const { roomId, assignments, durationSeconds } = data;
        io.to(roomId).emit('breakout-started', { assignments, durationSeconds });
    });
    socket.on('end-breakout', (data) => {
        const { roomId } = data;
        io.to(roomId).emit('breakout-ended');
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
