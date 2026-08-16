import { createServerFn } from "@tanstack/react-start";

/**
 * Order chat server APIs disabled.
 * No reads/writes to public.order_messages.
 */
function disabled(): never {
  throw new Error("Order chat has been removed. Contact customers on Discord.");
}

export type OrderMessage = {
  id: string;
  sender_kind: "customer" | "chef" | "system";
  author_name: string;
  body: string;
  created_at: string;
};

export type StaffThread = {
  order_id: string;
  discord_username: string;
  status: string;
  total_bs: number;
  message_count: number;
  last_message_at: string | null;
  last_body: string | null;
  last_sender: "customer" | "chef" | "system" | null;
  unread: number;
};

export const getOrderMessages = createServerFn({ method: "GET" }).handler(async () => disabled());
export const postCustomerMessage = createServerFn({ method: "POST" }).handler(async () => disabled());
export const listChefMessages = createServerFn({ method: "GET" }).handler(async () => disabled());
export const postChefMessage = createServerFn({ method: "POST" }).handler(async () => disabled());
export const listStaffThreads = createServerFn({ method: "GET" }).handler(async () => disabled());
export const markThreadRead = createServerFn({ method: "POST" }).handler(async () => disabled());
