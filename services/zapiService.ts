
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
      .single();

    const { data: tokenData } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'zapi_token')
      .single();

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
    console.warn("Z-API não configurada: ID ou Token ausentes.");
    return false;
  }

  // Limpeza robusta: remove tudo que não é dígito e remove o zero inicial se houver (ex: 011 -> 11)
  let cleanPhone = phone.replace(/\D/g, '');
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

    const result = await response.json();
    
    if (result.messageId || result.id) {
      return true;
    } else {
      console.error("Z-API recusou o envio:", result);
      return false;
    }
  } catch (error) {
    console.error("Falha na requisição para Z-API (verifique o Proxy/CORS):", error);
    return false;
  }
};
