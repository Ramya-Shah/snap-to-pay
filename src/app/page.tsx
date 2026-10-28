"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedBill } from "@/lib/bill";

// Minimal typing for the browser Speech Recognition API (Chrome/Edge expose it as webkitSpeechRecognition).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function Home() {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bill, setBill] = useState<ParsedBill | null>(null);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the preview's blob URL when it is replaced or the page unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function pickImage(file: File | null) {
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function toggleVoice() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    const SpeechCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SpeechCtor) {
      setError("Voice input needs Chrome or Edge. You can type the order instead.");
      return;
    }
    const r = new SpeechCtor();
    r.lang = "en-IN";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      const spoken = Array.from(e.results)
        .map((res) => res[0].transcript)
        .join(" ");
      setText((t) => (t ? `${t} ${spoken}` : spoken));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  }

  async function itemize() {
    setLoading(true);
    setError(null);
    setBill(null);
    const form = new FormData();
    if (text.trim()) form.append("text", text.trim());
    if (image) form.append("image", image);
    try {
      const res = await fetch("/api/parse-bill", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setBill(data.bill);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setText("");
    pickImage(null);
    setBill(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const canSubmit = !loading && (text.trim().length > 0 || image !== null);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Snap-to-Pay</h1>
        <p className="mt-2 text-sm opacity-70">
          Photo of a bill, a WhatsApp order, or a voice note → itemized bill, ready to collect
          payment.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-black/10 p-5 dark:border-white/15">
        <label className="block">
          <span className="text-sm font-medium">Bill photo</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white hover:file:bg-blue-700"
          />
        </label>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="Bill preview" className="max-h-64 rounded-lg border border-black/10" />
        )}

        <label className="block">
          <span className="text-sm font-medium">…or type / speak the order</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="2 kg tomatoes 80, 1 paneer 120, delivery 40"
            className="mt-2 w-full rounded-lg border border-black/15 bg-transparent p-3 text-sm outline-none focus:border-blue-600 dark:border-white/20"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={itemize}
            disabled={!canSubmit}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "Reading bill… (up to ~20 s)" : "Itemize bill"}
          </button>
          <button
            onClick={toggleVoice}
            className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
              listening ? "border-red-500 text-red-600" : "border-black/15 dark:border-white/20"
            }`}
          >
            {listening ? "■ Stop" : "🎤 Speak order"}
          </button>
          <button onClick={reset} className="px-2 text-sm opacity-60 hover:opacity-100">
            Clear
          </button>
        </div>
      </section>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {bill && <BillView bill={bill} />}
    </main>
  );
}

function BillView({ bill }: { bill: ParsedBill }) {
  return (
    <section className="mt-8 rounded-2xl border border-black/10 p-5 dark:border-white/15">
      <h2 className="text-lg font-semibold">{bill.merchantName ?? "Itemized bill"}</h2>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="pb-2 font-medium">Item</th>
            <th className="pb-2 text-right font-medium">Qty</th>
            <th className="pb-2 text-right font-medium">Rate</th>
            <th className="pb-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, i) => (
            <tr key={i} className="border-t border-black/5 dark:border-white/10">
              <td className="py-2">{item.name}</td>
              <td className="py-2 text-right">
                {item.quantity} {item.unit ?? ""}
              </td>
              <td className="py-2 text-right">
                {item.unitPrice !== undefined ? rupees(item.unitPrice) : "—"}
              </td>
              <td className="py-2 text-right">{rupees(item.amount)}</td>
            </tr>
          ))}
          {bill.charges.map((c, i) => (
            <tr key={`c${i}`} className="border-t border-black/5 opacity-80 dark:border-white/10">
              <td className="py-2" colSpan={3}>
                {c.label}
              </td>
              <td className="py-2 text-right">{rupees(c.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black/20 text-base font-bold dark:border-white/30">
            <td className="pt-3" colSpan={3}>
              Total
            </td>
            <td className="pt-3 text-right">{rupees(bill.computedTotal)}</td>
          </tr>
        </tfoot>
      </table>

      {bill.totalMismatch && bill.statedTotal !== undefined && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠️ The bill says {rupees(bill.statedTotal)}, but the lines add up to{" "}
          {rupees(bill.computedTotal)}. Check before collecting payment.
        </p>
      )}

      {bill.notes.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm opacity-70">
          {bill.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
