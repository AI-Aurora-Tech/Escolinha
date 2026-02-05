
-- 1. Criar a Tabela de Ocorrências (Se não existir)
CREATE TABLE IF NOT EXISTS public.student_occurrences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
    description text NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Garantir colunas necessárias na tabela students
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='group_ids') THEN
        ALTER TABLE public.students ADD COLUMN group_ids uuid[] DEFAULT '{}';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='active') THEN
        ALTER TABLE public.students ADD COLUMN active boolean DEFAULT true;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='documents') THEN
        ALTER TABLE public.students ADD COLUMN documents jsonb DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='birth_date') THEN
        ALTER TABLE public.students ADD COLUMN birth_date date;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='medical_expiry') THEN
        ALTER TABLE public.students ADD COLUMN medical_expiry date;
    END IF;
END $$;

-- 3. DESATIVAR RLS (CRITICAL para salvar sem erros de permissão)
ALTER TABLE IF EXISTS public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.student_occurrences DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_settings DISABLE ROW LEVEL SECURITY;

-- 4. Configurar Realtime
ALTER TABLE IF EXISTS public.students REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.transactions REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.activities REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.student_occurrences REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime SET TABLE 
    public.students, 
    public.activities, 
    public.transactions, 
    public.groups, 
    public.plans, 
    public.app_users, 
    public.student_occurrences;
