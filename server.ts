import express from 'express';
import { createServer as createViteServer } from 'vite';
import { supabase } from './lib/supabaseClient';
import { PaymentStatus } from './types';
import { sendZApiMessage } from './services/zapiService';
import * as dotenv from 'dotenv';

dotenv.config();

// Define o fuso horário global para o Node.js
process.env.TZ = 'America/Sao_Paulo';

// Store logs in memory
let serverLogs: string[] = [];
const originalLog = console.log;
console.log = (...args: any[]) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  serverLogs.push(`[${new Date().toISOString()}] ${message}`);
  if (serverLogs.length > 200) serverLogs.shift();
  originalLog.apply(console, args);
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. MIDDLEWARES BÁSICOS
  app.use(express.json());

  // --- ROTA DE TESTE ABSOLUTA (PARA TESTAR O 302) ---
  app.get('/ping', (req, res) => {
    console.log('[PING] Recebido');
    res.send('PONG_SERVER_IS_UP');
  });

  // --- WEBHOOK MERCADO PAGO ---
  app.all('/api/webhook/mercadopago', async (req, res) => {
    console.log(`[MP Webhook] Chamada recebida: ${req.method}`);
    
    if (req.method === 'GET') {
      return res.send('WEBHOOK_ENDPOINT_OK');
    }

    const notification = req.body;
    console.log('[MP Webhook] Dados:', JSON.stringify(notification));

    try {
        const token = process.env.MP_ACCESS_TOKEN || (await supabase.from('app_settings').select('value').eq('key', 'mp_access_token').maybeSingle()).data?.value;
        
        if (!token) {
            console.error('[MP Webhook] Erro: Token não configurado.');
            return res.status(200).send('OK');
        }

        const paymentId = notification.data?.id || notification.id;
        if (paymentId) {
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (mpRes.ok) {
                const paymentData = await mpRes.ok ? await mpRes.json() : null;
                if (!paymentData) return res.status(200).send('OK');

                console.log(`[MP Webhook] Pagamento: ${paymentData.status} | Ref: ${paymentData.external_reference}`);
                
                if (paymentData.status === 'approved' && paymentData.external_reference) {
                    const { data: updated } = await supabase
                        .from('transactions')
                        .update({ status: PaymentStatus.PAID, payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) })
                        .eq('external_reference', paymentData.external_reference)
                        .select();
                    
                    if (updated && updated.length > 0) {
                        console.log('[MP Webhook] Baixa realizada com sucesso.');
                        for (const tx of updated) {
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
            }
        }
    } catch (error) {
        console.error('[MP Webhook] Erro fatal:', error);
    }
    res.status(200).send('OK');
  });

  // --- API ROUTES ---
  app.get('/api/logs', (req, res) => res.json(serverLogs));

  // Proxy para Mercado Pago (para funcionar em produção sem Vite)
  app.use('/api/mp', async (req, res) => {
    const targetUrl = `https://api.mercadopago.com${req.url}`;
    // console.log(`[MP Proxy] Proxying to: ${targetUrl}`);
    
    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization || '',
                'X-Idempotency-Key': req.headers['x-idempotency-key'] as string || ''
            },
            body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
        });

        // Tenta ler como JSON, se falhar lê como texto
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.status(response.status).json(data);
        } else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
    } catch (error) {
        console.error('[MP Proxy] Error:', error);
        res.status(500).json({ error: 'Proxy error' });
    }
  });

  // Endpoint para o frontend consultar o status de um pagamento (contorna o erro 302 do webhook)
  app.get('/api/payment-status/:ref', async (req, res) => {
    const { ref } = req.params;
    console.log(`[Status Check] Verificando status para ref: ${ref}`);

    try {
        const token = process.env.MP_ACCESS_TOKEN || (await supabase.from('app_settings').select('value').eq('key', 'mp_access_token').maybeSingle()).data?.value;
        if (!token) return res.status(500).json({ error: 'Token não configurado' });

        // Busca o pagamento no Mercado Pago pela referência externa
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${ref}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!mpRes.ok) return res.status(500).json({ error: 'Erro na API do Mercado Pago' });

        const searchData = await mpRes.json();
        const payment = searchData.results?.[0];

        if (payment && payment.status === 'approved') {
            console.log(`[Status Check] Pagamento aprovado encontrado para ref: ${ref}. Baixando...`);
            
            // Atualiza no banco
            const { data: updated, error: updateError } = await supabase
                .from('transactions')
                .update({ status: PaymentStatus.PAID, payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) })
                .eq('external_reference', ref)
                .select();

            if (!updateError && updated && updated.length > 0) {
                // Envia WhatsApp
                for (const tx of updated) {
                    if (tx.student_id) {
                        const { data: student } = await supabase.from('students').select('name, guardian').eq('id', tx.student_id).single();
                        if (student?.guardian?.phone) {
                            const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\nConfirmamos o recebimento do pagamento do atleta *${student.name}* via Mercado Pago:\n\n📌 *${tx.description}*\n💰 Valor: *R$ ${tx.amount.toFixed(2)}*\n\nObrigado! Garotos do Martinica.`;
                            await sendZApiMessage(student.guardian.phone, msg);
                        }
                    }
                }
                return res.json({ status: 'approved', updated: true });
            }
        }

        res.json({ status: payment?.status || 'pending' });
    } catch (error) {
        console.error('[Status Check] Erro:', error);
        res.status(500).json({ error: 'Erro interno' });
    }
  });

  // Endpoint para enviar mensagem para um grupo
  app.all('/api/send-group-message', async (req, res) => {
    console.log(`[API SendGroupMessage] Chamada recebida. Método: ${req.method}. Body:`, req.body);
    
    if (req.method !== 'POST') {
        console.log(`[API SendGroupMessage] Método não permitido: ${req.method}`);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    
    const { groupId, message } = req.body;
    if (!groupId || !message) {
        console.log('[API SendGroupMessage] Missing params');
        return res.status(400).json({ error: 'Missing groupId or message' });
    }

    try {

        console.log('[API SendGroupMessage] Buscando alunos...');
        // Fetch students in the group
        const { data: students, error } = await supabase
            .from('students')
            .select('guardian')
            .contains('group_ids', [groupId]);

        if (error) {
            console.error('[API SendGroupMessage] Supabase error:', error);
            throw error;
        }
        
        console.log(`[API SendGroupMessage] Alunos encontrados: ${students?.length || 0}`);
        
        let count = 0;
        for (const student of students || []) {
            if (student.guardian?.phone) {
                console.log(`[API SendGroupMessage] Enviando para: ${student.guardian.phone}`);
                const success = await sendZApiMessage(student.guardian.phone, message);
                if (success) count++;
            }
        }
        console.log(`[API SendGroupMessage] Finalizado. Total enviado: ${count}`);
        res.json({ success: true, count });
    } catch (error) {
        console.error('[API SendGroupMessage] Erro catch:', error);
        res.status(500).json({ error: 'Erro ao enviar mensagens' });
    }
  });

  // --- VITE MIDDLEWARE (SPA FALLBACK) ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
