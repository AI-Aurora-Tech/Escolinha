
import { supabase } from '../lib/supabaseClient';

/**
 * Envia uma mensagem de texto via Z-API utilizando as credenciais salvas no banco.
 * @param phone Telefone do destinatário (apenas números, com DDD)
 * @param message Texto da mensagem
 * @returns boolean Sucesso ou falha no disparo
 */
export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  try {
    // Busca as configurações da Z-API no Supabase
    const { data: settings, error } = await supabase
      .from('app_settings')
      .select('*');

    if (error || !settings) {
      console.error('Erro ao buscar configurações da Z-API:', error);
      return false;
    }

    const instanceId = settings.find(s => s.key === 'zapi_instance_id')?.value;
    const instanceToken = settings.find(s => s.key === 'zapi_token')?.value;
    const clientToken = settings.find(s => s.key === 'zapi_client_token')?.value;

    // Verifica se as credenciais mínimas existem
    if (!instanceId || !instanceToken) {
      console.warn('Configurações da Z-API incompletas no sistema.');
      return false;
    }

    // Utiliza o proxy configurado em vite.config.ts / vercel.json
    const url = `/api/zapi/instances/${instanceId}/token/${instanceToken}/send-text`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client-token': clientToken || ''
      },
      body: JSON.stringify({
        phone: `55${phone.replace(/\D/g, '')}`, // Garante o DDI 55 (Brasil)
        message: message
      })
    });

    const result = await response.json();
    
    // Z-API costuma retornar o ID da mensagem em caso de sucesso
    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Z-API:', err);
    return false;
  }
};
