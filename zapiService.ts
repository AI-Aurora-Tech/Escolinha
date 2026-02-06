
import { supabase } from './lib/supabaseClient';

export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  try {
    const { data: settings, error } = await supabase.from('app_settings').select('*');
    if (error || !settings) return false;
    const instanceId = settings.find(s => s.key === 'zapi_instance_id')?.value;
    const instanceToken = settings.find(s => s.key === 'zapi_token')?.value;
    const clientToken = settings.find(s => s.key === 'zapi_client_token')?.value;
    if (!instanceId || !instanceToken) return false;
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken || '' },
      body: JSON.stringify({ phone: `55${phone.replace(/\D/g, '')}`, message: message })
    });
    return response.ok;
  } catch (err) { return false; }
};

export const sendZApiDocument = async (phone: string, base64: string, fileName: string): Promise<boolean> => {
  try {
    const { data: settings, error } = await supabase.from('app_settings').select('*');
    if (error || !settings) return false;
    const instanceId = settings.find(s => s.key === 'zapi_instance_id')?.value;
    const instanceToken = settings.find(s => s.key === 'zapi_token')?.value;
    const clientToken = settings.find(s => s.key === 'zapi_client_token')?.value;
    if (!instanceId || !instanceToken) return false;
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${instanceToken}/send-document-64`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'client-token': clientToken || '' },
      body: JSON.stringify({ phone: `55${phone.replace(/\D/g, '')}`, document: base64, extension: 'pdf', fileName: fileName })
    });
    return response.ok;
  } catch (err) { return false; }
};
