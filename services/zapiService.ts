
import { supabase } from '../lib/supabaseClient';

/**
 * Envia uma mensagem de texto via Z-API utilizando as credenciais salvas no banco.
 */
export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  try {
    const { data: settings, error } = await supabase.from('app_settings').select('*');
    if (error || !settings) return false;

    const instanceId = settings.find(s => s.key === 'zapi_instance_id')?.value;
    const instanceToken = settings.find(s => s.key === 'zapi_token')?.value;
    const clientToken = settings.find(s => s.key === 'zapi_client_token')?.value;

    if (!instanceId || !instanceToken) return false;

    const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client-token': clientToken || ''
      },
      body: JSON.stringify({
        phone: `55${phone.replace(/\D/g, '')}`,
        message: message
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Z-API:', err);
    return false;
  }
};

/**
 * Envia um documento PDF via Z-API utilizando Base64.
 */
export const sendZApiPoll = async (phone: string, name: string, options: string[], selectableOptionsCount: number = 1): Promise<boolean> => {
  try {
    const { data: settings, error } = await supabase.from('app_settings').select('*');
    if (error || !settings) return false;

    const instanceId = settings.find(s => s.key === 'zapi_instance_id')?.value;
    const instanceToken = settings.find(s => s.key === 'zapi_token')?.value;
    const clientToken = settings.find(s => s.key === 'zapi_client_token')?.value;

    if (!instanceId || !instanceToken) return false;

    const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-poll`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client-token': clientToken || ''
      },
      body: JSON.stringify({
        phone: `55${phone.replace(/\D/g, '')}`,
        name: name,
        options: options,
        selectableOptionsCount: selectableOptionsCount
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Z-API ao enviar enquete:', err);
    return false;
  }
};
/**
 * Envia um documento PDF via Z-API utilizando Base64.
 */
export const sendZApiDocument = async (phone: string, base64: string, fileName: string): Promise<boolean> => {
  try {
    const { data: settings, error } = await supabase.from('app_settings').select('*');
    if (error || !settings) return false;

    const instanceId = settings.find(s => s.key === 'zapi_instance_id')?.value;
    const instanceToken = settings.find(s => s.key === 'zapi_token')?.value;
    const clientToken = settings.find(s => s.key === 'zapi_client_token')?.value;

    if (!instanceId || !instanceToken) return false;

    const url = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-document-64`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client-token': clientToken || ''
      },
      body: JSON.stringify({
        phone: `55${phone.replace(/\D/g, '')}`,
        document: base64,
        extension: 'pdf',
        fileName: fileName
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Z-API ao enviar documento:', err);
    return false;
  }
};
