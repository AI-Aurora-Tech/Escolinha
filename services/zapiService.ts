
import { supabase } from '../lib/supabaseClient';

export interface ZApiConfig {
  instanceId: string;
  token: string;
}

export const getZApiConfig = async (): Promise<ZApiConfig | null> => {
  try {
    const { data: instanceData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'zapi_instance_id')
      .maybeSingle();

    const { data: tokenData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'zapi_token')
      .maybeSingle();

    if (!instanceData?.value || !tokenData?.value) return null;

    return {
      instanceId: instanceData.value,
      token: tokenData.value
    };
  } catch (err) {
    console.error("Erro ao buscar configurações Z-API no Supabase:", err);
    return null;
  }
};

export const saveZApiConfig = async (config: ZApiConfig): Promise<boolean> => {
  try {
    const { error: err1 } = await supabase
      .from('app_settings')
      .upsert({ key: 'zapi_instance_id', value: config.instanceId });
    
    const { error: err2 } = await supabase
      .from('app_settings')
      .upsert({ key: 'zapi_token', value: config.token });
    
    return !err1 && !err2;
  } catch (err) {
    console.error("Erro ao salvar configurações Z-API:", err);
    return false;
  }
};

export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  const config = await getZApiConfig();
  if (!config) {
    console.warn("Z-API não configurada no sistema.");
    return false;
  }

  // Limpeza do telefone: remove tudo que não é número
  let cleanPhone = phone.replace(/\D/g, '');
  
  // Remove o zero à esquerda do DDD se o usuário tiver digitado (ex: 011 -> 11)
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  // Z-API espera o formato 55 + DDD + Número
  const targetPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  try {
    const response = await fetch(`/api/zapi/instances/${config.instanceId}/token/${config.token}/send-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: targetPhone,
        message: message
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Erro retornado pela Z-API:", errorData);
      return false;
    }

    const result = await response.json();
    return !!(result.messageId || result.id);
  } catch (error) {
    console.error("Falha de rede ao tentar comunicar com Z-API via Proxy:", error);
    return false;
  }
};
