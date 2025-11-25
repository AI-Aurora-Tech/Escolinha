import { createClient } from '@supabase/supabase-js';

// ==============================================================================
// CONFIGURAÇÃO DO SUPABASE
// ==============================================================================
// Para resolver o problema da tela branca e conectar ao banco, 
// cole suas credenciais diretamente abaixo, dentro das aspas.
//
// Você encontra esses dados em: Supabase Dashboard > Project Settings > API
// ==============================================================================

const supabaseUrl = 'https://puluknfhkrznoalccszq.supabase.co'; 
// Exemplo: 'https://xyzxyzxyz.supabase.co'

const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1bHVrbmZoa3J6bm9hbGNjc3pxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNTMxNTIsImV4cCI6MjA3OTYyOTE1Mn0.eC_36_nl9Q_yPRFepX09HSqo1IossWuQR-2pkVPezJU';
// Exemplo: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

// ==============================================================================

// Verificação simples para evitar erros se as chaves não forem coladas
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http');
const isValidKey = supabaseAnonKey && supabaseAnonKey.length > 20;

if (!isValidUrl || !isValidKey) {
  console.error('🔴 ERRO CRÍTICO: As chaves do Supabase não foram configuradas no arquivo lib/supabaseClient.ts');
}

export const supabase = createClient(
  isValidUrl ? supabaseUrl : 'https://placeholder.supabase.co', 
  isValidKey ? supabaseAnonKey : 'placeholder'
);