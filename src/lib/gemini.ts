import "server-only";
import { ApiError, GoogleGenAI, type GenerateContentParameters } from "@google/genai";
import { z } from "zod";
import { billSchema, withTotals, type ParsedBill } from "./bill";

export const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
// Faster, but with a much smaller free daily quota, so it is only used when MODEL is overloaded.
export const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL ?? "gemini-3.6-flash";

const PROMPT = `You read bills and orders from small Indian shops: handwritten bills, printed receipts, WhatsApp order messages and spoken orders.
Extract every product line and every extra charge (delivery, GST, packing, discount).
- Amounts are in Indian rupees. Treat "Rs", "₹", "/-" as rupees.
- Translate item names to plain English; keep a Hindi/regional name in brackets only if it helps, e.g. "Cottage cheese (paneer)".
- If a line total is missing but quantity and unit price are present, compute it.
- Branded packs: the size is not the quantity. "Amul butter 500g 285" is quantity 1, unit "pack", name "Amul butter (500 g)". Loose goods keep their weight as the quantity: "Atta 5kg 245" is quantity 5, unit "kg".
- One price for several items together ("dono gandru aur bhindi 90", "onion and garlic together 50") is ONE item line: name "Cluster beans (gandru) 1 kg + Ladyfinger (bhindi) 2 kg", quantity 1, unit "lot", amount 90. Do not also list those items separately, and do not split the price between them.
- charges are only for delivery, GST/tax, packing, service and discounts. A product's price is never a charge.
- If a price is missing entirely, use 0 and set that line's check to "No price given".
- Never invent items. If a line is hard to read or you had to guess, set its check with a short reason, e.g. "Price smudged: read as 45". Leave check out for clear lines.
- notes are only for things about the whole bill, not single lines.
- For a voice recording, also fill transcript with what was said, in the words used (Hindi words in Roman script), numbers as digits. Spoken numbers like "one twenty" mean 120 rupees.
- statedTotal is only the total actually written on the bill; leave it out if none is written. Never fill it with a total you calculated.`;

// Gemini's structured output takes a plain JSON Schema; drop the $schema key Zod adds.
const responseJsonSchema: Record<string, unknown> = z.toJSONSchema(billSchema);
delete responseJsonSchema.$schema;

let client: GoogleGenAI | undefined;
export function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local.");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

const isBusy = (err: unknown) => err instanceof ApiError && err.status === 503;

// Free-tier models often answer 503 "high demand". Try the fallback model, then the main one once more.
// Returns the model that answered so a multi-step conversation can stay on it.
export async function generate(request: Omit<GenerateContentParameters, "model">, model = MODEL) {
  const order = model === FALLBACK_MODEL ? [FALLBACK_MODEL, MODEL] : [model, FALLBACK_MODEL, model];
  for (let i = 0; ; i++) {
    try {
      return { response: await getClient().models.generateContent({ ...request, model: order[i] }), model: order[i] };
    } catch (err) {
      if (!isBusy(err) || i === order.length - 1) throw err;
      if (order[i + 1] === order[i - 1]) await new Promise((r) => setTimeout(r, 1500));
    }
  }
}

export type BillInput = {
  text?: string;
  // A bill photo or a voice recording; Gemini reads both directly.
  media?: { kind: "image" | "audio"; mimeType: string; base64: string };
};

export async function parseBill(input: BillInput): Promise<ParsedBill> {
  const parts = [];
  if (input.media) {
    parts.push({ text: input.media.kind === "audio" ? "Voice recording of the order:" : "Photo of the bill:" });
    parts.push({ inlineData: { mimeType: input.media.mimeType, data: input.media.base64 } });
  }
  if (input.text) {
    parts.push({ text: `Order text:\n${input.text}` });
  }

  const { response } = await generate({
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema,
      temperature: 0,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned no content.");
  }
  return withTotals(billSchema.parse(JSON.parse(response.text)));
}
