# Discord verification, seasonal menus, and Melvin admin

## Goal

Stop verified customers from being sent back to Discord verification, let chefs sell seasonal items inside Panda Bites while retaining Seasonal Foods as the trusted partner, and provision a username-based admin account for Melvin.

## Plan

### 1. Fix Discord verification end to end

- Reproduce the full code confirmation flow from a clean browser state in the actual preview: request code, confirm it, inspect `Set-Cookie`, load the session endpoint, navigate home, and verify the gate remains unlocked after reload and route changes.
- Add focused server diagnostics around cookie presence and validation outcome without logging the cookie value or other credentials.
- Make verification-cookie attributes depend on the real request/host context rather than only the build environment, so embedded preview and published top-level browsing each receive a compatible secure cookie.
- Use one consistent session-check path for confirmation and the global gate, prevent stale unverified state from winning after successful confirmation, and redirect an already-verified visitor away from `/verify` only after the session read succeeds.
- Keep cookie clearing aligned with the exact attributes used when setting it.
- Validate both preview and published-style behavior, including a hard refresh. If a real clean Discord confirmation cannot be completed, report the authenticated confirmation path as unverified rather than claiming it is fixed.

### 2. Allow chefs to sell seasonal food

- Update the backend menu rules so active `seasonal` and `non_seasonal` items can be publicly listed and ordered; continue deriving prices, stock, ownership, and discounts on the server.
- Add a category selector to the chef menu editor. Chefs remain limited to their own items, including seasonal items and chef-specific discounts.
- Replace the seasonal placeholder with a real seasonal product grid using the same cart, stock, pricing, and checkout behavior as the existing menu.
- Keep separate Seasonal and Non-seasonal tabs, and add a clear “Trusted partner: Seasonal Foods” link to `https://seasonalfoods.lovable.app/` without blocking Panda Bites seasonal purchases.
- Update menu wording and metadata so it no longer says Panda Bites only sells non-seasonal food.

### 3. Provision the Melvin admin safely

- Treat `Melvin` as a username and map it internally to a deterministic synthetic email used only by authentication; the staff form will accept `Melvin` rather than exposing that internal address.
- Provision the account through the privileged backend auth API with password `Seasonal`, mark it confirmed, and assign the `admin` role in the separate roles table.
- Ensure Discord role synchronization does not silently remove the explicitly provisioned admin role during login. Discord verification remains required for staff access, and chef role synchronization stays server-validated.
- Remove the existing unauthenticated public bootstrap endpoint, which currently contains hardcoded staff credentials and can grant an admin role to anyone who calls it.
- Do not store the Melvin password in source code, browser storage, logs, or a public endpoint. Show a warning after first login recommending a stronger password because `Seasonal` is weak and username-only accounts cannot use email password recovery.

## Technical details

- Database changes will use an approved migration for public menu policy/function updates and retain RLS plus explicit grants.
- User roles remain in `user_roles`; no role is stored on a profile/user record or trusted from the client.
- Menu/order server functions will be kept as thin `createServerFn` declarations, with runtime helpers moved to server-only modules where needed.
- Verification will be tested from a fresh context rather than relying on the currently valid preview cookie, since current network evidence shows `/api/public/verify/session` returning the verified user successfully.

## Acceptance checks

- A newly verified Discord user reaches `/`, can refresh, visit `/menu` and `/history`, and is not redirected to `/verify`.
- A chef can create a seasonal item, set its own manual price and stock, and see it purchasable under the Seasonal tab; another chef cannot edit it or apply a discount to it.
- Seasonal Foods is visible as the trusted partner, but its link does not replace or block the local seasonal menu.
- `Melvin` + `Seasonal` signs into the staff portal as an admin after Discord verification, and no public route can create or elevate staff accounts.