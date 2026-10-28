"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ParsedBill } from "@/lib/bill";
import { rupees } from "@/lib/format";

type Link = { orderId: string; payUrl: string; amount: number; qr: string };
type Paid = { paymentId?: string; method?: string };

const POLL_MS = 3000;
const POLL_FOR_MS = 15 * 60 * 1000;

export function CollectPayment({ bill }: { bill: ParsedBill }) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<Link | null>(null);
  const [paid, setPaid] = useState<Paid | null>(null);
  const [copied, setCopied] = useState(false);

  // Watch the order until it is paid, so the merchant sees the payment land live.
  useEffect(() => {
    if (!link || paid) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > POLL_FOR_MS) return clearInterval(timer);
      try {
        const res = await fetch(`/api/orders/${link.orderId}`);
        const order = await res.json();
        if (res.ok && order.status === "paid") {
          setPaid({ paymentId: order.paymentId, method: order.method });
        }
      } catch {
        // Network blip: try again on the next tick.
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [link, paid]);

  async function createLink() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the payment link.");
      const qr = await QRCode.toDataURL(data.payUrl, { width: 240, margin: 1 });
      setLink({ ...data, qr });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the payment link.");
    } finally {
      setCreating(false);
    }
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!link) {
    return (
      <div className="mt-6 border-t border-black/10 pt-5 dark:border-white/15">
        <button
          onClick={createLink}
          disabled={creating || bill.computedTotal < 1}
          className="w-full rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? "Creating payment link…" : `Collect ${rupees(bill.computedTotal)}`}
        </button>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      </div>
    );
  }

  const whatsappText = `${bill.merchantName ?? "Your bill"}: ${rupees(link.amount)} due. Pay securely here: ${link.payUrl}`;

  return (
    <div className="mt-6 border-t border-black/10 pt-5 dark:border-white/15">
      {paid ? (
        <div className="rounded-xl bg-emerald-50 p-5 text-center dark:bg-emerald-950">
          <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            Paid {rupees(link.amount)} ✅
          </p>
          <p className="mt-1 text-xs opacity-70">
            {paid.method && `via ${paid.method.toUpperCase()} · `}
            {paid.paymentId}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={link.qr} alt="QR code for the payment link" className="h-40 w-40 rounded-lg bg-white p-1" />
          <div className="w-full min-w-0 space-y-3">
            <p className="text-sm">
              Ask the customer to scan, or share the link. Waiting for payment
              <span className="animate-pulse">…</span>
            </p>
            <a
              href={link.payUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate rounded-lg border border-black/15 px-3 py-2 font-mono text-xs text-blue-600 dark:border-white/20 dark:text-blue-400"
            >
              {link.payUrl}
            </a>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Send on WhatsApp
              </a>
              <button
                onClick={copy}
                className="rounded-lg border border-black/15 px-4 py-2 text-sm dark:border-white/20"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
