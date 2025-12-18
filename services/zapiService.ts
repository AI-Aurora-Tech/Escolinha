
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // CRITICAL: Algumas instâncias da Z-API exigem o Client-Token para permissão
    if (config.clientToken) {
      headers['client-token'] = config.clientToken;
    }

    const response = await fetch(`/api/zapi/instances/${config.instanceId}/token/${config.token}/send-text`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        phone: targetPhone,
        message: message
      })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Z-API erro detalhado:", errorData);
        return false;
    }

    const result = await response.json();
    
    // Verificação robusta de sucesso
    return !!(
      result.messageId || 
      result.id || 
      result.zaapId || 
      result.status === 'success' || 
      result.sent === true
    );
  } catch (error) {
    console.error("Falha física na comunicação com Z-API (CORS ou Rede):", error);
    return false;
  }
};
