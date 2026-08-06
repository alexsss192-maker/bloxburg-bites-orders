# Panda Bites: Zen Blossom rebuild — order chat, no verification, new design system

You picked **Zen Blossom Dashboard**. That becomes the single design language for the whole site, customer and staff. Discord verification is removed entirely and replaced by a required username field at checkout. Every order gets a live chat thread with the chef.

## 1. Remove Discord verification

Verification currently gates every customer page: `/`, `/menu`, `/checkout`, `/history` and `/order/:id` all redirect to `/verify` before rendering, which is why the site is unusable right now.

- Delete the `/verify` page, the verification API routes, the signed cookie, the server-side gate, and the session hook.
- All customer pages become public — no gate, no redirect, no loop.
- At checkout, a **Discord username** field is required (2–64 characters). It is not verified against Discord; it is just how the chef knows who to contact.
- The Discord bot secrets stay in place for staff role sync (chef/admin), which is unaffected.

## 2. Order history by username

Customers find their orders by typing the same username they used at checkout.

- `/history` shows a username box; entering it lists every order under that name with status, item count and total.
- The username is remembered in the browser so returning visitors skip the box.
- After checkout they land straight on the order page, so no lookup is needed the first time.

## 3. Order chat with the chef

Opening an order automatically opens a chat panel and shows a one-time popup: "Chat opened — you and the chef can talk here."

- The thread starts with an automatic system message containing the full order (every item, quantity, line price) with the total, plus a prompt to share your timezone and agree on a pickup date and time.
- Live for both sides: new messages appear without a refresh.
- Chefs see the same thread from the staff order queue, so nothing moves to Discord DMs.
- Messages show sender name and time; customer bubbles are pink, chef bubbles are the light surface.

## 4. Chef menus

Chefs keep their own menu and can only touch their own items and discounts — unchanged rule, clearer UI. Skippe (the AI helper) still cannot set or edit prices; price fields stay locked and manual.

## 5. New design system, applied everywhere

Built from the chosen direction and reused on every page:

- Canvas `#FFF5F7`, white surfaces, ink `#4A1D24`, muted `#A6888E`, hairline `#FFD1DC`, accent `#FF4D8D`, tint `#FFF0F3`
- Syne 700/800 headings, Plus Jakarta Sans 400/500/600 body
- One large frosted app shell with a `2.5rem` radius, a left rail of navigation pills, a slim top bar showing the page title and live status, and `2rem` white content sections inside
- A 12-column content grid, so an order page reads as "details on the left, chat on the right"
- Motion: soft rise on entry, gentle card lift, tactile button press, pulsing live-status dot, messages sliding in

Customer pages get the same shell with a shorter rail (Menu, Cart, My orders). Staff pages get the full rail (Dashboard, Orders, My menu, Discounts, Skippe, Audit, Users) and quiet grouped rows instead of nested cards — that is the main fix for the confusing staff dashboard.

## Technical notes

- New `order_messages` table (order id, sender kind, author name, body, created_at) with realtime enabled; a customer reads/writes a thread by order id, chefs by their fulfillment on that order.
- The seed system message is written server-side when the order is placed, so it always matches the real order rows.
- `place_order` drops the verified-discord argument and takes the typed username; a new lookup function returns orders by username. Order pages keep working from the order id alone.
- Tokens live in `@theme inline` in `src/styles.css`; shared `AppShell`, `NavRail`, `TopBar`, `Section`, `RowList` and `ChatPanel` components replace the current per-page markup. No hardcoded hex in components.
- Removed: `src/routes/verify.tsx`, `src/routes/api/public/verify.*`, `src/lib/verify-cookie.server.ts`, `src/lib/verified-guard.ts`, `src/lib/use-verified-session.ts`.
- Anyone with an order link can view and chat on that order — the same trade-off as a shareable receipt link. Worth knowing before publishing.