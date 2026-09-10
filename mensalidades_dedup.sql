-- =============================================================================
-- Corrige mensalidades DUPLICADAS por aluno/mês, que faziam parcelas já pagas
-- ou canceladas "reaparecerem" como pendentes/atrasadas (era a duplicata que
-- sobrava, ainda em aberto). Rode no Supabase → SQL Editor.
-- =============================================================================

-- 1) DIAGNÓSTICO — veja os grupos (aluno + mês) com mais de uma mensalidade.
--    Rode primeiro só para conferir o tamanho do problema.
SELECT student_id,
       to_char(date::date, 'YYYY-MM') AS mes,
       count(*)                        AS qtd,
       array_agg(status ORDER BY created_at) AS status_das_parcelas
FROM public.transactions
WHERE category = 'Mensalidade'
GROUP BY student_id, to_char(date::date, 'YYYY-MM')
HAVING count(*) > 1
ORDER BY qtd DESC, student_id;

-- 2) LIMPEZA (SEGURA) — remove apenas as duplicatas NÃO PAGAS quando já existe
--    outra parcela do mesmo aluno/mês. Mantém sempre:
--      - todas as parcelas PAGAS (nunca apaga pagamento);
--      - uma única parcela por aluno/mês quando não há paga.
--    Prioridade para escolher a que fica: PAGA > PENDENTE/ATRASADA > CANCELADA.
WITH ranked AS (
  SELECT id,
         status,
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
  AND r.rn > 1            -- não é a parcela "escolhida" do grupo
  AND r.status <> 'PAID'; -- nunca apaga uma parcela paga

-- 3) CONFERÊNCIA — deve retornar poucas (ou nenhuma) linhas. Grupos que ainda
--    aparecerem aqui terão 2+ parcelas PAGAS no mesmo mês (pagamento em
--    duplicidade) e precisam de conferência manual.
SELECT student_id,
       to_char(date::date, 'YYYY-MM') AS mes,
       count(*)                        AS qtd,
       array_agg(status ORDER BY created_at) AS status_das_parcelas
FROM public.transactions
WHERE category = 'Mensalidade'
GROUP BY student_id, to_char(date::date, 'YYYY-MM')
HAVING count(*) > 1
ORDER BY qtd DESC;
