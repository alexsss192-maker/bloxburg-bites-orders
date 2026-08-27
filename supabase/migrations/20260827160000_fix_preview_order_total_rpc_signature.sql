-- Fix the PostgREST RPC signature used by the checkout preview.
--
-- The client calls preview_order_total with these named arguments:
--   _items, _priority, _promo_code, _username
--
-- PostgREST matches RPC arguments by name. The previous migration created
-- the same four SQL types but used a different parameter-name/order layout,
-- which can leave the function invisible to the schema cache.
--
-- Recreate the function with the exact public argument names expected by
-- the application. The implementation still calls the *_base function
-- positionally in its original order.

DROP FUNCTION IF EXISTS public.preview_order_total(
  jsonb,
  jsonb,
  text,
  text
);

DROP FUNCTION IF EXISTS public.preview_order_total(
  jsonb,
  text,
  text,
  jsonb
);

CREATE OR REPLACE FUNCTION public.preview_order_total(
  _items jsonb,
  _priority jsonb DEFAULT '[]'::jsonb,
  _promo_code text DEFAULT NULL,
  _username text DEFAULT NULL
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
  -- Keep the base preview as the single source of truth for the normal
  -- subtotal, discount, priority, and discount-label behavior.
  SELECT *
  INTO base_row
  FROM public.preview_order_total_base(
    _items,
    _promo_code,
    _username,
    _priority
  );

  SELECT id
  INTO member_id
  FROM public.members
  WHERE username_key = lower(trim(coalesce(_username, '')));

  claimed_ok :=
    member_id IS NOT NULL
    AND _promo_code IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.member_discount_claims c
      JOIN public.chef_discounts cd ON cd.id = c.discount_id
      WHERE c.member_id = member_id
        AND c.used_order_id IS NULL
        AND upper(coalesce(cd.code, '')) =
            upper(trim(_promo_code))
    );

  IF claimed_ok THEN
    SELECT c.discount_id
    INTO claimed_discount_id
    FROM public.member_discount_claims c
    JOIN public.chef_discounts cd ON cd.id = c.discount_id
    WHERE c.member_id = member_id
      AND c.used_order_id IS NULL
      AND upper(coalesce(cd.code, '')) =
          upper(trim(_promo_code))
    LIMIT 1;
  END IF;

  IF member_id IS NOT NULL THEN
    SELECT r.value, r.label
    INTO reward_pct, reward_label
    FROM public.member_rewards r
    WHERE r.member_id = member_id
      AND r.kind = 'discount'
      AND r.uses_remaining > 0
    ORDER BY r.value DESC
    LIMIT 1;
  END IF;

  -- Determine the best normal chef discount for each owner.
  FOR item_owner IN
    SELECT DISTINCT mi.owner_id
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) x
    JOIN public.menu_items mi
      ON mi.id = (x->>'menu_item_id')::uuid
    WHERE mi.owner_id IS NOT NULL
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= greatest(0, (x->>'quantity')::integer)
  LOOP
    SELECT coalesce(
      sum(
        mi.price_bs * greatest(0, (x->>'quantity')::integer)
      ),
      0
    )::integer
    INTO owner_subtotal
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) x
    JOIN public.menu_items mi
      ON mi.id = (x->>'menu_item_id')::uuid
    WHERE mi.owner_id = item_owner
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= greatest(0, (x->>'quantity')::integer);

    SELECT coalesce(
      max(
        CASE
          WHEN cd.discount_type = 'percentage'
            THEN floor(owner_subtotal * cd.value / 100.0)::integer
          ELSE least(cd.value, owner_subtotal)
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
          AND (cd.starts_at IS NULL OR cd.starts_at <= now())
          AND (cd.ends_at IS NULL OR cd.ends_at > now())
          AND (
            cd.is_automatic
            OR (
              _promo_code IS NOT NULL
              AND upper(coalesce(cd.code, '')) =
                  upper(trim(_promo_code))
            )
          )
        )
        OR (
          claimed_discount_id IS NOT NULL
          AND cd.id = claimed_discount_id
        )
      );

    owner_discount := greatest(
      0,
      least(owner_discount, owner_subtotal)
    );

    chef_discount_total :=
      chef_discount_total + owner_discount;
  END LOOP;

  IF coalesce(reward_pct, 0) > 0 THEN
    reward_savings :=
      floor(base_row.subtotal_bs * reward_pct / 100.0)::integer;

    use_reward :=
      reward_savings > chef_discount_total;
  END IF;

  -- Calculate Bulk / Fast Service using the same discount that checkout
  -- would actually apply for each chef.
  FOR item_owner IN
    SELECT DISTINCT mi.owner_id
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) x
    JOIN public.menu_items mi
      ON mi.id = (x->>'menu_item_id')::uuid
    WHERE mi.owner_id IS NOT NULL
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= greatest(0, (x->>'quantity')::integer)
  LOOP
    SELECT coalesce(
      sum(
        mi.price_bs * greatest(0, (x->>'quantity')::integer)
      ),
      0
    )::integer
    INTO owner_subtotal
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) x
    JOIN public.menu_items mi
      ON mi.id = (x->>'menu_item_id')::uuid
    WHERE mi.owner_id = item_owner
      AND mi.is_active = true
      AND mi.price_bs > 0
      AND mi.stock >= greatest(0, (x->>'quantity')::integer);

    IF use_reward THEN
      owner_discount :=
        floor(owner_subtotal * reward_pct / 100.0)::integer;
    ELSE
      SELECT coalesce(
        max(
          CASE
            WHEN cd.discount_type = 'percentage'
              THEN floor(owner_subtotal * cd.value / 100.0)::integer
            ELSE least(cd.value, owner_subtotal)
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
            AND (cd.starts_at IS NULL OR cd.starts_at <= now())
            AND (cd.ends_at IS NULL OR cd.ends_at > now())
            AND (
              cd.is_automatic
              OR (
                _promo_code IS NOT NULL
                AND upper(coalesce(cd.code, '')) =
                    upper(trim(_promo_code))
              )
            )
          )
          OR (
            claimed_discount_id IS NOT NULL
            AND cd.id = claimed_discount_id
          )
        );
    END IF;

    owner_discount := greatest(
      0,
      least(owner_discount, owner_subtotal)
    );

    fee := public.calculate_bulk_service_fee(
      item_owner,
      owner_subtotal,
      owner_discount
    );

    IF fee <= 0 THEN
      CONTINUE;
    END IF;

    bulk_fee := bulk_fee + fee;

    bulk_details :=
      bulk_details ||
      jsonb_build_array(
        jsonb_build_object(
          'name', 'Bulk / Fast Service',
          'savings_bs', fee
        )
      );
  END LOOP;

  RETURN QUERY
  SELECT
    base_row.subtotal_bs,
    CASE
      WHEN use_reward THEN reward_savings
      ELSE base_row.discount_bs
    END,
    base_row.priority_bs,
    bulk_fee,
    (
      base_row.total_bs
      - CASE
          WHEN use_reward THEN base_row.discount_bs
          ELSE 0
        END
      + CASE
          WHEN use_reward THEN reward_savings
          ELSE 0
        END
      + bulk_fee
    )::integer,
    coalesce(base_row.discounts, '[]'::jsonb) || bulk_details,
    CASE
      WHEN bulk_fee > 0 THEN
        CASE
          WHEN base_row.applied_label IS NOT NULL THEN
            base_row.applied_label || ' + Bulk / Fast Service'
          ELSE
            'Bulk / Fast Service'
        END
      ELSE
        base_row.applied_label
    END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.preview_order_total(
  jsonb,
  jsonb,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.preview_order_total(
  jsonb,
  jsonb,
  text,
  text
) TO anon, authenticated, service_role;

-- Force PostgREST/Supabase to refresh its function schema.
NOTIFY pgrst, 'reload schema';
