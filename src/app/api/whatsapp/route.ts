import { after } from "next/server";
import { appUrl } from "@/lib/api";
import { handleMessage } from "@/lib/bot";
import { incomingMessage, isSignedByTwilio } from "@/lib/whatsapp";

// A bill plus a question can need several Gemini calls (each capped at 25 s); that work runs after the response.
export const maxDuration = 120;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

// Twilio posts each incoming WhatsApp message here as form fields. Answer at once with empty TwiML
// (Twilio gives up after 15 s), then reply through the REST API once the AI is done.
export async function POST(request: Request) {
  const params = Object.fromEntries(
    [...(await request.formData()).entries()].map(([k, v]) => [k, String(v)]),
  );
  // Twilio signs the public URL configured in its console, not the internal one Vercel sees.
  const url = `${appUrl(request)}/api/whatsapp`;
  if (!isSignedByTwilio(url, params, request.headers.get("x-twilio-signature"))) {
    console.warn("whatsapp webhook: rejected, bad or missing signature");
    return new Response("Invalid signature", { status: 403 });
  }
  const message = incomingMessage(params);
  // Message type only, never content or phone numbers.
  console.log(`whatsapp webhook: ${message ? message.type : "no"} message`);
  if (message) {
    const origin = appUrl(request);
    after(() => handleMessage(message, origin));
  }
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
