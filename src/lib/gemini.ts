import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { billSchema, withTotals, type ParsedBill } from "./bill";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

const PROMPT = `You read bills and orders from small Indian shops: handwritten bills, printed receipts, WhatsApp order messages and spoken orders.
Extract every product line and every extra charge (delivery, GST, packing, discount).
- Amounts are in Indian rupees. Treat "Rs", "₹", "/-" as rupees.
- Translate item names to plain English; keep a Hindi/regional name in brackets only if it helps, e.g. "Cottage cheese (paneer)".
- If a line total is missing but quantity and unit price are present, compute it.
- If a price is missing entirely, use 0 and add a note saying which item has no price.
- Never invent items. If something is unreadable, add a note instead of guessing silently.
- statedTotal is only the total actually written on the bill; leave it out if none is written.`;

// Gemini's structured output takes a plain JSON Schema; drop the $schema key Zod adds.
const responseJsonSchema: Record<string, unknown> = z.toJSONSchema(billSchema);
delete responseJsonSchema.$schema;

let client: GoogleGenAI | undefined;
function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set. Add it to .env.local.");
  }
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export type BillInput = {
  text?: string;
  image?: { mimeType: string; base64: string };
};

export async function parseBill(input: BillInput): Promise<ParsedBill> {
  const parts = [];
  if (input.image) {
    parts.push({
      inlineData: { mimeType: input.image.mimeType, data: input.image.base64 },
    });
  }
  if (input.text) {
    parts.push({ text: `Order text:\n${input.text}` });
  }

  const response = await getClient().models.generateContent({
    model: MODEL,
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
