import Link from "next/link";
import { Suspense } from "react";
import { isOrderId } from "@/lib/api";
import { indiaTime, methodLabel, rupees, splitLine } from "@/lib/format";
import { getOrder, RazorpayError, type OrderView } from "@/lib/razorpay";
import { Logo, TestModeBadge } from "../../ui/brand";
import { Icon } from "../../ui/icons";
import { InvoiceActions } from "./invoice-actions";

export const metadata = { title: "Receipt · Snap-to-Pay" };

// Not async: the order is read inside the Suspense boundary so the page shell stays static.
export default function ReceiptPage({ params }: PageProps<"/receipt/[orderId]">) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 print:max-w-none print:px-0">
      <nav className="flex items-center justify-between gap-3 py-5 print:hidden">
        <Logo />
        <TestModeBadge />
      </nav>
      <main className="pt-4 pb-12 print:p-0">
        <Suspense fallback={<p className="text-center text-sm text-muted">Loading receipt…</p>}>
          <Receipt params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Receipt({ params }: { params: PageProps<"/receipt/[orderId]">["params"] }) {
  const { orderId } = await params;
  if (!isOrderId(orderId)) return <Missing />;

  let order: OrderView;
  try {
    order = await getOrder(orderId);
  } catch (err) {
    if (err instanceof RazorpayError && (err.status === 400 || err.status === 404)) return <Missing />;
    throw err;
  }
  if (order.status !== "paid" || !order.paidAt) return <NotPaid order={order} />;

  const method = methodLabel(order.method);
  return (
    <div className="rise space-y-6">
      <section className="text-center print:hidden">
        <span className="pop mx-auto grid size-16 place-items-center rounded-full bg-brand text-on-brand">
          <Icon name="check" className="size-8" />
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Payment successful</h1>
        <p className="mt-1 font-display text-5xl font-extrabold tracking-tight">{rupees(order.amount)}</p>
        <p className="mt-2 text-sm text-muted">
          Paid to {order.merchant} · {indiaTime(order.paidAt)}
          {method && ` · ${method}`}
        </p>
      </section>

      <InvoiceActions
        invoiceNo={order.invoiceNo}
        shareText={`Paid ${rupees(order.amount)} to ${order.merchant}. Receipt:`}
      />

      <article className="relative overflow-hidden rounded-2xl border border-line bg-paper p-6 sm:p-8 print:rounded-none print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Invoice from</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight">{order.merchant}</h2>
          </div>
          <div className="text-right">
            <p className="font-display text-xl font-bold tracking-tight">INVOICE</p>
            <p className="mt-1 font-mono text-xs text-muted">{order.invoiceNo}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-line py-5 text-sm sm:grid-cols-3">
          <Meta label="Billed on" value={indiaTime(order.createdAt)} />
          <Meta label="Paid on" value={indiaTime(order.paidAt)} />
          <Meta label="Method" value={method || "Online"} />
          <Meta label="Payment ID" value={order.paymentId ?? "—"} mono />
          <Meta label="Order ID" value={order.orderId} mono />
          <Meta label="Status" value="Paid" />
        </dl>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="text-left text-xs tracking-wide text-muted uppercase">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line, i) => {
              const { label, amount } = splitLine(line);
              return (
                <tr key={i} className="border-t border-line/70">
                  <td className="py-2.5 pr-4">{label}</td>
                  <td className="py-2.5 text-right font-mono">{amount}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <td className="pt-4 font-semibold tracking-wide uppercase">Total paid</td>
              <td className="pt-4 text-right font-display text-3xl font-bold tracking-tight">{rupees(order.amount)}</td>
            </tr>
          </tfoot>
        </table>

        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-24 right-6 rotate-[-14deg] rounded-lg border-4 border-brand px-3 py-1 font-display text-3xl font-extrabold tracking-widest text-brand-ink opacity-25 sm:top-8 sm:right-1/3"
        >
          PAID
        </span>

        <footer className="mt-8 border-t border-dashed border-line pt-4 text-xs text-muted">
          Paid online through Razorpay (test mode, no real money moved). This is a demo receipt from
          Snap-to-Pay, not a GST tax invoice.
        </footer>
      </article>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 font-medium ${mono ? "truncate font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function NotPaid({ order }: { order: OrderView }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warn-soft text-warn">
        <Icon name="alert" className="size-5" />
      </span>
      <h1 className="mt-3 font-display text-2xl font-bold">Not paid yet</h1>
      <p className="mt-1 text-sm text-muted">
        {rupees(order.amount)} to {order.merchant} is still waiting for payment.
      </p>
      <Link
        href={`/pay/${order.orderId}`}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand hover:bg-brand-strong"
      >
        Pay {rupees(order.amount)}
        <Icon name="arrow" />
      </Link>
    </div>
  );
}

function Missing() {
  return (
    <div className="rounded-3xl border border-line bg-surface p-8 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-danger-soft text-danger">
        <Icon name="alert" className="size-5" />
      </span>
      <p className="mt-3 font-medium">We couldn&apos;t find this receipt.</p>
      <p className="mt-1 text-sm text-muted">Check the link with the shop that sent it.</p>
    </div>
  );
}
