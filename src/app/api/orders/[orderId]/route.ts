import { fail, isOrderId, razorpayFailure } from "@/lib/api";
import { getOrder } from "@/lib/razorpay";

// GET → the bill and payment status for an order (polled by the merchant and pay pages).
export async function GET(_request: Request, ctx: RouteContext<"/api/orders/[orderId]">) {
  const { orderId } = await ctx.params;
  if (!isOrderId(orderId)) return fail(400, "That isn't a valid order id.");
  try {
    return Response.json(await getOrder(orderId));
  } catch (err) {
    return razorpayFailure(err, "load the order");
  }
}
