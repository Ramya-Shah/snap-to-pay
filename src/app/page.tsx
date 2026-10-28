"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ParsedBill } from "@/lib/bill";
import { SAMPLES, type Sample } from "@/lib/samples";
import { BillEditor } from "./bill-editor";
import { Logo, TestModeBadge } from "./ui/brand";
import { HowItWorks } from "./ui/how-it-works";
import { Icon, type IconName } from "./ui/icons";

type Mode = Sample["kind"];

const MODES: { id: Mode; label: string; icon: IconName }[] = [
  { id: "photo", label: "Photo", icon: "camera" },
  { id: "text", label: "Type", icon: "message" },
  { id: "voice", label: "Speak", icon: "mic" },
];

const MAX_RECORDING_SEC = 60;

const READING_STEPS = ["Reading the bill…", "Translating item names…", "Checking the maths…", "Almost there…"];

const REPO_URL = "https://github.com/Ramya-Shah/snap-to-pay";

export default function Home() {
  const [mode, setMode] = useState<Mode>("photo");
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [readingStep, setReadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [bill, setBill] = useState<ParsedBill | null>(null);
  // Bumped for every new bill so the editor and its payment box start fresh.
  const [billRun, setBillRun] = useState(0);
  const [fromSample, setFromSample] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultPanel = useRef<HTMLElement>(null);

  // Free the preview's blob URL when it is replaced or the page unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  useEffect(() => {
    if (!recording) return;
    // Measured from the start, so throttled timers in background tabs can't drift it.
    const startedAt = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (recording && seconds >= MAX_RECORDING_SEC) recorder.current?.stop();
  }, [recording, seconds]);

  // Free-tier Gemini can take a while; show what it is doing.
  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(
      () => setReadingStep((s) => Math.min(s + 1, READING_STEPS.length - 1)),
      2500,
    );
    return () => clearInterval(timer);
  }, [loading]);

  function pickImage(file: File | null) {
    setImage(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) pickImage(file);
  }

  function pickAudio(blob: Blob | null) {
    setAudio(blob);
    setAudioUrl(blob ? URL.createObjectURL(blob) : null);
  }

  // Record with the microphone; Gemini listens to the recording itself, which copes with
  // Indian English, Hinglish, units and prices far better than the browser's speech engine.
  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser. Type the order instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Allow microphone access to record the order, or type it instead.");
      return;
    }
    setError(null);
    setHeard(null);
    const r = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunks, { type: r.mimeType });
      if (blob.size === 0) return;
      pickAudio(blob);
      itemize(blob);
    };
    recorder.current = r;
    r.start();
    setSeconds(0);
    setRecording(true);
  }

  function showBill(next: ParsedBill, sample: boolean) {
    setBill(next);
    setFromSample(sample);
    setBillRun((n) => n + 1);
  }

  // On phones the bill sits below the inputs, so bring it into view.
  function revealResult() {
    if (window.matchMedia("(min-width: 1024px)").matches) return;
    requestAnimationFrame(() => resultPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // Show the saved answer at once, and load the sample's input so "Itemize" can read it live.
  async function trySample(sample: Sample) {
    reset();
    setMode(sample.kind);
    setText(sample.text ?? "");
    setHeard(sample.bill.transcript ?? null);
    showBill(sample.bill, true);
    revealResult();
    if (sample.image) {
      const blob = await (await fetch(sample.image)).blob();
      pickImage(new File([blob], sample.image.split("/").pop()!, { type: blob.type }));
    }
    if (sample.audio) pickAudio(await (await fetch(sample.audio)).blob());
  }

  // `recorded` is passed straight from the recorder, before the audio state has updated.
  async function itemize(recorded?: Blob) {
    const voice = recorded ?? audio;
    setLoading(true);
    setReadingStep(0);
    setError(null);
    setBill(null);
    revealResult();
    const form = new FormData();
    if (mode === "photo" && image) form.append("image", image);
    if (mode === "voice" && voice) form.append("audio", voice, `order.${voice.type.includes("mp4") ? "m4a" : "webm"}`);
    if (mode === "text" && text.trim()) form.append("text", text.trim());
    try {
      const res = await fetch("/api/parse-bill", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      showBill(data.bill, false);
      if (mode === "voice") setHeard(data.bill.transcript ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    recorder.current?.stop();
    setText("");
    pickImage(null);
    pickAudio(null);
    setHeard(null);
    setBill(null);
    setFromSample(false);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  const canSubmit =
    !loading &&
    !recording &&
    (mode === "photo" ? image !== null : mode === "voice" ? audio !== null : text.trim().length > 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <nav className="flex items-center justify-between gap-3 py-5">
        <Logo />
        <TestModeBadge />
      </nav>

      <header className="max-w-3xl pt-8 pb-10 sm:pt-12">
        <p className="text-sm font-semibold tracking-wide text-brand uppercase">AI bill reader × Razorpay</p>
        <h1 className="mt-3 font-display text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl">
          Snap a bill.
          <br />
          <span className="text-brand">Get paid.</span>
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          A handwritten bill, a WhatsApp order or a voice note becomes an itemized bill in seconds, then
          a QR code your customer pays through Razorpay.
        </p>
      </header>

      <main className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-6">
          <StepLabel n={1}>Add the bill</StepLabel>

          <div role="tablist" aria-label="Input type" className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                  mode === m.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                <Icon name={m.icon} />
                {m.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {mode === "photo" && (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`group relative flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
                  dragging ? "border-brand bg-brand-soft" : "border-line hover:border-brand/60 hover:bg-surface-2"
                }`}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
                  className="sr-only"
                />
                {preview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                    <img src={preview} alt="Bill preview" className="max-h-72 w-full object-contain p-3" />
                    <span className="absolute right-3 bottom-3 rounded-lg bg-ink/80 px-2.5 py-1 text-xs font-medium text-bg">
                      Change photo
                    </span>
                  </>
                ) : (
                  <div className="px-6 text-center">
                    <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
                      <Icon name="upload" className="size-5" />
                    </span>
                    <p className="mt-3 font-medium">Drop a bill photo, or tap to take one</p>
                    <p className="mt-1 text-xs text-muted">JPG, PNG, WebP or HEIC · up to 8 MB</p>
                  </div>
                )}
              </label>
            )}

            {mode === "voice" && (
              <div className="flex flex-col items-center rounded-2xl bg-surface-2 px-4 py-6 text-center">
                <button
                  onClick={toggleRecording}
                  disabled={loading}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                  className={`relative grid size-20 place-items-center rounded-full transition disabled:opacity-40 ${
                    recording ? "bg-danger text-white" : "bg-brand text-on-brand hover:bg-brand-strong"
                  }`}
                >
                  {recording && <span className="absolute inset-0 animate-ping rounded-full bg-danger/40" />}
                  <Icon name={recording ? "stop" : "mic"} className="relative size-8" />
                </button>
                <p className="mt-3 text-sm font-medium">
                  {recording
                    ? `Recording ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} · tap to stop`
                    : audio
                      ? "Tap to record again"
                      : "Tap and say the order"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  English, Hindi or both · up to {MAX_RECORDING_SEC} seconds · e.g. “do kilo tamatar assi, ek paneer ek sau bees”
                </p>
                {audioUrl && !recording && (
                  // Lets people hear what was sent to the AI.
                  <audio controls src={audioUrl} className="mt-4 h-10 w-full max-w-xs" />
                )}
              </div>
            )}

            {mode === "voice" && heard && (
              <p className="mt-3 rounded-2xl border border-line p-4 text-sm">
                <span className="block text-xs font-semibold tracking-wide text-muted uppercase">Gemini heard</span>
                <span className="mt-1 block">“{heard}”</span>
              </p>
            )}

            {mode === "text" && (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder={"Paste a WhatsApp order, e.g.\n2 kg tomatoes 80, 1 paneer 120, delivery 40"}
                className="w-full resize-none rounded-2xl border border-line bg-surface p-4 text-sm outline-none placeholder:text-muted/70 focus:border-brand"
              />
            )}
          </div>

          {error && (
            <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            onClick={() => itemize()}
            disabled={!canSubmit}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3.5 font-semibold text-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Icon name="sparkles" />
            {loading ? READING_STEPS[readingStep] : "Itemize with AI"}
          </button>

          <div className="mt-7">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Or try a sample · instant</p>
            <ul className="mt-3 grid gap-2">
              {SAMPLES.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => trySample(s)}
                    disabled={loading}
                    className="group flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left transition hover:border-brand/50 hover:bg-surface-2 disabled:opacity-40"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted group-hover:bg-brand-soft group-hover:text-brand">
                      <Icon name={MODES.find((m) => m.id === s.kind)!.icon} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{s.label}</span>
                      <span className="block truncate text-xs text-muted">{s.hint}</span>
                    </span>
                    <Icon name="arrow" className="size-4 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section ref={resultPanel} className="scroll-mt-4 lg:sticky lg:top-6" aria-live="polite">
          <div className="flex items-center justify-between">
            <StepLabel n={2}>Check it, then collect</StepLabel>
            {bill && (
              <button onClick={reset} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
                <Icon name="refresh" className="size-3.5" />
                New bill
              </button>
            )}
          </div>
          <div className="mt-4">
            {loading ? (
              <ReadingReceipt step={READING_STEPS[readingStep]} />
            ) : bill ? (
              <BillEditor key={billRun} initial={bill} fromSample={fromSample} />
            ) : (
              <EmptyReceipt />
            )}
          </div>
        </section>
      </main>

      <HowItWorks />

      <footer className="mt-16 flex flex-col gap-2 border-t border-line py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Snap-to-Pay · a demo in Razorpay test mode. No real money moves.</p>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
          Source on GitHub
          <Icon name="external" className="size-3.5" />
        </a>
      </footer>
    </div>
  );
}

function StepLabel({ n, children }: { n: number; children: string }) {
  return (
    <h2 className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
      <span className="grid size-7 place-items-center rounded-full bg-ink font-sans text-xs font-bold text-bg">{n}</span>
      {children}
    </h2>
  );
}

function EmptyReceipt() {
  return (
    <div className="receipt-edge bg-paper px-6 pt-8 opacity-90 shadow-[0_1px_0_var(--line)]">
      <div className="space-y-3" aria-hidden="true">
        <div className="h-6 w-2/5 rounded bg-surface-2" />
        <div className="h-3 w-1/4 rounded bg-surface-2" />
        {[70, 55, 62, 48].map((w) => (
          <div key={w} className="flex justify-between gap-6 pt-2">
            <div className="h-3 rounded bg-surface-2" style={{ width: `${w}%` }} />
            <div className="h-3 w-14 rounded bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-col items-center pb-2 text-center">
        <span className="grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand">
          <Icon name="receipt" className="size-5" />
        </span>
        <p className="mt-3 font-medium">Your itemized bill appears here</p>
        <p className="mt-1 text-sm text-muted">Add a bill on the left, or try a sample. Samples are instant.</p>
      </div>
    </div>
  );
}

function ReadingReceipt({ step }: { step: string }) {
  return (
    <div className="receipt-edge bg-paper px-6 pt-8 shadow-[0_1px_0_var(--line)]">
      <p className="flex items-center gap-2 text-sm font-medium text-brand">
        <Icon name="sparkles" className="size-4 animate-pulse" />
        {step}
      </p>
      <div className="mt-6 space-y-4" aria-hidden="true">
        <div className="skeleton h-7 w-1/2 rounded" />
        {[75, 60, 68, 52, 64].map((w) => (
          <div key={w} className="flex justify-between gap-6">
            <div className="skeleton h-3.5 rounded" style={{ width: `${w}%` }} />
            <div className="skeleton h-3.5 w-16 rounded" />
          </div>
        ))}
        <div className="skeleton mt-6 h-9 w-full rounded" />
      </div>
      <p className="mt-6 text-xs text-muted">Free-tier AI can take up to ~20 seconds.</p>
    </div>
  );
}
