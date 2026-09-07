import { supabase } from '../lib/supabaseClient';

// ============================================================================
// Integração de WhatsApp via EVOLUTION API (v2).
// Os nomes das funções foram mantidos (sendZApiMessage/Poll/Document) para não
// impactar os pontos de chamada; internamente agora usam a Evolution API.
//
// Configuração (tabela app_settings), definida na tela Financeiro:
//   - evolution_base_url : URL base da Evolution (ex.: https://sua-evolution.com)
//   - evolution_instance : nome da instância
//   - evolution_apikey   : API Key (header "apikey")
// ============================================================================

interface EvolutionConfig {
  baseUrl: string;
  instance: string;
  apikey: string;
}

const getEvolutionConfig = async (): Promise<EvolutionConfig | null> => {
  const { data: settings, error } = await supabase.from('app_settings').select('*');
  if (error || !settings) return null;

  const baseUrlRaw = settings.find(s => s.key === 'evolution_base_url')?.value || '';
  const instance = settings.find(s => s.key === 'evolution_instance')?.value || '';
  const apikey = settings.find(s => s.key === 'evolution_apikey')?.value || '';

  if (!baseUrlRaw || !instance || !apikey) return null;

  const baseUrl = baseUrlRaw.replace(/\/+$/, ''); // remove barra(s) final(is)
  return { baseUrl, instance, apikey };
};

// Número no formato esperado pela Evolution: apenas dígitos, com DDI 55.
const toEvolutionNumber = (phone: string) => `55${phone.replace(/\D/g, '')}`;

/**
 * Envia uma mensagem de texto via Evolution API.
 */
export const sendZApiMessage = async (phone: string, message: string): Promise<boolean> => {
  try {
    const cfg = await getEvolutionConfig();
    if (!cfg) return false;

    const response = await fetch(`${cfg.baseUrl}/message/sendText/${cfg.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apikey
      },
      body: JSON.stringify({
        number: toEvolutionNumber(phone),
        text: message
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Evolution (texto):', err);
    return false;
  }
};

/**
 * Envia uma enquete (poll) via Evolution API.
 */
export const sendZApiPoll = async (phone: string, name: string, options: string[], selectableOptionsCount: number = 1): Promise<boolean> => {
  try {
    const cfg = await getEvolutionConfig();
    if (!cfg) return false;

    const response = await fetch(`${cfg.baseUrl}/message/sendPoll/${cfg.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apikey
      },
      body: JSON.stringify({
        number: toEvolutionNumber(phone),
        name: name,
        selectableCount: selectableOptionsCount,
        values: options
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Evolution (enquete):', err);
    return false;
  }
};

/**
 * Envia um documento (PDF em Base64) via Evolution API.
 */
export const sendZApiDocument = async (phone: string, base64: string, fileName: string): Promise<boolean> => {
  try {
    const cfg = await getEvolutionConfig();
    if (!cfg) return false;

    // A Evolution aceita o base64 puro (sem o prefixo data:...;base64,).
    const media = base64.includes(',') ? base64.split(',')[1] : base64;

    const response = await fetch(`${cfg.baseUrl}/message/sendMedia/${cfg.instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.apikey
      },
      body: JSON.stringify({
        number: toEvolutionNumber(phone),
        mediatype: 'document',
        mimetype: 'application/pdf',
        media: media,
        fileName: fileName
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Erro de conexão Evolution (documento):', err);
    return false;
  }
};
