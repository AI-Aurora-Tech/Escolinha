-- =============================================================================
-- TRAVAS DE UNICIDADE — impedem cobranças duplicadas no banco.
-- Rode no Supabase → SQL Editor, na ordem. Idempotente (pode rodar de novo).
--
--   PARTE 1: TAXAS DE JOGO  -> 1 cobrança por aluno/jogo (por external_reference)
--   PARTE 2: MENSALIDADES   -> 1 mensalidade por aluno/mês
--
-- Em ambos, as inserções no app já toleram conflito destes índices (não quebram).
-- =============================================================================


-- =============================================================================
-- PARTE 1 — TAXAS DE JOGO
-- Referência determinística: game_fee_<jogo>_<aluno>. Combos usam refs únicas
-- (combo_<timestamp>) e não conflitam entre si.
-- =============================================================================

-- 1.1) DIAGNÓSTICO — refs com mais de uma cobrança (confira se há 2+ PAGAS).
SELECT external_reference,
       count(*)                              AS qtd,
       array_agg(status ORDER BY created_at) AS status_das_cobrancas
FROM public.transactions
WHERE external_reference IS NOT NULL
GROUP BY external_reference
HAVING count(*) > 1
ORDER BY qtd DESC;

-- 1.2) LIMPEZA SEGURA — mantém 1 por referência; NUNCA apaga cobrança PAGA.
--      Prioridade p/ ficar: PAGA > PENDENTE/ATRASADA > CANCELADA; empate = mais recente.
WITH ranked AS (
  SELECT id, status,
         row_number() OVER (
           PARTITION BY external_reference
           ORDER BY (status = 'PAID') DESC,
                    (status IN ('PENDING','LATE')) DESC,
                    created_at DESC
         ) AS rn
  FROM public.transactions
  WHERE external_reference IS NOT NULL
)
DELETE FROM public.transactions t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1
  AND r.status <> 'PAID';

-- 1.3) CONFERÊNCIA — deve retornar 0 linhas. O que sobrar são refs com 2+ PAGAS
--      (pagamento em duplicidade real) para conferência manual.
SELECT external_reference, count(*)
FROM public.transactions
WHERE external_reference IS NOT NULL
GROUP BY external_reference
HAVING count(*) > 1;

-- 1.4) TRAVA — no máximo 1 transação por external_reference.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_external_reference
  ON public.transactions (external_reference)
  WHERE external_reference IS NOT NULL;


-- =============================================================================
-- PARTE 2 — MENSALIDADES
-- 1 mensalidade por aluno por mês.
-- =============================================================================

-- 2.1) CONFERÊNCIA — deve retornar 0 linhas. Se sobrar, resolva antes de criar o índice.
SELECT student_id, to_char(date::date, 'YYYY-MM') AS mes, count(*)
FROM public.transactions
WHERE category = 'Mensalidade'
GROUP BY student_id, to_char(date::date, 'YYYY-MM')
HAVING count(*) > 1;

-- 2.2) TRAVA — usa EXTRACT (IMMUTABLE); to_char/cast p/ texto não podem em índice.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mensalidade_aluno_mes
  ON public.transactions (
    student_id,
    (EXTRACT(YEAR  FROM date)),
    (EXTRACT(MONTH FROM date))
  )
  WHERE category = 'Mensalidade';
