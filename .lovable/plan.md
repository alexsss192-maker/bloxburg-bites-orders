# Panda Bites — Visual Redesign

Keep every feature and route intact. Rework only styling, layout, and motion so the site reads as a soft, editorial, cherry-blossom Panda Bites — not the current ugly build.

## Design direction

- **Palette (Cherry Blossom):**
  - `--cream` blossom white `#fef0f5`
  - `--petal` soft pink `#f8c8d8`
  - `--sakura` mid pink `#e88aab` (accents, buttons)
  - `--cherry` deep rose `#c45c7c` (primary CTAs, highlights)
  - `--ink` near-black plum for text
- **Type (Syne + Plus Jakarta Sans):** loaded via Google Fonts `<link>` in `__root.tsx`. Syne for display/H1/H2 with tight tracking, Plus Jakarta Sans for body/UI.
- **Feel:** editorial magazine — big serif-adjacent display type, generous whitespace, one hero photo, blossom petal SVG motifs, subtle grain, soft rose shadows (`0 30px 60px -30px rgba(196,92,124,.35)`).
- **Motion (Framer Motion, already installed):** hero letters stagger-in, petal drift on landing, card hover lift + soft glow, cart drawer slide with spring, tab underline morph.

## Pages to restyle

1. **Landing (`/`)** — Magazine layout: left column oversized Syne headline "Panda Bites" + kicker + CTA to `/menu`; right column featured menu item card (or panda mascot) framed as a magazine cover with issue number and date. Below: a 3-up "This week's bites" strip and a soft-pink footer band.
2. `**/menu**` — Editorial header with section label ("Vol. 01 — The Menu"), two big tab pills (Non-Seasonal / Seasonal) with animated underline. Non-seasonal grid becomes a magazine grid: 1 featured large card + smaller cards, stock shown as a delicate meter, price in B$ set in Syne. Seasonal modal restyled as a blossom-framed dialog with the redirect button.
3. **Cart drawer** — Keep behavior, upgrade visuals: blossom-pink panel, Syne totals, rose-tinted item cards, tabular B$ numbers, softer spring, quantity steppers as pill buttons.
4. `**/checkout` & `/order/$id**` — Two-column editorial layout: left order summary "receipt" styled like a torn magazine coupon; right Discord username + notes form. Success page shows a large order number in Syne with confetti petals.
5. **Staff (`/staff*`)** — Same palette, but calmer: darker plum sidebar, cream content, tables with generous rows, status pills in sakura/cherry. Functionality unchanged.
6. **Site header/footer** — Sticky blush header with wordmark, thin bottom hairline. Footer: dark plum band, Syne wordmark, small links, Discord CTA.  
  
Fix staff portal, it does not work and keeps taking me bacxk to the staff portal page, also, the user of an admin & its password is ON the same page as the staff portal... remove it... hige secuirty risk

## Technical changes (frontend only)

- `**src/routes/__root.tsx**` — add Google Fonts `<link>` preconnect + stylesheet for Syne (500–800) and Plus Jakarta Sans (400–700). Do NOT `@import` URLs in CSS.
- `**src/styles.css**` — replace palette tokens with Cherry Blossom oklch values, swap `--font-display` to `"Syne"` and `--font-sans` to `"Plus Jakarta Sans"`, add new tokens: `--petal`, `--sakura`, `--shadow-rose`, `--gradient-blossom`. Update `@theme inline` colors. Add `@utility` for `blossom-grain` and `petal-mask`.
- **Components touched:** `site-header.tsx`, `site-footer.tsx`, `cart-drawer.tsx`, all four `routes/*.tsx` pages, staff pages (light restyle). No changes to `cart-store.ts`, `menu.functions.ts`, migrations, `place_order`, auth, or any server logic.
- **Assets:** reuse existing `panda-mascot.png`; add 1–2 generated blossom / petal SVG or PNG accents inline where useful (or pure SVG in JSX to avoid new binary files).
- **Motion:** wrap hero, cards, and tab content in `motion.div` with `whileHover`/`whileInView`; keep existing AnimatePresence on cart.

## Out of scope

- No DB, RLS, auth, cart logic, or route changes.
- No new dependencies beyond what's already installed (Framer Motion + shadcn stay).
- Seasonal-site link and admin bootstrap unchanged.