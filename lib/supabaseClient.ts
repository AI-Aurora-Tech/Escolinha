
import { createClient } from '@supabase/supabase-js';

// Access environment variables. 
// In Vite (which is likely the underlying bundler), we use import.meta.env.
// However, to ensure compatibility if process.env is used, we check both.

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key is missing. Please check your environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). Application will not persist data correctly.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
