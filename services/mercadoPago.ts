
import { supabase } from '../lib/supabaseClient';

// Helper to get token from database
export const getMPAccessToken = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'mp_access_token')
      .maybeSingle();

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

const sanitizePayer = (payerData: CreatePreferenceData['payer']) => {
    const email = payerData.email && payerData.email.includes('@') 
        ? payerData.email.trim() 
        : 'financeiro@martinicaoficial.com';

    const fullName = payerData.name ? payerData.name.trim() : 'Responsável';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Atleta';

    const rawPhone = payerData.phone ? payerData.phone.replace(/\D/g, '') : '';
    let phoneObject = undefined;

    if (rawPhone.length >= 10) {
        phoneObject = {
            area_code: rawPhone.substring(0, 2),
            number: rawPhone.substring(2)
        };
    }

    return {
        first_name: firstName,
        last_name: lastName,
        name: firstName,
        surname: lastName,
        email: email,
        identification: {
            type: 'CPF',
            number: payerData.identification.number.replace(/\D/g, '')
        },
        phone: phoneObject
    };
};

export const createMPPreference = async (data: CreatePreferenceData): Promise<{ init_point: string, id: string } | null> => {
  const token = await getMPAccessToken();
  if (!token) {
    console.warn("Mercado Pago Access Token não configurado.");
    return null;
  }

  try {
    const payer = sanitizePayer(data.payer);

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
        payer: payer,
        external_reference: data.externalReference,
        back_urls: {
          success: window.location.origin,
          failure: window.location.origin,
          pending: window.location.origin
        },
        auto_return: "approved"
      })
    });

    if (!response.ok) {
        const errorDetail = await response.json();
        console.error("Erro na API do Mercado Pago:", errorDetail);
        return null;
    }

    const result = await response.json();
    const paymentLink = token.startsWith('TEST') ? result.sandbox_init_point : result.init_point;

    if (paymentLink) {
      return { init_point: paymentLink, id: result.id };
    }
    return null;
  } catch (error) {
    console.error("Falha ao criar preferência MP:", error);
    return null;
  }
};

export const createPixPayment = async (data: CreatePreferenceData): Promise<{ qrCode: string, qrCodeBase64: string, id: number } | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;

    try {
        const payer = sanitizePayer(data.payer);

        const body = {
            transaction_amount: Number(data.price),
            description: data.title,
            payment_method_id: "pix",
            payer: {
                email: payer.email,
                first_name: payer.first_name,
                last_name: payer.last_name,
                identification: payer.identification
            },
            external_reference: data.externalReference
        };

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
        const response = await fetch(`/api/mp/v1/payments/${paymentId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
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
      const response = await fetch(`/api/mp/v1/payments/search?external_reference=${externalReference}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
  
      const result = await response.json();
      if (result.results && result.results.length > 0) {
        return result.results[result.results.length - 1].status; 
      }
      return 'pending';
    } catch (error) {
      return null;
    }
  };
