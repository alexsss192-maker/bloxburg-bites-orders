# This-turn upgrade plan

## 1. Fix the "admin can't get in" issue
The account `hellosavagesavage79@pandabites.local` **already has the admin role** in the database — the auth logs confirm a successful login. The real blocker is that `/staff` sits behind the verify gate too on some paths, and after sign-in the header link goes to `/staff/orders` which doesn't exist yet as an index. Fix:
- Add `/staff` index redirect → `/staff/orders`
- Ensure `getMyRoles` returns roles even when the bearer attacher hasn't hydrated yet (retry once on 401)
- Show a clearer "Signed in as X — checking roles…" state instead of the silent "No staff access" flash
- Add a visible "You are: admin/chef" badge in the staff header so the user can confirm role at a glance

## 2. Premium checkout flow
Rework `/checkout` + cart into a 3-step wizard with animated transitions:
```text
[Cart] → [Details + Verify] → [Confirmation] → [Receipt /order/:id]
```
- Framer-motion slide/fade between steps, sticky progress indicator (1·2·3)
- Cart drawer gets a "Proceed to checkout" morph animation
- Skeleton loaders on every async boundary (menu, order submit, order fetch)
- Success screen: confetti burst + big order ID + "Copy link" + "View receipt"
- Inline validation (Discord username shape, empty cart guard, stock re-check)
- Disabled-state buttons with spinner, never a dead click

## 3. OTP resend with cooldown
- New endpoint `POST /api/public/verify/resend` (rate-limited to 1/60s per IP + discord_id)
- Verify page shows a **"Resend code (60s)"** countdown button after first send
- Clear error copy for: expired code, wrong code (attempts remaining), too many attempts, not in guild
- Auto-focus next OTP digit, paste-to-fill 6 digits, Enter to submit

## 4. Panda audit log (staff)
- New table `public.panda_audit_log` (id, actor_user_id, actor_email, action, target_type, target_id, payload jsonb, created_at) with RLS: staff read, service_role write, GRANTs included
- Every Panda server-fn action (item added, stock inserted, item edited, item toggled) writes an audit row
- New page `/staff/audit` with filter by actor + action + date, newest first, pagination
- Link from `/staff/panda` header: "View audit log →"

## 5. Extra polish (same turn, contained)
- **SEO**: unique `head()` per route (title, description, og:title/description, twitter:card); add JSON-LD Restaurant schema to `/`
- **404 page**: branded panda 404 with "Back to menu" CTA
- **Global error boundary**: friendly panda error card + "Try again" that calls `router.invalidate()`
- **Empty states**: cart empty, no orders yet, no menu items — all get illustrated empty states instead of blank divs
- **Toasts**: unify sonner styling to match cream/ink/cherry theme
- **Accessibility**: focus rings on all interactive elements, aria-labels on icon buttons, `prefers-reduced-motion` respected
- **Perf**: lazy-load framer-motion on non-critical routes, `loading="lazy"` on menu images
- **Header**: show verified Discord username + avatar when verified, "Sign out of verification" menu item
- **Order receipt** (`/order/:id`): print-friendly layout, "Add to Discord DM" copy button with pre-filled message

## Technical notes
- Audit writes go through `supabaseAdmin` inside existing Panda handlers (already authorized by `requireSupabaseAuth` + admin/chef check) — no new auth surface
- Resend endpoint reuses `discord_verifications` table, adds `last_sent_at` column via migration
- Checkout wizard is a single `/checkout` route using local step state — no new routes, keeps router surface small
- All new UI uses existing tokens (`cream`, `ink`, `cherry`, `font-display`) — no new colors
- No new npm packages (framer-motion, sonner, lucide already installed)

## Files touched (estimate)
- New: `panda_audit_log` migration, `/staff/audit.tsx`, `verify/resend.ts`, `NotFound` component
- Edited: `checkout.tsx`, `verify.tsx`, `staff.tsx`, `staff.panda.tsx` + panda functions, `__root.tsx` (error boundary), `site-header.tsx`, `order.$id.tsx`, route heads for SEO
