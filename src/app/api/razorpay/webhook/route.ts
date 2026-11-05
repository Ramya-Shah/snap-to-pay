import { appUrl } from "@/lib/api";
import { methodLabel, rupees } from "@/lib/format";
import { isSignedByRazorpay } from "@/lib/razorpay";
import { sendText } from "@/lib/whatsapp";

type OrderPaidEvent = {
  event: string;
  payload?: {
    order?: { entity?: { id: string; amount_paid: number; notes?: Record<string, string> | [] } };
    payment?: { entity?: { id: string; method?: string } };
  };
};

// Razorpay retries events until it gets a 2xx; remember recent event IDs so a retry isn't announced twice.
const seen = new Map<string, number>();

// Set in Razorpay's dashboard with the "order.paid" event. Tells the shopkeeper on WhatsApp when a bill
// made through the bot is paid.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!isSignedByRazorpay(raw, request.headers.get("x-razorpay-signature"))) {
    return new Response("Invalid signature", { status: 401 });
  }
  const eventId = request.headers.get("x-razorpay-event-id");
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > 60 * 60 * 1000) seen.delete(k);
  if (eventId && seen.has(eventId)) return new Response("Duplicate", { status: 200 });
  if (eventId) seen.set(eventId, now);

  const event = JSON.parse(raw) as OrderPaidEvent;
  const order = event.payload?.order?.entity;
  const notes = order && !Array.isArray(order.notes) ? order.notes : undefined;
  const notify = notes?.notify_whatsapp;
  if (event.event !== "order.paid" || !order || !notify) return new Response("Ignored", { status: 200 });

  const payment = event.payload?.payment?.entity;
  const method = methodLabel(payment?.method);
  try {
    await sendText(
      notify,
      [
        `✅ *${rupees(order.amount_paid / 100)} received*${notes?.merchant ? ` for ${notes.merchant}` : ""}`,
        [method && `Paid by ${method}`, payment?.id].filter(Boolean).join(" · "),
        `Receipt: ${appUrl(request)}/receipt/${order.id}`,
      ].join("\n"),
    );
  } catch (err) {
    // Usually the 24-hour WhatsApp window has closed. Nothing to retry, so still answer 200.
    console.error("paid notification failed:", err);
  }
  return new Response("OK", { status: 200 });
}
