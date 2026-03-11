-- Criar a tabela de configurações do app se não existir
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Permitir leitura para todos (necessário para o webhook ler o token sem estar logado)
CREATE POLICY "Enable read access for all users" ON public.app_settings FOR SELECT USING (true);

-- Permitir inserção/atualização para todos (para salvar as configurações pela tela de Financeiro)
CREATE POLICY "Enable insert for all users" ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.app_settings FOR UPDATE USING (true);
