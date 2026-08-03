# Panda Bites UI redesign

## Goal

Redesign the Panda Bites customer and staff interfaces to feel like a polished, food-forward magazine: bold typographic hierarchy, breathable layouts, thin-bordered editorial panels, and the existing cute cherry/cream color palette kept intact.

## Design decisions

- **Typography**: Syne for display headings, Plus Jakarta Sans for body and UI text.
- **Layout structure**: Magazine-style — a strong featured section with a supporting grid of cards.
- **Page density**: Breathable — large images, generous whitespace, fewer items per row.
- **Surface style**: Borders & outline — thin, structured borders around cards and panels instead of heavy shadows or soft blobs.
- **Color**: Keep the current cream/ink/cherry palette (it is already "cute"); do not change the palette.
- **Motion**: Subtle, purposeful micro-interactions only — hover lifts, focus rings, smooth height transitions, and staggered list reveals. No heavy parallax or continuous looping animations.

## Plan

### 1. Design system update

- Load Syne and Plus Jakarta Sans via Google Fonts in `src/routes/__root.tsx`.
- Add `--font-display` (Syne) and `--font-sans` (Plus Jakarta Sans) tokens in `src/styles.css`.
- Tighten the existing token system into a clean hierarchy: cream background, ink foreground, cherry primary, and a neutral border scale.
- Introduce border-radius scale: `2xl` for cards, `full` for pills and buttons, keep the current corner language.
- Add a thin `border-border` style to cards and panels.

### 2. Customer-facing pages

- **Home page (`src/routes/index.tsx`)**: Magazine hero — large headline, short tagline, a featured dish/seasonal highlight card, then a supporting grid of categories or call-to-action cards. Use the new border style, generous spacing, and a clear primary action.
- **Menu page (`src/routes/menu.tsx`)**: Convert to a magazine layout with a featured seasonal item at top, then two clearly separated tabs/blocks (Non-Seasonal and Seasonal) rendered as breathable grids. Replace the current seasonal placeholder dialog with a direct in-page grid of purchasable seasonal items. Keep the trusted partner link visible as a small editorial aside.
- **Verification page (`src/routes/verify.tsx`)**: Center the form in a thin-bordered panel with a clear step-by-step flow, larger inputs, and friendlier error states. Keep the panda emoji but make it part of a composed lockup, not a floating giant element.
- **Checkout (`src/routes/checkout.tsx`)**: Clean two-column magazine layout — order summary in one bordered panel, checkout details in another. Improve typography hierarchy and spacing.
- **Order history (`src/routes/history.tsx`)**: Timeline-style list with thin horizontal cards, status badges, and clear order numbers. No dense table feel.
- **Order detail (`src/routes/order.$id.tsx`)**: Magazine-style order receipt with item cards, fulfillment status, and totals.
- **Cart drawer (`src/components/cart-drawer.tsx`)**: Slide-out with bordered item cards, clear quantity steppers, and a sticky summary footer.
- **Site header/footer (`src/components/site-header.tsx`, `src/components/site-footer.tsx`)**: Sharper header with a thinner border, more generous spacing, and a clear cart button. Simpler footer with clean links.

### 3. Staff pages

- **Staff layout (`src/routes/staff.tsx`)**: Clean tab bar with thin borders, clear role badge, and a refined login panel.
- **Orders dashboard (`src/routes/staff.orders.tsx`)**: Magazine-style order cards with status chips, buyer info, and expandable fulfillment details. Filter/sort controls in a thin toolbar.
- **Menu editor (`src/routes/staff.menu.tsx`)**: Chef card gallery with clear ownership, seasonal badges, and a crisp edit sheet/dialog. Price field remains read-only for Skippe.
- **Discounts (`src/routes/staff.discounts.tsx`)**: Bordered list of chef-owned discounts with clear validity and scope labels.
- **Skippe (`src/routes/staff.panda.tsx`)**: Cleaner chat panel with message bubbles inside a bordered conversation surface and clearer action buttons.
- **Audit (`src/routes/staff.audit.tsx`)**: Timeline-style audit log with actor, action, and target styled as editorial entries.
- **Users (`src/routes/staff.users.tsx`)**: Refined table within a bordered panel, with clear role toggles and a structured add-user dialog.

### 4. Components and interactions

- Standardize all cards on `border border-border bg-background rounded-2xl p-6`.
- Standardize buttons: `rounded-full` primary, `rounded-full` outline secondary.
- Add subtle hover states: `transition-transform duration-200 hover:-translate-y-0.5` on cards, `hover:bg-primary/90` on primary buttons.
- Add focus-visible rings on all interactive elements.
- Refine `Toaster`/`sonner` positioning and styling.
- Remove any heavy or unrelated motion; keep the existing loader/emoji animation only on the verification loading state.

### 5. Verification and auth fixes

- Keep the underlying verification logic from the previous plan but ensure the UI reloads and gate behavior are clean after a successful Discord confirmation.
- Ensure the staff login page is visually consistent with the new design and clearly warns that the `Melvin`/`Seasonal` username-only account should change its password.

### 6. Acceptance checks

- Customer pages show a consistent magazine hierarchy, no dense tables, and the seasonal tab is a real menu grid.
- Staff pages have a unified header, clear role badge, and each page uses bordered cards with readable spacing.
- All buttons, cards, and inputs share the same radius/border language.
- The existing color palette is preserved; only typography, spacing, borders, and layout change.
- No heavy continuous animations are added; motion is limited to hover/focus/loading micro-interactions.
