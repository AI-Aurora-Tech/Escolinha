import express from 'express';
import { createServer as createViteServer } from 'vite';
import { supabase } from './src/lib/supabaseClient';
import { PaymentStatus } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Webhook endpoint for Mercado Pago
  app.post('/api/mp-webhook', async (req, res) => {
    const notification = req.body;

    if (notification.type === 'payment') {
        const paymentId = notification.data.id;

        try {
            // You should fetch the payment details from Mercado Pago API for security
            // For this example, we'll trust the notification for simplicity
            // const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { ... });
            // const payment = await paymentResponse.json();

            // Let's assume we get external_reference from a trusted source or the full payment object
            // This is a simplified example. In production, you'd get the full payment info.
            // const externalReference = payment.external_reference;
            
            // Since the webhook doesn't directly give us the external_reference, 
            // we need a different strategy. A better approach is to query transactions by preference_id if available
            // or have a more complex lookup. 
            // For now, let's assume we can find the transaction via a payment ID stored somewhere, 
            // or we adjust our logic to store preference_id from MercadoPago.

            // A more realistic scenario based on what we have:
            // The notification doesn't give us our internal transaction ID or external_reference directly.
            // We will need to have stored the Mercado Pago preference_id when we created the payment link.
            // Let's assume we have it. The notification would be for a preference, and we'd look up by that.
            // This part of the logic is complex without the exact webhook payload structure from MP.

            // Let's simulate a lookup based on what we *do* have: external_reference.
            // The webhook would need to be configured to send us this, or we'd fetch the payment by ID to get it.
            // Let's assume a hypothetical direct update for now.
            // In a real app, you'd fetch the payment from MP to get the external_reference.
            const { data: paymentData } = await getPaymentFromMercadoPago(paymentId);

            if (paymentData && paymentData.external_reference && paymentData.status === 'approved') {
                const { data: updatedTx, error } = await supabase
                    .from('transactions')
                    .update({
                        status: PaymentStatus.PAID,
                        payment_date: new Date().toISOString(),
                    })
                    .eq('external_reference', paymentData.external_reference)
                    .select();

                if (error) {
                    console.error('Error updating transaction from webhook:', error);
                }
            }

        } catch (error) {
            console.error('Error processing Mercado Pago webhook:', error);
            return res.status(500).send('Webhook processing error');
        }
    }

    res.status(200).send('OK');
  });

  // This function would interact with Mercado Pago's API
  async function getPaymentFromMercadoPago(paymentId: string) {
      // IMPORTANT: Replace with your actual Mercado Pago Access Token
      const accessToken = process.env.MP_ACCESS_TOKEN;
      if (!accessToken) {
          console.error('Mercado Pago Access Token is not configured.');
          return { data: null };
      }

      const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
      try {
          const response = await fetch(url, {
              headers: {
                  'Authorization': `Bearer ${accessToken}`
              }
          });
          if (!response.ok) {
              throw new Error(`Mercado Pago API responded with status: ${response.status}`);
          }
          const data = await response.json();
          return { data };
      } catch (error) {
          console.error('Failed to fetch payment from Mercado Pago:', error);
          return { data: null };
      }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
