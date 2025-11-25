import { createClient } from '@supabase/supabase-js';

// Access environment variables. 
// We use fallback values to prevent the application from crashing if keys are missing.
// In a real scenario, these must be set in .env or Vercel settings.

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

if (!import.meta.env?.VITE_SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  console.warn('Supabase keys are missing. The app is running in placeholder mode. Data will not be saved.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
