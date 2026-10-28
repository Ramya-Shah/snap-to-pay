import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { indiaDay, indiaTime, methodLabel, rupees } from "@/lib/format";
import { listOrders } from "@/lib/razorpay";
import { Logo, PaymentsLink, TestModeBadge } from "../ui/brand";
import { Icon } from "../ui/icons";

export const metadata = { title: "Payments · Snap-to-Pay" };

export default function PaymentsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
      <nav className="flex items-center justify-between gap-3 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <PaymentsLink />
          <TestModeBadge />
        </div>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-4 pt-6 pb-8">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Payments</h1>
          <p className="mt-2 text-muted">Every bill collected through Snap-to-Pay, read live from Razorpay.</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-strong"
        >
          <Icon name="plus" />
          New bill
        </Link>
      </header>
      <main className="pb-16">
        <Suspense fallback={<PaymentsSkeleton />}>
          <PaymentList />
        </Suspense>
      </main>
    </div>
  );
}

async function PaymentList() {
  // "Today" depends on when the page is opened, so render per request.
  await connection();
  const orders = await listOrders();
  // eslint-disable-next-line react-hooks/purity -- server component rendered per request (connection() above)
  const today = indiaDay(Date.now() / 1000);
  const paid = orders.filter((o) => o.status === "paid");
  const paidToday = paid.filter((o) => o.paidAt && indiaDay(o.paidAt) === today);
  const waiting = orders.length - paid.length;

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Collected today" value={rupees(paidToday.reduce((s, o) => s + o.amount, 0))} hint={`${paidToday.length} paid ${paidToday.length === 1 ? "bill" : "bills"}`} strong />
        <Stat label="Paid bills" value={String(paid.length)} hint={`${rupees(paid.reduce((s, o) => s + o.amount, 0))} in total`} />
        <Stat label="Waiting for payment" value={String(waiting)} hint={waiting ? "Links not paid yet" : "Nothing pending"} />
      </div>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-line p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
            <Icon name="receipt" className="size-5" />
          </span>
          <p className="mt-3 font-medium">No bills yet</p>
          <p className="mt-1 text-sm text-muted">Collect a payment and it shows up here.</p>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
          {orders.map((o) => {
            const isPaid = o.status === "paid";
            const items = o.lines.length;
            return (
              <li key={o.orderId}>
                <Link
                  href={isPaid ? `/receipt/${o.orderId}` : `/pay/${o.orderId}`}
                  className="flex items-center gap-4 px-4 py-4 transition hover:bg-surface-2 sm:px-5"
                >
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                      isPaid ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
                    }`}
                  >
                    <Icon name={isPaid ? "check" : "receipt"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{o.merchant}</span>
                    <span className="block truncate text-xs text-muted">
                      {items} {items === 1 ? "line" : "lines"} · {indiaTime(isPaid && o.paidAt ? o.paidAt : o.createdAt)}
                      {isPaid && o.method && ` · ${methodLabel(o.method)}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono font-semibold">{rupees(o.amount)}</span>
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        isPaid ? "bg-brand-soft text-brand-ink" : "bg-warn-soft text-warn"
                      }`}
                    >
                      {isPaid ? "Paid" : "Waiting"}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-center text-xs text-muted">Showing the latest {orders.length} bills. Times are IST.</p>
    </>
  );
}

function Stat({ label, value, hint, strong }: { label: string; value: string; hint: string; strong?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 sm:p-5 ${strong ? "border-transparent bg-brand text-on-brand" : "border-line bg-surface"}`}>
      <p className={`text-xs sm:text-sm ${strong ? "opacity-80" : "text-muted"}`}>{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      <p className={`mt-1 hidden text-xs sm:block ${strong ? "opacity-80" : "text-muted"}`}>{hint}</p>
    </div>
  );
}

function PaymentsSkeleton() {
  return (
    <div aria-label="Loading payments">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton mt-8 h-72 rounded-3xl" />
    </div>
  );
}
