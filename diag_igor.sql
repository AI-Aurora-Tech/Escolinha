-- Lista TODAS as transações do aluno Igor Teixeira Lima, sem agrupar,
-- para ver exatamente quantas linhas existem e como diferem.
-- Rode no Supabase → SQL Editor (somente leitura).
SELECT
  t.id,
  '[' || coalesce(t.category, '(null)') || ']' AS categoria,   -- colchetes revelam espaços/grafia
  t.status,
  t.amount,
  t.date,
  t.created_at,
  t.external_reference,
  t.recurrence
FROM public.transactions t
JOIN public.students s ON s.id = t.student_id
WHERE s.name ILIKE '%Igor Teixeira Lima%'
ORDER BY t.date DESC, t.created_at DESC;

-- Resumo por mês (contando TODAS as categorias e mostrando quais categorias existem):
SELECT
  to_char(t.date::date, 'YYYY-MM')                 AS mes,
  count(*)                                          AS qtd,
  array_agg(DISTINCT t.category)                    AS categorias,
  array_agg(t.id)                                   AS ids
FROM public.transactions t
JOIN public.students s ON s.id = t.student_id
WHERE s.name ILIKE '%Igor Teixeira Lima%'
GROUP BY to_char(t.date::date, 'YYYY-MM')
ORDER BY mes DESC;
