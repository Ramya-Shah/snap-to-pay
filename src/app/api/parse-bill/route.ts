import { ApiError } from "@google/genai";
import { ZodError } from "zod";
import { fail, tooMany } from "@/lib/api";
import { parseBill } from "@/lib/gemini";
import { LIMITS, clientId, hit, waitText } from "@/lib/rate-limit";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 4000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// POST multipart/form-data with an `image` file and/or a `text` field.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Send the bill as multipart form data.");
  }

  const text = String(form.get("text") ?? "").trim();
  const file = form.get("image");
  const image = file instanceof File && file.size > 0 ? file : undefined;

  if (!text && !image) return fail(400, "Add a photo of the bill or type the order.");
  if (text.length > MAX_TEXT_CHARS) return fail(400, "That order text is too long.");
  if (image && !IMAGE_TYPES.includes(image.type)) {
    return fail(400, "Use a JPG, PNG, WebP or HEIC photo.");
  }
  if (image && image.size > MAX_IMAGE_BYTES) return fail(400, "Keep the photo under 8 MB.");

  // Checked after validation so bad requests don't use up anyone's allowance.
  const mine = await hit(LIMITS.aiPerIp, clientId(request));
  if (!mine.ok) {
    return tooMany(
      mine.retryAfterSec,
      `You've read ${LIMITS.aiPerIp.max} bills with live AI this hour. The sample bills still work, or try again in ${waitText(mine.retryAfterSec)}.`,
    );
  }
  const everyone = await hit(LIMITS.aiPerDay, "all");
  if (!everyone.ok) {
    return tooMany(
      everyone.retryAfterSec,
      "The demo's free AI quota for today is used up. The sample bills still work without it.",
    );
  }

  try {
    const bill = await parseBill({
      text: text || undefined,
      image: image && {
        mimeType: image.type,
        base64: Buffer.from(await image.arrayBuffer()).toString("base64"),
      },
    });
    return Response.json({ bill });
  } catch (err) {
    console.error("parse-bill failed:", err);
    if (err instanceof ApiError && err.status === 429) {
      return fail(429, "The free AI quota is used up for now. Try again in a minute.");
    }
    if (err instanceof ApiError && err.status === 503) {
      return fail(503, "The AI is busy right now. Try again in a few seconds.");
    }
    if (err instanceof ZodError || err instanceof SyntaxError) {
      return fail(502, "Couldn't read that bill clearly. Try a sharper photo.");
    }
    return fail(500, "Something went wrong reading the bill.");
  }
}
