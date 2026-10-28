import { RazorpayError } from "./razorpay";

export const fail = (status: number, error: string) => Response.json({ error }, { status });

export const isOrderId = (id: string) => /^order_[A-Za-z0-9]{6,30}$/.test(id);

export function razorpayFailure(err: unknown, action: string) {
  console.error(`${action} failed:`, err);
  if (err instanceof RazorpayError && err.status === 400) return fail(400, err.message);
  if (err instanceof RazorpayError && err.status === 404) return fail(404, "Order not found.");
  return fail(500, `Couldn't ${action}. Try again.`);
}
