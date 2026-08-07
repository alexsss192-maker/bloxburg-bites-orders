# Skippe upgrades + easier-to-find order chat

Continuing the Zen Blossom build. Four changes.

## 1. Skippe can activate items, customers can't buy unpriced ones

Right now Skippe creates items as inactive with price B$0, so they vanish until you price them.

- Skippe may now set items **active** and manage names, stock, category and images. Prices stay Skippe-proof: it can never write a price.
- An active item with no price still appears on the public menu, but as a **"Price coming soon"** card: greyed, no quantity control, no add-to-cart, and the server refuses it if someone forces it into a cart.
- Your staff menu shows a clear "Needs a price" badge with a direct price field, so pricing is one tap.

## 2. Skippe remembers your conversation

- Your thread with Skippe is saved per chef and restored when you come back — no separate history panel, just the chat bar you already use.
- Every reply carries the full prior conversation, so Skippe stops forgetting what you said two messages ago.
- A single "Clear conversation" control if you want a fresh start.

## 3. Three Skippe modes with a modern picker

A dropdown at the top of the chat bar, Google-logo rows with a cost hint:

```text
[G] Auto                     Cost: $-$$
[G] Gemini 2.5 Flash Lite    Cost: $
[G] Gemini 3.1 Flash Lite    Cost: $$
```

- **Auto** reads your prompt and your images: light jobs (few pictures, few items per picture) go to the cheap model; a batch of roughly **7 or more images**, or dense multi-item photos, escalates to the stronger one. The reply notes which model handled it.
- Your choice is remembered between sessions.
- Naming note: "Gemini 2.5 Flash Lite Preview" isn't an accepted model on the AI gateway, so per your pick the two named tiers are 2.5 Flash Lite ($) and 3.1 Flash Lite ($$).

## 4. Order chat: fix the popup, make the chat obvious

You reported the "talk to your chef" popup is broken and the chat is buried.

- The popup gets rebuilt: one clean card with the order number, a single line explaining the chat replaces Discord DMs, and one primary button — **"Open chat with chef"** — that scrolls to and focuses the chat. Shows once per order, always reopenable.
- The chat moves from the bottom of the page into a **prominent right-hand panel on desktop**, and directly under the order summary on mobile, with a pink header, live dot and a taller message area.
- A sticky **"Chat with chef"** button follows you on the order page, and order rows in history link straight into the thread.
- Access is unchanged: whoever holds the order link can chat on it.

## Technical notes

- Skippe tools become `set_item_active` / `upsert_item` (name, stock, category, image, active) with `price_bs` stripped from every tool schema, so price is never in a payload Skippe controls.
- Menu reads keep returning zero-priced active items but flag them `purchasable: false`; `place_order` already rejects `price_bs = 0`, so the guard stays server-authoritative.
- New `skippe_messages` table (chef id, role, content, image count, model used, created_at) with owner-scoped RLS and GRANTs, read/written through a `createServerFn` under `requireSupabaseAuth`.
- Model selection resolves server-side from a `mode` argument so the model id is never client-trusted; Auto scores prompt length, image count and detected item density.
- Order page moves to a 12-column layout (summary left, `OrderChat` right on `lg+`); the popup is rebuilt on the shared dialog with a single CTA and a ref-based scroll/focus into the chat composer.