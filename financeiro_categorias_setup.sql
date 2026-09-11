-- =============================================================================
-- Financeiro: categorias de Receita/Despesa (com criação) + recorrência real.
-- Rode no Supabase → SQL Editor. Idempotente.
-- =============================================================================

-- 1) Tabela de categorias de transação.
CREATE TABLE IF NOT EXISTS public.transaction_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('INCOME','EXPENSE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, type)
);

ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;

-- Políticas abertas (o app usa a chave anônima, como nas demais tabelas).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transaction_categories' AND policyname='cat_select') THEN
    CREATE POLICY cat_select ON public.transaction_categories FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transaction_categories' AND policyname='cat_insert') THEN
    CREATE POLICY cat_insert ON public.transaction_categories FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transaction_categories' AND policyname='cat_update') THEN
    CREATE POLICY cat_update ON public.transaction_categories FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='transaction_categories' AND policyname='cat_delete') THEN
    CREATE POLICY cat_delete ON public.transaction_categories FOR DELETE USING (true);
  END IF;
END $$;

-- 2) Categorias padrão (não duplica se já existirem).
INSERT INTO public.transaction_categories (name, type) VALUES
  ('Mensalidade',   'INCOME'),
  ('Taxa de Jogo',  'INCOME'),
  ('Transporte',    'EXPENSE'),
  ('Alimentação',   'EXPENSE'),
  ('Salário',       'EXPENSE')
ON CONFLICT (name, type) DO NOTHING;

-- 3) Vínculo de recorrência entre lançamentos gerados juntos.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_transactions_recurrence_group
  ON public.transactions (recurrence_group_id);

-- 4) (Opcional) habilite Realtime para as categorias sincronizarem entre usuários.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='transaction_categories'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_categories';
  END IF;
END $$;
