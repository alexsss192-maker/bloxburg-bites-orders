CREATE OR REPLACE FUNCTION public.get_order_public(_order_id uuid)
 RETURNS TABLE(id uuid, discord_username text, note text, subtotal_bs integer, discount_bs integer, total_bs integer, status order_status, created_at timestamp with time zone, items jsonb, fulfillments jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.discord_username, o.note, o.subtotal_bs, o.discount_bs, o.total_bs, o.status, o.created_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'item_name', oi.item_name, 'quantity', oi.quantity, 'unit_price_bs', oi.unit_price_bs,
      'subtotal_bs', oi.subtotal_bs, 'discount_bs', oi.discount_bs, 'discount_name', oi.discount_name
    ) ORDER BY oi.id) FROM public.order_items oi WHERE oi.order_id = o.id), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'status', f.status, 'subtotal_bs', f.subtotal_bs, 'discount_bs', f.discount_bs, 'total_bs', f.total_bs,
      'cancel_reason', f.cancel_reason, 'priority_label', f.priority_label, 'priority_color', f.priority_color
    ) ORDER BY f.id)
      FROM public.order_fulfillments f WHERE f.order_id = o.id), '[]'::jsonb)
  FROM public.orders o WHERE o.id = _order_id;
$function$;
