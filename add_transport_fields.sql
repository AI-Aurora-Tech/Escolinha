-- Execute este script no SQL Editor do Supabase para adicionar os novos campos de transporte

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS ask_transport boolean DEFAULT false;
ALTER TABLE public.activity_rsvps ADD COLUMN IF NOT EXISTS transport_option text;
