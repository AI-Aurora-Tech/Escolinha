import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_string: `
      ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS ask_transport boolean DEFAULT false;
      ALTER TABLE public.activity_rsvps ADD COLUMN IF NOT EXISTS transport_option text;
    `
  });

  if (error) {
    console.error('Error adding columns:', error);
  } else {
    console.log('Successfully added transport columns');
  }
}

run();
