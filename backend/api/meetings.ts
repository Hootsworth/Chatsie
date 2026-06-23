import { createClient } from '@supabase/supabase-js';
import { IncomingMessage, ServerResponse } from 'http';

// Helper to parse JSON body from incoming stream
const parseJsonBody = (req: IncomingMessage): Promise<any> => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
};

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

export default async function handler(req: IncomingMessage & { query: Record<string, string | string[]> }, res: ServerResponse) {
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

  try {
    // We expect an Authorization header "Bearer <token>" containing the user's JWT
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized: Missing or invalid authorization token' }));
      return;
    }

    const token = authHeader.split(' ')[1];
    
    // Retrieve user details from Supabase Auth using the JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'Unauthorized: Invalid token', details: authError?.message }));
      return;
    }

    // 1. GET: List User's Scheduled Meetings
    if (req.method === 'GET') {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const listHistory = url.searchParams.get('history') === 'true';

      let query = supabase
        .from('meetings')
        .select('*')
        .eq('host_id', user.id);

      if (listHistory) {
        // Meetings that occurred in the past or where duration has passed
        query = query.lt('scheduled_start', new Date().toISOString());
      } else {
        // Upcoming meetings (scheduled start in the future or no start time / instant)
        query = query.or(`scheduled_start.gte.${new Date().toISOString()},scheduled_start.is.null`);
      }

      const { data: meetings, error: dbError } = await query.order('scheduled_start', { ascending: true });

      if (dbError) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to fetch meetings', details: dbError.message }));
        return;
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ meetings }));
      return;
    }

    // 2. POST: Create a New Meeting
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { title, passcode, isWaitingRoomEnabled, scheduledStart, duration } = body;

      if (!title) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Title is required' }));
        return;
      }

      // Generate a unique code and ensure it doesn't collide
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
          host_id: user.id,
          passcode: passcode || null,
          is_waiting_room_enabled: !!isWaitingRoomEnabled,
          scheduled_start: scheduledStart || null,
          duration: duration ? parseInt(duration, 10) : null
        })
        .select()
        .single();

      if (insertError) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Failed to create meeting', details: insertError.message }));
        return;
      }

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ meeting: newMeeting }));
      return;
    }

    // Method Not Allowed
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));

  } catch (error: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Server Error', details: error.message }));
  }
}
