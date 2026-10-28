import { z } from "zod";

// What Gemini must return for a bill. Amounts are in rupees.
export const billSchema = z.object({
  merchantName: z
    .string()
    .optional()
    .describe("Shop or seller name if written on the bill"),
  items: z
    .array(
      z.object({
        name: z.string().describe("Item name in English, e.g. 'Tomatoes'"),
        quantity: z.number().describe("Numeric quantity, e.g. 2 or 0.5"),
        unit: z
          .string()
          .optional()
          .describe("Unit such as kg, g, L, pc, dozen, packet"),
        unitPrice: z
          .number()
          .optional()
          .describe("Price per unit in rupees, if known"),
        amount: z.number().describe("Line total in rupees"),
        check: z
          .string()
          .optional()
          .describe(
            "Only for a line the shopkeeper should double-check (hard to read, guessed, or no price): a short reason. Leave out for clear lines.",
          ),
      }),
    )
    .describe("One entry per product line"),
  charges: z
    .array(
      z.object({
        label: z.string().describe("e.g. Delivery, GST, Packing, Discount"),
        amount: z
          .number()
          .describe("Rupees; negative for discounts"),
      }),
    )
    .describe("Extra charges or discounts that are not products"),
  statedTotal: z
    .number()
    .optional()
    .describe("The grand total written on the bill, if any"),
  transcript: z
    .string()
    .optional()
    .describe("Only for a voice recording: what was said. Leave out otherwise."),
  notes: z
    .array(z.string())
    .describe(
      "Short notes about anything unreadable, guessed, or ambiguous. Empty if none.",
    ),
});

export type Bill = z.infer<typeof billSchema>;

export type ParsedBill = Bill & {
  computedTotal: number;
  totalMismatch: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// The model reads the bill; the arithmetic is done here, not trusted from the model.
export function withTotals(bill: Bill): ParsedBill {
  const computedTotal = round2(
    bill.items.reduce((sum, i) => sum + i.amount, 0) +
      bill.charges.reduce((sum, c) => sum + c.amount, 0),
  );
  const totalMismatch =
    bill.statedTotal !== undefined &&
    Math.abs(bill.statedTotal - computedTotal) >= 1;
  // The model sometimes sends "" instead of leaving the optional name out.
  const merchantName = bill.merchantName?.trim() || undefined;
  return { ...bill, merchantName, computedTotal, totalMismatch };
}
