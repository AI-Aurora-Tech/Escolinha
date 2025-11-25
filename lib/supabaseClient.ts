import { createClient } from '@supabase/supabase-js';

// Função auxiliar para acessar variáveis de ambiente de forma segura
// Isso previne o erro "process is not defined" em navegadores
const getEnv = (key: string) => {
  // 1. Tenta acessar via import.meta.env (Padrão Vite/ESM)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  // 2. Tenta acessar via process.env de forma segura (Padrão Node/Webpack)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return null;
};

// Define URLs padrão de fallback para evitar crash na inicialização se as chaves não existirem
const supabaseUrl = getEnv('VITE_SUPABASE_URL') || 'https://placeholder-project.supabase.co';
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || 'placeholder-key';

// Aviso no console para facilitar debugging
if (!getEnv('VITE_SUPABASE_URL')) {
  console.warn('⚠️ Supabase keys not found. App is running in placeholder mode. Database operations will fail or return mock data.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);