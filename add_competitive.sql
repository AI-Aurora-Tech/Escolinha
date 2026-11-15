-- Marca de "aluno competitivo" no cadastro do aluno.
-- Execute uma vez no SQL Editor do Supabase. Pode ser executado de novo sem problema.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS competitive boolean NOT NULL DEFAULT false;
