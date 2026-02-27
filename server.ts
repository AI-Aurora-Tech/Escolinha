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
    console.log('--- [MP Webhook] Notificação Recebida ---');
    const notification = req.body;
    console.log('[MP Webhook] Payload:', JSON.stringify(notification));

    // Mercado Pago envia notificações de 'payment' ou 'merchant_order'
    if (notification.type === 'payment' || notification.action?.startsWith('payment.')) {
        const paymentId = notification.data?.id || notification.id;
        
        if (!paymentId) {
            console.log('[MP Webhook] ID de pagamento não encontrado no payload.');
            return res.status(200).send('OK');
        }

        console.log(`[MP Webhook] Processando Pagamento ID: ${paymentId}`);

        try {
            const token = await getMPAccessToken();
            if (!token) {
                console.error('[MP Webhook] ERRO: Access Token do Mercado Pago não configurado (env ou DB).');
                return res.status(200).send('OK');
            }

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.error(`[MP Webhook] Erro na API do Mercado Pago: ${response.status}`);
                return res.status(200).send('OK');
            }

            const paymentData = await response.json();
            const { external_reference, status, status_detail } = paymentData;

            console.log(`[MP Webhook] Status do Pagamento: ${status} (${status_detail}) | Ref: ${external_reference}`);

            if (external_reference && status === 'approved') {
                console.log(`[MP Webhook] ✅ Pagamento APROVADO. Atualizando banco de dados...`);

                const { data: updatedTxs, error: updateError } = await supabase
                    .from('transactions')
                    .update({
                        status: PaymentStatus.PAID,
                        payment_date: new Date().toISOString().split('T')[0],
                    })
                    .eq('external_reference', external_reference)
                    .select();

                if (updateError) {
                    console.error('[MP Webhook] Erro ao atualizar transação no Supabase:', updateError);
                } else if (updatedTxs && updatedTxs.length > 0) {
                    console.log(`[MP Webhook] Sucesso: ${updatedTxs.length} transação(ões) baixada(s).`);
                    
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
                } else {
                    console.log(`[MP Webhook] Nenhuma transação encontrada com a referência: ${external_reference}`);
                }
            }
        } catch (error) {
            console.error('[MP Webhook] Exceção ao processar webhook:', error);
        }
    }

    res.status(200).send('OK');
  });

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
