ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'discord';

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_source_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_source_check CHECK (source IN ('discord', 'manual'));

CREATE INDEX IF NOT EXISTS user_roles_user_source_idx ON public.user_roles (user_id, source);