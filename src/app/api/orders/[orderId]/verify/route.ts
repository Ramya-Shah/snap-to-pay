import { fail, isOrderId } from "@/lib/api";
import { verifySignature } from "@/lib/razorpay";

// POST { paymentId, signature } from Checkout's success handler → checks Razorpay's HMAC signature.
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[orderId]/verify">) {
  const { orderId } = await ctx.params;
  if (!isOrderId(orderId)) return fail(400, "That isn't a valid order id.");

  const body = (await request.json().catch(() => null)) as {
    paymentId?: unknown;
    signature?: unknown;
  } | null;
  if (typeof body?.paymentId !== "string" || typeof body?.signature !== "string") {
    return fail(400, "paymentId and signature are required.");
  }

  // Uses the order id from the URL we issued, not one echoed back by Checkout.
  if (!verifySignature(orderId, body.paymentId, body.signature)) {
    return fail(400, "Payment signature did not match.");
  }
  return Response.json({ verified: true });
}
