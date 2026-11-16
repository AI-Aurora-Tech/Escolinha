-- Marketing / Captação: contatos de possíveis alunos e patrocinadores.
-- Execute uma vez no SQL Editor do Supabase. Pode ser executado de novo sem problema.

CREATE TABLE IF NOT EXISTS public.marketing_leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_type text NOT NULL DEFAULT 'STUDENT',          -- STUDENT (possível aluno) | SPONSOR (possível patrocinador)
    name text NOT NULL,                                 -- nome do aluno/família ou da empresa
    contact_name text,                                  -- responsável / pessoa de contato
    phone text,
    email text,
    neighborhood text,                                  -- bairro / região
    source text,                                        -- origem: Indicação, Instagram, Panfleto...
    interest text,                                      -- ex.: "Sub-11, 9 anos" ou "Patrocínio de uniforme"
    status text NOT NULL DEFAULT 'NEW',                 -- NEW | CONTACTED | NEGOTIATING | WON | LOST
    next_contact_date date,                             -- lembrete de retorno
    history jsonb NOT NULL DEFAULT '[]'::jsonb,         -- [{ "date": "...", "text": "...", "author": "..." }]
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_leads_status_idx ON public.marketing_leads (status);
CREATE INDEX IF NOT EXISTS marketing_leads_next_contact_idx ON public.marketing_leads (next_contact_date);

-- Mesmo modelo de acesso das demais tabelas do app (o controle de quem vê a tela é feito no app:
-- só administradores).
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'marketing_leads' AND policyname = 'marketing_leads_all') THEN
        CREATE POLICY marketing_leads_all ON public.marketing_leads FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
