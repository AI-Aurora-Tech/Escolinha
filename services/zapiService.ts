
import { supabase } from '../lib/supabaseClient';

export const getZApiCredentials = async (): Promise<{ instanceId: string; token: string } | null> => {
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

    if (instanceData?.value && tokenData?.value) {
        return {
            instanceId: instanceData.value,
            token: tokenData.value
        };
    }
    return null;
  } catch (err) {
    console.error("Error fetching Z-API Credentials", err);
    return null;
  }
};

export const saveZApiCredentials = async (instanceId: string, token: string): Promise<boolean> => {
  try {
    const { error: err1 } = await supabase.from('app_settings').upsert({ key: 'zapi_instance_id', value: instanceId });
    const { error: err2 } = await supabase.from('app_settings').upsert({ key: 'zapi_token', value: token });
    
    return !err1 && !err2;
  } catch (err) {
    console.error("Error saving Z-API Credentials", err);
    return false;
  }
};

export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
    const creds = await getZApiCredentials();
    if (!creds) return false;

    try {
        // Limpar telefone (apenas números)
        const cleanPhone = phone.replace(/\D/g, '');
        // Garantir 55 (Brasil) se não tiver
        const finalPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

        // Usando Proxy configurado no Vite/Vercel
        const response = await fetch(`/api/zapi/instances/${creds.instanceId}/token/${creds.token}/send-text`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Client-Token': creds.token // Alguns endpoints exigem headers extras
            },
            body: JSON.stringify({
                phone: finalPhone,
                message: message
            })
        });

        const data = await response.json();
        // Z-API usually returns { messageId: "..." } or similar on success
        return response.ok;
    } catch (error) {
        console.error("Erro ao enviar Z-API:", error);
        return false;
    }
};
