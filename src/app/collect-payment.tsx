"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import type { ParsedBill } from "@/lib/bill";
import { rupees } from "@/lib/format";
import { Icon } from "./ui/icons";

type Link = { orderId: string; payUrl: string; amount: number; qr: string };
type Paid = { paymentId?: string; method?: string };

const POLL_MS = 3000;
const POLL_FOR_MS = 15 * 60 * 1000;

export function CollectPayment({
  bill,
  flagged,
  onCreated,
}: {
  bill: ParsedBill;
  flagged: number;
  onCreated: () => void;
}) {
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
      const qr = await QRCode.toDataURL(data.payUrl, { width: 320, margin: 1 });
      setLink({ ...data, qr });
      onCreated();
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
      <div className="mt-6">
        {flagged > 0 && (
          <p className="mb-2 text-center text-xs text-warn">
            Check the flagged {flagged === 1 ? "line" : "lines"} before you collect.
          </p>
        )}
        <button
          onClick={createLink}
          disabled={creating || bill.computedTotal < 1}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-4 text-base font-semibold text-on-brand shadow-sm transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? (
            "Creating payment link…"
          ) : (
            <>
              Collect {rupees(bill.computedTotal)}
              <Icon name="arrow" className="size-4" />
            </>
          )}
        </button>
        {error && (
          <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </div>
    );
  }

  if (paid) {
    return (
      <div className="rise mt-6 rounded-2xl border border-brand/30 bg-brand-soft p-6 text-center">
        <span className="pop mx-auto grid size-14 place-items-center rounded-full bg-brand text-on-brand">
          <Icon name="check" className="size-7" />
        </span>
        <p className="mt-3 font-display text-3xl font-bold tracking-tight text-brand-ink">
          {rupees(link.amount)} received
        </p>
        <p className="mt-1 font-mono text-xs text-muted">
          {paid.method && `${paid.method.toUpperCase()} · `}
          {paid.paymentId}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <a
            href={`/receipt/${link.orderId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3.5 py-2 text-sm font-semibold shadow-sm"
          >
            <Icon name="receipt" className="size-3.5" />
            View receipt
          </a>
          <Link href="/payments" className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium hover:bg-surface">
            <Icon name="list" className="size-3.5" />
            All payments
          </Link>
        </div>
      </div>
    );
  }

  const whatsappText = `${bill.merchantName || "Your bill"}: ${rupees(link.amount)} due. Pay securely here: ${link.payUrl}`;

  return (
    <div className="rise mt-6 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
        <img
          src={link.qr}
          alt="QR code for the payment link"
          className="size-44 shrink-0 rounded-xl border border-line bg-white p-2"
        />
        <div className="w-full min-w-0 space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-marigold opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-marigold" />
            </span>
            Waiting for {rupees(link.amount)}…
          </p>
          <p className="text-sm text-muted">Ask the customer to scan the QR, or send them the link.</p>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 py-1.5 pr-1.5 pl-3">
            <Icon name="link" className="size-3.5 shrink-0 text-muted" />
            <a
              href={link.payUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-xs hover:underline"
            >
              {link.payUrl.replace(/^https?:\/\//, "")}
            </a>
            <button
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-xs font-medium shadow-sm"
            >
              <Icon name={copied ? "check" : "copy"} className="size-3.5" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#06301a] hover:brightness-95"
            >
              <Icon name="message" className="size-4" />
              Send on WhatsApp
            </a>
            <a
              href={link.payUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Open pay page
              <Icon name="external" className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
