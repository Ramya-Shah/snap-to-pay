import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--ff-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Geist({
  variable: "--ff-body",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--ff-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Snap-to-Pay",
  description:
    "Snap a bill, type a WhatsApp order or speak it. AI itemizes it and the customer pays through Razorpay.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
