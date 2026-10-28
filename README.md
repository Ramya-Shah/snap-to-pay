# Snap-to-Pay

**Live:** https://snap-to-pay.vercel.app (Razorpay test mode, no real money moves)

Snap a bill, paste a WhatsApp order or speak it. Gemini turns it into an itemized bill, the
shopkeeper checks it, and the customer pays through Razorpay from a QR code or a WhatsApp link.
The shopkeeper's screen switches to "Paid" on its own.

## What it does

- **Reads messy input:** handwritten kirana bills, Hinglish WhatsApp orders, spoken orders.
  Item names are translated, missing line totals are worked out, and GST or delivery become
  separate charges.
- **Flags what to double-check:** lines with no price or hard-to-read values show in amber.
- **Every value is editable** before collecting; quantity × rate and the line amount stay in step.
- **Collects payment:** a Razorpay order per bill, our own `/pay/[orderId]` page with Razorpay
  Checkout, a QR code and a WhatsApp share link.
- **Sample bills** show saved Gemini answers instantly, with no AI quota used.

## Why the total can be trusted

- Gemini's answer must match a Zod schema (used as its structured-output schema too).
- The server re-adds every line itself; the browser's amount is never trusted.
- "Paid" comes from Razorpay's own order status, and Checkout's signature is verified with HMAC.
- Only `rzp_test_` keys are accepted, so this demo can never move real money.

## Stack

Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Gemini (`gemini-3.5-flash-lite`, free tier)
via `@google/genai` · Razorpay Orders API + Checkout · Zod · Vercel.

No database: each bill travels with its Razorpay order as notes.

## Limits

- Live AI reads: 10 per hour per visitor and 300 per day overall. Payment links: 20 per hour.
  Counts use Upstash Redis when `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set,
  otherwise memory (per server instance).

## Run it locally

```bash
npm install
cp .env.example .env.local   # add a Gemini key and Razorpay test keys
npm run dev
```

Pushes to `main` deploy to Vercel automatically.
