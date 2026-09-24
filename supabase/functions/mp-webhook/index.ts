import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

// Número no formato esperado pela Evolution: apenas dígitos, com DDI 55.
const toEvolutionNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
};

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

    // Cliente do Supabase usando a Service Role Key (ignora RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Configurações salvas na tela Financeiro (token do MP e Evolution API)
    const { data: settingsRows } = await supabase.from("app_settings").select("key, value");
    const settings: Record<string, string> = {};
    (settingsRows || []).forEach((s: { key: string; value: string }) => { settings[s.key] = s.value; });

    const mpToken = Deno.env.get("MP_ACCESS_TOKEN") || settings["mp_access_token"];
    if (!mpToken) {
      console.error("Token do Mercado Pago não configurado (secret MP_ACCESS_TOKEN ou app_settings.mp_access_token)");
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
      // Atualiza apenas as transações que ainda não estavam pagas: o MP reenvia
      // notificações do mesmo pagamento, e assim o aviso não é enviado em duplicidade.
      const { data: updatedTxs, error: updateError } = await supabase
        .from("transactions")
        .update({ 
          status: "PAID", 
          payment_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) 
        })
        .eq("external_reference", paymentData.external_reference)
        .neq("status", "PAID")
        .select();

      if (updateError) {
        console.error("Erro ao atualizar transação:", updateError);
        throw updateError;
      }

      // 3. Enviar aviso via WhatsApp (Evolution API) para cada transação baixada
      if (updatedTxs && updatedTxs.length > 0) {
        const baseUrl = (settings["evolution_base_url"] || "").replace(/\/+$/, "");
        const instance = settings["evolution_instance"] || "";
        const apikey = settings["evolution_apikey"] || "";

        if (!baseUrl || !instance || !apikey) {
          console.log("Evolution API não configurada em app_settings (tela Financeiro). Aviso não enviado.");
        } else {
          for (const tx of updatedTxs) {
            console.log("Transação atualizada com sucesso:", tx.id);
            if (!tx.student_id) continue;

            const { data: student } = await supabase
              .from("students")
              .select("name, guardian")
              .eq("id", tx.student_id)
              .single();

            if (!student?.guardian?.phone) continue;

            const msg = `✅ *PAGAMENTO RECEBIDO* ⚽\n\nOlá *${student.guardian.name}*!\nConfirmamos o recebimento do pagamento do atleta *${student.name}* via Mercado Pago:\n\n📌 *${tx.description}*\n💰 Valor: *R$ ${Number(tx.amount).toFixed(2)}*\n\nObrigado! Garotos do Martinica.`;

            const evoRes = await fetch(`${baseUrl}/message/sendText/${instance}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "apikey": apikey },
              body: JSON.stringify({ number: toEvolutionNumber(student.guardian.phone), text: msg }),
            });

            console.log("Status do envio Evolution:", evoRes.status, evoRes.ok ? "" : await evoRes.text());
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
