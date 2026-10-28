"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rupees } from "@/lib/format";
import type { OrderView } from "@/lib/razorpay";
import { Icon } from "../../ui/icons";

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
  const router = useRouter();
  const receiptUrl = `/receipt/${orderId}`;

  // A bill that is already paid has nothing left to pay: show its receipt instead.
  useEffect(() => {
    fetchOrder(orderId).then(
      (o) => (o.status === "paid" ? router.replace(receiptUrl) : setOrder(o)),
      (e: Error) => setError(e.message),
    );
  }, [orderId, router, receiptUrl]);

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
      if (latest.status === "paid") return router.replace(receiptUrl);
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
        theme: { color: "#00b8a9" },
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
    return (
      <div className="rounded-3xl border border-line bg-surface p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
          <Icon name="alert" className="size-5" />
        </span>
        <p className="mt-3 font-medium">{error}</p>
        <p className="mt-1 text-sm text-muted">Check the link with the shop that sent it.</p>
      </div>
    );
  }
  if (!order) return <PayPageSkeleton />;

  const paid = order.status === "paid";

  return (
    <div className="rise">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand font-display text-2xl font-bold text-on-brand">
          {order.merchant.trim().charAt(0).toUpperCase()}
        </span>
        <p className="mt-3 text-sm text-muted">Bill from</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{order.merchant}</h1>
      </div>

      <article className="receipt-edge mt-6 bg-paper px-6 pt-6 shadow-[0_1px_0_var(--line),0_12px_32px_-12px_rgb(0_0_0/0.18)]">
        <ul className="space-y-2.5 text-sm">
          {order.lines.map((line, i) => {
            const cut = line.lastIndexOf(" — ");
            return (
              <li key={i} className="flex justify-between gap-4">
                <span>{cut === -1 ? line : line.slice(0, cut)}</span>
                {cut !== -1 && <span className="shrink-0 font-mono">{line.slice(cut + 3)}</span>}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex items-end justify-between border-t-2 border-ink pt-4">
          <span className="text-sm font-semibold tracking-wide uppercase">Total</span>
          <span className="font-display text-4xl font-bold tracking-tight">{rupees(order.amount)}</span>
        </div>
      </article>

      {paid ? (
        <div className="mt-6 rounded-2xl border border-brand/30 bg-brand-soft p-6 text-center">
          <span className="pop mx-auto grid size-14 place-items-center rounded-full bg-brand text-on-brand">
            <Icon name="check" className="size-7" />
          </span>
          <p className="mt-3 font-display text-2xl font-bold text-brand-ink">Paid. Thank you!</p>
          {order.paymentId && <p className="mt-1 font-mono text-xs text-muted">{order.paymentId}</p>}
          <Link href={receiptUrl} className="mt-3 inline-block text-sm font-semibold text-brand-ink underline-offset-2 hover:underline">
            View receipt
          </Link>
        </div>
      ) : (
        <button
          onClick={pay}
          disabled={busy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-4 text-lg font-semibold text-on-brand shadow-sm transition hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "Opening payment…" : `Pay ${rupees(order.amount)}`}
          {!busy && <Icon name="arrow" className="size-5" />}
        </button>
      )}

      {error && <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted">
        <Icon name="shield" className="size-3.5" />
        Secured by Razorpay · UPI, cards, netbanking
      </p>
    </div>
  );
}

function PayPageSkeleton() {
  return (
    <div aria-label="Loading bill">
      <div className="skeleton mx-auto size-14 rounded-2xl" />
      <div className="skeleton mx-auto mt-4 h-7 w-1/2 rounded" />
      <div className="skeleton mt-6 h-56 w-full rounded-xl" />
      <div className="skeleton mt-6 h-14 w-full rounded-xl" />
    </div>
  );
}
