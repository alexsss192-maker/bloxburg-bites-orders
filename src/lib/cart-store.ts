import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  menu_item_id: string;
  name: string;
  price_bs: number;
  image_url: string | null;
  quantity: number;
  max_stock: number;
};

type CartState = {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  setQty: (menu_item_id: string, qty: number) => void;
  remove: (menu_item_id: string) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const existing = s.items.find((i) => i.menu_item_id === item.menu_item_id);
          const addQty = item.quantity ?? 1;
          if (existing) {
            const newQty = Math.min(existing.max_stock, existing.quantity + addQty);
            return {
              items: s.items.map((i) =>
                i.menu_item_id === item.menu_item_id ? { ...i, quantity: newQty, max_stock: item.max_stock } : i,
              ),
            };
          }
          return {
            items: [
              ...s.items,
              {
                menu_item_id: item.menu_item_id,
                name: item.name,
                price_bs: item.price_bs,
                image_url: item.image_url,
                max_stock: item.max_stock,
                quantity: Math.min(item.max_stock, addQty),
              },
            ],
          };
        }),
      setQty: (id, qty) =>
        set((s) => ({
          items: s.items
            .map((i) => (i.menu_item_id === id ? { ...i, quantity: Math.max(0, Math.min(i.max_stock, qty)) } : i))
            .filter((i) => i.quantity > 0),
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.menu_item_id !== id) })),
      clear: () => set({ items: [] }),
      total: () => get().items.reduce((a, b) => a + b.price_bs * b.quantity, 0),
      count: () => get().items.reduce((a, b) => a + b.quantity, 0),
    }),
    { name: "panda-bites-cart" },
  ),
);