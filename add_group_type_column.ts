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
      ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS type text DEFAULT 'TRAINING';
    `
  });

  if (error) {
    console.error('Error adding type column:', error);
  } else {
    console.log('Successfully added type column to groups table');
  }
}

run();
