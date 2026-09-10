-- =============================================================================
-- Garante que NUNCA exista cobrança de taxa duplicada por aluno/jogo.
-- A referência das taxas de jogo é determinística: game_fee_<jogo>_<aluno>.
-- Rode este script UMA vez no Supabase (SQL Editor).
-- =============================================================================

-- 1) Remove duplicatas já existentes, mantendo por external_reference apenas uma
--    linha "preferida": prioriza a PAGA; senão, a mais antiga.
DELETE FROM public.transactions t
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY external_reference
           ORDER BY (status = 'PAID') DESC, created_at ASC
         ) AS rn
  FROM public.transactions
  WHERE external_reference IS NOT NULL
) d
WHERE t.id = d.id
  AND d.rn > 1;

-- 2) Impede duplicidade futura: no máximo 1 transação por external_reference.
--    (external_reference nulo continua livre — mensalidades não usam esse campo.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_external_reference
  ON public.transactions (external_reference)
  WHERE external_reference IS NOT NULL;
