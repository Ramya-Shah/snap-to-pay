import { ApiError } from "@google/genai";
import { ZodError } from "zod";
import { fail, tooMany } from "@/lib/api";
import { parseBill } from "@/lib/gemini";
import { LIMITS, clientId, hit, waitText } from "@/lib/rate-limit";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 4000;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
// What browsers record (Chrome/Firefox: WebM or Ogg Opus, Safari: MP4/AAC) plus common uploads.
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/aac"];

const fileField = (form: FormData, name: string) => {
  const value = form.get(name);
  return value instanceof File && value.size > 0 ? value : undefined;
};

// POST multipart/form-data with one of: an `image` file, an `audio` recording, or a `text` field.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "Send the bill as multipart form data.");
  }

  const text = String(form.get("text") ?? "").trim();
  const image = fileField(form, "image");
  const audio = fileField(form, "audio");
  // Browsers add codec details, e.g. "audio/webm;codecs=opus"; Gemini wants the bare type.
  const audioType = audio?.type.split(";")[0];

  if (!text && !image && !audio) return fail(400, "Add a photo of the bill, type the order or record it.");
  if (image && audio) return fail(400, "Send a photo or a recording, not both.");
  if (text.length > MAX_TEXT_CHARS) return fail(400, "That order text is too long.");
  if (image && !IMAGE_TYPES.includes(image.type)) {
    return fail(400, "Use a JPG, PNG, WebP or HEIC photo.");
  }
  if (image && image.size > MAX_IMAGE_BYTES) return fail(400, "Keep the photo under 8 MB.");
  if (audio && !AUDIO_TYPES.includes(audioType!)) return fail(400, "That recording format isn't supported.");
  if (audio && audio.size > MAX_AUDIO_BYTES) return fail(400, "Keep the recording under a minute.");

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

  const media = image ?? audio;
  try {
    const bill = await parseBill({
      text: text || undefined,
      media: media && {
        kind: image ? "image" : "audio",
        mimeType: image ? image.type : audioType!,
        base64: Buffer.from(await media.arrayBuffer()).toString("base64"),
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
      return fail(502, audio ? "Couldn't make out that recording. Try again a little slower." : "Couldn't read that bill clearly. Try a sharper photo.");
    }
    return fail(500, "Something went wrong reading the bill.");
  }
}
