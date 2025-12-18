
import { supabase } from '../lib/supabaseClient';

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken?: string;
}

export const getZApiConfig = async (): Promise<ZApiConfig | null> => {
  try {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['zapi_instance_id', 'zapi_token', 'zapi_client_token']);

    if (!settings || settings.length < 2) return null;

    const config: any = {};
    settings.forEach(s => {
      if (s.key === 'zapi_instance_id') config.instanceId = s.value;
      if (s.key === 'zapi_token') config.token = s.value;
      if (s.key === 'zapi_client_token') config.clientToken = s.value;
    });

    if (!config.instanceId || !config.token) return null;

    return config as ZApiConfig;
  } catch (err) {
    console.error("Erro ao ler config Z-API:", err);
    return null;
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
  
  if (!config) {
    console.warn("Z-API não configurada completamente.");
    return false;
  }

  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
  const targetPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  try {
    // CRITICAL: Headers de permissão conforme solicitado pela equipe Z-API
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    if (config.clientToken) {
      // Alguns proxies exigem estritamente minúsculas
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
        console.error(`Z-API Falha (Status ${response.status}):`, errorText);
        return false;
    }

    const result = await response.json();
    
    // Verificação de sucesso flexível para diferentes versões da API
    return !!(
      result.messageId || 
      result.zaapId || 
      result.id ||
      result.status === 'success' || 
      result.sent === true
    );
  } catch (error) {
    console.error("Erro de conexão com Z-API:", error);
    return false;
  }
};
