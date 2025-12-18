
import { supabase } from '../lib/supabaseClient';

export const getMPAccessToken = async (): Promise<string | null> => {
  try {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'mp_access_token')
      .maybeSingle();
    return data?.value || null;
  } catch (err) {
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

    const fullName = payerData.name ? payerData.name.trim() : 'Responsavel';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Atleta';

    return {
        first_name: firstName,
        last_name: lastName,
        email: email,
        identification: {
            type: 'CPF',
            number: payerData.identification.number.replace(/\D/g, '')
        }
    };
};

export const createMPPreference = async (data: CreatePreferenceData): Promise<{ init_point: string, id: string } | null> => {
  const token = await getMPAccessToken();
  if (!token) return null;

  try {
    const payer = sanitizePayer(data.payer);
    const response = await fetch('/api/mp/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        items: [{ title: data.title, quantity: 1, currency_id: 'BRL', unit_price: Number(data.price) }],
        payer: payer,
        external_reference: data.externalReference,
        auto_return: "approved",
        back_urls: { success: window.location.origin, failure: window.location.origin, pending: window.location.origin }
      })
    });

    if (!response.ok) return null;
    const result = await response.json();
    const link = token.startsWith('TEST') ? result.sandbox_init_point : result.init_point;
    return link ? { init_point: link, id: result.id } : null;
  } catch (error) {
    return null;
  }
};

export const createPixPayment = async (data: CreatePreferenceData): Promise<{ qrCode: string, qrCodeBase64: string, id: number } | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;

    try {
        const payer = sanitizePayer(data.payer);
        const response = await fetch('/api/mp/v1/payments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Idempotency-Key': data.externalReference 
            },
            body: JSON.stringify({
                transaction_amount: Number(data.price),
                description: data.title,
                payment_method_id: "pix",
                payer: payer,
                external_reference: data.externalReference
            })
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
      return (result.results && result.results.length > 0) ? result.results[result.results.length - 1].status : 'pending';
    } catch (error) {
      return null;
    }
  };
