# Panda Bites fulfillment, chef discounts, and verification repair

## Goal

Repair Discord verification first, then complete customer order tracking and chef/admin fulfillment tools while enforcing strict chef ownership and keeping every price outside Skippe’s control.

## Build plan

### 1. Repair Discord verification and the redirect loop
- Make the signed `pb_verified` cookie work in both the embedded HTTPS preview and the published site, including the secure cross-site/partitioned attributes required by the preview iframe.
- Keep the cookie `HttpOnly`, signed, expiring, and server-validated; do not expose the verification token to browser JavaScript.
- Return a definitive successful verification response, refresh the gate through a full same-origin navigation, and remove the long/stale panda-loading path that can send a verified user back to `/verify`.
- Validate the complete flow: confirmation sets the cookie, `/api/public/verify/session` returns the Discord identity, `/` remains open after reload, and logout clears the session.

### 2. Add chef-scoped fulfillment data
- Add a chef ownership snapshot to each order line so historical access does not change if a menu item is later edited or removed.
- Add one fulfillment segment per chef per order, each with its own status. A chef can read and update only their segments; admins can manage all segments.
- Derive the customer-facing overall order status from its segments so a multi-chef order remains pending/preparing until all relevant portions advance, and becomes ready/delivered only when all portions reach that stage.
- Update order placement atomically to create line snapshots and fulfillment segments with server-calculated totals.

### 3. Complete customer order history
- Keep history tied to the verified Discord identity from the signed cookie, never a caller-provided identity.
- Show past and active orders, timestamps, totals, item counts, and a clear checkout → preparing → ready → delivered timeline.
- Show per-chef progress for mixed-chef orders without exposing internal staff account details.
- Add refresh/revalidation so current fulfillment status can be checked without placing another order.

### 4. Complete the chef/admin order dashboard
- Chefs see buyer Discord username, note, and only the items assigned to them; they cannot inspect another chef’s items or totals.
- Chefs update only their own fulfillment segment using valid forward status transitions.
- Admins can see and manage all order segments.
- Preserve server-side role checks, ownership filtering, input validation, and audit important status changes.

### 5. Add chef-owned discounts
- Add a **Discounts** staff tab for percentage and fixed B$ discounts.
- Support both automatic promotions and promo codes, with active/inactive controls and optional validity windows.
- Every discount is permanently owned by its creating chef. Chefs can create, edit, disable, and delete only their own discounts; admins can oversee all.
- At checkout, validate discounts and calculate savings on the server. A discount affects only line items owned by that discount’s chef, including in mixed-chef carts; it can never reduce another chef’s items.
- Snapshot applied discount amounts on order lines and show subtotal, savings, and final total consistently in cart/checkout, order confirmation, history, and staff views.

### 6. Make Skippe price-proof
- Remove price from every Skippe tool/action schema and reject any AI-generated price-like mutation server-side.
- New Skippe-created items remain inactive with a zero placeholder until a human enters a valid price in the chef menu editor.
- Skippe views display price as read-only and direct chefs to the regular menu editor; only the manual menu form can submit a price.
- Keep chef ownership enforcement on every Skippe and manual menu mutation so neither path can alter another chef’s menu.

### 7. Verification and polish
- Update staff navigation for Orders, Menu, Discounts, and Skippe while preserving the existing Panda Bites visual system.
- Add route-specific metadata to the customer and staff pages touched by this work.
- Verify database policies/grants, server validation, discount math, mixed-chef isolation, valid status transitions, and responsive customer/staff layouts.

## Technical details

- Database changes will be delivered through an approved migration with explicit grants, RLS, ownership policies, indexes, and atomic database functions.
- Suggested additions: `chef_discounts`, `order_fulfillments`, and immutable chef/discount snapshots on `order_items`; exact names may follow existing conventions during implementation.
- Protected staff operations continue through authenticated server functions and server-verified roles. Customer history continues through the signed Discord verification cookie.
- Discount values and order totals are always recomputed from database menu prices; cart values, AI output, and browser-submitted totals are never trusted.

## Acceptance checks

- A newly verified user reaches `/` immediately and remains verified after reload.
- A chef cannot read/update another chef’s menu, discounts, order lines, or fulfillment status.
- An admin can oversee all chef segments.
- A chef promotion changes only that chef’s lines in a mixed cart, for both automatic and code-based discounts.
- Skippe cannot create, suggest, or mutate a price; a human must activate a new item by manually entering its price.
- Customers can track one order from checkout through final delivery, including mixed-chef progress.
