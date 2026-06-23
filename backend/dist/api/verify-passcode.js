"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const supabase_js_1 = require("@supabase/supabase-js");
const parseJsonBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            }
            catch (err) {
                reject(err);
            }
        });
    });
};
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
async function handler(req, res) {
    // Handle CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method Not Allowed' }));
        return;
    }
    try {
        const body = await parseJsonBody(req);
        const { code, passcode } = body;
        if (!code) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Meeting code is required' }));
            return;
        }
        // Look up the meeting
        const { data: meeting, error: dbError } = await supabase
            .from('meetings')
            .select('id, passcode')
            .eq('code', code)
            .maybeSingle();
        if (dbError) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to query meeting', details: dbError.message }));
            return;
        }
        if (!meeting) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Meeting not found' }));
            return;
        }
        // Verify passcode (if meeting has passcode, compare it)
        if (meeting.passcode && meeting.passcode !== passcode) {
            res.statusCode = 401;
            res.end(JSON.stringify({ success: false, error: 'Incorrect passcode' }));
            return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, meetingId: meeting.id }));
    }
    catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Internal Server Error', details: error.message }));
    }
}
