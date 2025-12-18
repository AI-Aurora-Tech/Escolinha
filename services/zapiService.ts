
import { supabase } from '../lib/supabaseClient';

export interface ZApiConfig {
  instanceId: string;
  token: string;
  clientToken: string;
}

// Credenciais fornecidas pelo usuário
const ZAPI_CREDENTIALS: ZApiConfig = {
  instanceId: '3EB6A4F6718FF16A5820EE5C3D37D036',
  token: 'F6853E48C5449460DC26476E',
  clientToken: 'F2234c2d4bf674c2dbbc22ba4bb87f518S'
};

export const getZApiConfig = async (): Promise<ZApiConfig> => {
  // Retorna as credenciais fixas conforme solicitado
  return ZAPI_CREDENTIALS;
};

export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  const config = ZAPI_CREDENTIALS;
  
  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
  const targetPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  try {
    const url = `/api/zapi/instances/${config.instanceId}/token/${config.token}/send-text`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'client-token': config.clientToken
      },
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
    // Verifica se a Z-API retornou sucesso (geralmente messageId ou zaapId)
    return !!(result.messageId || result.zaapId || result.id || result.sent);
  } catch (error) {
    console.error("Falha na comunicação com Z-API:", error);
    return false;
  }
};
