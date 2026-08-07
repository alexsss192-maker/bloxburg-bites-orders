CREATE TABLE public.skippe_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL DEFAULT '',
  image_count integer NOT NULL DEFAULT 0,
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.skippe_messages TO authenticated;
GRANT ALL ON public.skippe_messages TO service_role;

ALTER TABLE public.skippe_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Chefs read own Skippe chat" ON public.skippe_messages
  FOR SELECT TO authenticated USING (owner_id = auth.uid() AND public.is_staff(auth.uid()));

CREATE POLICY "Chefs write own Skippe chat" ON public.skippe_messages
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND public.is_staff(auth.uid()));

CREATE POLICY "Chefs clear own Skippe chat" ON public.skippe_messages
  FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE INDEX skippe_messages_owner_created_idx ON public.skippe_messages (owner_id, created_at);