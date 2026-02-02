
-- 1. Garantir que a publicação para Realtime existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Configurar a Identidade de Réplica (FULL garante que todos os campos sejam enviados no evento)
-- Isso é essencial para que o Realtime funcione corretamente com filtros e payloads completos.
ALTER TABLE IF EXISTS public.students REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.activities REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.transactions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.groups REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.plans REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.app_users REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.student_occurrences REPLICA IDENTITY FULL;

-- 3. Configurar as tabelas da publicação
-- O comando SET TABLE define exatamente quais tabelas pertencem à publicação, 
-- resolvendo o problema de tentar adicionar tabelas que já existem ou remover as que não existem.
ALTER PUBLICATION supabase_realtime SET TABLE 
    public.students, 
    public.activities, 
    public.transactions, 
    public.groups, 
    public.plans, 
    public.app_users, 
    public.student_occurrences;
