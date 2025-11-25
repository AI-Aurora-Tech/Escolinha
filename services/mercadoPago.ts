
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

export const createMPPreference = async (data: CreatePreferenceData): Promise<{ init_point: string, id: string } | null> => {
  const token = await getMPAccessToken();
  if (!token) return null;

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
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
            unit_price: data.price
          }
        ],
        payer: {
            name: data.payer.name,
            email: data.payer.email || 'email@naoinformado.com',
            phone: {
                area_code: data.payer.phone.substring(0, 2),
                number: data.payer.phone.substring(2)
            }
        },
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
    if (result.init_point) {
      return { init_point: result.init_point, id: result.id };
    }
    console.error("MP Error:", result);
    return null;

  } catch (error) {
    console.error("Error creating preference:", error);
    return null;
  }
};

export const checkMPPaymentStatus = async (externalReference: string): Promise<'approved' | 'pending' | 'rejected' | null> => {
    const token = await getMPAccessToken();
    if (!token) return null;
  
    try {
      // Search payment by external_reference
      const response = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${externalReference}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
  
      const result = await response.json();
      
      if (result.results && result.results.length > 0) {
        // Check the most recent payment
        const lastPayment = result.results[result.results.length - 1];
        return lastPayment.status; // approved, pending, rejected
      }
      
      return 'pending'; // No payment found yet
  
    } catch (error) {
      console.error("Error checking payment:", error);
      return null;
    }
  };
