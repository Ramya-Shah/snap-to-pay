import { after } from "next/server";
import { appUrl } from "@/lib/api";
import { respond, type BotReply } from "@/lib/bot";
import { incomingMessage, isSignedByTwilio } from "@/lib/whatsapp";

// Work that misses the reply window keeps running for a follow-up "ok" (each Gemini call is capped at 25 s).
export const maxDuration = 120;

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// TwiML: Twilio sends this message back to the sender. Media must be a public URL.
function twiml(reply?: BotReply) {
  const message = reply
    ? `<Message><Body>${escapeXml(reply.text.slice(0, 1600))}</Body>${reply.mediaUrl ? `<Media>${escapeXml(reply.mediaUrl)}</Media>` : ""}</Message>`
    : "";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${message}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

// Twilio posts each incoming WhatsApp message here as form fields and waits up to 15 s for the reply.
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
  if (!message) return twiml();

  const started = Date.now();
  const { reply, keepAlive } = await respond(message, appUrl(request));
  if (keepAlive) after(() => keepAlive);
  console.log(`whatsapp reply: ${reply.mediaUrl ? "image + text" : "text"} in ${Date.now() - started} ms${keepAlive ? " (still working)" : ""}`);
  return twiml(reply);
}
