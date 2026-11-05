"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "../ui/icons";

type Reminder = { orderId: string; amount: string; shop: string; whatsappUrl: string };
type ToolUse = { name: string; args: Record<string, unknown> };
type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolsUsed: ToolUse[]; reminders: Reminder[] };

const SUGGESTIONS = [
  "How much have I collected in total?",
  "Which bills are still unpaid?",
  "What sells the most?",
  "Remind customers with the 2 biggest unpaid bills",
  "Aaj kitna paisa aaya?",
];

const THINKING_STEPS = ["Checking your payments…", "Reading Razorpay…", "Adding it up…", "Writing the answer…"];

const TOOL_LABELS: Record<string, string> = {
  get_sales_summary: "Sales summary",
  list_bills: "Bills",
  top_items: "Top items",
  prepare_reminders: "Reminders",
};
const PERIOD_LABELS: Record<string, string> = {
  today: "today",
  yesterday: "yesterday",
  last_7_days: "last 7 days",
  this_month: "this month",
  all: "all time",
};

function toolLabel(t: ToolUse) {
  const name = TOOL_LABELS[t.name] ?? t.name;
  const period = typeof t.args.period === "string" ? PERIOD_LABELS[t.args.period] : undefined;
  const status = t.args.status === "waiting" ? "unpaid" : t.args.status === "paid" ? "paid" : undefined;
  return [name, status, period].filter(Boolean).join(" · ");
}

// Renders the small Markdown subset the assistant is asked to use (**bold**, "- " bullets) as
// React elements, so model text is never inserted as HTML.
function RichText({ text }: { text: string }) {
  const bold = (line: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
    );
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc space-y-1 pl-5">
        {bullets.map((b, i) => (
          <li key={i}>{bold(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (/^[-*] /.test(trimmed)) bullets.push(trimmed.slice(2));
    else {
      flush();
      if (trimmed) blocks.push(<p key={blocks.length}>{bold(trimmed)}</p>);
    }
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

export function SalesAssistant() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  // Free-tier answers can take 10-20 seconds; show what is happening.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, THINKING_STEPS.length - 1)), 3000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (messages.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const next: Message[] = [...messages, { role: "user", text }];
    setMessages(next);
    setInput("");
    setError(null);
    setStep(0);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, text: m.text })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong answering that.");
      setMessages([...next, { role: "assistant", text: data.answer, toolsUsed: data.toolsUsed, reminders: data.reminders }]);
    } catch (e) {
      // Drop the unanswered question so the conversation sent next time stays question/answer pairs.
      setMessages(messages);
      setInput(text);
      setError(e instanceof Error ? e.message : "Something went wrong answering that.");
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <section className="mb-8 rounded-3xl border border-line bg-surface p-5 sm:p-6" aria-labelledby="assistant-title">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
          <Icon name="sparkles" className="size-5" />
        </span>
        <div>
          <h2 id="assistant-title" className="font-display text-xl font-bold tracking-tight">
            Ask about your sales
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Answers come straight from your Razorpay payments. English or Hinglish. Free AI, so allow 10–20 seconds.
          </p>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="mt-5 space-y-4" aria-live="polite">
          {messages.map((m, i) =>
            m.role === "user" ? (
              <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-bg">
                {m.text}
              </p>
            ) : (
              <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3 text-sm">
                <RichText text={m.text} />
                {m.reminders.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.reminders.map((r) => (
                      <a
                        key={r.orderId}
                        href={r.whatsappUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-[#06301a] hover:brightness-95"
                      >
                        <Icon name="message" className="size-3.5" />
                        Remind · {r.amount} · {r.shop}
                      </a>
                    ))}
                  </div>
                )}
                {m.toolsUsed.length > 0 && (
                  <p className="mt-3 text-xs text-muted">
                    Looked up: {[...new Set(m.toolsUsed.map(toolLabel))].join(", ")}
                  </p>
                )}
              </div>
            ),
          )}
          {busy && (
            <p className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-surface-2 px-4 py-3 text-sm text-muted">
              <Icon name="sparkles" className="size-4 animate-pulse text-brand-ink" />
              {THINKING_STEPS[step]}
            </p>
          )}
          <div ref={bottom} />
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      {messages.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => ask(q)}
              disabled={busy}
              className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-brand hover:bg-brand-soft disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={600}
          placeholder="e.g. Which unpaid bill is the biggest?"
          aria-label="Ask about your sales"
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted/70 focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:opacity-40"
        >
          Ask
          <Icon name="arrow" className="size-4" />
        </button>
      </form>
    </section>
  );
}
