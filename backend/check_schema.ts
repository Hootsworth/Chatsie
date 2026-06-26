import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check() {
  try {
    const { data, error } = await supabase.from('meetings').select('*').limit(1);
    if (error) {
      console.error('Error querying meetings:', error);
    } else {
      console.log('Columns in meetings:', Object.keys(data[0] || {}));
    }
  } catch (err: any) {
    console.error('Failed to run check:', err.message);
  }
}

check();
