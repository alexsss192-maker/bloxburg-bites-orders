-- Bulk / Fast Service pricing
--
-- Only the server-side Skippe tool should be able to create/update
-- these rows. Customers and normal chefs must not be able to edit
-- bulk service pricing directly.

create table if not exists public.bulk_service_fees (
  chef_id uuid primary key references auth.users(id) on delete cascade,

  fee_type text not null
    check (fee_type in ('percentage', 'fixed')),

  fee_value integer not null
    check (
      fee_value >= 0
      and (
        (fee_type = 'percentage' and fee_value <= 100)
        or
        (fee_type = 'fixed' and fee_value <= 100000000)
      )
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bulk_service_fees is
  'Bulk / Fast Service pricing configured through Skippe for eligible bulk chefs.';

comment on column public.bulk_service_fees.fee_type is
  'percentage = percentage increase; fixed = flat B$ amount.';

comment on column public.bulk_service_fees.fee_value is
  'Percentage points or fixed B$ amount depending on fee_type.';


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

alter table public.bulk_service_fees enable row level security;


-- Customers and normal client-side users must not be able to
-- create/update/delete fee records.
--
-- The Skippe server uses the service-role/server-side Supabase
-- connection for these mutations.


drop policy if exists "Bulk service fees are not publicly writable"
on public.bulk_service_fees;


-- A chef may read their own current fee.
-- This is useful if the staff portal wants to display it, while
-- mutations remain server-only.

drop policy if exists "Chefs can view their own bulk service fee"
on public.bulk_service_fees;

create policy "Chefs can view their own bulk service fee"
on public.bulk_service_fees
for select
to authenticated
using (
  chef_id = auth.uid()
);


-- Do NOT create INSERT / UPDATE / DELETE policies for authenticated
-- users.
--
-- That means:
--
--   SELECT  -> own row only
--   INSERT  -> server-side only
--   UPDATE  -> server-side only
--   DELETE  -> server-side only
--
-- Skippe performs the actual mutation server-side.


-- ------------------------------------------------------------
-- updated_at helper
-- ------------------------------------------------------------

create or replace function public.set_bulk_service_fee_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


drop trigger if exists set_bulk_service_fee_updated_at
on public.bulk_service_fees;

create trigger set_bulk_service_fee_updated_at
before update on public.bulk_service_fees
for each row
execute function public.set_bulk_service_fee_updated_at();


-- ------------------------------------------------------------
-- Useful index
-- ------------------------------------------------------------

create index if not exists idx_bulk_service_fees_chef_id
on public.bulk_service_fees (chef_id);
