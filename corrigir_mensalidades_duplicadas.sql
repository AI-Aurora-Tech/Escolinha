-- =============================================================================
-- Corrige de vez as mensalidades DUPLICADAS (mesmo aluno + mesmo mês) que ainda
-- existem no banco, e cria a trava para não voltarem a acontecer.
-- Rode no Supabase → SQL Editor, na ordem. Passos 1 e 3 são só leitura.
-- =============================================================================

-- 1) VER quem ainda está duplicado (com nome do aluno, status e ids).
SELECT
  s.name                                        AS aluno,
  to_char(t.date::date, 'YYYY-MM')              AS mes,
  count(*)                                       AS qtd,
  array_agg(t.status ORDER BY t.created_at)      AS status,
  array_agg(t.id ORDER BY t.created_at)          AS ids
FROM public.transactions t
LEFT JOIN public.students s ON s.id = t.student_id
WHERE t.category = 'Mensalidade'
GROUP BY s.name, t.student_id, to_char(t.date::date, 'YYYY-MM')
HAVING count(*) > 1
ORDER BY aluno, mes;

-- 2) LIMPEZA SEGURA — mantém 1 mensalidade por aluno/mês.
--    Nunca apaga parcela PAGA. Prioridade p/ ficar: PAGA > PENDENTE/ATRASADA > CANCELADA.
--    (No caso do Bryan, com 2 pendentes iguais, mantém uma e remove a outra.)
WITH ranked AS (
  SELECT id, status,
         row_number() OVER (
           PARTITION BY student_id, to_char(date::date, 'YYYY-MM')
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
  AND r.rn > 1
  AND r.status <> 'PAID';

-- 3) CONFERÊNCIA — deve retornar 0 linhas.
--    O que sobrar são meses com 2+ parcelas PAGAS (pagamento em duplicidade real),
--    que precisam de conferência manual antes de criar o índice.
SELECT s.name AS aluno, to_char(t.date::date, 'YYYY-MM') AS mes, count(*)
FROM public.transactions t
LEFT JOIN public.students s ON s.id = t.student_id
WHERE t.category = 'Mensalidade'
GROUP BY s.name, t.student_id, to_char(t.date::date, 'YYYY-MM')
HAVING count(*) > 1
ORDER BY aluno;

-- 4) TRAVA DEFINITIVA — 1 mensalidade por aluno/mês (só cria se o passo 3 deu 0).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mensalidade_aluno_mes
  ON public.transactions (
    student_id,
    (EXTRACT(YEAR  FROM date)),
    (EXTRACT(MONTH FROM date))
  )
  WHERE category = 'Mensalidade';
