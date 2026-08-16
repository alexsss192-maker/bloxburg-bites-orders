-- ============================================================
-- FIX: bulk_service_fees missing from live schema
-- Run this in Supabase → SQL Editor (once)
-- Then: Settings → API → Reload schema cache
-- ============================================================

-- 1) Eligible bulk chefs registry (needed by is_bulk_service_chef)
CREATE TABLE IF NOT EXISTS public.bulk_service_eligible_chefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bulk_service_eligible_chefs_username_lower_key
  ON public.bulk_service_eligible_chefs (lower(username));

ALTER TABLE public.bulk_service_eligible_chefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read bulk chef eligibility"
  ON public.bulk_service_eligible_chefs;
CREATE POLICY "Public can read bulk chef eligibility"
  ON public.bulk_service_eligible_chefs
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2) Fee table
CREATE TABLE IF NOT EXISTS public.bulk_service_fees (
  chef_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fee_type text NOT NULL CHECK (fee_type IN ('percentage', 'fixed')),
  fee_value integer NOT NULL CHECK (
    fee_value >= 0
    AND (
      (fee_type = 'percentage' AND fee_value <= 100)
      OR (fee_type = 'fixed' AND fee_value <= 100000000)
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bulk_service_fees IS
  'Bulk / Fast Service pricing configured through Skippe for eligible bulk chefs.';

ALTER TABLE public.bulk_service_fees ENABLE ROW LEVEL SECURITY;

-- SELECT own fee
DROP POLICY IF EXISTS "Chefs can view their own bulk service fee"
  ON public.bulk_service_fees;
CREATE POLICY "Chefs can view their own bulk service fee"
  ON public.bulk_service_fees
  FOR SELECT
  TO authenticated
  USING (chef_id = auth.uid());

-- INSERT own fee (Skippe uses the user JWT, not service role)
DROP POLICY IF EXISTS "Chefs can insert their own bulk service fee"
  ON public.bulk_service_fees;
CREATE POLICY "Chefs can insert their own bulk service fee"
  ON public.bulk_service_fees
  FOR INSERT
  TO authenticated
  WITH CHECK (chef_id = auth.uid());

-- UPDATE own fee
DROP POLICY IF EXISTS "Chefs can update their own bulk service fee"
  ON public.bulk_service_fees;
CREATE POLICY "Chefs can update their own bulk service fee"
  ON public.bulk_service_fees
  FOR UPDATE
  TO authenticated
  USING (chef_id = auth.uid())
  WITH CHECK (chef_id = auth.uid());

-- DELETE own fee
DROP POLICY IF EXISTS "Chefs can delete their own bulk service fee"
  ON public.bulk_service_fees;
CREATE POLICY "Chefs can delete their own bulk service fee"
  ON public.bulk_service_fees
  FOR DELETE
  TO authenticated
  USING (chef_id = auth.uid());

-- Grants so PostgREST exposes the table
GRANT SELECT ON public.bulk_service_fees TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bulk_service_fees TO authenticated;
GRANT ALL ON public.bulk_service_fees TO service_role;

GRANT SELECT ON public.bulk_service_eligible_chefs TO anon, authenticated;
GRANT ALL ON public.bulk_service_eligible_chefs TO service_role;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_bulk_service_fee_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_bulk_service_fee_updated_at ON public.bulk_service_fees;
CREATE TRIGGER set_bulk_service_fee_updated_at
  BEFORE UPDATE ON public.bulk_service_fees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_bulk_service_fee_updated_at();

CREATE INDEX IF NOT EXISTS idx_bulk_service_fees_chef_id
  ON public.bulk_service_fees (chef_id);

-- Optional: is_bulk_service_chef helper (idempotent)
CREATE OR REPLACE FUNCTION public.is_bulk_service_chef(p_chef_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = p_chef_id
        AND public.has_role(p_chef_id, 'admin'::app_role)
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      JOIN public.bulk_service_eligible_chefs b
        ON lower(b.username) = lower(sp.username)
      WHERE sp.user_id = p_chef_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_bulk_service_chef(uuid) TO anon, authenticated, service_role;
