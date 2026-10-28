import type { ParsedBill } from "./bill";

export type Sample = {
  id: string;
  kind: "photo" | "text" | "voice";
  label: string;
  hint: string;
  image?: string;
  text?: string;
  bill: ParsedBill;
};

// Real Gemini answers for these inputs, saved so the demo is instant and costs no AI quota.
// Re-record them with the same inputs if the prompt changes.
export const SAMPLES: Sample[] = [
  {
    id: "photo",
    kind: "photo",
    label: "Handwritten kirana bill",
    hint: "Photo · 8 lines",
    image: "/samples/kirana-bill.png",
    bill: {
      merchantName: "Sharma Kirana Store",
      items: [
        {
          name: "Wheat flour (Atta)",
          quantity: 5,
          unit: "kg",
          amount: 245,
        },
        {
          name: "Split pigeon pea (Toor dal)",
          quantity: 1,
          unit: "kg",
          amount: 160,
        },
        {
          name: "Milk (Doodh)",
          quantity: 2,
          unit: "L",
          unitPrice: 34,
          amount: 68,
        },
        {
          name: "Maggi",
          quantity: 4,
          unit: "pc",
          amount: 56,
        },
        {
          name: "Sugar",
          quantity: 1,
          unit: "kg",
          amount: 48,
        },
        {
          name: "Onions (Pyaz)",
          quantity: 2,
          unit: "kg",
          amount: 70,
        },
        {
          name: "Coriander (Dhaniya)",
          quantity: 1,
          unit: "pc",
          amount: 10,
        },
      ],
      charges: [
        {
          label: "Home delivery",
          amount: 30,
        },
      ],
      statedTotal: 687,
      notes: [],
      computedTotal: 687,
      totalMismatch: false,
    },
  },
  {
    id: "whatsapp",
    kind: "text",
    label: "WhatsApp order",
    hint: "Hinglish · one item has no price",
    text: "Bhaiya 2 kg aloo 60, 1 dozen ande 84, Amul butter 500g 285, 2 packet bread 90, aur thoda dhaniya bhi. Delivery free",
    bill: {
      items: [
        {
          name: "Potatoes (aloo)",
          quantity: 2,
          unit: "kg",
          unitPrice: 30,
          amount: 60,
        },
        {
          name: "Eggs",
          quantity: 1,
          unit: "dozen",
          unitPrice: 84,
          amount: 84,
        },
        {
          name: "Amul butter (500 g)",
          quantity: 1,
          unit: "pack",
          unitPrice: 285,
          amount: 285,
        },
        {
          name: "Bread",
          quantity: 2,
          unit: "packet",
          unitPrice: 45,
          amount: 90,
        },
        {
          name: "Coriander (dhaniya)",
          quantity: 1,
          unit: "pc",
          unitPrice: 0,
          amount: 0,
          check: "No price given",
        },
      ],
      charges: [
        {
          label: "Delivery",
          amount: 0,
        },
      ],
      notes: ["Coriander price not specified in order"],
      computedTotal: 519,
      totalMismatch: false,
    },
  },
  {
    id: "voice",
    kind: "voice",
    label: "Spoken restaurant order",
    hint: "Voice · adds 5% GST",
    text: "one plate paneer tikka two twenty, two butter naan forty each, one dal makhani two forty, add five percent GST",
    bill: {
      items: [
        {
          name: "Cottage cheese tikka (paneer tikka)",
          quantity: 1,
          unit: "plate",
          unitPrice: 220,
          amount: 220,
        },
        {
          name: "Butter naan",
          quantity: 2,
          unit: "pc",
          unitPrice: 40,
          amount: 80,
        },
        {
          name: "Black lentil curry (dal makhani)",
          quantity: 1,
          unit: "plate",
          unitPrice: 240,
          amount: 240,
        },
      ],
      charges: [
        {
          label: "GST",
          amount: 27,
        },
      ],
      statedTotal: 567,
      notes: ["GST calculated as 5 percent of subtotal 540 rupees"],
      computedTotal: 567,
      totalMismatch: false,
    },
  },
];
