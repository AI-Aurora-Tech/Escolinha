
import { supabase } from '../lib/supabaseClient';

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

export const getZApiConfig = async (): Promise<ZApiConfig | null> => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['zapi_instance_id', 'zapi_token', 'zapi_client_token']);

    if (error || !data || data.length === 0) return null;

    const config: ZApiConfig = {
      instanceId: data.find(i => i.key === 'zapi_instance_id')?.value || '',
      token: data.find(i => i.key === 'zapi_token')?.value || '',
      clientToken: data.find(i => i.key === 'zapi_client_token')?.value || '',
    };

    return config;
  } catch (err) {
    console.error("Erro ao buscar configurações Z-API", err);
    return null;
  }
};

export const saveZApiConfig = async (config: ZApiConfig): Promise<boolean> => {
  try {
    const updates = [
      { key: 'zapi_instance_id', value: config.instanceId },
      { key: 'zapi_token', value: config.token },
      { key: 'zapi_client_token', value: config.clientToken }
    ];

    const { error } = await supabase
      .from('app_settings')
      .upsert(updates);
    
    return !error;
  } catch (err) {
    console.error("Erro ao salvar configurações Z-API", err);
    return false;
  }
};

/**
 * Envia mensagem via Z-API usando as credenciais configuradas.
 * O endpoint usa o proxy /api/zapi para evitar erros de CORS.
 */
export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  const config = await getZApiConfig();
  
  if (!config || !config.instanceId || !config.token) {
    console.warn("Z-API não configurada no Fluxo de Caixa > Configurações.");
    return false;
  }

  // Formata o telefone: remove tudo que não é número e garante o DDI 55
  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone.startsWith('55')) {
    cleanPhone = `55${cleanPhone}`;
  }

  try {
    const url = `/api/zapi/instances/${config.instanceId}/token/${config.token}/send-text`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'client-token': config.clientToken
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: message
      })
    });

    const result = await response.json();
    
    // Z-API retorna um ID de mensagem ou zaapId em caso de sucesso
    return !!(result.messageId || result.zaapId || result.id);
  } catch (error) {
    console.error("Erro ao enviar mensagem via Z-API:", error);
    return false;
  }
};
