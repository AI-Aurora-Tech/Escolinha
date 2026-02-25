import express from 'express';
import { createServer as createViteServer } from 'vite';
import { supabase } from './src/lib/supabaseClient';
import { PaymentStatus } from './src/types';

// Store logs in memory
let serverLogs: string[] = [];
const originalLog = console.log;
console.log = (...args: any[]) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  serverLogs.push(`[${new Date().toISOString()}] ${message}`);
  if (serverLogs.length > 100) { // Keep only the last 100 logs
    serverLogs.shift();
  }
  originalLog.apply(console, args);
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // New endpoint to serve logs
  app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(serverLogs);
  });

  // Webhook endpoint for Mercado Pago
  app.post('/api/mp-webhook', async (req, res) => {
    console.log('--- [MP Webhook] Received Notification ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    const notification = req.body;

    if (notification.type === 'payment' && notification.data?.id) {
        const paymentId = notification.data.id;
        console.log(`[MP Webhook] Processing payment ID: ${paymentId}`);

        try {
            const { data: paymentData } = await getPaymentFromMercadoPago(paymentId);
            console.log('[MP Webhook] Fetched Payment Data from MP:', JSON.stringify(paymentData, null, 2));

            if (paymentData && paymentData.external_reference && paymentData.status === 'approved') {
                console.log(`[MP Webhook] Payment approved for external_reference: ${paymentData.external_reference}. Updating database...`);
                
                const { data: updatedTx, error } = await supabase
                    .from('transactions')
                    .update({
                        status: PaymentStatus.PAID,
                        payment_date: new Date().toISOString().split('T')[0], // Use YYYY-MM-DD
                    })
                    .eq('external_reference', paymentData.external_reference)
                    .select();

                if (error) {
                    console.error('[MP Webhook] Error updating transaction from webhook:', error);
                } else {
                    console.log('[MP Webhook] Database update successful for:', updatedTx);
                }
            } else {
                console.log('[MP Webhook] Payment not ready for processing or missing data. Status:', paymentData?.status);
            }

        } catch (error) {
            console.error('[MP Webhook] Error processing Mercado Pago webhook:', error);
            return res.status(500).send('Webhook processing error');
        }
    } else {
        console.log('[MP Webhook] Notification received, but it was not a valid payment notification.');
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
