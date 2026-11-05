import { ApiError } from "@google/genai";
import { z } from "zod";
import { fail, tooMany } from "@/lib/api";
import { askAssistant } from "@/lib/assistant";
import { LIMITS, clientId, hit, waitText } from "@/lib/rate-limit";
import { RazorpayError } from "@/lib/razorpay";

const MAX_TURNS = 8;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(40),
});

// POST { messages: [{ role, text }] } → { answer, toolsUsed, reminders }. The last message is the new question.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Send the question as JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail(400, "Ask a question of up to 600 characters.");
  const history = parsed.data.messages.slice(-MAX_TURNS);
  if (history[history.length - 1].role !== "user") return fail(400, "The last message must be a question.");

  const mine = await hit(LIMITS.assistantPerIp, clientId(request));
  if (!mine.ok) {
    return tooMany(
      mine.retryAfterSec,
      `That's ${LIMITS.assistantPerIp.max} questions this hour. Try again in ${waitText(mine.retryAfterSec)}.`,
    );
  }
  const everyone = await hit(LIMITS.aiPerDay, "all");
  if (!everyone.ok) {
    return tooMany(everyone.retryAfterSec, "The demo's free AI quota for today is used up. The Payments list still works.");
  }

  try {
    return Response.json(await askAssistant(history, new URL(request.url).origin));
  } catch (err) {
    console.error("assistant failed:", err);
    if (err instanceof ApiError && err.status === 429) {
      return fail(429, "The free AI quota is used up for now. Try again in a minute.");
    }
    if (err instanceof ApiError && err.status === 503) {
      return fail(503, "The AI is busy right now. Try again in a few seconds.");
    }
    if (err instanceof RazorpayError) return fail(502, "Couldn't read your payments from Razorpay. Try again.");
    return fail(500, "Something went wrong answering that.");
  }
}
