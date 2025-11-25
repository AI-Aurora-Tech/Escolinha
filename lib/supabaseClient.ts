import { createClient } from '@supabase/supabase-js';

// ==============================================================================
// CONFIGURAÇÃO DO SUPABASE
// ==============================================================================

const supabaseUrl = 'https://puluknfhkrznoalccszq.supabase.co'; 
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bHVrbmZoa3J6bm9hbGNjc3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNTMxNTIsImV4cCI6MjA3OTYyOTE1Mn0.eC_36_nl9Q_yPRFepX09HSqo1IossWuQR-2pkVPezJU';

// ==============================================================================

// Fallback seguro para evitar crash do app se as chaves estiverem vazias ou inválidas
const safeUrl = (supabaseUrl && supabaseUrl.startsWith('http')) 
  ? supabaseUrl 
  : 'https://placeholder.supabase.co';

const safeKey = (supabaseAnonKey && supabaseAnonKey.length > 20) 
  ? supabaseAnonKey 
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJhbm9uIn0.placeholder';

export const supabase = createClient(safeUrl, safeKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});