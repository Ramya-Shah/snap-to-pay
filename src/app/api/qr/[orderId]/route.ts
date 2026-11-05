import QRCode from "qrcode";
import { appUrl, fail, isOrderId } from "@/lib/api";

// A PNG QR code of a bill's pay link, so the WhatsApp bot can send it as an image.
export async function GET(request: Request, ctx: RouteContext<"/api/qr/[orderId]">) {
  const { orderId } = await ctx.params;
  if (!isOrderId(orderId)) return fail(400, "Not an order ID.");
  const png = await QRCode.toBuffer(`${appUrl(request)}/pay/${orderId}`, { width: 600, margin: 2 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
