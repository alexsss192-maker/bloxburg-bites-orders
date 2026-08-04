# Panda Bites: Architectural Soft-Pop redesign + verification & auth hardening

You picked the **Architectural Soft-Pop** direction. That becomes the single design system for every page, customer and staff. The two blocking bugs (verification loop on the published site, staff login) get fixed in the same pass.

## 1. Design system (built once, used everywhere)

Extracted verbatim from the chosen direction into `src/styles.css` tokens:

- Canvas `#FFF5F7`, surface white, ink `#4A3E3F`, muted `#8E7E7F`, faint `#CBBABA`
- Accent `#FFB7C5`, accent-strong `#F48FB1`, accent-ink `#FF85A1`, hairline pink-100
- Syne 700/800 headings, Plus Jakarta Sans 400/500/600 body (loaded via `<link>` in the root route)
- Shape language: pill floating nav, `rounded-[2.5rem]` hero panels, `rounded-2xl` inputs/buttons, 1px hairline borders, soft pink-tinted shadows
- Decorative language: one oversized blurred accent circle plus one rotated outlined square per hero panel — used sparingly, never on data tables
- Motion: card lift on hover, `active:scale-[0.98]` on buttons, soft fade-and-rise on section entry, underline sweep on active nav

Shared pieces: floating pill header (nav + account/cart state), page-header block (Syne title + muted supporting line), a `PanelSplit` hero (accent side + action side), a dish card, and a dense row-list style for staff data.

## 2. Pages remodeled

Customer: Home, Menu (regular + seasonal grids, Seasonal Foods partner link kept), Checkout, Order history, Order detail, Verify.
Staff: Overview, Orders, Menu editor, Discounts, Skippe, Audit, Users — same tokens, tighter density, hairline row lists instead of heavy tables. Skippe price fields stay visibly read-only with a lock affordance.

## 3. Verification, fixed at the root

Stop trusting client state. The `pb_verified` cookie is validated on the server in `beforeLoad` for protected routes, which redirects before any protected UI renders — so there is no window where the app can bounce a verified user back to `/verify`.

- Cookie attributes chosen from the actual request: `Secure` only on real HTTPS, `SameSite=Lax` for same-origin published traffic, `Path=/`, `HttpOnly`.
- After a successful confirm, the server redirects (303) instead of the client reloading, so the browser lands on `/` with the cookie already attached — no panda-emoji pause, no loop.
- `VerifyGate` is retired as a gate and reduced to presentation.
- Verified end-to-end on the published origin before I call it done.

## 4. Staff auth

- Username + password sign-in (no email field shown), mapped internally to synthetic addresses.
- Provision **Alex** / `Forever Panda Bites` as an admin.
- Remove the copy explaining Melvin's username-only mapping and the password-change note.
- Discord role sync only touches Discord-sourced roles, so manually granted admin rights survive a sync.

## Technical notes

- Route-level `beforeLoad` server checks in TanStack Start replace the client gate; `src/lib/verify-cookie.server.ts` derives attributes from `x-forwarded-proto`/URL protocol.
- `user_roles` gets a `source` column (`discord` | `manual`); sync deletes only `source = 'discord'` rows.
- Design tokens live in `@theme inline` in `src/styles.css`; no hardcoded hex in components.
- The unauthenticated `/api/public/bootstrap` endpoint is removed.
