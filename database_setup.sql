
-- 1. Criar a Tabela de Alunos (se não existir) com tipos de dados robustos
CREATE TABLE IF NOT EXISTS public.students (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    birth_date date,
    rg text,
    cpf text,
    phone text,
    medical_expiry date,
    photo_url text,
    address jsonb DEFAULT '{}',
    guardian jsonb DEFAULT '{}',
    plan_id uuid,
    group_ids uuid[] DEFAULT '{}',
    positions text[] DEFAULT '{}',
    active boolean DEFAULT true,
    documents jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Tabela de Ocorrências
CREATE TABLE IF NOT EXISTS public.student_occurrences (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
    description text NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- 3. Tabelas de Suporte
CREATE TABLE IF NOT EXISTS public.groups (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plans (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    price numeric NOT NULL,
    due_day integer,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    description text,
    category text,
    amount numeric NOT NULL,
    type text NOT NULL,
    date date NOT NULL,
    payment_date date,
    status text NOT NULL,
    student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
    payment_method text,
    payment_link text,
    external_reference text,
    preference_id text,
    created_at timestamp with time zone DEFAULT now()
);

-- 4. Tabela de Configurações
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamp with time zone DEFAULT now()
);

-- 5. DESATIVAR RLS (Para permitir cadastros sem políticas complexas no momento)
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_occurrences DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- 6. Configurar Realtime
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime SET TABLE 
    public.students, 
    public.transactions, 
    public.student_occurrences;
