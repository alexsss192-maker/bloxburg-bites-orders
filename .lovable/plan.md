# Panda Bites — Ordering System Plan

A bold, playful ordering site for your Bloxburg food shop, with a menu, a sexy cart, a seasonal-redirect modal, and a staff portal where admins manage items and chefs fulfill orders.

## Design direction

- **Palette**: "Panda Noir" — near-black `#0d0d0d`, warm off-white `#f5f3ee`, bamboo green `#7d9b76`, cherry-red accent `#e85d3a`. Playful but premium.
- **Typography**: Abril Fatface (display headings) + Cabin (body). Bold food-editorial feel.
- **Vibe**: Big juicy hero, sticky floating cart drawer with spring animation, glossy card menu tiles with hover lift, panda mascot accents.

## Pages / routes

```text
/                       Landing (hero, "Order now", featured items)
/menu                   Tabs: Non-Seasonals | Seasonals
                          - Non-Seasonals: live menu grid with add-to-cart
                          - Seasonals: opens modal → button to seasonalfoods.lovable.app
/checkout               Cart review + Discord username + B$ payment note → places order
/order/:id              Order confirmation with reference code
/staff                  Staff login (email + password)
/staff/orders           Chef + Admin: list orders, mark preparing/ready/delivered
/staff/menu             Admin only: create/edit/delete menu items, stock, images, price (B$)
/staff/users            Admin only: promote chef accounts
```

## Ordering / stock behavior

- Customers browse anonymously (no login required per your call — Discord bot login comes later).
- Add to cart → sexy slide-in drawer with quantity steppers, running B$ total, remove buttons, empty state with mascot.
- Checkout captures: Discord username (validated), optional note, cart contents. Payment method is fixed to "Bloxburg Cash (B$)" with instructions to DM staff in Discord.
- On order submit (server function, transactional): for each line item, atomically decrement `stock` — if any item has insufficient stock the whole order fails with a clear error. Stock of 77 → order 5 → becomes 72 automatically.
- Out-of-stock items show a "Sold out" badge and disable add-to-cart.

## Staff portal

- **Admin** (Hellosavagesavage79 / Panda Bites — seeded): full menu CRUD, view all orders, change order status, promote users to `chef`.
- **Chef**: view orders queue, update status (pending → preparing → ready → delivered), cannot edit menu.
- Roles stored in a separate `user_roles` table with `has_role()` security-definer function (standard secure pattern).

## Seasonal tab

Clicking the Seasonals tab opens a themed modal:

> "Seasonal foods live on a separate shop! Join that Discord to gain access."
> Primary button → `https://seasonalfoods.lovable.app/` (opens new tab). Non-Seasonals tab stays active underneath.

## Technical details

- **Backend**: Lovable Cloud (Supabase) enabled.
- **Auth**: Email/password for staff only. Admin account seeded via migration using Auth Admin API ([Hellosavagesavage79@pandabites.local](mailto:Hellosavagesavage79@pandabites.local) / Panda Bites) and granted `admin` role.
- **DB schema** (all with GRANTs + RLS):
  - `menu_items` (id, name, description, price_bs int, stock int, image_url, category enum('non_seasonal','seasonal'), is_active, timestamps). Public `SELECT` for `anon` where `is_active` + `non_seasonal`. Admin-only write via RLS + `has_role`.
  - `orders` (id, discord_username, note, total_bs, status enum, created_at). Public `INSERT` for anon; `SELECT/UPDATE` for staff (chef or admin).
  - `order_items` (id, order_id, menu_item_id, quantity, unit_price_bs).
  - `user_roles` (id, user_id, role enum('admin','chef')) — per security guidance.
  - `app_role` enum + `has_role()` SECURITY DEFINER function.
- **Stock decrement**: Postgres function `place_order(items jsonb, discord text, note text)` runs the insert + `UPDATE ... SET stock = stock - qty WHERE stock >= qty` in one transaction, returning the new order id. Called from a public server route.
- **Server functions**: `staff/*` protected via `requireSupabaseAuth` + role check. Menu reads for the public site use the server publishable client with the narrow anon SELECT policy.
- **Cart state**: Zustand + localStorage persistence.
- **Animations**: Framer Motion for cart drawer, tab switch, and card hovers.

## Out of scope (per your message)

- Discord bot login (later).
- Real payment processing — payment is a manual B$ note captured on the order.
- Seasonal menu management (that's the other site).

## Deliverables in this build

1. Enable Lovable Cloud + migrations (tables, enums, RLS, GRANTs, `place_order` fn, seed admin).
2. Public site: landing, menu with tabs, cart drawer, checkout, order confirmation.
3. Staff portal: login, orders queue, menu CRUD (admin), user role management (admin).
4. Seasonal redirect modal.
5. SEO head metadata per route, favicon reuse, error/not-found boundaries.  
  
Thisa MUST look so sexy as you have so little to do

Approve and I'll build it end-to-end.