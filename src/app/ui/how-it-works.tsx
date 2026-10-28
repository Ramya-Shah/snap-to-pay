import { Icon, type IconName } from "./icons";

const STEPS: { icon: IconName; title: string; body: string }[] = [
  { icon: "camera", title: "Snap or speak", body: "A bill photo, a WhatsApp order or a voice note." },
  { icon: "sparkles", title: "AI itemizes it", body: "Gemini reads every line, translates it and does the maths." },
  { icon: "check", title: "You check it", body: "Unsure lines are flagged. Tap any value to fix it." },
  { icon: "shield", title: "Customer pays", body: "QR or WhatsApp link to Razorpay. You see “Paid” live." },
];

const STACK = ["Next.js 16", "Gemini Flash-Lite", "Razorpay Orders + Checkout", "Zod-validated AI output"];

export function HowItWorks() {
  return (
    <section aria-labelledby="how" className="mt-16">
      <h2 id="how" className="font-display text-2xl font-bold tracking-tight">
        How it works
      </h2>
      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                <Icon name={step.icon} className="size-5" />
              </span>
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
            </div>
            <h3 className="mt-4 font-semibold">{step.title}</h3>
            <p className="mt-1 text-sm text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 grid gap-4 rounded-2xl border border-line bg-surface-2 p-5 text-sm sm:grid-cols-[auto_1fr] sm:items-start">
        <p className="font-semibold">Why you can trust the total</p>
        <p className="text-muted">
          The AI only reads the bill. Its answer must match a strict schema, the server re-adds
          every line itself before creating the Razorpay order, and “Paid” only appears once
          Razorpay confirms the payment and its signature checks out.
        </p>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {STACK.map((s) => (
          <li key={s} className="rounded-full border border-line px-3 py-1 text-xs text-muted">
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}
