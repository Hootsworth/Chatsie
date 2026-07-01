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
function parseMeetingDetails(meeting) {
    if (!meeting)
        return null;
    let passcode = meeting.passcode;
    let blockEarlyJoin = false;
    let inviteOnly = false;
    let invitedEmails = [];
    let theme = 'lime';
    if (meeting.passcode && meeting.passcode.startsWith('{')) {
        try {
            const parsed = JSON.parse(meeting.passcode);
            passcode = parsed.passcode || null;
            blockEarlyJoin = !!parsed.blockEarlyJoin;
            inviteOnly = !!parsed.inviteOnly;
            invitedEmails = parsed.invitedEmails || [];
            theme = parsed.theme || 'lime';
        }
        catch (e) {
            console.error('Error parsing meeting metadata json from passcode column:', e);
        }
    }
    return {
        ...meeting,
        passcode,
        blockEarlyJoin,
        inviteOnly,
        invitedEmails,
        theme
    };
}
async function sendScheduledMeetingEmails(hostId, meeting, invitedEmails, rawPasscode) {
    try {
        const brevoApiKey = process.env.BREVO_API_KEY;
        if (!brevoApiKey) {
            console.error('Brevo API key is not configured on the server');
            return;
        }
        // Fetch the host's details from Clerk to get their name
        const hostUser = await express_2.clerkClient.users.getUser(hostId);
        const hostName = hostUser.fullName || hostUser.username || `${hostUser.firstName || ''} ${hostUser.lastName || ''}`.trim() || 'A Chatsie Host';
        const joinLink = `https://chatsie.singulr.tech/room/${meeting.code}`;
        // Calendar & ICS invite generation
        const startDate = meeting.scheduled_start ? new Date(meeting.scheduled_start) : new Date();
        const duration = meeting.duration ? parseInt(meeting.duration, 10) : 30;
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
        const formatIcsDate = (date) => {
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        // Stable event UID based on meeting room code
        const eventUid = `meeting-${meeting.code}@chatsie.singulr.tech`;
        const icsLines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Chatsie//Meeting Schedule//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            `UID:${eventUid}`,
            `DTSTAMP:${formatIcsDate(new Date())}`,
            `DTSTART:${formatIcsDate(startDate)}`,
            `DTEND:${formatIcsDate(endDate)}`,
            `SUMMARY:${meeting.title || 'Chatsie Sync'}`,
            `DESCRIPTION:Join Chatsie Meeting at: ${joinLink}${rawPasscode ? `\\nPasscode: ${rawPasscode}` : ''}`,
            `LOCATION:${joinLink}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ];
        const icsString = icsLines.join('\r\n');
        const icsBase64 = Buffer.from(icsString).toString('base64');
        const icsFilename = `${(meeting.title || 'chatsie-sync').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
        // Map theme colors
        const themeBgColors = {
            lime: '#dceeb1',
            lilac: '#c5b0f4',
            cream: '#f4ecd6',
            pink: '#efd4d4',
            mint: '#c8e6cd',
            coral: '#f3c9b6'
        };
        const themeBgColor = themeBgColors[meeting.theme] || '#dceeb1';
        // Calendar URLs
        const googleUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meeting.title || 'Chatsie Sync')}&dates=${formatIcsDate(startDate)}/${formatIcsDate(endDate)}&details=${encodeURIComponent(`Join Chatsie Meeting:\n${joinLink}${rawPasscode ? `\nPasscode: ${rawPasscode}` : ''}`)}&location=${encodeURIComponent(joinLink)}`;
        const outlookLiveUrl = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(meeting.title || 'Chatsie Sync')}&startdt=${startDate.toISOString()}&enddt=${endDate.toISOString()}&body=${encodeURIComponent(`Join Chatsie Meeting:\n${joinLink}${rawPasscode ? `\nPasscode: ${rawPasscode}` : ''}`)}&location=${encodeURIComponent(joinLink)}`;
        const outlookOfficeUrl = `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(meeting.title || 'Chatsie Sync')}&startdt=${startDate.toISOString()}&enddt=${endDate.toISOString()}&body=${encodeURIComponent(`Join Chatsie Meeting:\n${joinLink}${rawPasscode ? `\nPasscode: ${rawPasscode}` : ''}`)}&location=${encodeURIComponent(joinLink)}`;
        // Format Scheduled Time
        let timeRow = '';
        if (meeting.scheduled_start) {
            const formattedTime = new Date(meeting.scheduled_start).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
            timeRow = `
        <tr>
          <td style="padding-bottom: 14px;">
            <span class="detail-label">Scheduled Time</span>
            <span class="detail-value">${formattedTime}</span>
          </td>
        </tr>
      `;
        }
        // Format Passcode
        let passcodeRow = '';
        if (rawPasscode) {
            passcodeRow = `
        <tr>
          <td style="padding-bottom: 14px;">
            <span class="detail-label">Passcode</span>
            <span class="detail-value code">${rawPasscode}</span>
          </td>
        </tr>
      `;
        }
        // Craft a premium responsive HTML email
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Invitation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: #f7f7f5;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      -webkit-font-smoothing: antialiased;
    }

    .wrapper {
      padding: 48px 20px;
    }

    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #ffffff;
    }

    /* Header strip — table-based for Outlook/Gmail */
    .header-table {
      width: 100%;
      border-bottom: 1px solid #e6e6e6;
    }

    .header-table td {
      padding: 20px 32px;
      vertical-align: middle;
    }

    .wordmark {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #000000;
    }

    .eyebrow-tag {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      background-color: ${themeBgColor};
      padding: 3px 8px;
      border-radius: 2px;
    }

    /* Color block */
    .color-block {
      background-color: ${themeBgColor};
      padding: 40px 32px 36px;
    }

    .eyebrow {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      margin-bottom: 14px;
    }

    .headline {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: -0.03em;
      color: #000000;
      margin-bottom: 12px;
    }

    .subtext {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.5;
      color: #000000;
    }

    .subtext strong {
      font-weight: 700;
    }

    /* White canvas body */
    .body-section {
      padding: 32px 32px 28px;
      background-color: #ffffff;
    }

    /* Meeting detail card — table-based */
    .meeting-card {
      border: 1px solid #e6e6e6;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 28px;
    }

    .detail-table {
      width: 100%;
    }

    .detail-table td {
      vertical-align: top;
      padding-bottom: 14px;
    }

    .detail-table tr:last-child td {
      padding-bottom: 0;
    }

    .detail-label {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      opacity: 0.5;
      display: block;
      margin-bottom: 2px;
    }

    .detail-value {
      font-size: 15px;
      font-weight: 700;
      color: #000000;
      letter-spacing: -0.01em;
      display: block;
    }

    .detail-value.code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      font-weight: 400;
      letter-spacing: 0.06em;
      background-color: #f7f7f5;
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
    }

    /* CTA pill */
    .cta-wrap {
      text-align: center;
      margin-bottom: 20px;
    }

    .btn-primary {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      padding: 13px 36px;
      border-radius: 9999px;
    }

    /* Hairline divider */
    .divider {
      height: 1px;
      background-color: #e6e6e6;
      margin: 0 32px;
      font-size: 0;
      line-height: 0;
    }

    /* Footer */
    .footer {
      padding: 20px 32px;
      background-color: #ffffff;
    }

    .footer-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      color: #000000;
      opacity: 0.45;
      line-height: 1.7;
    }

    .footer-link {
      color: #000000;
      word-break: break-all;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header (table-based for email clients) -->
      <table class="header-table" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="text-align: left;">
            <div class="wordmark">Chatsie</div>
          </td>
          <td style="text-align: right;">
            <span class="eyebrow-tag">Invitation</span>
          </td>
        </tr>
      </table>

      <!-- Lime color block -->
      <div class="color-block">
        <div class="eyebrow">Scheduled video meeting</div>
        <div class="headline">You're invited.</div>
        <div class="subtext"><strong>${hostName}</strong> has invited you to join a scheduled live meeting.</div>
      </div>

      <!-- White canvas body -->
      <div class="body-section">
        <div class="meeting-card">
          <table class="detail-table" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding-bottom: 14px;">
                <span class="detail-label">Meeting Room</span>
                <span class="detail-value">${meeting.title}</span>
              </td>
            </tr>
            ${timeRow}
            <tr>
              <td style="padding-bottom: 14px;">
                <span class="detail-label">Code</span>
                <span class="detail-value code">${meeting.code}</span>
              </td>
            </tr>
            ${passcodeRow}
          </table>
        </div>

        <!-- Add to Calendar Section -->
        <div style="margin-bottom: 28px; text-align: center;">
          <div style="font-family: 'Courier New', Courier, monospace; font-size: 10px; font-weight: 400; letter-spacing: 0.06em; text-transform: uppercase; color: #000000; opacity: 0.5; margin-bottom: 10px; text-align: center;">Save to Calendar</div>
          <table cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 auto 12px auto;">
            <tr>
              <td style="padding: 0 4px;">
                <a href="${googleUrl}" target="_blank" style="display: inline-block; font-size: 12px; font-weight: 700; color: #000000; background-color: #ffffff; border: 1px solid #e6e6e6; text-decoration: none; padding: 8px 16px; border-radius: 9999px; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Google</a>
              </td>
              <td style="padding: 0 4px;">
                <a href="${outlookLiveUrl}" target="_blank" style="display: inline-block; font-size: 12px; font-weight: 700; color: #000000; background-color: #ffffff; border: 1px solid #e6e6e6; text-decoration: none; padding: 8px 16px; border-radius: 9999px; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Outlook Live</a>
              </td>
              <td style="padding: 0 4px;">
                <a href="${outlookOfficeUrl}" target="_blank" style="display: inline-block; font-size: 12px; font-weight: 700; color: #000000; background-color: #ffffff; border: 1px solid #e6e6e6; text-decoration: none; padding: 8px 16px; border-radius: 9999px; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">Office 365</a>
              </td>
            </tr>
          </table>
          <div style="font-size: 11px; color: #6a6a6a; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; opacity: 0.7;">An <code>.ics</code> invite is attached for Apple Calendar / Outlook App.</div>
        </div>

        <div class="cta-wrap">
          <a href="${joinLink}" class="btn-primary" target="_blank">Join meeting</a>
        </div>
      </div>

      <div class="divider">&nbsp;</div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-text">
          Button not working? Paste this URL into your browser:<br>
          <a href="${joinLink}" class="footer-link">${joinLink}</a>
        </div>
      </div>

    </div>
  </div>
</body>
</html>
    `;
        // Send emails in parallel
        for (const email of invitedEmails) {
            try {
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
                            email: 'info@singulr.tech'
                        },
                        to: [
                            {
                                email: email
                            }
                        ],
                        subject: `Invitation: ${meeting.title} by ${hostName}`,
                        htmlContent: htmlContent,
                        attachment: [
                            {
                                name: icsFilename,
                                content: icsBase64
                            }
                        ]
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to send email to ${email}:`, errorText);
                }
                else {
                    console.log(`Email invitation successfully sent to ${email}`);
                }
            }
            catch (err) {
                console.error(`Error sending email to ${email}:`, err);
            }
        }
    }
    catch (err) {
        console.error('Error in sendScheduledMeetingEmails helper:', err);
    }
}
async function sendCancelledMeetingEmails(hostId, meeting, invitedEmails) {
    try {
        const brevoApiKey = process.env.BREVO_API_KEY;
        if (!brevoApiKey) {
            console.error('Brevo API key is not configured on the server');
            return;
        }
        // Fetch the host's details from Clerk
        const hostUser = await express_2.clerkClient.users.getUser(hostId);
        const hostName = hostUser.fullName || hostUser.username || `${hostUser.firstName || ''} ${hostUser.lastName || ''}`.trim() || 'A Chatsie Host';
        const joinLink = `https://chatsie.singulr.tech/room/${meeting.code}`;
        // Calendar & ICS cancel generation
        const startDate = meeting.scheduled_start ? new Date(meeting.scheduled_start) : new Date();
        const duration = meeting.duration ? parseInt(meeting.duration, 10) : 30;
        const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
        const formatIcsDate = (date) => {
            return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        };
        // Stable event UID based on meeting room code
        const eventUid = `meeting-${meeting.code}@chatsie.singulr.tech`;
        const icsLines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Chatsie//Meeting Schedule//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:CANCEL',
            'BEGIN:VEVENT',
            `UID:${eventUid}`,
            `DTSTAMP:${formatIcsDate(new Date())}`,
            `DTSTART:${formatIcsDate(startDate)}`,
            `DTEND:${formatIcsDate(endDate)}`,
            `SUMMARY:CANCELLED: ${meeting.title || 'Chatsie Sync'}`,
            `DESCRIPTION:The scheduled meeting "${meeting.title}" has been cancelled.`,
            `LOCATION:${joinLink}`,
            'SEQUENCE:1',
            'STATUS:CANCELLED',
            'END:VEVENT',
            'END:VCALENDAR'
        ];
        const icsString = icsLines.join('\r\n');
        const icsBase64 = Buffer.from(icsString).toString('base64');
        const icsFilename = `cancelled-${(meeting.title || 'chatsie-sync').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
        // Map theme background (using dynamic or cancellation alert theme)
        const themeBgColors = {
            lime: '#dceeb1',
            lilac: '#c5b0f4',
            cream: '#f4ecd6',
            pink: '#efd4d4',
            mint: '#c8e6cd',
            coral: '#f3c9b6'
        };
        const themeBgColor = themeBgColors[meeting.theme] || '#efd4d4'; // default to pink on cancel alert
        // Format Scheduled Time
        let timeRow = '';
        if (meeting.scheduled_start) {
            const formattedTime = new Date(meeting.scheduled_start).toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
            timeRow = `
        <tr>
          <td style="padding-bottom: 14px;">
            <span class="detail-label">Original Scheduled Time</span>
            <span class="detail-value">${formattedTime}</span>
          </td>
        </tr>
      `;
        }
        // Craft cancellation HTML email
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Cancelled</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: #f7f7f5;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      -webkit-font-smoothing: antialiased;
    }

    .wrapper {
      padding: 48px 20px;
    }

    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #ffffff;
    }

    .header-table {
      width: 100%;
      border-bottom: 1px solid #e6e6e6;
    }

    .header-table td {
      padding: 20px 32px;
      vertical-align: middle;
    }

    .wordmark {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #000000;
    }

    .eyebrow-tag {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      background-color: ${themeBgColor};
      padding: 3px 8px;
      border-radius: 2px;
    }

    .color-block {
      background-color: ${themeBgColor};
      padding: 40px 32px 36px;
    }

    .eyebrow {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      margin-bottom: 14px;
    }

    .headline {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: -0.03em;
      color: #000000;
      margin-bottom: 12px;
    }

    .subtext {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.5;
      color: #000000;
    }

    .subtext strong {
      font-weight: 700;
    }

    .body-section {
      padding: 32px 32px 28px;
      background-color: #ffffff;
    }

    .meeting-card {
      border: 1px solid #e6e6e6;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 28px;
    }

    .detail-table {
      width: 100%;
    }

    .detail-table td {
      vertical-align: top;
      padding-bottom: 14px;
    }

    .detail-table tr:last-child td {
      padding-bottom: 0;
    }

    .detail-label {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      opacity: 0.5;
      display: block;
      margin-bottom: 2px;
    }

    .detail-value {
      font-size: 15px;
      font-weight: 700;
      color: #000000;
      letter-spacing: -0.01em;
      display: block;
    }

    .detail-value.code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      font-weight: 400;
      letter-spacing: 0.06em;
      background-color: #f7f7f5;
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
    }

    .divider {
      height: 1px;
      background-color: #e6e6e6;
      margin: 0 32px;
      font-size: 0;
      line-height: 0;
    }

    .footer {
      padding: 20px 32px;
      background-color: #ffffff;
    }

    .footer-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      color: #000000;
      opacity: 0.45;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <table class="header-table" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="text-align: left;">
            <div class="wordmark">Chatsie</div>
          </td>
          <td style="text-align: right;">
            <span class="eyebrow-tag">Cancellation</span>
          </td>
        </tr>
      </table>

      <div class="color-block">
        <div class="eyebrow">Meeting Cancelled</div>
        <div class="headline">Sync Cancelled.</div>
        <div class="subtext"><strong>${hostName}</strong> has cancelled the following scheduled meeting.</div>
      </div>

      <div class="body-section">
        <div class="meeting-card">
          <table class="detail-table" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding-bottom: 14px;">
                <span class="detail-label">Meeting Room</span>
                <span class="detail-value">${meeting.title}</span>
              </td>
            </tr>
            ${timeRow}
            <tr>
              <td style="padding-bottom: 14px;">
                <span class="detail-label">Code</span>
                <span class="detail-value code">${meeting.code}</span>
              </td>
            </tr>
          </table>
        </div>
        <div style="font-size: 12px; color: #ea4335; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; font-weight: bold;">
          This event has been cancelled and will be removed from your calendar client automatically.
        </div>
      </div>

      <div class="divider">&nbsp;</div>

      <div class="footer">
        <div class="footer-text">
          Sent via Chatsie Meetings.
        </div>
      </div>

    </div>
  </div>
</body>
</html>
    `;
        // Send emails in parallel
        for (const email of invitedEmails) {
            try {
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
                            email: 'info@singulr.tech'
                        },
                        to: [
                            {
                                email: email
                            }
                        ],
                        subject: `Cancelled: ${meeting.title} by ${hostName}`,
                        htmlContent: htmlContent,
                        attachment: [
                            {
                                name: icsFilename,
                                content: icsBase64
                            }
                        ]
                    })
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Failed to send cancellation email to ${email}:`, errorText);
                }
                else {
                    console.log(`Cancellation email successfully sent to ${email}`);
                }
            }
            catch (err) {
                console.error(`Error sending cancellation email to ${email}:`, err);
            }
        }
    }
    catch (err) {
        console.error('Error in sendCancelledMeetingEmails helper:', err);
    }
}
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
        const parsedMeetings = (meetings || []).map(parseMeetingDetails);
        res.status(200).json({ meetings: parsedMeetings });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// POST: Create a New Meeting
app.post('/api/meetings', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const userId = (0, express_2.getAuth)(req).userId;
        const { title, passcode, isWaitingRoomEnabled, scheduledStart, duration, code: customCode, blockEarlyJoin, inviteOnly, invitedEmails, theme } = req.body;
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
        let passcodePayload = passcode || null;
        if (passcode || blockEarlyJoin || inviteOnly || (invitedEmails && invitedEmails.length > 0) || theme) {
            passcodePayload = JSON.stringify({
                passcode: passcode || null,
                blockEarlyJoin: !!blockEarlyJoin,
                inviteOnly: !!inviteOnly,
                invitedEmails: invitedEmails || [],
                theme: theme || 'lime'
            });
        }
        const { data: newMeeting, error: insertError } = await supabase
            .from('meetings')
            .insert({
            code,
            title,
            host_id: userId,
            passcode: passcodePayload,
            is_waiting_room_enabled: !!isWaitingRoomEnabled,
            scheduled_start: scheduledStart || null,
            duration: duration ? parseInt(duration, 10) : null
        })
            .select()
            .single();
        if (insertError) {
            return res.status(500).json({ error: 'Failed to create meeting', details: insertError.message });
        }
        const parsedMeeting = parseMeetingDetails(newMeeting);
        // Send emails asynchronously in the background if invitedEmails are present
        if (invitedEmails && invitedEmails.length > 0) {
            sendScheduledMeetingEmails(userId, parsedMeeting, invitedEmails, passcode || null);
        }
        res.status(201).json({ meeting: parsedMeeting });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
// DELETE: Cancel/Delete a Meeting
app.delete('/api/meetings/:code', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const userId = (0, express_2.getAuth)(req).userId;
        const { code } = req.params;
        // Fetch meeting details before deleting
        const { data: meeting, error: fetchError } = await supabase
            .from('meetings')
            .select('*')
            .eq('code', code)
            .maybeSingle();
        if (fetchError) {
            return res.status(500).json({ error: 'Database error', details: fetchError.message });
        }
        if (!meeting) {
            return res.status(404).json({ error: 'Meeting not found' });
        }
        if (meeting.host_id !== userId) {
            return res.status(403).json({ error: 'Only the meeting host can cancel this meeting' });
        }
        const parsedMeeting = parseMeetingDetails(meeting);
        // Perform deletion
        const { error: deleteError } = await supabase
            .from('meetings')
            .delete()
            .eq('code', code);
        if (deleteError) {
            return res.status(500).json({ error: 'Failed to delete meeting', details: deleteError.message });
        }
        // Send cancellation emails in the background if there were invited emails
        if (parsedMeeting.invitedEmails && parsedMeeting.invitedEmails.length > 0) {
            sendCancelledMeetingEmails(userId, parsedMeeting, parsedMeeting.invitedEmails);
        }
        res.json({ message: 'Meeting successfully cancelled' });
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
        res.status(200).json({ meeting: parseMeetingDetails(meeting), messages: messages || [] });
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
async function sendDirectMessageEmailNotification(senderName, recipientEmail, messageText) {
    try {
        const brevoApiKey = process.env.BREVO_API_KEY;
        if (!brevoApiKey) {
            console.error('Brevo API key is not configured on the server');
            return;
        }
        const chatLink = `https://chatsie.singulr.tech/`;
        // Craft a premium responsive HTML direct message email
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Message on Chatsie</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: #f7f7f5;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      -webkit-font-smoothing: antialiased;
    }

    .wrapper {
      padding: 48px 20px;
    }

    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #ffffff;
      border: 1px solid #e6e6e6;
      border-radius: 8px;
      overflow: hidden;
    }

    /* Header strip */
    .header-table {
      width: 100%;
      border-bottom: 1px solid #e6e6e6;
    }

    .header-table td {
      padding: 20px 32px;
      vertical-align: middle;
    }

    .wordmark {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #000000;
    }

    .eyebrow-tag {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      background-color: #e8dbfc;
      padding: 3px 8px;
      border-radius: 2px;
    }

    /* Message content section */
    .body-section {
      padding: 32px;
    }

    .sender-info {
      font-size: 14px;
      color: #707070;
      margin-bottom: 8px;
    }

    .message-card {
      background-color: #fcfcfb;
      border-left: 3px solid #6366f1;
      padding: 16px;
      border-radius: 4px;
      font-size: 15px;
      line-height: 1.5;
      color: #000000;
      margin-bottom: 24px;
    }

    /* CTA pill */
    .cta-wrap {
      text-align: center;
      margin-bottom: 12px;
    }

    .btn-primary {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      padding: 12px 32px;
      border-radius: 9999px;
    }

    /* Footer */
    .footer {
      padding: 20px 32px;
      background-color: #fcfcfb;
      border-top: 1px solid #e6e6e6;
    }

    .footer-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      color: #000000;
      opacity: 0.45;
      line-height: 1.7;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header -->
      <table class="header-table" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="text-align: left;">
            <div class="wordmark">Chatsie</div>
          </td>
          <td style="text-align: right;">
            <span class="eyebrow-tag">New Chat</span>
          </td>
        </tr>
      </table>

      <!-- Body -->
      <div class="body-section">
        <div class="sender-info"><strong>${senderName}</strong> sent you a message:</div>
        <div class="message-card">
          ${messageText.replace(/\n/g, '<br>')}
        </div>

        <div class="cta-wrap">
          <a href="${chatLink}" class="btn-primary" target="_blank">Reply on Chatsie</a>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-text">
          Sent via Chatsie. To view your full message history, sign in at chatsie.singulr.tech.
        </div>
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
                    name: 'Chatsie Messages',
                    email: 'info@singulr.tech'
                },
                to: [
                    {
                        email: recipientEmail
                    }
                ],
                subject: `New message from ${senderName} on Chatsie`,
                htmlContent: htmlContent
            })
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to send DM email notification to ${recipientEmail}:`, errorText);
        }
        else {
            console.log(`DM email notification successfully sent to ${recipientEmail}`);
        }
    }
    catch (err) {
        console.error('Error in sendDirectMessageEmailNotification helper:', err);
    }
}
app.get('/api/chats', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const userId = (0, express_2.getAuth)(req).userId;
        // Fetch user details from Clerk to get their email
        const user = await express_2.clerkClient.users.getUser(userId);
        const userEmail = user.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
        // Fetch all meetings starting with 'dm-'
        const { data: threads, error: dbError } = await supabase
            .from('meetings')
            .select('*')
            .like('code', 'dm-%');
        if (dbError) {
            return res.status(500).json({ error: 'Failed to query chat threads', details: dbError.message });
        }
        const filteredThreads = (threads || []).filter((thread) => {
            // Include thread if host is logged-in user
            if (thread.host_id === userId)
                return true;
            // Or if the passcode payload mentions the logged-in user email
            if (thread.passcode && thread.passcode.startsWith('{')) {
                try {
                    const parsed = JSON.parse(thread.passcode);
                    if (parsed.isChat) {
                        const cleanRecip = parsed.recipientEmail?.toLowerCase();
                        const cleanHost = parsed.hostEmail?.toLowerCase();
                        return cleanRecip === userEmail || cleanHost === userEmail;
                    }
                }
                catch (e) {
                    // ignore
                }
            }
            return false;
        });
        // Unpack threads details and add recipient/host metadata
        const activeThreads = filteredThreads.map((thread) => {
            let recipientEmail = '';
            let recipientName = '';
            let hostEmail = '';
            let hostName = '';
            if (thread.passcode && thread.passcode.startsWith('{')) {
                try {
                    const parsed = JSON.parse(thread.passcode);
                    recipientEmail = parsed.recipientEmail || '';
                    recipientName = parsed.recipientName || '';
                    hostEmail = parsed.hostEmail || '';
                    hostName = parsed.hostName || '';
                }
                catch (e) {
                    // ignore
                }
            }
            // Determine "other participant" details for the frontend
            const isHost = thread.host_id === userId;
            const otherParticipantEmail = isHost ? recipientEmail : hostEmail;
            const otherParticipantName = isHost ? recipientName : hostName;
            return {
                id: thread.id,
                code: thread.code,
                title: thread.title,
                created_at: thread.created_at,
                otherParticipantEmail,
                otherParticipantName,
                isHost
            };
        });
        res.status(200).json({ threads: activeThreads });
    }
    catch (error) {
        console.error('Error fetching chats list:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
app.get('/api/chats/:threadCode', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const { threadCode } = req.params;
        const userId = (0, express_2.getAuth)(req).userId;
        // Fetch the thread details
        const { data: thread, error: dbError } = await supabase
            .from('meetings')
            .select('*')
            .eq('code', threadCode)
            .maybeSingle();
        if (dbError) {
            return res.status(500).json({ error: 'Failed to query thread', details: dbError.message });
        }
        if (!thread) {
            return res.status(404).json({ error: 'Chat thread not found' });
        }
        // Verify user is part of the thread
        const user = await express_2.clerkClient.users.getUser(userId);
        const userEmail = user.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
        let isAuthorized = thread.host_id === userId;
        let recipientEmail = '';
        let recipientName = '';
        let hostEmail = '';
        let hostName = '';
        if (thread.passcode && thread.passcode.startsWith('{')) {
            try {
                const parsed = JSON.parse(thread.passcode);
                recipientEmail = parsed.recipientEmail || '';
                recipientName = parsed.recipientName || '';
                hostEmail = parsed.hostEmail || '';
                hostName = parsed.hostName || '';
                if (recipientEmail.toLowerCase() === userEmail || hostEmail.toLowerCase() === userEmail) {
                    isAuthorized = true;
                }
            }
            catch (e) {
                // ignore
            }
        }
        if (!isAuthorized) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        // Load message history from chat_messages
        const { data: messages, error: msgError } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('meeting_id', thread.id)
            .order('created_at', { ascending: true });
        if (msgError) {
            console.error('Failed to fetch chat history:', msgError);
        }
        const formattedMessages = (messages || []).map((m) => ({
            id: m.id,
            senderId: m.user_id,
            senderName: m.sender_name,
            message: m.message,
            created_at: m.created_at
        }));
        const isHost = thread.host_id === userId;
        const otherParticipantEmail = isHost ? recipientEmail : hostEmail;
        const otherParticipantName = isHost ? recipientName : hostName;
        res.status(200).json({
            thread: {
                id: thread.id,
                code: thread.code,
                otherParticipantEmail,
                otherParticipantName
            },
            messages: formattedMessages
        });
    }
    catch (error) {
        console.error('Error fetching chat messages:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});
app.post('/api/chats/message', (0, express_2.requireAuth)(), async (req, res) => {
    try {
        const userId = (0, express_2.getAuth)(req).userId;
        const { recipientEmail, message } = req.body;
        if (!recipientEmail || !message) {
            return res.status(400).json({ error: 'Recipient email and message are required' });
        }
        const cleanRecipientEmail = recipientEmail.trim().toLowerCase();
        // Fetch the host's details from Clerk
        const hostUser = await express_2.clerkClient.users.getUser(userId);
        const hostName = hostUser.fullName || hostUser.username || `${hostUser.firstName || ''} ${hostUser.lastName || ''}`.trim() || 'A Chatsie User';
        const hostEmail = hostUser.primaryEmailAddress?.emailAddress?.toLowerCase() || '';
        if (cleanRecipientEmail === hostEmail) {
            return res.status(400).json({ error: 'You cannot chat with yourself' });
        }
        // Generate a deterministic thread code based on host and recipient email to prevent duplicate threads
        const sortedEmails = [hostEmail, cleanRecipientEmail].sort();
        const threadCode = `dm-${Buffer.from(sortedEmails.join('_')).toString('hex')}`.slice(0, 30);
        // Check if the thread already exists
        let { data: thread } = await supabase
            .from('meetings')
            .select('*')
            .eq('code', threadCode)
            .maybeSingle();
        if (!thread) {
            // Look up recipient in Clerk to get their name if registered
            let recipientName = cleanRecipientEmail;
            try {
                const clerkLookup = await express_2.clerkClient.users.getUserList({
                    emailAddress: [cleanRecipientEmail],
                    limit: 1
                });
                const rUser = clerkLookup.data[0];
                if (rUser) {
                    recipientName = rUser.fullName || rUser.username || `${rUser.firstName || ''} ${rUser.lastName || ''}`.trim() || cleanRecipientEmail;
                }
            }
            catch (err) {
                console.error('Error looking up recipient user name in Clerk:', err);
            }
            // Create a new DM thread as a meeting
            const passcodeJson = JSON.stringify({
                isChat: true,
                recipientEmail: cleanRecipientEmail,
                recipientName,
                hostEmail,
                hostName
            });
            const { data: newThread, error: createError } = await supabase
                .from('meetings')
                .insert({
                code: threadCode,
                title: `DM: ${hostName} & ${recipientName}`,
                host_id: userId,
                passcode: passcodeJson,
                is_waiting_room_enabled: false,
                is_locked: false,
                is_active: true
            })
                .select()
                .single();
            if (createError) {
                return res.status(500).json({ error: 'Failed to create chat thread', details: createError.message });
            }
            thread = newThread;
        }
        // Insert the message into chat_messages
        const { data: newMessage, error: msgError } = await supabase
            .from('chat_messages')
            .insert({
            meeting_id: thread.id,
            user_id: userId,
            sender_name: hostName,
            message
        })
            .select()
            .single();
        if (msgError) {
            return res.status(500).json({ error: 'Failed to save message', details: msgError.message });
        }
        // Trigger Brevo transaction email to recipient notification in background
        sendDirectMessageEmailNotification(hostName, cleanRecipientEmail, message);
        res.status(201).json({ success: true, message: newMessage, threadCode });
    }
    catch (error) {
        console.error('Error in POST /api/chats/message:', error);
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Meeting Invitation</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: #f7f7f5;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #000000;
      -webkit-font-smoothing: antialiased;
    }

    .wrapper {
      padding: 48px 20px;
    }

    .container {
      max-width: 520px;
      margin: 0 auto;
      background-color: #ffffff;
    }

    /* Header strip — table-based for Outlook/Gmail */
    .header-table {
      width: 100%;
      border-bottom: 1px solid #e6e6e6;
    }

    .header-table td {
      padding: 20px 32px;
      vertical-align: middle;
    }

    .wordmark {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #000000;
    }

    .eyebrow-tag {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      background-color: #dceeb1;
      padding: 3px 8px;
      border-radius: 2px;
    }

    /* Color block — lime */
    .color-block {
      background-color: #dceeb1;
      padding: 40px 32px 36px;
    }

    .eyebrow {
      font-family: 'Courier New', Courier, monospace;
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      margin-bottom: 14px;
    }

    .headline {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.25;
      letter-spacing: -0.03em;
      color: #000000;
      margin-bottom: 12px;
    }

    .subtext {
      font-size: 15px;
      font-weight: 400;
      line-height: 1.5;
      color: #000000;
    }

    .subtext strong {
      font-weight: 700;
    }

    /* White canvas body */
    .body-section {
      padding: 32px 32px 28px;
      background-color: #ffffff;
    }

    /* Meeting detail card — table-based */
    .meeting-card {
      border: 1px solid #e6e6e6;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 28px;
    }

    .detail-table {
      width: 100%;
    }

    .detail-table td {
      vertical-align: top;
      padding-bottom: 14px;
    }

    .detail-table tr:last-child td {
      padding-bottom: 0;
    }

    .detail-label {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      font-weight: 400;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #000000;
      opacity: 0.5;
      display: block;
      margin-bottom: 2px;
    }

    .detail-value {
      font-size: 15px;
      font-weight: 700;
      color: #000000;
      letter-spacing: -0.01em;
      display: block;
    }

    .detail-value.code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      font-weight: 400;
      letter-spacing: 0.06em;
      background-color: #f7f7f5;
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
    }

    /* CTA pill */
    .cta-wrap {
      text-align: center;
      margin-bottom: 20px;
    }

    .btn-primary {
      display: inline-block;
      background-color: #000000;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -0.01em;
      padding: 13px 36px;
      border-radius: 9999px;
    }

    /* Hairline divider */
    .divider {
      height: 1px;
      background-color: #e6e6e6;
      margin: 0 32px;
      font-size: 0;
      line-height: 0;
    }

    /* Footer */
    .footer {
      padding: 20px 32px;
      background-color: #ffffff;
    }

    .footer-text {
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      letter-spacing: 0.04em;
      color: #000000;
      opacity: 0.45;
      line-height: 1.7;
    }

    .footer-link {
      color: #000000;
      word-break: break-all;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">

      <!-- Header (table-based for email clients) -->
      <table class="header-table" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="text-align: left;">
            <div class="wordmark">Chatsie</div>
          </td>
          <td style="text-align: right;">
            <span class="eyebrow-tag">Invitation</span>
          </td>
        </tr>
      </table>

      <!-- Lime color block -->
      <div class="color-block">
        <div class="eyebrow">Secure video meeting</div>
        <div class="headline">You're invited.</div>
        <div class="subtext"><strong>${hostName}</strong> has invited you to join a live meeting.</div>
      </div>

      <!-- White canvas body -->
      <div class="body-section">
        <div class="meeting-card">
          <table class="detail-table" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td>
                <span class="detail-label">Meeting Room</span>
                <span class="detail-value">${meeting.title}</span>
              </td>
            </tr>
            <tr>
              <td>
                <span class="detail-label">Code</span>
                <span class="detail-value code">${code}</span>
              </td>
            </tr>
          </table>
        </div>

        <div class="cta-wrap">
          <a href="${joinLink}" class="btn-primary" target="_blank">Join meeting</a>
        </div>
      </div>

      <div class="divider">&nbsp;</div>

      <!-- Footer -->
      <div class="footer">
        <div class="footer-text">
          Button not working? Paste this URL into your browser:<br>
          <a href="${joinLink}" class="footer-link">${joinLink}</a>
        </div>
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
                    email: 'info@singulr.tech'
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
        const parsed = parseMeetingDetails(meeting);
        if (parsed && parsed.passcode && parsed.passcode !== passcode) {
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
// POST: Copilot AI Query Proxy (to bypass CORS for OpenAI and Claude)
app.post('/api/copilot/query', async (req, res) => {
    try {
        const { provider, apiKey, messages, systemPrompt } = req.body;
        if (!provider || !messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Missing required parameters: provider and messages array.' });
        }
        if (provider === 'openai') {
            const key = apiKey || process.env.OPENAI_API_KEY;
            if (!key) {
                return res.status(400).json({ error: 'OpenAI API key is missing. Set it locally in Chatsie settings.' });
            }
            const response = await (0, cross_fetch_1.default)('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                        ...messages
                    ]
                })
            });
            if (!response.ok) {
                const errDetails = await response.text();
                return res.status(response.status).json({ error: `OpenAI API error: ${errDetails}` });
            }
            const data = await response.json();
            return res.status(200).json(data);
        }
        if (provider === 'claude') {
            const key = apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
            if (!key) {
                return res.status(400).json({ error: 'Claude API key is missing. Set it locally in Chatsie settings.' });
            }
            const response = await (0, cross_fetch_1.default)('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-5-sonnet-20240620',
                    max_tokens: 1024,
                    ...(systemPrompt ? { system: systemPrompt } : {}),
                    messages: messages.map((m) => ({
                        role: m.role === 'assistant' ? 'assistant' : 'user',
                        content: m.content
                    }))
                })
            });
            if (!response.ok) {
                const errDetails = await response.text();
                return res.status(response.status).json({ error: `Claude API error: ${errDetails}` });
            }
            const data = await response.json();
            return res.status(200).json(data);
        }
        return res.status(400).json({ error: `Unsupported provider: ${provider}` });
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
const roomPolls = new Map();
const roomQuestions = new Map();
const bannedUsers = new Map();
// Disconnect timeouts map: userId -> Timeout ID
const disconnectTimeouts = new Map();
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // 1. Join Room
    socket.on('join-room', (data) => {
        const { roomId, userId, username, role, isWaiting } = data;
        // Check if participant is banned
        if (bannedUsers.get(roomId)?.has(userId)) {
            console.log(`Banned user ${username} (${userId}) blocked from room ${roomId}`);
            socket.emit('waiting-status', { status: 'denied' });
            return;
        }
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
            // Send polls and questions history
            socket.emit('polls-history', { polls: roomPolls.get(roomId) || [] });
            socket.emit('questions-history', { questions: roomQuestions.get(roomId) || [] });
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
    socket.on('lower-all-hands', (data) => {
        const { roomId } = data;
        const roomParticipants = rooms.get(roomId) || [];
        roomParticipants.forEach((participant) => {
            participant.isHandRaised = false;
        });
        rooms.set(roomId, roomParticipants);
        io.to(roomId).emit('lower-hands-command');
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
            // Add user to ban list
            if (!bannedUsers.has(roomId)) {
                bannedUsers.set(roomId, new Set());
            }
            bannedUsers.get(roomId)?.add(targetUserId);
            console.log(`Banned user ${targetUserId} from room ${roomId}`);
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
    socket.on('moderation-policy', (data) => {
        const { roomId, policy } = data;
        socket.to(roomId).emit('moderation-policy-updated', policy);
    });
    socket.on('workspace-update', (data) => {
        const { roomId, type, content } = data;
        socket.to(roomId).emit('workspace-update', { type, content });
    });
    // Toggle Multiplayer Cursors
    socket.on('toggle-multiplayer-cursors', (data) => {
        const { roomId, enabled } = data;
        socket.to(roomId).emit('multiplayer-cursors-toggled', { enabled });
    });
    // Screenshare Cursor Move
    socket.on('screenshare-cursor-move', (data) => {
        const { roomId, userId, username, x, y } = data;
        socket.to(roomId).emit('screenshare-cursor-moved', { userId, username, x, y });
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
    // Interactive Polls Socket Handlers
    socket.on('create-poll', (data) => {
        const { roomId, question, options } = data;
        const userId = socket.userId;
        const roomParticipants = rooms.get(roomId) || [];
        const creator = roomParticipants.find(p => p.userId === userId);
        const creatorName = creator ? creator.username : 'Host';
        const newPoll = {
            id: `poll-${Date.now()}`,
            creatorId: userId || '',
            creatorName,
            question,
            options: options.map((opt, idx) => ({ id: `opt-${idx}`, text: opt, votes: [] })),
            isActive: true,
            createdAt: Date.now()
        };
        const polls = roomPolls.get(roomId) || [];
        polls.push(newPoll);
        roomPolls.set(roomId, polls);
        io.to(roomId).emit('poll-created', { poll: newPoll });
    });
    socket.on('vote-poll', (data) => {
        const { roomId, pollId, optionId } = data;
        const userId = socket.userId;
        if (!userId)
            return;
        const polls = roomPolls.get(roomId) || [];
        const poll = polls.find(p => p.id === pollId);
        if (poll && poll.isActive) {
            poll.options.forEach(opt => {
                opt.votes = opt.votes.filter(v => v !== userId);
                if (opt.id === optionId) {
                    opt.votes.push(userId);
                }
            });
            roomPolls.set(roomId, polls);
            io.to(roomId).emit('poll-voted', { pollId, optionId, voterId: userId });
        }
    });
    socket.on('close-poll', (data) => {
        const { roomId, pollId } = data;
        const polls = roomPolls.get(roomId) || [];
        const poll = polls.find(p => p.id === pollId);
        if (poll) {
            poll.isActive = false;
            roomPolls.set(roomId, polls);
            io.to(roomId).emit('poll-closed', { pollId });
        }
    });
    socket.on('delete-poll', (data) => {
        const { roomId, pollId } = data;
        const polls = roomPolls.get(roomId) || [];
        const filtered = polls.filter(p => p.id !== pollId);
        roomPolls.set(roomId, filtered);
        io.to(roomId).emit('poll-deleted', { pollId });
    });
    // Structured Q&A Socket Handlers
    socket.on('create-question', (data) => {
        const { roomId, text, username } = data;
        const userId = socket.userId || '';
        const newQuestion = {
            id: `q-${Date.now()}`,
            userId,
            username: username || 'Anonymous',
            text,
            upvotes: [],
            isAnswered: false,
            createdAt: Date.now()
        };
        const questions = roomQuestions.get(roomId) || [];
        questions.push(newQuestion);
        roomQuestions.set(roomId, questions);
        io.to(roomId).emit('question-created', { question: newQuestion });
    });
    socket.on('upvote-question', (data) => {
        const { roomId, questionId, isUpvote } = data;
        const userId = socket.userId;
        if (!userId)
            return;
        const questions = roomQuestions.get(roomId) || [];
        const question = questions.find(q => q.id === questionId);
        if (question) {
            const hasUpvoted = question.upvotes.includes(userId);
            if (isUpvote && !hasUpvoted) {
                question.upvotes.push(userId);
            }
            else if (!isUpvote && hasUpvoted) {
                question.upvotes = question.upvotes.filter(v => v !== userId);
            }
            roomQuestions.set(roomId, questions);
            io.to(roomId).emit('question-upvoted', { questionId, voterId: userId, isUpvote });
        }
    });
    socket.on('answer-question', (data) => {
        const { roomId, questionId, isAnswered } = data;
        const questions = roomQuestions.get(roomId) || [];
        const question = questions.find(q => q.id === questionId);
        if (question) {
            question.isAnswered = isAnswered;
            roomQuestions.set(roomId, questions);
            io.to(roomId).emit('question-answered', { questionId, isAnswered });
        }
    });
    socket.on('delete-question', (data) => {
        const { roomId, questionId } = data;
        const questions = roomQuestions.get(roomId) || [];
        const filtered = questions.filter(q => q.id !== questionId);
        roomQuestions.set(roomId, filtered);
        io.to(roomId).emit('question-deleted', { questionId });
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
                    roomPolls.delete(roomId);
                    roomQuestions.delete(roomId);
                    bannedUsers.delete(roomId);
                    console.log(`Room ${roomId} is now empty. Deleting all room state.`);
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
