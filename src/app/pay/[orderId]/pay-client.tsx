"use client";

import { useEffect, useState } from "react";
import { rupees } from "@/lib/format";
import type { OrderView } from "@/lib/razorpay";

type CheckoutSuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};
type Checkout = new (options: Record<string, unknown>) => { open(): void };

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<Checkout> {
  const w = window as unknown as { Razorpay?: Checkout };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Checkout failed to load.")));
    script.onerror = () => reject(new Error("Couldn't load Razorpay Checkout."));
    document.body.appendChild(script);
  });
}

async function fetchOrder(orderId: string): Promise<OrderView> {
  const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Couldn't load this bill.");
  return data;
}

export function PayClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchOrder(orderId).then(setOrder, (e: Error) => setError(e.message));
  }, [orderId]);

  async function confirmPaid(success: CheckoutSuccess) {
    const res = await fetch(`/api/orders/${orderId}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paymentId: success.razorpay_payment_id,
        signature: success.razorpay_signature,
      }),
    });
    if (!res.ok) throw new Error("We couldn't verify this payment. Please contact the shop.");
    // Capture can lag the success callback by a moment; re-check a few times.
    for (let i = 0; i < 5; i++) {
      const latest = await fetchOrder(orderId);
      if (latest.status === "paid") return setOrder(latest);
      await new Promise((r) => setTimeout(r, 1500));
    }
    setOrder((o) => o && { ...o, status: "paid", paymentId: success.razorpay_payment_id });
  }

  async function pay() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const Razorpay = await loadCheckout();
      new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: order.merchant,
        description: "Bill payment via Snap-to-Pay",
        theme: { color: "#059669" },
        handler: (success: CheckoutSuccess) =>
          confirmPaid(success)
            .catch((e: Error) => setError(e.message))
            .finally(() => setBusy(false)),
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the payment.");
      setBusy(false);
    }
  }

  if (error && !order) {
    return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>;
  }
  if (!order) return <p className="text-sm opacity-60">Loading bill…</p>;

  return (
    <section className="rounded-2xl border border-black/10 p-6 dark:border-white/15">
      <p className="text-xs uppercase tracking-wide opacity-60">Bill from</p>
      <h1 className="mt-1 text-2xl font-bold">{order.merchant}</h1>

      <ul className="mt-5 space-y-2 text-sm">
        {order.lines.map((line, i) => (
          <li key={i} className="border-b border-black/5 pb-2 dark:border-white/10">
            {line}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-baseline justify-between">
        <span className="font-medium">Total</span>
        <span className="text-2xl font-bold">{rupees(order.amount)}</span>
      </div>

      {order.status === "paid" ? (
        <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-center dark:bg-emerald-950">
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">Paid ✅</p>
          {order.paymentId && <p className="mt-1 font-mono text-xs opacity-70">{order.paymentId}</p>}
        </div>
      ) : (
        <button
          onClick={pay}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? "Opening payment…" : `Pay ${rupees(order.amount)}`}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      <p className="mt-6 text-center text-xs opacity-50">
        Test mode · secured by Razorpay · no real money moves
      </p>
    </section>
  );
}
