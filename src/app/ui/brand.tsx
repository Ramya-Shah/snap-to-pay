import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-brand font-display text-lg font-bold text-on-brand shadow-sm">
        ₹
      </span>
      <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">Snap-to-Pay</span>
    </Link>
  );
}

export function PaymentsLink() {
  return (
    <Link href="/payments" className="rounded-lg px-2 py-1.5 text-sm font-medium whitespace-nowrap text-muted hover:bg-surface-2 hover:text-ink">
      Payments
    </Link>
  );
}

export function TestModeBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-marigold/40 bg-marigold/10 px-2.5 py-1 text-xs font-medium whitespace-nowrap">
      <span className="size-1.5 rounded-full bg-marigold" />
      Test mode<span className="hidden sm:inline"> · no real money</span>
    </span>
  );
}
