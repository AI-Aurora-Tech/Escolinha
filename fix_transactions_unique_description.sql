-- ============================================================================
-- Cobranças: duplicidade só quando a DESCRIÇÃO for exatamente igual
-- ============================================================================
-- Problema: o banco possui um índice/constraint de unicidade na tabela
-- "transactions" (ex.: uma mensalidade por aluno por mês/data) que impede
-- alterar o vencimento de uma cobrança quando já existe outra cobrança do
-- aluno no mesmo período, mesmo com descrições diferentes.
--
-- Regra desejada: só é duplicidade quando o mesmo aluno tiver outra cobrança
-- (não cancelada) com a descrição EXATAMENTE igual (descrição inteira).
--
-- Execute no Supabase: SQL Editor > New query > cole este arquivo > Run.
-- ============================================================================

-- 1) (Opcional) Ver as regras de unicidade atuais da tabela transactions.
SELECT i.relname AS indice, pg_get_indexdef(ix.indexrelid) AS definicao
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'transactions'
  AND ix.indisunique AND NOT ix.indisprimary;

-- 2) Remove as regras de unicidade antigas baseadas em data/período.
--    Mantém a chave primária e a unicidade por external_reference (usada nas
--    taxas de jogo, evita cobrança de taxa duplicada).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT i.relname AS indice, c.conname AS constraint_name,
           pg_get_indexdef(ix.indexrelid) AS definicao
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = ix.indexrelid AND c.conrelid = t.oid
    WHERE n.nspname = 'public' AND t.relname = 'transactions'
      AND ix.indisunique AND NOT ix.indisprimary
      AND pg_get_indexdef(ix.indexrelid) NOT ILIKE '%external_reference%'
      AND pg_get_indexdef(ix.indexrelid) NOT ILIKE '%transactions_unique_description%'
  LOOP
    RAISE NOTICE 'Removendo regra de unicidade: % (%)', r.indice, r.definicao;
    IF r.constraint_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', r.constraint_name);
    ELSE
      EXECUTE format('DROP INDEX public.%I', r.indice);
    END IF;
  END LOOP;
END $$;

-- 3) Nova regra: mesmo aluno + descrição exatamente igual (ignorando canceladas).
--    Como as mensalidades geradas têm o mês na descrição ("Mensalidade (Nome) 09/2026"),
--    ela continua impedindo mensalidade duplicada do mesmo mês.
--    Taxas de jogo (external_reference 'game_fee_...') ficam de fora: já têm
--    unicidade própria e dois jogos podem ter o mesmo título.
--    Se já existirem duplicatas de descrição, o índice NÃO é criado e as
--    cobranças duplicadas são listadas para correção manual.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE student_id IS NOT NULL AND status <> 'CANCELLED'
      AND coalesce(external_reference, '') NOT LIKE 'game\_fee\_%'
    GROUP BY student_id, btrim(description)
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Existem cobranças com descrição repetida para o mesmo aluno. Corrija-as (consulta 4) e rode este passo novamente.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS transactions_unique_description
      ON public.transactions (student_id, btrim(description))
      WHERE student_id IS NOT NULL AND status <> 'CANCELLED'
        AND coalesce(external_reference, '') NOT LIKE 'game\_fee\_%';
    RAISE NOTICE 'Regra por descrição criada: transactions_unique_description';
  END IF;
END $$;

-- 4) (Se o passo 3 avisar) Lista as cobranças com descrição repetida por aluno.
SELECT student_id, btrim(description) AS descricao, count(*) AS quantidade,
       array_agg(id ORDER BY date) AS ids
FROM public.transactions
WHERE student_id IS NOT NULL AND status <> 'CANCELLED'
  AND coalesce(external_reference, '') NOT LIKE 'game\_fee\_%'
GROUP BY student_id, btrim(description)
HAVING count(*) > 1;
