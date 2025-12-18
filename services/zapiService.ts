
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
    console.error("Erro ao ler config Z-API:", err);
    return null;
  }
};

export const saveZApiConfig = async (config: ZApiConfig): Promise<boolean> => {
  try {
    await supabase.from('app_settings').upsert({ key: 'zapi_instance_id', value: config.instanceId });
    await supabase.from('app_settings').upsert({ key: 'zapi_token', value: config.token });
    return true;
  } catch (err) {
    return false;
  }
};

export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  const config = await getZApiConfig();
  
  // Se não houver configuração, retorna false para o frontend abrir o WhatsApp manual
  if (!config) {
    console.warn("Z-API não configurada nas definições do sistema.");
    return false;
  }

  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
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
        const errLog = await response.text();
        console.error("Z-API erro na resposta:", errLog);
        return false;
    }

    const result = await response.json();
    return !!(result.messageId || result.id);
  } catch (error) {
    console.error("Falha na comunicação com o proxy Z-API:", error);
    return false;
  }
};
