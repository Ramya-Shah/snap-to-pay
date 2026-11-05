import "server-only";
import { ApiError } from "@google/genai";
import { askAssistant } from "./assistant";
import type { ParsedBill } from "./bill";
import { rupees } from "./format";
import { parseBill, type BillInput } from "./gemini";
import { LIMITS, hit, waitText } from "./rate-limit";
import { createOrder } from "./razorpay";
import { downloadMedia, sendImage, sendText, type IncomingMessage } from "./whatsapp";

const HELP = `👋 Hi! I'm the *Snap-to-Pay* bot.

• Send a *photo of a bill*, *type an order* or send a *voice note*. I'll make the bill and a payment link for your customer.
• Ask about your sales: _"aaj kitna aaya?"_, _"which bills are unpaid?"_

Test mode: no real money moves.`;

const GREETING = /^\s*(hi+|hello|hey|help|start|menu|namaste|namaskar)\b[\s!.]*$/i;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

// Meta retries a webhook it thinks failed; remember recent message IDs so a retry isn't answered twice.
const seen = new Map<string, number>();
function firstTime(id: string) {
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > 10 * 60 * 1000) seen.delete(k);
  if (seen.has(id)) return false;
  seen.set(id, now);
  return true;
}

const MAX_RUPEES = 100_000;

// Without a pay link (nothing to collect), the message ends after the bill.
function billMessage(bill: ParsedBill, payUrl?: string) {
  const lines = [
    ...bill.items.map((i) => `• ${i.name} × ${i.quantity}${i.unit ? ` ${i.unit}` : ""}  *${rupees(i.amount)}*`),
    ...bill.charges.map((c) => `• ${c.label}  *${rupees(c.amount)}*`),
  ];
  const checks = bill.items.filter((i) => i.check).map((i) => `⚠️ ${i.name}: ${i.check}`);
  return [
    `🧾 *${bill.merchantName ?? "Your bill"}*`,
    ...lines,
    `*Total: ${rupees(bill.computedTotal)}*`,
    ...(bill.totalMismatch && bill.statedTotal !== undefined
      ? [`⚠️ The bill says ${rupees(bill.statedTotal)}, but the lines add up to ${rupees(bill.computedTotal)}.`]
      : []),
    ...(checks.length ? ["", ...checks, "If something's wrong, send the corrected order and I'll make a new link."] : []),
    ...(payUrl ? ["", `Forward this link to your customer:\n${payUrl}`, "I'll message you here when it's paid ✅"] : []),
  ].join("\n");
}

// Every reply asks Twilio to report its delivery status, so failures show in the logs.
export async function handleMessage(message: IncomingMessage, origin: string) {
  if (!firstTime(message.id)) return;
  const to = message.from;
  const opts = { statusCallback: `${origin}/api/whatsapp/status` };
  const reply = (text: string) => sendText(to, text, opts);
  console.log(`whatsapp bot: handling ${message.type} message`);
  try {
    const text = message.text;
    if (message.type === "text" && GREETING.test(text)) return await reply(HELP);
    if (message.type === "other") {
      return await reply("I can read photos, voice notes and text. Send one of those, or say *hi* for help.");
    }

    const mine = await hit(LIMITS.aiPerIp, `wa:${to}`);
    if (!mine.ok) return await reply(`You've used this hour's ${LIMITS.aiPerIp.max} AI reads. Try again in ${waitText(mine.retryAfterSec)}.`);
    const everyone = await hit(LIMITS.aiPerDay, "all");
    if (!everyone.ok) return await reply("The demo's free AI quota for today is used up. Please try again tomorrow.");

    const input: BillInput = { text: text || undefined };
    if (message.mediaUrl) {
      const media = await downloadMedia(message.mediaUrl);
      if (media.size > MAX_MEDIA_BYTES) return await reply("That file is too big. Keep photos under 8 MB and voice notes under a minute.");
      input.media = { kind: message.type === "image" ? "image" : "audio", mimeType: media.mimeType, base64: media.base64 };
    }

    // One rule decides between a bill and a question: if Gemini finds no items, it's a question.
    const bill = await parseBill(input);
    if (bill.items.length === 0) {
      const question = bill.transcript?.trim() || text;
      if (!question) return await reply("I couldn't find any items in that. Try a clearer photo, or say *hi* for help.");
      const answer = await askAssistant([{ role: "user", text: question }], origin);
      const reminders = answer.reminders.map((r) => `• ${r.amount} (${r.shop}): ${r.whatsappUrl}`);
      return await reply(
        [
          ...(bill.transcript ? [`🎙️ _"${bill.transcript}"_`, ""] : []),
          // The website renders **bold**; WhatsApp uses *bold*.
          answer.answer.replace(/\*\*(.+?)\*\*/g, "*$1*"),
          ...(reminders.length ? ["", "Tap to send a reminder:", ...reminders] : []),
        ].join("\n"),
      );
    }

    if (bill.computedTotal < 1) {
      return await reply(`${billMessage(bill)}\n\nThere's nothing to collect yet. Add the prices and send it again.`);
    }
    if (bill.computedTotal > MAX_RUPEES) {
      return await reply(`${billMessage(bill)}\n\nThis demo collects at most ${rupees(MAX_RUPEES)} per bill.`);
    }
    const orderId = await createOrder(bill, { notifyWhatsapp: to });
    const payUrl = `${origin}/pay/${orderId}`;
    // One message, not two: the QR image with the bill as its caption (captions allow 1,024 characters).
    const caption = billMessage(bill, payUrl);
    if (caption.length <= 1024) return await sendImage(to, `${origin}/api/qr/${orderId}`, caption, opts);
    await reply(caption);
    await sendImage(to, `${origin}/api/qr/${orderId}`, `Scan to pay ${rupees(bill.computedTotal)}`, opts);
  } catch (err) {
    console.error("whatsapp bot failed:", err);
    const busy = err instanceof ApiError && (err.status === 503 || err.status === 429);
    await reply(busy ? "The AI is busy right now. Please send it again in a minute." : "Sorry, something went wrong. Please try again.").catch(
      (e) => console.error("whatsapp error reply failed:", e),
    );
  }
}
