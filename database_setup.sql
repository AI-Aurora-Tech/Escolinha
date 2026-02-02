
-- 1. Garantir que a publicação para Realtime existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- Tabela de Ocorrências
CREATE TABLE IF NOT EXISTS public.student_occurrences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
    description text NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Configurar a Identidade de Réplica (FULL garante que todos os campos sejam enviados no evento)
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER TABLE public.activities REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.groups REPLICA IDENTITY FULL;
ALTER TABLE public.plans REPLICA IDENTITY FULL;
ALTER TABLE public.app_users REPLICA IDENTITY FULL;
ALTER TABLE public.student_occurrences REPLICA IDENTITY FULL;

-- 3. Limpar a publicação atual (evita erros de "já existe")
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS students, activities, transactions, groups, plans, app_users, student_occurrences;

-- 4. Adicionar tabelas à publicação para habilitar o Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE students;
ALTER PUBLICATION supabase_realtime ADD TABLE activities;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE groups;
ALTER PUBLICATION supabase_realtime ADD TABLE plans;
ALTER PUBLICATION supabase_realtime ADD TABLE app_users;
ALTER PUBLICATION supabase_realtime ADD TABLE student_occurrences;
