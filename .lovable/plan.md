# Panda Bites — v2

## Secrets I'll request first thing in build mode

Plan mode blocks the secure secret form, so the very first action after you approve is opening it for:

- `DISCORD_BOT_TOKEN` — your bot's token (Bot → Reset Token in the Developer Portal). **Enable the "Message Content" and "Server Members" privileged intents.**
- `DISCORD_GUILD_ID` — the server ID users must belong to (right-click server → Copy Server ID with Developer Mode on).
- `DISCORD_CLIENT_ID` — application ID (needed to build the invite link shown to un-joined users).

`LOVABLE_API_KEY` is already set — Panda will use it via Lovable AI Gateway. No third-party search key needed; we'll use the built-in web search on the server side.

---

## 1. Discord DM verification (gate every page) (MUST DO)

**Flow**

1. First visit → full-screen `/verify` wall (blocks all routes via a root-level check on a `pb_verified` httpOnly cookie).
2. User enters Discord username or ID → server route calls Discord API to resolve the user + confirm guild membership. If not a member, show "Join our Discord" CTA with invite link.
3. Bot DMs a 6-digit code (5-min TTL, 5 attempts max, rate-limited per Discord ID + IP).
4. User enters code → server sets signed httpOnly `pb_verified` cookie (30 days) storing `{ discord_id, username, avatar }`.
5. All routes read verification from cookie server-side; header shows Discord avatar + "Verified" badge.
6. Checkout auto-fills the Discord username (locked field).

**Schema**

- `discord_verifications(discord_id, code_hash, expires_at, attempts, created_at, ip)` — RLS: service_role only.
- `verified_users(discord_id PK, username, avatar_url, first_verified_at, last_seen_at)` — RLS: service_role only, read via server fn.

**Backend surface**

- `POST /api/public/verify/request` — resolves Discord user, checks guild membership, generates + hashes code, DMs via Discord REST (`POST /users/@me/channels` + `POST /channels/{id}/messages` using bot token).
- `POST /api/public/verify/confirm` — verifies code, issues signed cookie.
- `POST /api/public/verify/logout` — clears cookie.
- Root `beforeLoad` reads cookie; unverified → `/verify` (except `/verify`, `/api/*`, `/staff/*` — staff sign in with Supabase, separate gate).

---

## 2. Panda — AI stock scanner (chef/admin only) (MUST DO)

New staff page `/staff/panda` (chef + admin roles).

**Capabilities**

- Chat interface, up to **9 image attachments per turn**.
- Model: `google/gemini-2.5-flash-lite` via Lovable AI Gateway (multimodal chat completions with `image_url` blocks).
- Tools exposed to Panda (AI SDK `tool()`):
  - `list_my_menu()` — returns chef's current items (name, stock, price — Panda sees price for context, cannot change it).
  - `upsert_stock({ item_name, stock })` — creates a new item (price defaulted to 0, `is_active=false` until chef sets price) or updates stock on an existing owned item. **Rejects any attempt to write `price_bs`.**
  - `web_search({ query })` — server-executed via the built-in web-search tool; returns snippets Panda uses to answer pricing questions. Panda itself never fetches URLs.
- System prompt hard-codes: never invent/modify prices; new items are inserted with `price_bs=0, is_active=false` and Panda tells the chef "set a price to publish".
- Rate limit: 20 turns/hour per chef.

**UI**

- Split view: chat left, live "changes made this session" panel right showing added/updated items with a jump-to-editor link.
- Drag-drop up to 9 images, previews with remove chips, per-turn counter.

---

## 3. Checkout confirmation + receipt (upgrade existing flow) (Please try to do)

`place_order` server fn already returns totals; extend receipt page `/order/$id`:

- Animated success burst (Framer Motion) with panda mascot.
- Itemized receipt: name, qty, unit price, line total.
- **Updated stock status** per item ("3 left", "sold out", "plenty") pulled fresh from `menu_items` at render.
- Chef DM instructions block, order reference, timestamp.
- "Download receipt" (client-side PDF via `@react-pdf/renderer`) + "Copy order # to Discord".
- Save last 10 order IDs to `localStorage` so pre-Discord-login users can revisit; also link to future `/history` (placeholder disabled until Discord-tied auth ships — deferred per earlier answer, but now that verification IS Discord-tied, we'll list orders by `verified_users.discord_id` in this pass too).

**Bonus** (since Discord verification lands in the same turn): add `/history` showing all past orders for the verified Discord ID.

---

## 4. UI polish — "even sexier & cuter" (Please try to do)

- Route-level page transitions via Framer Motion `AnimatePresence` in `__root.tsx` (fade + subtle rise).
- Cart→checkout: shared-layout animation on the primary CTA (`layoutId="cta"`) so the button morphs across pages.
- Tighter spacing tokens: reduce section padding on mobile, refine type scale (Syne clamp).
- Micro-interactions: menu card hover tilts, add-to-cart flying-blossom animation, cart badge spring-scale on count change.
- Loading skeletons with blossom shimmer instead of gray blocks.
- Header: sticky with scroll-progress blossom bar.
- Confetti of SVG petals on order success.

---

## Technical notes

- Discord bot calls use REST only (no gateway/websocket) — token in `Authorization: Bot <token>`; endpoints: `GET /guilds/{gid}/members/{uid}` for membership, `POST /users/@me/channels` then `POST /channels/{id}/messages` for DM.
- Cookie signed with `PB_COOKIE_SECRET` (auto-generated via `generate_secret` in build mode).
- Verification wall lives at root `beforeLoad` in `__root.tsx`; `/verify`, `/staff/*`, and `/api/*` are exempt.
- Panda tool calls use AI SDK `streamText` + `stepCountIs(50)`; web-search tool result trimmed to top 5 snippets before returning to model.
- Migration adds `verified_users`, `discord_verifications`, and an `orders.verified_discord_id` column (nullable, backfilled at order time from cookie).

---

## Files (new / edited)

**New**

- `src/routes/verify.tsx`, `src/routes/history.tsx`, `src/routes/staff.panda.tsx`
- `src/routes/api/public/verify.request.ts`, `verify.confirm.ts`, `verify.logout.ts`
- `src/routes/api/panda.ts` (streaming chat endpoint)
- `src/lib/discord.server.ts`, `src/lib/verify-cookie.server.ts`, `src/lib/ai-gateway.server.ts`
- `src/lib/panda.functions.ts` (tools + web search wrapper)
- `src/components/verify-wall.tsx`, `src/components/panda-chat.tsx`, `src/components/receipt.tsx`, `src/components/page-transition.tsx`
- Supabase migration: verification tables + `orders.verified_discord_id`

**Edited**

- `src/routes/__root.tsx` (gate, page transitions, header progress bar)
- `src/routes/order.$id.tsx` (receipt upgrade, stock status)
- `src/routes/checkout.tsx` (auto-fill locked Discord field)
- `src/routes/staff.tsx` (add Panda tab)
- `src/components/site-header.tsx` (avatar + verified badge)
- `src/components/cart-drawer.tsx` (shared layout CTA, spacing)
- `src/styles.css` (tighter tokens, shimmer keyframes)