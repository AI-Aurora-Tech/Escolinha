import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { supabase } from './lib/supabaseClient';
import { PaymentStatus } from './types';
import { sendZApiMessage } from './services/zapiService';
import * as dotenv from 'dotenv';

dotenv.config();

// Define o fuso horário global para o Node.js
process.env.TZ = 'America/Sao_Paulo';

import fs from 'fs';
import path from 'path';

// Store logs in memory
let serverLogs: string[] = [];
const LOG_FILE = path.join(process.cwd(), 'server.log');

const originalLog = console.log;
console.log = (...args: any[]) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  const logEntry = `[${new Date().toISOString()}] ${message}\n`;
  serverLogs.push(logEntry.trim());
  if (serverLogs.length > 200) serverLogs.shift();
  
  fs.appendFile(LOG_FILE, logEntry, (err) => {
    if (err) originalLog('Error writing to log file:', err);
  });
  
  originalLog.apply(console, args);
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. MIDDLEWARES BÁSICOS
  app.use((req, res, next) => {
    console.log(`[REQUEST LOG] ${req.method} ${req.path}`);
    next();
  });
  app.use(cors());
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

  // --- ROTA DE ENVIO DE MENSAGENS EM MASSA PARA MEMBROS DE GRUPOS ---
  app.options('/api/send-messages', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
  });

  app.post('/api/send-messages', async (req, res) => {
    console.log('[DEBUG] Rota de envio acessada.');
    console.log(`[Mass Messaging] Rota acessada. Método: ${req.method}`);
    
    const { phones, message } = req.body;
    if (!phones || !Array.isArray(phones) || !message) {
      return res.status(400).json({ error: 'Faltam dados: phones e message.' });
    }

    console.log(`[Mass Messaging] Iniciando envio para ${phones.length} membros.`);

    // Envio assíncrono (em background)
    (async () => {
        for (const phone of phones) {
            try {
              console.log(`[Mass Messaging] Enviando para: ${phone}`);
              await sendZApiMessage(phone, message);
              // Wait 10 segundos
              await new Promise(resolve => setTimeout(resolve, 10000));
            } catch (err) {
              console.error(`[Mass Messaging] Falha no envio para ${phone}:`, err);
            }
        }
        console.log('[Mass Messaging] Envio finalizado.');
    })();
    
    res.json({ status: 'queued', count: phones.length });
  });

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
