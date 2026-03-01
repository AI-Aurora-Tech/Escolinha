
-- 1. Tabela de Atividades (Agenda)
CREATE TABLE IF NOT EXISTS public.activities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    activity_type text NOT NULL DEFAULT 'TRAINING',
    fee numeric DEFAULT 0,
    location text,
    presentation_time text,
    opponent text,
    home_score integer,
    away_score integer,
    scorers uuid[] DEFAULT '{}',
    group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
    participants uuid[] DEFAULT '{}',
    date date NOT NULL,
    start_time text NOT NULL,
    end_time text,
    description text,
    recurrence text DEFAULT 'none',
    attendance uuid[] DEFAULT '{}',
    fee_payments uuid[] DEFAULT '{}',
    lineup jsonb,
    created_at timestamp with time zone DEFAULT now()
);

-- Garantir colunas de controle caso a tabela já exista
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='fee_payments') THEN
        ALTER TABLE public.activities ADD COLUMN fee_payments uuid[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='attendance') THEN
        ALTER TABLE public.activities ADD COLUMN attendance uuid[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activities' AND column_name='lineup') THEN
        ALTER TABLE public.activities ADD COLUMN lineup jsonb;
    END IF;
END $$;

-- DESATIVAR RLS para Atividades
ALTER TABLE public.activities DISABLE ROW LEVEL SECURITY;

-- Adicionar Atividades ao Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
