"use client";

import { useState } from "react";
import { withTotals, type Bill, type ParsedBill } from "@/lib/bill";
import { rupees } from "@/lib/format";
import { CollectPayment } from "./collect-payment";
import { Icon } from "./ui/icons";

type Item = Bill["items"][number];
type Charge = Bill["charges"][number];

const round2 = (n: number) => Math.round(n * 100) / 100;

// Keep quantity × rate and the line amount in step, whichever one was edited.
function reprice(item: Item, patch: Partial<Item>): Item {
  const next = { ...item, ...patch, check: undefined };
  if (next.unitPrice === undefined) return next;
  if ("quantity" in patch || "unitPrice" in patch) {
    return { ...next, amount: round2(next.quantity * next.unitPrice) };
  }
  if ("amount" in patch && next.quantity > 0) {
    return { ...next, unitPrice: round2(next.amount / next.quantity) };
  }
  return next;
}

export function BillEditor({ initial, fromSample }: { initial: ParsedBill; fromSample: boolean }) {
  const [draft, setDraft] = useState<Bill>(initial);
  const [locked, setLocked] = useState(false);
  const [createdAt] = useState(() => new Date());
  const bill = withTotals(draft);
  const flagged = draft.items.filter((i) => i.check).length;

  const setItem = (i: number, patch: Partial<Item>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? reprice(it, patch) : it)) }));
  const clearCheck = (i: number) =>
    setDraft((d) => ({ ...d, items: d.items.map((it, j) => (j === i ? { ...it, check: undefined } : it)) }));
  const removeItem = (i: number) =>
    setDraft((d) => ({ ...d, items: d.items.filter((_, j) => j !== i) }));
  const addItem = () =>
    setDraft((d) => ({ ...d, items: [...d.items, { name: "", quantity: 1, amount: 0 }] }));

  const setCharge = (i: number, patch: Partial<Charge>) =>
    setDraft((d) => ({ ...d, charges: d.charges.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const removeCharge = (i: number) =>
    setDraft((d) => ({ ...d, charges: d.charges.filter((_, j) => j !== i) }));
  const addCharge = () =>
    setDraft((d) => ({ ...d, charges: [...d.charges, { label: "", amount: 0 }] }));

  return (
    <div className="rise">
      <article className="receipt-edge bg-paper px-5 pt-6 shadow-[0_1px_0_var(--line),0_12px_32px_-12px_rgb(0_0_0/0.18)] sm:px-7">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <input
              value={draft.merchantName ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, merchantName: e.target.value }))}
              disabled={locked}
              placeholder="Shop name"
              aria-label="Shop name"
              className="field -ml-1.5 font-display text-2xl font-bold tracking-tight placeholder:text-muted/60"
            />
            <p className="mt-0.5 text-xs text-muted">
              {createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
              {draft.items.length} {draft.items.length === 1 ? "item" : "items"}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-ink">
            <Icon name="sparkles" className="size-3.5" />
            {fromSample ? "Saved AI answer" : "Read by Gemini"}
          </span>
        </header>

        {flagged > 0 && !locked && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <Icon name="alert" className="size-4 shrink-0" />
            {flagged === 1 ? "1 line needs" : `${flagged} lines need`} a quick check. Tap a value to fix it.
          </p>
        )}

        <div className="mt-5 hidden grid-cols-[minmax(0,1fr)_3.5rem_4rem_5rem_6rem_2rem] gap-x-1 border-b border-dashed border-line pb-2 text-xs font-medium tracking-wide text-muted uppercase sm:grid">
          <span className="px-1.5">Item</span>
          <span className="px-1.5 text-right">Qty</span>
          <span className="px-1.5">Unit</span>
          <span className="px-1.5 text-right">Rate</span>
          <span className="px-1.5 text-right">Amount</span>
        </div>

        <ul className="mt-2 sm:mt-1">
          {draft.items.map((item, i) => (
            <li
              key={i}
              className={`grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-x-1 rounded-lg py-1.5 sm:grid-cols-[minmax(0,1fr)_3.5rem_4rem_5rem_6rem_2rem] ${
                item.check ? "-mx-2 bg-warn-soft px-2" : ""
              }`}
            >
              <input
                value={item.name}
                onChange={(e) => setItem(i, { name: e.target.value })}
                disabled={locked}
                placeholder="Item name"
                aria-label="Item name"
                className="field col-start-1 row-start-1 font-medium sm:col-start-auto sm:row-start-auto"
              />
              <div className="col-span-full row-start-2 flex items-center gap-1 pl-1.5 text-xs text-muted sm:contents sm:text-sm sm:text-ink">
                <span className="sm:hidden">Qty</span>
                <NumberField
                  value={item.quantity}
                  onChange={(v) => setItem(i, { quantity: v ?? 0 })}
                  disabled={locked}
                  label="Quantity"
                  className="w-14 sm:w-auto"
                />
                <input
                  value={item.unit ?? ""}
                  onChange={(e) => setItem(i, { unit: e.target.value || undefined })}
                  disabled={locked}
                  placeholder="unit"
                  aria-label="Unit"
                  className="field w-14 placeholder:text-muted/50 sm:w-auto"
                />
                <span className="sm:hidden">×</span>
                <NumberField
                  value={item.unitPrice}
                  onChange={(v) => setItem(i, { unitPrice: v })}
                  disabled={locked}
                  optional
                  label="Rate"
                  className="w-16 sm:w-auto"
                />
              </div>
              <NumberField
                value={item.amount}
                onChange={(v) => setItem(i, { amount: v ?? 0 })}
                disabled={locked}
                label="Amount"
                className="col-start-2 row-start-1 font-mono font-semibold sm:col-start-auto sm:row-start-auto"
              />
              <RemoveButton onClick={() => removeItem(i)} hidden={locked} label={`Remove ${item.name || "item"}`} />
              {item.check && (
                <div className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1 px-1.5 pt-1 text-xs text-warn">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="alert" className="size-3.5" />
                    {item.check}
                  </span>
                  {!locked && (
                    <button onClick={() => clearCheck(i)} className="font-semibold underline-offset-2 hover:underline">
                      Looks right
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {draft.charges.length > 0 && (
          <ul className="mt-2 border-t border-dashed border-line pt-2">
            {draft.charges.map((charge, i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-x-1 py-1 text-sm">
                <input
                  value={charge.label}
                  onChange={(e) => setCharge(i, { label: e.target.value })}
                  disabled={locked}
                  placeholder="Charge or discount"
                  aria-label="Charge label"
                  className="field text-muted"
                />
                <NumberField
                  value={charge.amount}
                  onChange={(v) => setCharge(i, { amount: v ?? 0 })}
                  disabled={locked}
                  label="Charge amount"
                  allowNegative
                  className="font-mono"
                />
                <RemoveButton onClick={() => removeCharge(i)} hidden={locked} label={`Remove ${charge.label || "charge"}`} />
              </li>
            ))}
          </ul>
        )}

        {!locked && (
          <div className="mt-3 flex gap-2 text-sm">
            <AddButton onClick={addItem}>Item</AddButton>
            <AddButton onClick={addCharge}>Charge or discount</AddButton>
          </div>
        )}

        <div className="mt-5 flex items-end justify-between border-t-2 border-ink pt-4">
          <span className="text-sm font-semibold tracking-wide uppercase">Total</span>
          <span className="font-display text-4xl font-bold tracking-tight">{rupees(bill.computedTotal)}</span>
        </div>

        {bill.totalMismatch && bill.statedTotal !== undefined && (
          <p className="mt-3 flex gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
            <span>
              The bill says {rupees(bill.statedTotal)}, but the lines add up to {rupees(bill.computedTotal)}.
            </span>
          </p>
        )}

        {draft.notes.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted">
            {draft.notes.map((n, i) => (
              <li key={i} className="flex gap-1.5">
                <Icon name="sparkles" className="mt-px size-3.5 shrink-0" />
                {n}
              </li>
            ))}
          </ul>
        )}
      </article>

      <CollectPayment bill={bill} flagged={locked ? 0 : flagged} onCreated={() => setLocked(true)} />
    </div>
  );
}

// Lets people clear and retype a number without it snapping to 0 mid-edit.
function NumberField({
  value,
  onChange,
  disabled,
  optional,
  allowNegative,
  label,
  className = "",
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  disabled?: boolean;
  optional?: boolean;
  allowNegative?: boolean;
  label: string;
  className?: string;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value === undefined ? "" : String(value));
  }

  function commit(raw: string) {
    setText(raw);
    if (raw.trim() === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n) || (!allowNegative && n < 0)) return;
    setShown(n);
    onChange(n);
  }

  return (
    <label className={`flex items-center ${className}`}>
      <span className="sr-only">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step="any"
        value={text}
        onChange={(e) => commit(e.target.value)}
        onBlur={() => {
          if (text.trim() !== "") return;
          const fallback = optional ? undefined : 0;
          setShown(fallback);
          setText(fallback === undefined ? "" : "0");
          onChange(fallback);
        }}
        disabled={disabled}
        placeholder={optional ? "—" : "0"}
        className="field text-right"
      />
    </label>
  );
}

function RemoveButton({ onClick, hidden, label }: { onClick: () => void; hidden: boolean; label: string }) {
  if (hidden) return <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto" />;
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="col-start-3 row-start-1 grid size-7 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger sm:col-start-auto sm:row-start-auto"
    >
      <Icon name="x" className="size-3.5" />
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-brand-ink hover:bg-brand-soft"
    >
      <Icon name="plus" className="size-3.5" />
      {children}
    </button>
  );
}
