import { Suspense } from "react";
import { Logo, TestModeBadge } from "../../ui/brand";
import { PayClient } from "./pay-client";

export const metadata = { title: "Pay your bill · Snap-to-Pay" };

// Not async: the order id is read inside the Suspense boundary so the page shell stays static.
export default function PayPage({ params }: PageProps<"/pay/[orderId]">) {
  return (
    <div className="mx-auto w-full max-w-md px-4">
      <nav className="flex items-center justify-between gap-3 py-5">
        <Logo />
        <TestModeBadge />
      </nav>
      <main className="pt-6 pb-12">
        <Suspense fallback={<p className="text-center text-sm text-muted">Loading bill…</p>}>
          <Pay params={params} />
        </Suspense>
      </main>
    </div>
  );
}

async function Pay({ params }: { params: PageProps<"/pay/[orderId]">["params"] }) {
  const { orderId } = await params;
  return <PayClient orderId={orderId} />;
}
