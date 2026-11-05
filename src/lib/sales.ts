import "server-only";
import { indiaDay, indiaTime, methodLabel, rupees, splitLine } from "./format";
import type { OrderView } from "./razorpay";

// Tools the sales assistant can call. They read Razorpay and do all the arithmetic here,
// so the model only ever repeats numbers it was given.

export const PERIODS = ["today", "yesterday", "last_7_days", "this_month", "all"] as const;
export type Period = (typeof PERIODS)[number];

const DAY = 24 * 60 * 60;

function inPeriod(unixSec: number, period: Period, nowSec: number) {
  const day = indiaDay(unixSec);
  switch (period) {
    case "today":
      return day === indiaDay(nowSec);
    case "yesterday":
      return day === indiaDay(nowSec - DAY);
    case "last_7_days":
      return unixSec >= nowSec - 7 * DAY;
    case "this_month":
      return day.slice(0, 7) === indiaDay(nowSec).slice(0, 7);
    case "all":
      return true;
  }
}

// Paid bills count by when they were paid; waiting bills by when they were created.
const when = (o: OrderView) => (o.status === "paid" && o.paidAt ? o.paidAt : o.createdAt);

const sum = (orders: OrderView[]) => Math.round(orders.reduce((s, o) => s + o.amount, 0) * 100) / 100;

function brief(o: OrderView, origin: string) {
  return {
    order_id: o.orderId,
    shop: o.merchant,
    amount: rupees(o.amount),
    status: o.status === "paid" ? "paid" : "waiting",
    time_ist: indiaTime(when(o)),
    method: o.status === "paid" ? methodLabel(o.method) || "online" : undefined,
    // Short item names keep the answer (and the model's reading time) brief.
    items: o.lines.map((l) => splitLine(l).label.split(" × ")[0]).join(", "),
    link: o.status === "paid" ? `${origin}/receipt/${o.orderId}` : `${origin}/pay/${o.orderId}`,
  };
}

// Item lines are stored as "Tomatoes × 2 kg — ₹80"; charges ("Delivery — ₹40") have no quantity.
function itemName(line: string) {
  const { label } = splitLine(line);
  const cut = label.lastIndexOf(" × ");
  return cut === -1 ? undefined : label.slice(0, cut).trim();
}

export type ReminderAction = { orderId: string; amount: string; shop: string; whatsappUrl: string };

export type ToolResult = { result: Record<string, unknown>; reminders?: ReminderAction[] };

export const TOOL_DECLARATIONS = [
  {
    name: "get_sales_summary",
    description:
      "Totals for a period: money collected, number of paid bills, money and bills still waiting, average paid bill, and collections by payment method. Use for any 'how much' question.",
    parametersJsonSchema: {
      type: "object",
      properties: { period: { type: "string", enum: PERIODS, description: 'Use "all" unless the shopkeeper names a period.' } },
      required: ["period"],
    },
  },
  {
    name: "list_bills",
    description:
      "Bills in a period, newest first, with shop name, amount, status (paid or waiting), time in IST, payment method and items. Use to answer who or which bills are unpaid, the biggest bill, or what a bill contained.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: PERIODS },
        status: { type: "string", enum: ["paid", "waiting", "all"] },
        sort: { type: "string", enum: ["newest", "largest"] },
        limit: { type: "integer", minimum: 1, maximum: 20 },
      },
      required: ["period", "status"],
    },
  },
  {
    name: "top_items",
    description:
      "Items ranked by money earned from paid bills in a period, with how many paid bills included each item. Use for 'what sells most' questions.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: PERIODS },
        limit: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["period"],
    },
  },
  {
    name: "prepare_reminders",
    description:
      "Prepares WhatsApp payment-reminder buttons for unpaid bills; the shopkeeper taps each to send it, nothing is sent automatically. Picks the unpaid bills itself: the largest or the newest, up to count. Pass order_ids only to remind specific bills.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        count: { type: "integer", minimum: 1, maximum: 5, description: "How many bills to remind; defaults to 1. Pass more only when asked for several." },
        pick: { type: "string", enum: ["largest", "newest"] },
        order_ids: { type: "array", items: { type: "string" }, maxItems: 5 },
      },
    },
  },
];

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { orders: () => Promise<OrderView[]>; origin: string },
): Promise<ToolResult> {
  const nowSec = Date.now() / 1000;
  const orders = await ctx.orders();
  const period = (PERIODS as readonly string[]).includes(String(args.period)) ? (args.period as Period) : "all";
  const scoped = orders.filter((o) => inPeriod(when(o), period, nowSec));
  const paid = scoped.filter((o) => o.status === "paid");
  const waiting = scoped.filter((o) => o.status !== "paid");
  // The history is read from Razorpay's latest 100 orders; say so when that may cut off older data.
  const coverage =
    orders.length >= 100
      ? `Only the latest ${orders.length} bills are available, back to ${indiaTime(orders[orders.length - 1].createdAt)}.`
      : `All ${orders.length} bills are included.`;

  switch (name) {
    case "get_sales_summary": {
      const byMethod: Record<string, string> = {};
      for (const m of new Set(paid.map((o) => methodLabel(o.method) || "Online"))) {
        byMethod[m] = rupees(sum(paid.filter((o) => (methodLabel(o.method) || "Online") === m)));
      }
      const lastPaid = orders.filter((o) => o.status === "paid" && o.paidAt).sort((a, b) => b.paidAt! - a.paidAt!)[0];
      return {
        result: {
          period,
          collected: rupees(sum(paid)),
          paid_bills: paid.length,
          average_paid_bill: paid.length ? rupees(Math.round((sum(paid) / paid.length) * 100) / 100) : null,
          waiting_amount: rupees(sum(waiting)),
          waiting_bills: waiting.length,
          collected_by_method: byMethod,
          last_payment_ever: lastPaid ? { amount: rupees(lastPaid.amount), time_ist: indiaTime(lastPaid.paidAt!) } : null,
          coverage,
        },
      };
    }
    case "list_bills": {
      const status = args.status === "paid" ? paid : args.status === "waiting" ? waiting : scoped;
      const sorted = args.sort === "largest" ? [...status].sort((a, b) => b.amount - a.amount) : status;
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 20);
      return {
        result: {
          period,
          matching_bills: status.length,
          matching_total: rupees(sum(status)),
          shown: Math.min(limit, status.length),
          bills: sorted.slice(0, limit).map((o) => brief(o, ctx.origin)),
          coverage,
        },
      };
    }
    case "top_items": {
      const items = new Map<string, { name: string; earned: number; bills: number }>();
      for (const o of paid) {
        for (const line of o.lines) {
          const { amount } = splitLine(line);
          const name = itemName(line);
          if (!amount || !name) continue;
          const value = Number(amount.replace(/[^\d.]/g, ""));
          const key = name.toLowerCase();
          const entry = items.get(key) ?? { name, earned: 0, bills: 0 };
          entry.earned += value;
          entry.bills += 1;
          items.set(key, entry);
        }
      }
      const limit = Math.min(Math.max(Number(args.limit) || 5, 1), 10);
      const ranked = [...items.values()].sort((a, b) => b.earned - a.earned).slice(0, limit);
      return {
        result: {
          period,
          paid_bills_counted: paid.length,
          items: ranked.map((i) => ({ item: i.name, earned: rupees(i.earned), paid_bills: i.bills })),
          note: "Products only; delivery, GST and other charges are left out.",
          coverage,
        },
      };
    }
    case "prepare_reminders": {
      const ids = Array.isArray(args.order_ids) ? args.order_ids.map(String) : [];
      const unpaid = orders.filter((o) => o.status !== "paid");
      const ordered = args.pick === "largest" ? [...unpaid].sort((a, b) => b.amount - a.amount) : unpaid;
      const count = Math.min(Math.max(Number(args.count) || 1, 1), 5);
      const chosen = (ids.length ? unpaid.filter((o) => ids.includes(o.orderId)) : ordered).slice(0, count);
      const reminders = chosen.map((o) => {
        const text = `Hi! A gentle reminder from ${o.merchant}: ${rupees(o.amount)} is pending. Pay securely here: ${ctx.origin}/pay/${o.orderId}`;
        return {
          orderId: o.orderId,
          amount: rupees(o.amount),
          shop: o.merchant,
          whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
        };
      });
      return {
        result: {
          prepared: reminders.length,
          bills: reminders.map((r) => ({ order_id: r.orderId, shop: r.shop, amount: r.amount })),
          note: "Buttons are shown under your answer; the shopkeeper taps each one to send it on WhatsApp.",
        },
        reminders,
      };
    }
    default:
      return { result: { error: `Unknown tool ${name}` } };
  }
}
