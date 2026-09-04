-- =============================================================================
-- Resolve as duplicatas que restaram (ex.: aluno d8d70d1e..., mês 2026-08),
-- para permitir criar o índice único. Rode no Supabase → SQL Editor.
-- =============================================================================

-- 1) INSPECIONE primeiro os grupos ainda duplicados (veja status/valor/datas).
--    Confira especialmente se há mais de uma parcela PAGA (pagamento em duplicidade real).
SELECT id, student_id,
       to_char(date::date, 'YYYY-MM') AS mes,
       status, amount, date, payment_date, created_at
FROM public.transactions
WHERE category = 'Mensalidade'
  AND (student_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)) IN (
    SELECT student_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    FROM public.transactions
    WHERE category = 'Mensalidade'
    GROUP BY student_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    HAVING count(*) > 1
  )
ORDER BY student_id, date, created_at;

-- 2) LIMPEZA FINAL — mantém exatamente UMA parcela por aluno/mês.
--    Prioridade para ficar: PAGA > PENDENTE/ATRASADA > CANCELADA; empate = mais recente.
--    ATENÇÃO: se um mês tiver 2 parcelas PAGAS (pagamento em duplicidade real),
--    isto removerá a mais antiga. Confira o passo 1 antes de rodar.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY student_id, EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
           ORDER BY (status = 'PAID') DESC,
                    (status IN ('PENDING','LATE')) DESC,
                    created_at DESC
         ) AS rn
  FROM public.transactions
  WHERE category = 'Mensalidade'
)
DELETE FROM public.transactions t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;

-- 3) CONFERÊNCIA — deve retornar 0 linhas.
SELECT student_id, to_char(date::date, 'YYYY-MM') AS mes, count(*)
FROM public.transactions
WHERE category = 'Mensalidade'
GROUP BY student_id, to_char(date::date, 'YYYY-MM')
HAVING count(*) > 1;

-- 4) Agora crie a trava definitiva.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mensalidade_aluno_mes
  ON public.transactions (
    student_id,
    (EXTRACT(YEAR  FROM date)),
    (EXTRACT(MONTH FROM date))
  )
  WHERE category = 'Mensalidade';
