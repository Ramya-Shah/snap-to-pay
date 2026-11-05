import { after } from "next/server";
import { appUrl } from "@/lib/api";
import { handleMessage } from "@/lib/bot";
import { incomingMessages, isSignedByMeta, verifyToken } from "@/lib/whatsapp";

// Reading a bill can take 20 s or more on the free Gemini tier; that work runs after the response.
export const maxDuration = 60;

// Meta checks the webhook once when you connect it: echo the challenge if the verify token matches.
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = verifyToken();
  if (params.get("hub.mode") === "subscribe" && token && params.get("hub.verify_token") === token) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// Incoming messages. Answer 200 straight away so Meta doesn't retry, then do the slow work.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!isSignedByMeta(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn(`whatsapp webhook: rejected, bad or missing signature (${raw.length} bytes)`);
    return new Response("Invalid signature", { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const origin = appUrl(request);
  const messages = incomingMessages(payload);
  // Message types only, never content or phone numbers.
  console.log(`whatsapp webhook: ${messages.length} message(s) ${messages.map((m) => m.type).join(",")}`);
  // Delivery and read receipts arrive here too; they carry no messages and need nothing.
  if (messages.length) after(() => Promise.all(messages.map((m) => handleMessage(m, origin))));
  return new Response("OK", { status: 200 });
}
