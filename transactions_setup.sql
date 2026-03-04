
-- Tabela de Transações Financeiras
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    description text NOT NULL,
    category text,
    amount numeric NOT NULL,
    type text NOT NULL CHECK (type IN ('INCOME', 'EXPENSE')),
    date date NOT NULL,
    payment_date date,
    status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PAID', 'PENDING', 'LATE', 'CANCELLED')),
    student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
    payment_method text,
    plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
    payment_link text,
    external_reference text,
    preference_id text,
    recurrence text DEFAULT 'NONE',
    created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Adicionar ao Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;

-- Políticas de Acesso (Permitir tudo para facilitar o uso público do RSVP)
-- Em produção idealmente restringiríamos, mas para o RSVP funcionar sem login, precisamos liberar INSERT/SELECT/UPDATE
CREATE POLICY "Enable read access for all users" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.transactions FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.transactions FOR DELETE USING (true);
