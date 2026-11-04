import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

serve(async (req) => {
  // Responde a requisições GET (útil para testar se a função está no ar)
  if (req.method === "GET") {
    return new Response("Webhook do Mercado Pago está rodando!", { status: 200 });
  }

  try {
    const body = await req.json();
    console.log("Notificação recebida:", body);

    // O Mercado Pago envia o ID do pagamento em data.id ou id
    const paymentId = body?.data?.id || body?.id;

    if (!paymentId) {
      return new Response("Nenhum ID de pagamento encontrado", { status: 200 });
    }

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpToken) {
      console.error("MP_ACCESS_TOKEN não configurado nas secrets do Supabase");
      return new Response("Erro de configuração", { status: 500 });
    }

    // 1. Consultar o status do pagamento na API do Mercado Pago
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    
    if (!mpRes.ok) {
      console.error("Erro ao consultar Mercado Pago:", await mpRes.text());
      return new Response("Erro ao consultar MP", { status: 500 });
    }

    const paymentData = await mpRes.json();
    console.log(`Status do pagamento ${paymentId}: ${paymentData.status}, Ref: ${paymentData.external_reference}`);

    // 2. Se o pagamento foi aprovado, atualizar no Supabase
    if (paymentData.status === "approved" && paymentData.external_reference) {
      // Inicializar o cliente do Supabase usando a Service Role Key (ignora RLS)
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Atualizar a transação para PAID
      const { data: updatedTxs, error: updateError } = await supabase
        .from("transactions")
        .update({ 
          status: "PAID", 
          payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) 
        })
        .eq("external_reference", paymentData.external_reference)
        .select();

      if (updateError) {
        console.error("Erro ao atualizar transação:", updateError);
        throw updateError;
      }

      // 3. Enviar mensagem via WhatsApp (Z-API) se a transação foi atualizada
      if (updatedTxs && updatedTxs.length > 0) {
        const tx = updatedTxs[0];
        console.log("Transação atualizada com sucesso:", tx.id);

        if (tx.student_id) {
          const { data: student } = await supabase
            .from("students")
            .select("name, guardian")
            .eq("id", tx.student_id)
            .single();

          if (student?.guardian?.phone) {
            const zapiInstance = Deno.env.get("ZAPI_INSTANCE_ID");
            const zapiToken = Deno.env.get("ZAPI_TOKEN");
            const zapiClientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

            if (zapiInstance && zapiToken && zapiClientToken) {
              const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\nConfirmamos o recebimento do pagamento do atleta *${student.name}* via Mercado Pago:\n\n📌 *${tx.description}*\n💰 Valor: *R$ ${tx.amount.toFixed(2)}*\n\nObrigado! Garotos do Martinica.`;

              const zapiRes = await fetch(`https://api.z-api.io/instances/${zapiInstance}/token/${zapiToken}/send-text`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Client-Token": zapiClientToken,
                },
                body: JSON.stringify({
                  phone: student.guardian.phone,
                  message: msg,
                }),
              });
              
              console.log("Status do envio Z-API:", zapiRes.status);
            } else {
              console.log("Credenciais do Z-API não configuradas nas secrets.");
            }
          }
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Erro interno no Webhook:", err);
    return new Response("Erro interno", { status: 500 });
  }
});
