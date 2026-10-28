"use client";

import { Icon } from "../../ui/icons";

export function InvoiceActions({ invoiceNo, shareText }: { invoiceNo: string; shareText: string }) {
  // The browser's "Save as PDF" names the file after the page title.
  function download() {
    const title = document.title;
    document.title = `Invoice ${invoiceNo}`;
    window.print();
    document.title = title;
  }

  function share() {
    const text = `${shareText} ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noreferrer");
  }

  return (
    <div className="grid grid-cols-2 gap-2 print:hidden">
      <button
        onClick={download}
        className="flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg hover:opacity-90"
      >
        <Icon name="download" />
        Download PDF
      </button>
      <button
        onClick={share}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-[#06301a] hover:brightness-95"
      >
        <Icon name="message" />
        Share on WhatsApp
      </button>
    </div>
  );
}
