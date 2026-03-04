
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='category') THEN
        ALTER TABLE public.transactions ADD COLUMN category text DEFAULT 'Outros';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='recurrence') THEN
        ALTER TABLE public.transactions ADD COLUMN recurrence text DEFAULT 'NONE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='transactions' AND column_name='external_reference') THEN
        ALTER TABLE public.transactions ADD COLUMN external_reference text;
    END IF;
END $$;
