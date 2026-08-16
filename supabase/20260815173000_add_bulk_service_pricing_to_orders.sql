-- ============================================================
-- Panda Bites — Bulk / Fast Service pricing
-- ============================================================
--
-- This migration:
--
-- 1. Stores a Bulk / Fast Service fee for eligible chefs.
-- 2. Preserves the existing order RPCs as *_base functions.
-- 3. Creates secure wrappers around those RPCs.
-- 4. Applies the Bulk / Fast Service charge inside PostgreSQL.
-- 5. Makes preview and actual checkout use the same fee logic.
--
-- Fee types:
--   percentage -> e.g. 20 = +20%
--   fixed      -> e.g. 5000 = +B$5,000
--
-- A value of 0 removes the fee.
--
-- The client cannot choose the fee.
-- Skippe changes it server-side.
-- ============================================================


-- ============================================================
-- 1. ELIGIBLE BULK CHEFS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bulk_service_eligible_chefs (
  username text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS
  bulk_service_eligible_chefs_username_lower_key
ON public.bulk_service_eligible_chefs (lower(username));


ALTER TABLE public.bulk_service_eligible_chefs
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
  "Public can read bulk chef eligibility"
ON public.bulk_service_eligible_chefs;

CREATE POLICY
  "Public can read bulk chef eligibility"
ON public.bulk_service_eligible_chefs
FOR SELECT
TO anon, authenticated
USING (true);


-- No client-side INSERT / UPDATE / DELETE policies.
-- Eligibility is controlled server-side.


-- ============================================================
-- 2. BULK SERVICE FEE TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bulk_service_fees (
  chef_id uuid PRIMARY KEY
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  fee_type text NOT NULL
    CHECK (
      fee_type IN ('percentage', 'fixed')
    ),

  fee_value integer NOT NULL
    CHECK (
      fee_value >= 0
      AND (
        (
          fee_type = 'percentage'
          AND fee_value <= 100
        )
        OR
        (
          fee_type = 'fixed'
          AND fee_value <= 100000000
        )
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


ALTER TABLE public.bulk_service_fees
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
  "Chefs can view their own bulk service fee"
ON public.bulk_service_fees;

CREATE POLICY
  "Chefs can view their own bulk service fee"
ON public.bulk_service_fees
FOR SELECT
TO authenticated
USING (
  chef_id = auth.uid()
);


-- Intentionally no client INSERT / UPDATE / DELETE policies.
-- Skippe performs fee changes server-side.


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


DROP TRIGGER IF EXISTS
  set_bulk_service_fee_updated_at
ON public.bulk_service_fees;


CREATE TRIGGER
  set_bulk_service_fee_updated_at
BEFORE UPDATE ON public.bulk_service_fees
FOR EACH ROW
EXECUTE FUNCTION public.set_bulk_service_fee_updated_at();


-- ============================================================
-- 3. SERVER-SIDE BULK CHEF CHECK
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_bulk_service_chef(
  p_chef_id uuid
)
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
        AND public.has_role(
          p_chef_id,
          'admin'::app_role
        )
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


-- ============================================================
-- 4. PRESERVE EXISTING ORDER RPCs
-- ============================================================

ALTER FUNCTION public.place_order(
  text,
  text,
  jsonb,
  text,
  text,
  jsonb
)
RENAME TO place_order_base;


ALTER FUNCTION public.preview_order_total(
  jsonb,
  text,
  text,
  jsonb
)
RENAME TO preview_order_total_base;


-- ============================================================
-- 5. ORDER BULK FEE COLUMNS
-- ============================================================

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS bulk_service_fee_bs integer
NOT NULL DEFAULT 0;


ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS bulk_service_fee_label text;


ALTER TABLE public.order_fulfillments
ADD COLUMN IF NOT EXISTS bulk_service_fee_bs integer
NOT NULL DEFAULT 0;


ALTER TABLE public.order_fulfillments
ADD COLUMN IF NOT EXISTS bulk_service_fee_label text;


-- ============================================================
-- 6. BULK FEE CALCULATION HELPER
-- ============================================================
--
-- Centralizing this calculation makes the pricing rules easier
-- to keep identical between preview and actual checkout.
--
-- Percentage:
--   discounted subtotal × percentage / 100
--
-- Fixed:
--   exact configured B$ amount
--
-- The caller is responsible for checking eligibility.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_bulk_service_fee(
  p_chef_id uuid,
  p_subtotal integer,
  p_discount integer
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee_type text;
  v_fee_value integer;
  v_fee integer := 0;
BEGIN

  IF p_chef_id IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.is_bulk_service_chef(
    p_chef_id
  ) THEN
    RETURN 0;
  END IF;

  SELECT
    fee_type,
    fee_value
  INTO
    v_fee_type,
    v_fee_value
  FROM public.bulk_service_fees
  WHERE chef_id = p_chef_id;

  IF v_fee_value IS NULL
     OR v_fee_value <= 0 THEN
    RETURN 0;
  END IF;

  IF v_fee_type = 'percentage' THEN

    v_fee :=
      floor(
        GREATEST(
          0,
          COALESCE(p_subtotal, 0)
          - COALESCE(p_discount, 0)
        )
        * v_fee_value
        / 100.0
      )::integer;

  ELSE

    v_fee := v_fee_value;

  END IF;

  RETURN GREATEST(
    0,
    v_fee
  );
END;
$$;


-- ============================================================
-- 7. PREVIEW ORDER TOTAL
-- ============================================================
--
-- IMPORTANT:
--
-- This deliberately mirrors the discount/reward logic used by
-- place_order_base().
--
-- That means:
--
--   normal chef discounts
--   OR member reward discount
--   + priority
--   + Bulk / Fast Service
--
-- are calculated consistently.
-- ============================================================

DROP FUNCTION IF EXISTS public.preview_order_total(
  jsonb,
  text,
  text,
  jsonb
);


CREATE OR REPLACE FUNCTION public.preview_order_total(
  _items jsonb,
  _promo_code text DEFAULT NULL,
  _username text DEFAULT NULL,
  _priority jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(
  subtotal_bs integer,
  discount_bs integer,
  priority_bs integer,
  bulk_service_bs integer,
  total_bs integer,
  discounts jsonb,
  applied_label text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_row record;

  bulk_fee integer := 0;

  bulk_details jsonb := '[]'::jsonb;

  item_owner uuid;

  owner_subtotal integer := 0;
  owner_discount integer := 0;

  fee integer := 0;

  member_id uuid;

  claimed_ok boolean := false;

  claimed_discount_id uuid;

  reward_pct integer := 0;
  reward_label text;

  chef_discount_total integer := 0;

  reward_savings integer := 0;

  use_reward boolean := false;
BEGIN

  -- ----------------------------------------------------------
  -- First obtain the exact existing preview.
  -- ----------------------------------------------------------

  SELECT *
  INTO base_row
  FROM public.preview_order_total_base(
    _items,
    _promo_code,
    _username,
    _priority
  );


  -- ----------------------------------------------------------
  -- Find the member exactly like the original preview function.
  -- ----------------------------------------------------------

  SELECT id
  INTO member_id
  FROM public.members
  WHERE username_key =
    lower(
      trim(
        coalesce(
          _username,
          ''
        )
      )
    );


  -- ----------------------------------------------------------
  -- Determine whether the supplied promo code is a claimed
  -- member discount.
  -- ----------------------------------------------------------

  claimed_ok :=
    member_id IS NOT NULL
    AND _promo_code IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.member_discount_claims c
      JOIN public.chef_discounts cd
        ON cd.id = c.discount_id
      WHERE c.member_id = member_id
        AND c.used_order_id IS NULL
        AND upper(
          coalesce(
            cd.code,
            ''
          )
        ) =
        upper(
          trim(
            _promo_code
          )
        )
    );


  IF claimed_ok THEN

    SELECT c.discount_id
    INTO claimed_discount_id
    FROM public.member_discount_claims c
    JOIN public.chef_discounts cd
      ON cd.id = c.discount_id
    WHERE c.member_id = member_id
      AND c.used_order_id IS NULL
      AND upper(
        coalesce(
          cd.code,
          ''
        )
      ) =
      upper(
        trim(
          _promo_code
        )
      )
    LIMIT 1;

  END IF;


  -- ----------------------------------------------------------
  -- Determine the member reward exactly like the original
  -- preview.
  -- ----------------------------------------------------------

  IF member_id IS NOT NULL THEN

    SELECT
      r.value,
      r.label
    INTO
      reward_pct,
      reward_label
    FROM public.member_rewards r
    WHERE r.member_id = member_id
      AND r.kind = 'discount'
      AND r.uses_remaining > 0
    ORDER BY r.value DESC
    LIMIT 1;

  END IF;


  -- ----------------------------------------------------------
  -- Determine each chef's actual discounted subtotal.
  --
  -- This mirrors place_order_base():
  --   - choose the best applicable chef discount
  --   - claimed discount can also qualify
  --   - then compare the total with the member reward
  -- ----------------------------------------------------------

  FOR item_owner IN
    SELECT DISTINCT
      mi.owner_id
    FROM jsonb_array_elements(
      COALESCE(
        _items,
        '[]'::jsonb
      )
    ) x
    JOIN public.menu_items mi
      ON mi.id =
        (x->>'menu_item_id')::uuid
    WHERE mi.owner_id IS NOT NULL
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= GREATEST(
        0,
        (x->>'quantity')::integer
      )
  LOOP

    SELECT
      COALESCE(
        SUM(
          mi.price_bs *
          GREATEST(
            0,
            (x->>'quantity')::integer
          )
        ),
        0
      )::integer
    INTO owner_subtotal
    FROM jsonb_array_elements(
      COALESCE(
        _items,
        '[]'::jsonb
      )
    ) x
    JOIN public.menu_items mi
      ON mi.id =
        (x->>'menu_item_id')::uuid
    WHERE mi.owner_id = item_owner
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= GREATEST(
        0,
        (x->>'quantity')::integer
      );


    -- --------------------------------------------------------
    -- Pick the same best discount used by place_order_base().
    -- --------------------------------------------------------

    SELECT
      COALESCE(
        MAX(
          CASE
            WHEN cd.discount_type = 'percentage'
              THEN floor(
                owner_subtotal *
                cd.value /
                100.0
              )::integer

            ELSE
              least(
                cd.value,
                owner_subtotal
              )
          END
        ),
        0
      )::integer
    INTO owner_discount
    FROM public.chef_discounts cd
    WHERE cd.owner_id = item_owner
      AND (
        (
          cd.is_active
          AND (
            cd.starts_at IS NULL
            OR cd.starts_at <= now()
          )
          AND (
            cd.ends_at IS NULL
            OR cd.ends_at > now()
          )
          AND (
            cd.is_automatic
            OR (
              _promo_code IS NOT NULL
              AND upper(
                coalesce(
                  cd.code,
                  ''
                )
              ) =
              upper(
                trim(
                  _promo_code
                )
              )
            )
          )
        )
        OR
        (
          claimed_discount_id IS NOT NULL
          AND cd.id =
            claimed_discount_id
        )
      );


    owner_discount :=
      GREATEST(
        0,
        LEAST(
          owner_discount,
          owner_subtotal
        )
      );


    chef_discount_total :=
      chef_discount_total +
      owner_discount;

  END LOOP;


  -- ----------------------------------------------------------
  -- Match the original member reward behavior.
  -- ----------------------------------------------------------

  IF COALESCE(reward_pct, 0) > 0 THEN

    reward_savings :=
      floor(
        base_row.subtotal_bs *
        reward_pct /
        100.0
      )::integer;

    use_reward :=
      reward_savings >
      chef_discount_total;

  END IF;


  -- ----------------------------------------------------------
  -- Now calculate the Bulk / Fast Service fee.
  -- ----------------------------------------------------------

  FOR item_owner IN
    SELECT DISTINCT
      mi.owner_id
    FROM jsonb_array_elements(
      COALESCE(
        _items,
        '[]'::jsonb
      )
    ) x
    JOIN public.menu_items mi
      ON mi.id =
        (x->>'menu_item_id')::uuid
    WHERE mi.owner_id IS NOT NULL
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= GREATEST(
        0,
        (x->>'quantity')::integer
      )
  LOOP

    SELECT
      COALESCE(
        SUM(
          mi.price_bs *
          GREATEST(
            0,
            (x->>'quantity')::integer
          )
        ),
        0
      )::integer
    INTO owner_subtotal
    FROM jsonb_array_elements(
      COALESCE(
        _items,
        '[]'::jsonb
      )
    ) x
    JOIN public.menu_items mi
      ON mi.id =
        (x->>'menu_item_id')::uuid
    WHERE mi.owner_id = item_owner
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= GREATEST(
        0,
        (x->>'quantity')::integer
      );


    -- --------------------------------------------------------
    -- If the member reward wins, use the exact reward discount
    -- that place_order_base() would put on this fulfillment.
    -- Otherwise use the chef's actual discount.
    -- --------------------------------------------------------

    IF use_reward THEN

      owner_discount :=
        floor(
          owner_subtotal *
          reward_pct /
          100.0
        )::integer;

    ELSE

      SELECT
        COALESCE(
          MAX(
            CASE
              WHEN cd.discount_type = 'percentage'
                THEN floor(
                  owner_subtotal *
                  cd.value /
                  100.0
                )::integer

              ELSE
                least(
                  cd.value,
                  owner_subtotal
                )
            END
          ),
          0
        )::integer
      INTO owner_discount
      FROM public.chef_discounts cd
      WHERE cd.owner_id = item_owner
        AND (
          (
            cd.is_active
            AND (
              cd.starts_at IS NULL
              OR cd.starts_at <= now()
            )
            AND (
              cd.ends_at IS NULL
              OR cd.ends_at > now()
            )
            AND (
              cd.is_automatic
              OR (
                _promo_code IS NOT NULL
                AND upper(
                  coalesce(
                    cd.code,
                    ''
                  )
                ) =
                upper(
                  trim(
                    _promo_code
                  )
                )
              )
            )
          )
          OR
          (
            claimed_discount_id IS NOT NULL
            AND cd.id =
              claimed_discount_id
          )
        );

    END IF;


    owner_discount :=
      GREATEST(
        0,
        LEAST(
          owner_discount,
          owner_subtotal
        )
      );


    -- --------------------------------------------------------
    -- Calculate the actual fee through the shared function.
    -- --------------------------------------------------------

    fee :=
      public.calculate_bulk_service_fee(
        item_owner,
        owner_subtotal,
        owner_discount
      );


    IF fee <= 0 THEN
      CONTINUE;
    END IF;


    bulk_fee :=
      bulk_fee +
      fee;


    bulk_details :=
      bulk_details ||
      jsonb_build_array(
        jsonb_build_object(
          'name',
          'Bulk / Fast Service',
          'savings_bs',
          fee
        )
      );

  END LOOP;


  -- ----------------------------------------------------------
  -- Return:
  --
  -- subtotal
  -- - correct discount
  -- + priority
  -- + bulk fee
  -- = total
  -- ----------------------------------------------------------

  RETURN QUERY
  SELECT
    base_row.subtotal_bs,
    CASE
      WHEN use_reward
        THEN reward_savings
      ELSE
        base_row.discount_bs
    END,
    base_row.priority_bs,
    bulk_fee,
    (
      base_row.total_bs
      - CASE
          WHEN use_reward
            THEN base_row.discount_bs
          ELSE 0
        END
      + CASE
          WHEN use_reward
            THEN reward_savings
          ELSE 0
        END
      + bulk_fee
    )::integer,
    (
      COALESCE(
        base_row.discounts,
        '[]'::jsonb
      )
      ||
      bulk_details
    ),
    CASE
      WHEN bulk_fee > 0 THEN
        CASE
          WHEN base_row.applied_label IS NOT NULL THEN
            base_row.applied_label ||
            ' + Bulk / Fast Service'
          ELSE
            'Bulk / Fast Service'
        END
      ELSE
        base_row.applied_label
    END;
END;
$$;


-- ============================================================
-- 8. ACTUAL ORDER PLACEMENT
-- ============================================================
--
-- The original order is created first.
--
-- Then the exact same shared Bulk Service calculation is
-- applied to each eligible fulfillment.
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_order(
  _discord_username text,
  _note text,
  _items jsonb,
  _verified_discord_id text DEFAULT NULL::text,
  _promo_code text DEFAULT NULL::text,
  _priority jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE

  new_order_id uuid;

  f record;

  owner_fee integer;

  bulk_total integer := 0;

  current_total integer;

  new_total integer;

BEGIN

  -- ----------------------------------------------------------
  -- Run the original order creation logic.
  -- ----------------------------------------------------------

  new_order_id :=
    public.place_order_base(
      _discord_username,
      _note,
      _items,
      _verified_discord_id,
      _promo_code,
      _priority
    );


  -- ----------------------------------------------------------
  -- Apply Bulk / Fast Service to every eligible fulfillment.
  -- ----------------------------------------------------------

  FOR f IN
    SELECT
      of.id,
      of.chef_id,
      of.subtotal_bs,
      of.discount_bs,
      of.priority_price_bs
    FROM public.order_fulfillments of
    WHERE of.order_id =
      new_order_id
  LOOP

    IF f.chef_id IS NULL THEN
      CONTINUE;
    END IF;


    owner_fee :=
      public.calculate_bulk_service_fee(
        f.chef_id,
        f.subtotal_bs,
        f.discount_bs
      );


    IF owner_fee <= 0 THEN
      CONTINUE;
    END IF;


    -- --------------------------------------------------------
    -- Store the fee on the fulfillment.
    -- --------------------------------------------------------

    UPDATE public.order_fulfillments
    SET
      bulk_service_fee_bs =
        owner_fee,

      bulk_service_fee_label =
        CASE
          WHEN (
            SELECT b.fee_type
            FROM public.bulk_service_fees b
            WHERE b.chef_id = f.chef_id
          ) = 'percentage'
          THEN
            'Bulk / Fast Service (' ||
            (
              SELECT b.fee_value
              FROM public.bulk_service_fees b
              WHERE b.chef_id = f.chef_id
            ) ||
            '%)'

          ELSE
            'Bulk / Fast Service (B$' ||
            (
              SELECT b.fee_value
              FROM public.bulk_service_fees b
              WHERE b.chef_id = f.chef_id
            ) ||
            ')'
        END,

      total_bs =
        subtotal_bs
        - discount_bs
        + priority_price_bs
        + owner_fee

    WHERE id = f.id;


    bulk_total :=
      bulk_total +
      owner_fee;

  END LOOP;


  -- ----------------------------------------------------------
  -- Read the current order total.
  -- ----------------------------------------------------------

  SELECT
    o.total_bs
  INTO
    current_total
  FROM public.orders o
  WHERE o.id =
    new_order_id;


  new_total :=
    current_total +
    bulk_total;


  -- ----------------------------------------------------------
  -- Store the total Bulk Service fee on the order.
  -- ----------------------------------------------------------

  UPDATE public.orders
  SET
    bulk_service_fee_bs =
      bulk_total,

    bulk_service_fee_label =
      CASE
        WHEN bulk_total > 0
          THEN 'Bulk / Fast Service'
        ELSE NULL
      END,

    total_bs =
      new_total

  WHERE id =
    new_order_id;


  -- ----------------------------------------------------------
  -- Tell the customer about the fee in the order chat.
  -- ----------------------------------------------------------

  IF bulk_total > 0 THEN

    INSERT INTO public.order_messages (
      order_id,
      sender_kind,
      author_name,
      body
    )
    VALUES (
      new_order_id,
      'system',
      'Panda Bites',
      'Bulk / Fast Service: +B$' ||
      bulk_total ||
      E'\n' ||
      'Updated total: B$' ||
      new_total
    );

  END IF;


  RETURN new_order_id;

END;
$function$;


-- ============================================================
-- 9. PERMISSIONS
-- ============================================================

GRANT EXECUTE
ON FUNCTION public.preview_order_total(
  jsonb,
  text,
  text,
  jsonb
)
TO anon, authenticated;


GRANT EXECUTE
ON FUNCTION public.place_order(
  text,
  text,
  jsonb,
  text,
  text,
  jsonb
)
TO anon, authenticated;


-- The original base functions are server-only.

REVOKE EXECUTE
ON FUNCTION public.place_order_base(
  text,
  text,
  jsonb,
  text,
  text,
  jsonb
)
FROM anon, authenticated;


REVOKE EXECUTE
ON FUNCTION public.preview_order_total_base(
  jsonb,
  text,
  text,
  jsonb
)
FROM anon, authenticated;
