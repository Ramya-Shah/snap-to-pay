import { appUrl } from "@/lib/api";
import { isSignedByTwilio } from "@/lib/whatsapp";

// Twilio reports what happened to each reply (queued, sent, delivered, read, failed). Logged so a
// reply that never arrives shows its error code, e.g. 63016 when the 24-hour window has closed.
export async function POST(request: Request) {
  const params = Object.fromEntries(
    [...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]),
  );
  const url = `${appUrl(request)}/api/whatsapp/status`;
  if (!isSignedByTwilio(url, params, request.headers.get("x-twilio-signature"))) {
    return new Response("Invalid signature", { status: 403 });
  }
  const error = params.ErrorCode ? ` · error ${params.ErrorCode} ${params.ErrorMessage ?? ""}`.trimEnd() : "";
  console.log(`whatsapp status: ${params.MessageStatus ?? "unknown"}${error}`);
  return new Response(null, { status: 204 });
}
