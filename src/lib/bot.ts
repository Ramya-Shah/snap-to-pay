import "server-only";
import { ApiError } from "@google/genai";
import { askAssistant } from "./assistant";
import type { ParsedBill } from "./bill";
import { rupees, splitLine } from "./format";
import { parseBill, type BillInput } from "./gemini";
import { LIMITS, hit, waitText } from "./rate-limit";
import { createOrder, latestBotOrder } from "./razorpay";
import { downloadMedia, type IncomingMessage } from "./whatsapp";

// Twilio trial numbers can't send messages through the API (template-only, an upgrade feature),
// so every reply goes back inside the webhook response, which Twilio waits 15 s for.
export type BotReply = { text: string; mediaUrl?: string };

const HELP = `👋 Hi! I'm the *Snap-to-Pay* bot.

• Send a *photo of a bill*, *type an order* or send a *voice note*. I'll make the bill and a payment link for your customer.
• Ask about your sales: _"aaj kitna aaya?"_, _"which bills are unpaid?"_

Test mode: no real money moves.`;

const GREETING = /^\s*(hi+|hello|hey|help|start|menu|namaste|namaskar)\b[\s!.]*$/i;
const FOLLOW_UP = /^\s*(ok+|okay|k|status|done|\?+)[\s!.]*$/i;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_RUPEES = 100_000;
// Answer within this or say "still working"; Twilio drops replies that take over 15 s.
export const REPLY_BUDGET_MS = Number(process.env.WHATSAPP_REPLY_BUDGET_MS) || 12_000;

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
    ...(payUrl ? ["", `Forward this link to your customer:\n${payUrl}`] : []),
  ].join("\n");
}

// Works out the reply to one message. Pure: sending is the webhook's job.
async function answer(message: IncomingMessage, origin: string): Promise<BotReply> {
  const from = message.from;
  const text = message.text;
  if (message.type === "text" && GREETING.test(text)) return { text: HELP };
  if (message.type === "other") return { text: "I can read photos, voice notes and text. Send one of those, or say *hi* for help." };

  const mine = await hit(LIMITS.aiPerIp, `wa:${from}`);
  if (!mine.ok) return { text: `You've used this hour's ${LIMITS.aiPerIp.max} AI reads. Try again in ${waitText(mine.retryAfterSec)}.` };
  const everyone = await hit(LIMITS.aiPerDay, "all");
  if (!everyone.ok) return { text: "The demo's free AI quota for today is used up. Please try again tomorrow." };

  const input: BillInput = { text: text || undefined };
  if (message.mediaUrl) {
    const media = await downloadMedia(message.mediaUrl);
    if (media.size > MAX_MEDIA_BYTES) return { text: "That file is too big. Keep photos under 8 MB and voice notes under a minute." };
    input.media = { kind: message.type === "image" ? "image" : "audio", mimeType: media.mimeType, base64: media.base64 };
  }

  // One rule decides between a bill and a question: if Gemini finds no items, it's a question.
  const bill = await parseBill(input);
  if (bill.items.length === 0) {
    const question = bill.transcript?.trim() || text;
    if (!question) return { text: "I couldn't find any items in that. Try a clearer photo, or say *hi* for help." };
    const reply = await askAssistant([{ role: "user", text: question }], origin);
    const reminders = reply.reminders.map((r) => `• ${r.amount} (${r.shop}): ${r.whatsappUrl}`);
    return {
      text: [
        ...(bill.transcript ? [`🎙️ _"${bill.transcript}"_`, ""] : []),
        // The website renders **bold**; WhatsApp uses *bold*.
        reply.answer.replace(/\*\*(.+?)\*\*/g, "*$1*"),
        ...(reminders.length ? ["", "Tap to send a reminder:", ...reminders] : []),
      ].join("\n"),
    };
  }

  if (bill.computedTotal < 1) return { text: `${billMessage(bill)}\n\nThere's nothing to collect yet. Add the prices and send it again.` };
  if (bill.computedTotal > MAX_RUPEES) return { text: `${billMessage(bill)}\n\nThis demo collects at most ${rupees(MAX_RUPEES)} per bill.` };
  const orderId = await createOrder(bill, { notifyWhatsapp: from });
  // One message: the QR image with the bill as its caption.
  return { text: billMessage(bill, `${origin}/pay/${orderId}`), mediaUrl: `${origin}/api/qr/${orderId}` };
}

async function safeAnswer(message: IncomingMessage, origin: string): Promise<BotReply> {
  console.log(`whatsapp bot: handling ${message.type} message`);
  try {
    return await answer(message, origin);
  } catch (err) {
    console.error("whatsapp bot failed:", err);
    const busy = err instanceof ApiError && (err.status === 503 || err.status === 429);
    return { text: busy ? "The AI is busy right now. Please send it again in a minute." : "Sorry, something went wrong. Please try again." };
  }
}

// Replies still being worked on when the 12 s budget ran out, per sender. Per server instance;
// a follow-up that lands elsewhere falls back to the sender's latest bot-made bill in Razorpay.
const pending = new Map<string, { reply: Promise<BotReply>; startedAt: number }>();

const within = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([promise, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

const STILL_WORKING: BotReply = {
  text: "⏳ The free AI is taking a little longer. Reply *ok* in about 20 seconds and I'll send it.",
};

// From a stored bill line set, for follow-ups served from Razorpay instead of memory.
function storedBillMessage(order: { merchant: string; lines: string[]; amount: number }, payUrl: string) {
  return [
    `🧾 *${order.merchant}*`,
    ...order.lines.map((l) => {
      const { label, amount } = splitLine(l);
      return `• ${label}${amount ? `  *${amount}*` : ""}`;
    }),
    `*Total: ${rupees(order.amount)}*`,
    "",
    `Forward this link to your customer:\n${payUrl}`,
  ].join("\n");
}

// The reply to send now, plus any work that must keep running after the response.
export async function respond(message: IncomingMessage, origin: string): Promise<{ reply: BotReply; keepAlive?: Promise<unknown> }> {
  const waiting = pending.get(message.from);

  if (FOLLOW_UP.test(message.text) && message.type === "text") {
    if (waiting) {
      const done = await within(waiting.reply, REPLY_BUDGET_MS);
      if (!done) return { reply: STILL_WORKING };
      pending.delete(message.from);
      return { reply: done };
    }
    const order = await latestBotOrder(message.from, 10 * 60).catch((err) => {
      console.error("whatsapp follow-up lookup failed:", err);
      return undefined;
    });
    console.log(`whatsapp follow-up: ${order ? "latest bill from Razorpay" : "nothing pending"}`);
    if (order) {
      return { reply: { text: storedBillMessage(order, `${origin}/pay/${order.orderId}`), mediaUrl: `${origin}/api/qr/${order.orderId}` } };
    }
    return { reply: { text: "Nothing is waiting right now. Send a bill photo, an order or a question, or say *hi* for help." } };
  }

  const work = safeAnswer(message, origin);
  const done = await within(work, REPLY_BUDGET_MS);
  if (done) return { reply: done };
  pending.set(message.from, { reply: work, startedAt: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.startedAt > 10 * 60 * 1000) pending.delete(k);
  return { reply: STILL_WORKING, keepAlive: work };
}
