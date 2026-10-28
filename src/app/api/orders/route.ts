import { billSchema, withTotals } from "@/lib/bill";
import { fail, razorpayFailure, tooMany } from "@/lib/api";
import { createOrder } from "@/lib/razorpay";
import { LIMITS, clientId, hit, waitText } from "@/lib/rate-limit";

const MIN_RUPEES = 1;
const MAX_RUPEES = 100_000;

// POST { bill } → creates a Razorpay order for the bill and returns the shareable pay page URL.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Send the bill as JSON.");
  }

  const parsed = billSchema.safeParse((body as { bill?: unknown })?.bill);
  if (!parsed.success) return fail(400, "That bill isn't in the expected format.");

  // Recompute the total here; never trust an amount sent by the browser.
  const bill = withTotals(parsed.data);
  if (bill.computedTotal < MIN_RUPEES) return fail(400, "The bill total must be at least ₹1.");
  if (bill.computedTotal > MAX_RUPEES) return fail(400, "This demo collects at most ₹1,00,000.");

  const limit = await hit(LIMITS.ordersPerIp, clientId(request));
  if (!limit.ok) {
    return tooMany(
      limit.retryAfterSec,
      `That's ${LIMITS.ordersPerIp.max} payment links this hour. Try again in ${waitText(limit.retryAfterSec)}.`,
    );
  }

  try {
    const orderId = await createOrder(bill);
    const payUrl = `${new URL(request.url).origin}/pay/${orderId}`;
    return Response.json({ orderId, payUrl, amount: bill.computedTotal });
  } catch (err) {
    return razorpayFailure(err, "create the payment link");
  }
}
