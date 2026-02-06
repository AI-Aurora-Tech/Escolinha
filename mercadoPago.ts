
import { supabase } from './lib/supabaseClient';

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
    return null;
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
    const email = payerData.email && payerData.email.includes('@') ? payerData.email.trim() : 'cliente@naoinformado.com';
    const fullName = payerData.name ? payerData.name.trim() : 'Responsável';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'do Aluno';
    const rawPhone = payerData.phone ? payerData.phone.replace(/\D/g, '') : '';
    let phoneObject = { area_code: '11', number: '99999999' };
    if (rawPhone.length >= 10) {
        phoneObject = { area_code: rawPhone.substring(0, 2), number: rawPhone.substring(rawPhone.length - 8) };
    }
    const payerPayload = {
        first_name: firstName,
        last_name: lastName,
        name: firstName,
        surname: lastName,
        email: email,
        identification: { type: 'CPF', number: (payerData.identification?.number || '').replace(/\D/g, '') }
    };
    return { payerPayload, phoneObject };
};

export const createMPPreference = async (data: CreatePreferenceData): Promise<{ init_point: string, id: string } | null> => {
  const token = await getMPAccessToken();
  if (!token) return null;
  try {
    const { payerPayload, phoneObject } = sanitizePayer(data.payer);
    const preferencesPayer = { name: payerPayload.name, surname: payerPayload.surname, email: payerPayload.email, identification: payerPayload.identification, phone: phoneObject };
    const response = await fetch('/api/mp/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ title: data.title.substring(0, 250), quantity: 1, currency_id: 'BRL', unit_price: Number(data.price) }],
        payer: preferencesPayer,
        external_reference: data.externalReference,
        back_urls: { success: window.location.origin, failure: window.location.origin, pending: window.location.origin },
        auto_return: "approved"
      })
    });
    if (!response.ok) return null;
    const result = await response.json();
    const isSandbox = token.startsWith('TEST');
    const paymentLink = isSandbox ? result.sandbox_init_point : result.init_point;
    return paymentLink ? { init_point: paymentLink, id: result.id } : null;
  } catch (error) { return null; }
};

export const createPixPayment = async (data: CreatePreferenceData): Promise<{ qrCode: string, qrCodeBase64: string, id: number } | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;
    try {
        const { payerPayload } = sanitizePayer(data.payer);
        const response = await fetch('/api/mp/v1/payments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Idempotency-Key': data.externalReference },
            body: JSON.stringify({
                transaction_amount: Number(data.price),
                description: data.title.substring(0, 250),
                payment_method_id: "pix",
                payer: { email: payerPayload.email, first_name: payerPayload.first_name, last_name: payerPayload.last_name, identification: payerPayload.identification },
                external_reference: data.externalReference
            })
        });
        if (!response.ok) return null;
        const result = await response.json();
        if (result.id && result.point_of_interaction) {
            return { id: result.id, qrCode: result.point_of_interaction.transaction_data.qr_code, qrCodeBase64: result.point_of_interaction.transaction_data.qr_code_base64 };
        }
        return null;
    } catch (error) { return null; }
};

export const checkMPPaymentStatus = async (externalReference: string): Promise<'approved' | 'pending' | 'rejected' | 'cancelled' | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;
    try {
      const response = await fetch(`/api/mp/v1/payments/search?external_reference=${externalReference}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
      });
      if (!response.ok) return null;
      const result = await response.json();
      if (result && result.results && result.results.length > 0) {
        return result.results[result.results.length - 1].status;
      }
      return 'pending';
    } catch (error) { return null; }
  };
