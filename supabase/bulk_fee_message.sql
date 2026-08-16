-- Bulk / Fast Service fee: optional hover message chefs can edit
ALTER TABLE public.bulk_service_fees
  ADD COLUMN IF NOT EXISTS fee_message text;

COMMENT ON COLUMN public.bulk_service_fees.fee_message IS
  'Customer-facing explanation shown on hover at checkout for the Bulk / Fast Service fee.';

-- Optional default for existing rows
UPDATE public.bulk_service_fees
SET fee_message = COALESCE(
  NULLIF(trim(fee_message), ''),
  'Bulk / Fast Service handles large orders in a dedicated kitchen lane so they finish faster. This fee covers that capacity. Adding priority (High/Mid/Low) on top makes your order even faster in the queue.'
)
WHERE fee_value > 0 AND (fee_message IS NULL OR trim(fee_message) = '');
