-- =============================================================================
-- Habilita o Realtime (sincronização entre usuários) para as tabelas do sistema.
-- Rode no Supabase → SQL Editor. É idempotente: pode rodar mais de uma vez sem erro.
-- =============================================================================

-- 1) Cria a publicação padrão do Supabase, caso ela não exista.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- 2) Adiciona cada tabela à publicação apenas se ainda não estiver nela.
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'students',
    'transactions',
    'activities',
    'groups',
    'plans',
    'student_occurrences',
    'activity_rsvps'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- 3) Conferência: liste as tabelas que estão com Realtime habilitado.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
