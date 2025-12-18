
import { supabase } from '../lib/supabaseClient';

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken?: string;
}

// Credenciais fixas fornecidas pelo usuário
const DEFAULT_CONFIG: ZApiConfig = {
  instanceId: '3EB6A4F6718FF16A5820EE5C3D37D036',
  token: 'F6853E48C5449460DC26476E',
  clientToken: 'F2234c2d4bf674c2dbbc22ba4bb87f518S'
};

export const getZApiConfig = async (): Promise<ZApiConfig | null> => {
  try {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['zapi_instance_id', 'zapi_token', 'zapi_client_token']);

    // Se houver no banco, usa as do banco, senão usa as fornecidas
    const config: any = { ...DEFAULT_CONFIG };
    
    if (settings && settings.length >= 2) {
        settings.forEach(s => {
          if (s.key === 'zapi_instance_id' && s.value) config.instanceId = s.value;
          if (s.key === 'zapi_token' && s.value) config.token = s.value;
          if (s.key === 'zapi_client_token' && s.value) config.clientToken = s.value;
        });
    }

    return config as ZApiConfig;
  } catch (err) {
    return DEFAULT_CONFIG;
  }
};

export const saveZApiConfig = async (config: ZApiConfig): Promise<boolean> => {
  try {
    const upserts = [
      { key: 'zapi_instance_id', value: config.instanceId },
      { key: 'zapi_token', value: config.token }
    ];
    
    if (config.clientToken !== undefined) {
      upserts.push({ key: 'zapi_client_token', value: config.clientToken });
    }

    const { error } = await supabase.from('app_settings').upsert(upserts);
    return !error;
  } catch (err) {
    return false;
  }
};

export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  const config = await getZApiConfig();
  
  if (!config) return false;

  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
  const targetPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (config.clientToken) {
      headers['client-token'] = config.clientToken;
    }

    const url = `/api/zapi/instances/${config.instanceId}/token/${config.token}/send-text`;

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        phone: targetPhone,
        message: message
      })
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Z-API Erro (${response.status}):`, errorText);
        return false;
    }

    const result = await response.json();
    return !!(result.messageId || result.zaapId || result.id || result.sent);
  } catch (error) {
    console.error("Erro ao enviar mensagem Z-API:", error);
    return false;
  }
};
