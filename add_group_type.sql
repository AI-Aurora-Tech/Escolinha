-- Adiciona a coluna type na tabela groups
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS type text DEFAULT 'TRAINING';
