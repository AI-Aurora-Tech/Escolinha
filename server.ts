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

  // --- WEBHOOK MERCADO PAGO (RAIZ PARA EVITAR 302) ---
  app.get('/api/mp-webhook', (req, res) => {
    res.status(200).send('Webhook endpoint is active. Use POST for notifications.');
  });

  app.post('/api/mp-webhook', async (req, res) => {
    console.log('--- [MP Webhook] Notificação Recebida ---');
    const notification = req.body;
    console.log('[MP Webhook] Payload:', JSON.stringify(notification));

    if (notification.type === 'payment' || notification.action?.startsWith('payment.')) {
        const paymentId = notification.data?.id || notification.id;
        if (!paymentId) return res.status(200).send('OK');

        try {
            const token = await getMPAccessToken();
            if (!token) {
                console.error('[MP Webhook] Erro: Token não encontrado.');
                return res.status(200).send('OK');
            }

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.error(`[MP Webhook] Erro API MP: ${response.status}`);
                return res.status(200).send('OK');
            }

            const paymentData = await response.json();
            const { external_reference, status } = paymentData;

            if (external_reference && status === 'approved') {
                const { data: updatedTxs, error: updateError } = await supabase
                    .from('transactions')
                    .update({
                        status: PaymentStatus.PAID,
                        payment_date: new Date().toISOString().split('T')[0],
                    })
                    .eq('external_reference', external_reference)
                    .select();

                if (!updateError && updatedTxs && updatedTxs.length > 0) {
                    for (const tx of updatedTxs) {
                        if (tx.student_id) {
                            const { data: student } = await supabase.from('students').select('name, guardian').eq('id', tx.student_id).single();
                            if (student?.guardian?.phone) {
                                const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\nConfirmamos o recebimento do pagamento do atleta *${student.name}* via Mercado Pago:\n\n📌 *${tx.description}*\n💰 Valor: *R$ ${tx.amount.toFixed(2)}*\n\nObrigado! Garotos do Martinica.`;
                                await sendZApiMessage(student.guardian.phone, msg);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[MP Webhook] Exceção:', error);
        }
    }
    res.status(200).send('OK');
  });

  // --- API ROUTER --- //
  const apiRouter = express.Router();

  async function getMPAccessToken() {
    // Tenta primeiro a variável de ambiente (configurada no painel do AI Studio)
    if (process.env.MP_ACCESS_TOKEN) return process.env.MP_ACCESS_TOKEN;
    
    // Se não houver, tenta buscar no banco de dados
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'mp_access_token').maybeSingle();
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
