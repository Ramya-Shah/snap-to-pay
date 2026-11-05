import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp through Twilio (the free Sandbox works without Meta business verification).
// Docs: https://www.twilio.com/docs/whatsapp/api

function config() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not set.");
  // The Sandbox number by default; a registered sender later.
  const from = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";
  return { sid, token, from, basic: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` };
}

// Twilio signs each webhook: HMAC-SHA1 over the exact webhook URL plus the POST fields sorted by name.
export function isSignedByTwilio(url: string, params: Record<string, string>, signature: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = Buffer.from(createHmac("sha1", token).update(data).digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Numbers are stored and passed around as "+91…"; Twilio wants the "whatsapp:" prefix.
const address = (number: string) => (number.startsWith("whatsapp:") ? number : `whatsapp:${number}`);

async function send(to: string, fields: Record<string, string>, statusCallback?: string) {
  const { sid, from, basic } = config();
  const body = new URLSearchParams({ From: from, To: address(to), ...fields });
  if (statusCallback) body.set("StatusCallback", statusCallback);
  // WHATSAPP_DRY_RUN logs outgoing messages instead of sending them, for local testing.
  if (process.env.WHATSAPP_DRY_RUN === "1") {
    console.log("[whatsapp dry run]", JSON.stringify(Object.fromEntries(body)));
    return;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: basic },
    body,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${data?.code ?? ""} ${data?.message ?? ""}`);
  console.log(`whatsapp sent: ${data.status}`);
}

export type SendOptions = { statusCallback?: string };

export function sendText(to: string, text: string, options: SendOptions = {}) {
  return send(to, { Body: text.slice(0, 1600) }, options.statusCallback);
}

// One message with an image and a caption. `link` must be a public HTTPS URL Twilio can fetch.
export function sendImage(to: string, link: string, caption: string, options: SendOptions = {}) {
  return send(to, { Body: caption.slice(0, 1024), MediaUrl: link }, options.statusCallback);
}

// Photos and voice notes arrive as Twilio media URLs, which need the account's credentials.
export async function downloadMedia(url: string) {
  const res = await fetch(url, { headers: { Authorization: config().basic }, redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Twilio media download ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  // Voice notes come as "audio/ogg; codecs=opus"; Gemini wants the bare type.
  const mimeType = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  return { base64: bytes.toString("base64"), mimeType, size: bytes.length };
}

export type IncomingMessage = {
  id: string;
  from: string; // "+91…"
  type: "text" | "image" | "audio" | "other";
  text: string;
  mediaUrl?: string;
};

// Twilio posts one message per request as form fields.
export function incomingMessage(params: Record<string, string>): IncomingMessage | undefined {
  if (!params.MessageSid || !params.From) return undefined;
  const contentType = params.MediaContentType0 ?? "";
  const hasMedia = Number(params.NumMedia ?? 0) > 0;
  const type = !hasMedia ? "text" : contentType.startsWith("image/") ? "image" : contentType.startsWith("audio/") ? "audio" : "other";
  return {
    id: params.MessageSid,
    from: params.From.replace(/^whatsapp:/, ""),
    type,
    text: (params.Body ?? "").trim(),
    mediaUrl: hasMedia ? params.MediaUrl0 : undefined,
  };
}
