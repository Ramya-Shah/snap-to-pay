import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Meta's WhatsApp Cloud API. Graph API versions stay supported for about two years.
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0"}`;

function config() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set.");
  }
  return { token, phoneNumberId };
}

export const verifyToken = () => process.env.WHATSAPP_VERIFY_TOKEN;

// Meta signs every webhook body with the app secret; anything without a valid signature is ignored.
export function isSignedByMeta(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function graph(path: string, body: unknown) {
  const { token } = config();
  // WHATSAPP_DRY_RUN logs outgoing messages instead of sending them, for local testing.
  if (process.env.WHATSAPP_DRY_RUN === "1") {
    console.log("[whatsapp dry run]", path, JSON.stringify(body));
    return {};
  }
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(data?.error ?? data)}`);
  return data;
}

export function sendText(to: string, text: string) {
  return graph(`/${config().phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text.slice(0, 4096), preview_url: true },
  });
}

// `link` must be a public HTTPS URL; Meta fetches the image itself.
export function sendImage(to: string, link: string, caption: string) {
  return graph(`/${config().phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to,
    type: "image",
    image: { link, caption },
  });
}

// Blue ticks plus "typing…" while the AI works. Cosmetic, so failures are ignored.
export async function markReadAndTyping(messageId: string) {
  try {
    await graph(`/${config().phoneNumberId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    });
  } catch (err) {
    console.warn("typing indicator failed:", err);
  }
}

// Photos and voice notes arrive as media IDs: look up the temporary URL, then download it with the token.
export async function downloadMedia(mediaId: string) {
  const { token } = config();
  const auth = { Authorization: `Bearer ${token}` };
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: auth, cache: "no-store" });
  if (!meta.ok) throw new Error(`WhatsApp media lookup ${meta.status}`);
  const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
  const file = await fetch(url, { headers: auth, cache: "no-store" });
  if (!file.ok) throw new Error(`WhatsApp media download ${file.status}`);
  const bytes = Buffer.from(await file.arrayBuffer());
  // Voice notes come as "audio/ogg; codecs=opus"; Gemini wants the bare type.
  return { base64: bytes.toString("base64"), mimeType: mime_type.split(";")[0].trim(), size: bytes.length };
}

// The parts of Meta's webhook payload the bot uses.
export type IncomingMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  audio?: { id: string; mime_type: string };
};

export function incomingMessages(payload: unknown): IncomingMessage[] {
  const entries = (payload as { entry?: { changes?: { value?: { messages?: IncomingMessage[] } }[] }[] })?.entry ?? [];
  return entries.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []);
}
