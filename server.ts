import express from 'express';
import { createServer as createViteServer } from 'vite';
import { supabase } from './lib/supabaseClient';
import { PaymentStatus } from './types';
import { sendZApiMessage } from './services/zapiService';

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

  // --- API ROUTER --- //
  const apiRouter = express.Router();

  // Endpoint to serve logs
  apiRouter.get('/logs', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(serverLogs);
  });

  // Webhook endpoint for Mercado Pago
  apiRouter.post('/mp-webhook', async (req, res) => {
    console.log('--- [MP Webhook] Received Notification ---');
    const notification = req.body;

    // Mercado Pago sends notifications for 'payment' and 'merchant_order'
    // We are interested in 'payment'
    if (notification.type === 'payment' || notification.action?.startsWith('payment.')) {
        const paymentId = notification.data?.id || notification.id;
        if (!paymentId) return res.status(200).send('OK');

        console.log(`[MP Webhook] Processing payment ID: ${paymentId}`);

        try {
            const token = await getMPAccessToken();
            if (!token) {
                console.error('[MP Webhook] MP Access Token not found in database.');
                return res.status(200).send('OK');
            }

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.error(`[MP Webhook] MP API Error: ${response.status}`);
                return res.status(200).send('OK');
            }

            const paymentData = await response.json();
            const { external_reference, status } = paymentData;

            if (external_reference && status === 'approved') {
                console.log(`[MP Webhook] Payment approved for ref: ${external_reference}`);

                // Update transaction in Supabase
                const { data: updatedTxs, error: updateError } = await supabase
                    .from('transactions')
                    .update({
                        status: PaymentStatus.PAID,
                        payment_date: new Date().toISOString().split('T')[0],
                    })
                    .eq('external_reference', external_reference)
                    .select();

                if (updateError) {
                    console.error('[MP Webhook] Error updating DB:', updateError);
                } else if (updatedTxs && updatedTxs.length > 0) {
                    console.log(`[MP Webhook] ${updatedTxs.length} transactions updated successfully.`);
                    
                    // Send WhatsApp confirmation
                    for (const tx of updatedTxs) {
                        if (tx.student_id) {
                            const { data: student } = await supabase
                                .from('students')
                                .select('name, guardian')
                                .eq('id', tx.student_id)
                                .single();
                            
                            if (student && student.guardian?.phone) {
                                const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\nConfirmamos o recebimento do pagamento do atleta *${student.name}* via Mercado Pago:\n\n📌 *${tx.description}*\n💰 Valor: *R$ ${tx.amount.toFixed(2)}*\n\nObrigado! Garotos do Martinica.`;
                                await sendZApiMessage(student.guardian.phone, msg);
                            }
                        }
                    }
                }
            } else {
                console.log(`[MP Webhook] Payment status: ${status} for ref: ${external_reference}`);
            }
        } catch (error) {
            console.error('[MP Webhook] Exception:', error);
        }
    }

    res.status(200).send('OK');
  });

  async function getMPAccessToken() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'mp_access_token').single();
    return data?.value || null;
  }

  // Mount the API router
  app.use('/api', apiRouter);

  // Vite middleware should be the last thing to run
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
