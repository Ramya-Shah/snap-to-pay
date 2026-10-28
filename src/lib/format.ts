export const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Shops are in India and servers run in UTC, so dates are always shown in IST.
export const indiaTime = (unixSec: number, style: "full" | "date" | "time" = "full") =>
  new Date(unixSec * 1000).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...(style !== "time" && { day: "numeric", month: "short", year: "numeric" }),
    ...(style !== "date" && { hour: "numeric", minute: "2-digit" }),
  });

export const indiaDay = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// Bill lines are stored as "Tomatoes × 2 kg — ₹80"; split off the amount for display.
export function splitLine(line: string) {
  const cut = line.lastIndexOf(" — ");
  return cut === -1 ? { label: line } : { label: line.slice(0, cut), amount: line.slice(cut + 3) };
}

export const methodLabel = (method?: string) =>
  method ? ({ upi: "UPI", card: "Card", netbanking: "Netbanking", wallet: "Wallet" }[method] ?? method) : "";
