
CREATE TABLE IF NOT EXISTS public.activity_rsvps (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    activity_id uuid REFERENCES public.activities(id) ON DELETE CASCADE,
    student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
    status text NOT NULL CHECK (status IN ('CONFIRMED', 'DECLINED')),
    transport_option text CHECK (transport_option IN ('DIRECT', 'TRANSPORT')),
    created_at timestamptz DEFAULT now(),
    UNIQUE(activity_id, student_id)
);

-- Enable RLS
ALTER TABLE public.activity_rsvps ENABLE ROW LEVEL SECURITY;

-- Add to publication for Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_rsvps;

-- Policies
CREATE POLICY "Enable read access for all users" ON public.activity_rsvps FOR SELECT USING (true);
CREATE POLICY "Enable insert for all users" ON public.activity_rsvps FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all users" ON public.activity_rsvps FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all users" ON public.activity_rsvps FOR DELETE USING (true);
