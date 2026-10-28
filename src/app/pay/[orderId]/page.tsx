import { Suspense } from "react";
import { PayClient } from "./pay-client";

export const metadata = { title: "Pay your bill · Snap-to-Pay" };

// Not async: the order id is read inside the Suspense boundary so the page shell stays static.
export default function PayPage({ params }: PageProps<"/pay/[orderId]">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <Suspense fallback={<p className="text-sm opacity-60">Loading bill…</p>}>
        <Pay params={params} />
      </Suspense>
    </main>
  );
}

async function Pay({ params }: { params: PageProps<"/pay/[orderId]">["params"] }) {
  const { orderId } = await params;
  return <PayClient orderId={orderId} />;
}
