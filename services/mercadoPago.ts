
import { supabase } from '../lib/supabaseClient';

// Helper to get token from database
export const getMPAccessToken = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'mp_access_token')
      .single();

    if (error || !data) return null;
    return data.value;
  } catch (err) {
    console.error("Error fetching MP Token", err);
    return null;
  }
};

export const saveMPAccessToken = async (token: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'mp_access_token', value: token });
    
    return !error;
  } catch (err) {
    console.error("Error saving MP Token", err);
    return false;
  }
};

interface CreatePreferenceData {
  title: string;
  price: number;
  externalReference: string;
  payer: {
    name: string;
    email: string;
    phone: string;
    identification: { type: string, number: string }
  };
}

// --- HELPERS DE SANITIZAÇÃO ---
const sanitizePayer = (payerData: CreatePreferenceData['payer']) => {
    // 1. Sanitização do Email
    const email = payerData.email && payerData.email.includes('@') 
        ? payerData.email.trim() 
        : 'cliente@naoinformado.com';

    // 2. Separação de Nome e Sobrenome
    const fullName = payerData.name ? payerData.name.trim() : 'Responsável';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'do Aluno';

    // 3. Sanitização do Telefone
    const rawPhone = payerData.phone ? payerData.phone.replace(/\D/g, '') : '';
    let phoneObject = undefined;

    if (rawPhone.length >= 10) {
        const areaCode = rawPhone.substring(0, 2);
        const number = rawPhone.substring(2);
        phoneObject = {
            area_code: areaCode,
            number: number
        };
    }

    const payerPayload: any = {
        first_name: firstName, // Para /v1/payments usa first_name
        last_name: lastName,   // Para /v1/payments usa last_name
        name: firstName,       // Para preferences usa name
        surname: lastName,     // Para preferences usa surname
        email: email,
        identification: {
            type: 'CPF',
            number: payerData.identification.number.replace(/\D/g, '')
        }
    };
    
    return { payerPayload, phoneObject };
};

export const createMPPreference = async (data: CreatePreferenceData): Promise<{ init_point: string, id: string } | null> => {
  const token = await getMPAccessToken();
  if (!token) return null;

  try {
    const { payerPayload, phoneObject } = sanitizePayer(data.payer);
    
    // Ajuste para Preferences API
    const preferencesPayer = {
        name: payerPayload.name,
        surname: payerPayload.surname,
        email: payerPayload.email,
        identification: payerPayload.identification,
        phone: phoneObject
    };

    // USANDO PROXY: /api/mp/... em vez de https://api.mercadopago.com/...
    const response = await fetch('/api/mp/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items: [
          {
            title: data.title,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: Number(data.price)
          }
        ],
        payer: preferencesPayer,
        external_reference: data.externalReference,
        back_urls: {
          success: window.location.origin,
          failure: window.location.origin,
          pending: window.location.origin
        },
        auto_return: "approved"
      })
    });

    const result = await response.json();
    const isSandbox = token.startsWith('TEST');
    const paymentLink = isSandbox ? result.sandbox_init_point : result.init_point;

    if (paymentLink) {
      return { init_point: paymentLink, id: result.id };
    }
    
    console.error("Erro MP (Preferences):", result);
    return null;

  } catch (error) {
    console.error("Error creating preference:", error);
    return null;
  }
};

export const createPixPayment = async (data: CreatePreferenceData): Promise<{ qrCode: string, qrCodeBase64: string, id: number } | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;

    try {
        const { payerPayload } = sanitizePayer(data.payer);

        const body = {
            transaction_amount: Number(data.price),
            description: data.title,
            payment_method_id: "pix",
            payer: {
                email: payerPayload.email,
                first_name: payerPayload.first_name,
                last_name: payerPayload.last_name,
                identification: payerPayload.identification
            },
            external_reference: data.externalReference
        };

        // USANDO PROXY
        const response = await fetch('/api/mp/v1/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Idempotency-Key': data.externalReference 
            },
            body: JSON.stringify(body)
        });

        const result = await response.json();

        if (result.id && result.point_of_interaction) {
            return {
                id: result.id,
                qrCode: result.point_of_interaction.transaction_data.qr_code,
                qrCodeBase64: result.point_of_interaction.transaction_data.qr_code_base64
            };
        }

        console.error("Erro MP (PIX):", result);
        return null;

    } catch (error) {
        console.error("Error creating PIX:", error);
        return null;
    }
};

export const getPaymentStatus = async (paymentId: number | string): Promise<'approved' | 'pending' | 'rejected' | 'cancelled' | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;

    try {
        // USANDO PROXY
        const response = await fetch(`/api/mp/v1/payments/${paymentId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const result = await response.json();
        return result.status;
    } catch (error) {
        return null;
    }
};

export const checkMPPaymentStatus = async (externalReference: string): Promise<'approved' | 'pending' | 'rejected' | 'cancelled' | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;
  
    try {
      // USANDO PROXY
      const response = await fetch(`/api/mp/v1/payments/search?external_reference=${externalReference}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      const result = await response.json();
      
      if (result.results && result.results.length > 0) {
        const lastPayment = result.results[result.results.length - 1];
        return lastPayment.status; 
      }
      
      return 'pending';
  
    } catch (error) {
      console.error("Error checking payment:", error);
      return null;
    }
  };
