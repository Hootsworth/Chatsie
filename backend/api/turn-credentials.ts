import { IncomingMessage, ServerResponse } from 'http';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
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
    // Default fallback to free Google STUN and Metered TURN servers
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
        // Query Twilio Ephemeral TURN Credentials API
        const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Tokens.json`;
        const auth = Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString('base64');
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`
          }
        });

        if (response.ok) {
          const data: any = await response.json();
          if (data.ice_servers) {
            iceServers = data.ice_servers;
            console.log('Successfully fetched Twilio ICE servers');
          }
        } else {
          console.error('Twilio Token request failed', response.statusText);
        }
      } catch (twilioErr) {
        console.error('Error fetching Twilio TURN credentials:', twilioErr);
      }
    } else {
      // Check if user provided static TURN details in environment variables
      const staticTurnUrl = process.env.STATIC_TURN_URL; // e.g. "turn:turn.example.com:3478"
      const staticTurnUser = process.env.STATIC_TURN_USERNAME;
      const staticTurnCred = process.env.STATIC_TURN_CREDENTIAL;

      if (staticTurnUrl && staticTurnUser && staticTurnCred) {
        iceServers.push({
          urls: staticTurnUrl,
          // @ts-ignore
          username: staticTurnUser,
          credential: staticTurnCred
        });
        console.log('Successfully added static TURN credentials');
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ iceServers }));

  } catch (error: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: 'Internal Server Error', details: error.message }));
  }
}
