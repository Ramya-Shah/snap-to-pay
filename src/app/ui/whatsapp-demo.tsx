import Image from "next/image";
import { Icon } from "./icons";

const JOIN_CODE = "join almost-cloud";
const BOT_NUMBER = "+1 415 523 8886";
// Opens WhatsApp with the join code already typed; the bot runs on Twilio's Sandbox.
const JOIN_LINK = `https://wa.me/14155238886?text=${encodeURIComponent(JOIN_CODE)}`;

const SHOTS = [
  {
    src: "/whatsapp/typed-order.png",
    width: 932,
    height: 584,
    title: "A typed order",
    body: "One reply with the QR code, the bill and a pay link.",
    alt: "WhatsApp: a typed order gets a QR code, an itemized bill totalling ₹449 and a pay link",
  },
  {
    src: "/whatsapp/missing-price.png",
    width: 705,
    height: 624,
    title: "A missing price",
    body: "“Thoda dhaniya” has no price, so it's flagged, not guessed.",
    alt: "WhatsApp: coriander is flagged with No price given, and the bill totals ₹170",
  },
  {
    src: "/whatsapp/combined-price.png",
    width: 676,
    height: 556,
    title: "One price for two items",
    body: "“Dono kundru aur bhindi 90” stays a single ₹90 line.",
    alt: "WhatsApp: ivy gourd and ladyfinger appear as one ₹90 line, and the bill totals ₹130",
  },
];

export function WhatsAppDemo() {
  return (
    <section aria-labelledby="whatsapp" className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <h2 id="whatsapp" className="font-display text-2xl font-bold tracking-tight">
            See it on WhatsApp
          </h2>
          <p className="mt-2 text-muted">
            Shopkeepers can skip the website. Send the bot a bill photo, an order or a voice note, or ask
            about sales. These are real chats, in Razorpay test mode.
          </p>
        </div>
        <a
          href={JOIN_LINK}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-[#06301a] hover:brightness-95"
        >
          <Icon name="message" />
          Try it on WhatsApp
        </a>
      </div>

      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {SHOTS.map((shot) => (
          <li key={shot.src} className="overflow-hidden rounded-2xl border border-line bg-surface">
            <Image
              src={shot.src}
              width={shot.width}
              height={shot.height}
              alt={shot.alt}
              sizes="(min-width: 768px) 33vw, 100vw"
              className="h-auto w-full"
            />
            <div className="p-4">
              <h3 className="font-semibold">{shot.title}</h3>
              <p className="mt-1 text-sm text-muted">{shot.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <figure className="mt-4 max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface">
        <Image
          src="/whatsapp/sales-questions.png"
          width={890}
          height={301}
          alt="WhatsApp: a Hinglish question gets a Hinglish answer, and an English question lists the 5 latest of 38 unpaid bills"
          sizes="(min-width: 768px) 768px, 100vw"
          className="h-auto w-full"
        />
        <figcaption className="p-4">
          <span className="font-semibold">Sales questions</span>
          <span className="text-sm text-muted"> · answered from live Razorpay data, in the language they&apos;re asked in.</span>
        </figcaption>
      </figure>

      <p className="mt-4 text-sm text-muted">
        To try it, send <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">{JOIN_CODE}</code> to{" "}
        {BOT_NUMBER} first, then say hi. It runs on Twilio&apos;s free sandbox, so the join lasts 72 hours.
      </p>
    </section>
  );
}
