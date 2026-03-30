-- Execute este script no SQL Editor do Supabase para adicionar os novos campos à tabela de atividades

ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS presentation_location text;
ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS direct_to_game_time text;
