
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

    if (error || !data) return null;

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
