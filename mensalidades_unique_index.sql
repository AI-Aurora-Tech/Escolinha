-- =============================================================================
-- TRAVA DEFINITIVA: no máximo UMA mensalidade por aluno por mês.
-- Rode DEPOIS da limpeza (mensalidades_dedup.sql). Idempotente.
-- Com isso, o banco recusa qualquer segunda parcela do mesmo aluno/mês,
-- impedindo de vez o "reaparecimento" de parcelas pagas/canceladas.
-- =============================================================================

-- (Opcional) Confira antes se ainda há duplicatas. Deve retornar 0 linhas.
-- Se retornar algo, são meses com 2+ pagamentos (duplicidade real) que precisam
-- de conferência manual ANTES de criar o índice.
SELECT student_id,
       to_char(date::date, 'YYYY-MM') AS mes,
       count(*) AS qtd
FROM public.transactions
WHERE category = 'Mensalidade'
GROUP BY student_id, to_char(date::date, 'YYYY-MM')
HAVING count(*) > 1;

-- Cria a trava: 1 mensalidade por aluno por mês.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_mensalidade_aluno_mes
  ON public.transactions (student_id, (to_char(date::date, 'YYYY-MM')))
  WHERE category = 'Mensalidade';
