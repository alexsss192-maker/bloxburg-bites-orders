# Panda Bites verification, staff auth, and UI hardening

## Goal

Make Discord verification reliable on the published site, ensure protected pages are authorized before rendering, replace staff email login with username login, securely provision **Alex** as an admin, and apply the selected modern-minimalist visual direction across the app.

## Confirmed issues

- The current verification gate runs in a React effect after hydration. Protected routes render first, then `/api/public/verify/session` decides whether to navigate, which creates the visible redirect race.
- The verification cookie changes attributes based on forwarded protocol and uses `SameSite=None; Partitioned` on HTTPS. That production-only behavior is a likely contributor to preview/published differences.
- `/api/public/bootstrap` is an unauthenticated endpoint with hardcoded credentials that can create an admin account. It must be removed.
- Staff login currently accepts email/password. The UI still contains the Melvin account note.
- Discord role synchronization deletes all stored roles on every login, so it can erase a manually assigned Alex admin role unless role sources are separated.

## Implementation

### 1. Server-authoritative Discord verification

- Replace the root client-side `VerifyGate` with a pathless protected route layout.
- Keep `/verify`, `/staff`, and public API routes outside that layout; move customer-only pages under it without changing their public URLs.
- In the protected layout's `beforeLoad`, call a server function that reads and cryptographically validates `pb_verified`; throw a router redirect to `/verify` before protected components or loaders render when invalid.
- Return the verified Discord identity through route context so protected pages share one authoritative session instead of repeatedly fetching navigation state.
- Make `/verify` redirect verified visitors through the same server-authoritative check.
- Remove the client gate, panda loading delay, redirect-effect loop, and redundant session endpoint where it is no longer needed.
- Keep ordering/history server functions independently validating the signed cookie so authorization is enforced at the data boundary too.

### 2. Published cookie reliability

- Issue one host-only, HTTP-only verification cookie with consistent production attributes: `Secure`, `SameSite=Lax`, explicit path, expiry, and no unnecessary `Partitioned` flag for normal top-level same-origin use.
- Use local-development fallback attributes only on localhost; do not infer production security from an untrusted forwarded header alone.
- Add private/no-store response headers to verification/session-sensitive responses.
- After code confirmation, navigate to `/` and let the protected server layout validate the newly issued cookie before rendering.
- Validate the real published round trip: confirm response sets the cookie, next document request sends it, protected content renders, and refresh remains verified.

### 3. Secure username/password staff accounts

- Add a `profiles` table for normalized unique usernames and display names, with explicit grants, RLS, and own-profile read policy. Roles remain only in `user_roles`.
- Implement username login by normalizing the username and deriving an internal synthetic auth email server-side; the browser submits only username/password and never performs a public email lookup.
- Because synthetic addresses cannot receive mail, omit email password-reset UI and document that password changes are admin-managed.
- Update staff account creation/listing to use usernames, masked password inputs, strict server validation, and server-only privileged account creation.
- Provision **Alex** with the supplied password through a one-time trusted backend operation, create the profile, and assign the admin role without exposing the password in source, migrations, logs, or browser responses.
- Remove `/api/public/bootstrap` and all hardcoded bootstrap credentials.
- Remove the Melvin note and all email terminology from staff sign-in.

### 4. Preserve manual admin access safely

- Add a role-source field to `user_roles` (for example `manual` and `discord`).
- Update Discord role sync to replace only Discord-sourced rows and leave manually granted roles such as Alex's admin role intact.
- Keep role checks server-side and keep chefs limited to their own menus, discounts, and fulfillment records.

### 5. Modern-minimalist UI system, applied to every page

Build one shared design system from the approved sign-in direction, then remodel every page — customer and staff — against it.

**Design system foundation**

- Structural reference: focused branded header, one clear primary surface, balanced viewport spacing, restrained blush background, strong ink text, purposeful pink accent, soft shadow, generous padding.
- Keep **Syne** headings and **Plus Jakarta Sans** body text.
- Normalize tokens for background, surface, border, radius, input, button, badge, muted text, and status colors so pages stop mixing raw white/ink opacity values with semantic roles.
- Encode primary/secondary/ghost/destructive button variants and one field style once, instead of repeating ad hoc classes per page.
- Remove ornamental blobs, floating particles, confetti, and looping mascot motion. Keep only short hover, focus, loading, and state transitions with reduced-motion support.
- No card walls or nested cards: one dominant surface per task, clear section rhythm, and lists/tables that become stacked rows on mobile.

**Pages to remodel**

- Customer: home, menu (including seasonal), verification, checkout, cart drawer, order history, order tracking, header, footer.
- Staff: sign-in, portal shell and navigation, orders dashboard, menu editor, discounts, Skippe, audit log, users and roles.
- System states: loading, empty, no-access, error boundary, and not-found.

**Rendered direction previews for key screens**

Before rewriting the heavier screens, generate rendered design directions for the screens where composition matters most, and let you pick each one:

1. Customer menu and home
2. Checkout and order tracking
3. Staff orders dashboard
4. Staff menu editor and discounts

Directions will keep the approved palette, typography, and minimalist system locked, varying only composition, density, and hierarchy. Lower-risk screens (audit, users, system states) follow the chosen patterns directly without a separate pick.

## Technical details

- All schema changes use a database migration with `GRANT` statements before RLS policies.
- Username normalization is deterministic, case-insensitive, length-bounded, and validated on both client and server.
- Auth admin access remains inside server handlers after authorization; private credentials are never imported or returned client-side.
- Server-function modules remain thin wrappers; runtime helpers/config move to server-only helper modules.
- Route metadata will be updated where files move so every content route retains unique title, description, Open Graph title/description, type, and Twitter card.

## Verification

- Test unverified direct loads and refreshes of every protected customer route: server redirects before protected UI renders.
- Test successful verification in preview and on the published domain, including refresh and navigation back to `/verify`.
- Test invalid, expired, and tampered cookies.
- Test Alex username/password login, confirmed admin controls, sign-out cache clearing, and a second login.
- Confirm Discord sync does not remove Alex's manual admin role and still removes stale Discord-derived roles.
- Confirm the deleted bootstrap URL no longer exists and no credential strings remain in source.
- Check desktop and mobile layouts for overflow, cramped forms, overlapping text, inaccessible contrast, and unnecessary animation.