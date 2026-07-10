-- Panda audit log
CREATE TABLE public.panda_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  target_type text,
  target_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.panda_audit_log TO authenticated;
GRANT ALL ON public.panda_audit_log TO service_role;

ALTER TABLE public.panda_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff read audit log"
  ON public.panda_audit_log FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX panda_audit_log_created_at_idx ON public.panda_audit_log (created_at DESC);
CREATE INDEX panda_audit_log_actor_idx ON public.panda_audit_log (actor_user_id);

-- Resend cooldown
ALTER TABLE public.discord_verifications
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NOT NULL DEFAULT now();
