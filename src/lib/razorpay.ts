import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ParsedBill } from "./bill";
import { rupees } from "./format";

const API = "https://api.razorpay.com/v1";
const MAX_NOTE = 256;
// Razorpay allows 15 notes per order: one for the shop name, the rest for bill lines.
const MAX_LINE_NOTES = 14;

function keys() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Add them to .env.local.");
  }
  // This is a public demo: refuse live keys so no real money can ever move.
  if (!keyId.startsWith("rzp_test_")) {
    throw new Error("Only Razorpay test keys (rzp_test_...) are allowed in this demo.");
  }
  return { keyId, keySecret };
}

export class RazorpayError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  const { keyId, keySecret } = keys();
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new RazorpayError(res.status, data?.error?.description ?? `Razorpay ${res.status}`);
  }
  return data as T;
}

type RazorpayOrder = {
  id: string;
  amount: number;
  amount_paid: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
  notes: Record<string, string> | [];
  created_at: number; // unix seconds
};

type RazorpayPayment = {
  id: string;
  order_id: string | null;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string;
  created_at: number;
};

// Every order this app creates has a receipt starting with this, so other orders on the account are skipped.
const RECEIPT_PREFIX = "stp_";

export type OrderView = {
  orderId: string;
  keyId: string;
  amount: number; // rupees
  currency: string;
  merchant: string;
  lines: string[];
  status: "unpaid" | "paid";
  paymentId?: string;
  method?: string;
  invoiceNo: string;
  createdAt: number; // unix seconds
  paidAt?: number;
};

const clip = (s: string) => (s.length > MAX_NOTE ? `${s.slice(0, MAX_NOTE - 1)}…` : s);

// The bill travels with the order as notes, so the pay page needs no database.
// `notify` is the shopkeeper's WhatsApp number for bills made through the bot; it takes one line slot
// and is never shown on public pages (they only read `merchant` and `line…` notes).
function billNotes(bill: ParsedBill, notify?: string): Record<string, string> {
  const maxLines = notify ? MAX_LINE_NOTES - 1 : MAX_LINE_NOTES;
  const lines = [
    ...bill.items.map((i) => `${i.name} × ${i.quantity}${i.unit ? ` ${i.unit}` : ""} — ${rupees(i.amount)}`),
    ...bill.charges.map((c) => `${c.label} — ${rupees(c.amount)}`),
  ];
  const kept =
    lines.length > maxLines ? [...lines.slice(0, maxLines - 1), `+ ${lines.length - maxLines + 1} more items`] : lines;
  const notes: Record<string, string> = { merchant: clip(bill.merchantName ?? "Snap-to-Pay") };
  if (notify) notes.notify_whatsapp = notify;
  kept.forEach((line, i) => (notes[`line${String(i + 1).padStart(2, "0")}`] = clip(line)));
  return notes;
}

export async function createOrder(bill: ParsedBill, options: { notifyWhatsapp?: string } = {}) {
  const order = await call<RazorpayOrder>("/orders", {
    method: "POST",
    body: {
      amount: Math.round(bill.computedTotal * 100),
      currency: "INR",
      receipt: `${RECEIPT_PREFIX}${Date.now().toString(36)}`,
      notes: billNotes(bill, options.notifyWhatsapp),
    },
  });
  return order.id;
}

function toView(order: RazorpayOrder, keyId: string, captured?: RazorpayPayment): OrderView {
  const notes = Array.isArray(order.notes) ? {} : order.notes;
  return {
    orderId: order.id,
    keyId,
    amount: order.amount / 100,
    currency: order.currency,
    merchant: notes.merchant ?? "Snap-to-Pay",
    lines: Object.keys(notes)
      .filter((k) => k.startsWith("line"))
      .sort()
      .map((k) => notes[k]),
    status: order.status === "paid" || captured ? "paid" : "unpaid",
    paymentId: captured?.id,
    method: captured?.method,
    invoiceNo: (order.receipt ?? order.id).toUpperCase(),
    createdAt: order.created_at,
    paidAt: captured?.created_at,
  };
}

export async function getOrder(orderId: string): Promise<OrderView> {
  const { keyId } = keys();
  const [order, payments] = await Promise.all([
    call<RazorpayOrder>(`/orders/${encodeURIComponent(orderId)}`),
    call<{ items: RazorpayPayment[] }>(`/orders/${encodeURIComponent(orderId)}/payments`),
  ]);
  return toView(order, keyId, payments.items.find((p) => p.status === "captured"));
}

// The shop's latest bills, newest first. Two list calls instead of one per order.
export async function listOrders(): Promise<OrderView[]> {
  const { keyId } = keys();
  const [orders, payments] = await Promise.all([
    call<{ items: RazorpayOrder[] }>("/orders?count=100"),
    call<{ items: RazorpayPayment[] }>("/payments?count=100"),
  ]);
  const captured = new Map(
    payments.items.filter((p) => p.status === "captured" && p.order_id).map((p) => [p.order_id, p]),
  );
  return orders.items
    .filter((o) => o.receipt?.startsWith(RECEIPT_PREFIX))
    .map((o) => toView(o, keyId, captured.get(o.id)));
}

// The newest bill the WhatsApp bot made for this shopkeeper in the last `withinSec` seconds.
// Matches on the private notify_whatsapp note but never returns it.
export async function latestBotOrder(whatsapp: string, withinSec: number): Promise<OrderView | undefined> {
  const { keyId } = keys();
  const since = Math.floor(Date.now() / 1000) - withinSec;
  const orders = await call<{ items: RazorpayOrder[] }>(`/orders?count=20&from=${since}`);
  const match = orders.items.find((o) => !Array.isArray(o.notes) && o.notes.notify_whatsapp === whatsapp);
  return match && toView(match, keyId);
}

// Razorpay signs webhook bodies with the webhook secret set in its dashboard.
export function isSignedByRazorpay(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Checkout's success callback is only trusted once this signature matches.
export function verifySignature(orderId: string, paymentId: string, signature: string) {
  const expected = createHmac("sha256", keys().keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
