-- =============================================================================
-- Verifica mensalidades DUPLICADAS (mesmo aluno + mesmo mês).
-- Rode no Supabase → SQL Editor. É somente leitura (não altera nada).
-- =============================================================================

-- 1) RESUMO — quantos grupos (aluno+mês) estão duplicados.
SELECT count(*) AS grupos_duplicados
FROM (
  SELECT 1
  FROM public.transactions
  WHERE category = 'Mensalidade'
  GROUP BY student_id, to_char(date::date, 'YYYY-MM')
  HAVING count(*) > 1
) x;

-- 2) DETALHE — lista cada duplicidade com nome do aluno, mês, quantidade,
--    status e ids de cada parcela (útil para decidir o que manter/remover).
SELECT
  s.name                                        AS aluno,
  t.student_id,
  to_char(t.date::date, 'YYYY-MM')              AS mes,
  count(*)                                       AS qtd,
  array_agg(t.status ORDER BY t.created_at)      AS status_das_parcelas,
  array_agg(t.amount ORDER BY t.created_at)      AS valores,
  array_agg(t.id ORDER BY t.created_at)          AS ids
FROM public.transactions t
LEFT JOIN public.students s ON s.id = t.student_id
WHERE t.category = 'Mensalidade'
GROUP BY s.name, t.student_id, to_char(t.date::date, 'YYYY-MM')
HAVING count(*) > 1
ORDER BY aluno, mes;

-- Se a consulta 1 retornar 0 e a 2 vier vazia, não há mensalidades duplicadas.
