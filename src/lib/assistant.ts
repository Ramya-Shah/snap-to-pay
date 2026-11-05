import "server-only";
import type { Content } from "@google/genai";
import { generate, MODEL } from "./gemini";
import { listOrders, type OrderView } from "./razorpay";
import { runTool, TOOL_DECLARATIONS, type ReminderAction } from "./sales";

const PROMPT = `You are the sales assistant inside Snap-to-Pay, for a small Indian shop that collects payments through Razorpay.
Answer the shopkeeper's questions about their bills and payments.
- Call a tool for every number, bill or item you mention. Never calculate, estimate or reuse numbers from earlier turns; quote amounts exactly as the tools return them.
- When a tool shows only some of the matching bills, say how many match in total and their total amount (matching_bills, matching_total).
- When you list what a tool returned, keep its order and include every entry it returned; never drop one because its name looks unusual.
- Bills do not record customer names. Describe a bill by its amount, items and time instead.
- Times are in IST. If a tool's coverage note says older bills are missing and that matters for the answer, say so in a few words.
- Keep answers short: one to three sentences, or a short list with "- " bullets. Use **bold** only for key amounts. No tables, headings or URLs; the app shows links and buttons itself.
- Reply in English. Switch to Hinglish (Roman script) only when the shopkeeper's latest message itself uses Hindi words such as "aaj", "kitna" or "paisa".
- If the shopkeeper names no period, use "all". Make as few tool calls as possible: one is usually enough.
- If a period has no payments, say so and mention the last payment the summary reports.
- To remind customers, call prepare_reminders directly (it picks the unpaid bills itself) and say the WhatsApp buttons are below. You cannot send messages yourself.
- Only help with this shop's sales, bills and payments; politely decline anything else.`;

const MAX_ROUNDS = 5;
export type ChatTurn = { role: "user" | "assistant"; text: string };
export type ToolUse = { name: string; args: Record<string, unknown> };
export type AssistantReply = { answer: string; toolsUsed: ToolUse[]; reminders: ReminderAction[]; failed?: boolean };

// Free-tier answers take 10-20 s, so a repeated opening question (like the suggested ones)
// reuses a recent answer. Per server instance, and short enough that new payments show up soon.
const CACHE_MS = 3 * 60 * 1000;
const recent = new Map<string, { reply: AssistantReply; at: number }>();

export async function askAssistant(history: ChatTurn[], origin: string): Promise<AssistantReply> {
  const key = history.length === 1 ? `${origin}|${history[0].text.trim().toLowerCase()}` : undefined;
  const hitCache = key && recent.get(key);
  if (hitCache && Date.now() - hitCache.at < CACHE_MS) return hitCache.reply;
  const reply = await answer(history, origin);
  if (key && !reply.failed) recent.set(key, { reply, at: Date.now() });
  return reply;
}

async function answer(history: ChatTurn[], origin: string): Promise<AssistantReply> {
  // Read Razorpay once per question, however many tools the model calls.
  let ordersPromise: Promise<OrderView[]> | undefined;
  const ctx = { origin, orders: () => (ordersPromise ??= listOrders()) };

  const contents: Content[] = history.map((t) => ({
    role: t.role === "user" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
  const toolsUsed: ToolUse[] = [];
  const reminders: ReminderAction[] = [];

  // Once a round falls back to another model, stay on it: thought signatures belong to the model that made them.
  let model = MODEL;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await generate(
      {
        contents,
        config: {
          systemInstruction: PROMPT,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          temperature: 0,
        },
      },
      model,
    );
    const response = result.response;
    model = result.model;

    const calls = response.functionCalls ?? [];
    if (calls.length === 0) {
      const text = response.text?.trim();
      return { answer: text || "Sorry, I couldn't answer that.", toolsUsed, reminders, failed: !text };
    }

    // Send the model's own turn back unchanged: it carries the thought signatures newer models need.
    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    const parts = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const args = call.args ?? {};
      toolsUsed.push({ name, args });
      const out = await runTool(name, args, ctx);
      if (out.reminders) reminders.push(...out.reminders);
      parts.push({ functionResponse: { id: call.id, name, response: { output: out.result } } });
    }
    contents.push({ role: "user", parts });
  }

  return { answer: "That took too many steps. Try asking a simpler question.", toolsUsed, reminders, failed: true };
}
