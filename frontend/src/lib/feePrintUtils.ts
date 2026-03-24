// Fee Print Utilities
// Uses @page CSS for paper control, percentage-based layouts, no fixed dimensions on content.
// Browser print dialog handles paper size selection.

function openPrintWindow(html: string) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow popups to print.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.print();
  };
}

// ─── Shared styles ──────────────────────────────────────

const baseStyles = `
  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #222; line-height: 1.4; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; word-wrap: break-word; }
  th, td { text-align: left; padding: 4px 6px; font-size: 11px; }
  th { border-bottom: 1.5px solid #333; color: #555; font-weight: 600; }
  td { border-bottom: 1px solid #ddd; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .bold { font-weight: 700; }
  .muted { color: #777; }
  .small { font-size: 9px; }
`;

// ─── Shared invoice slip builder ────────────────────────
// Single source of truth for the invoice slip HTML used in all 3 print modes.

function buildInvoiceSlipHtml(inv: any): string {
  const items = inv.items || [];
  const school = inv.school || {};
  const student = inv.student || {};
  const phoneLine = school.phone ? ` • ${school.phone}` : "";

  // If no items (fully paid), show a "No dues" message
  const tableHtml =
    items.length > 0
      ? `<table>
          <colgroup><col style="width:70%"><col style="width:30%"></colgroup>
          <thead><tr><th>Description</th><th class="text-right">Amount</th></tr></thead>
          <tbody>${items.map((item: any) => `<tr><td>${item.category}</td><td class="text-right">Rs ${item.amount.toLocaleString()}</td></tr>`).join("")}</tbody>
        </table>`
      : `<div style="text-align:center;color:#15803d;font-weight:600;font-size:11px;padding:8px 0;">All dues cleared for this month.</div>`;

  const totalAmount = items.length > 0 ? inv.totalDue || items.reduce((s: number, i: any) => s + (i.amount || 0), 0) : 0;

  return `
    <div class="cell-header">
      <b>${school.nameNp || school.name || "School"}</b>
      <span>${school.address || ""}${phoneLine}</span>
    </div>
    <div class="cell-title">Fee Invoice — ${inv.month} ${inv.yearBS}</div>
    <div class="cell-info">
      <div>Student: <b>${student.name || "—"}</b></div>
      <div>Class: <b>${student.className || ""} — Section ${student.section || ""}</b></div>
      <div>Roll: <b>${student.rollNo || "—"}</b></div>
    </div>
    ${tableHtml}
    <div class="cell-spacer"></div>
    ${totalAmount > 0 ? `<div class="cell-total">Total Due: Rs ${totalAmount.toLocaleString()}</div>` : ""}
    <div class="cell-note">Please pay the above amount at the school office. Thank you.</div>
  `;
}

// Shared styles for invoice slips (used by individual, compact, and bulk individual)
const invoiceSlipStyles = `
  .cell-header { text-align: center; border-bottom: 1.5px solid #333; padding-bottom: 5px; margin-bottom: 6px; }
  .cell-header b { display: block; font-size: 13px; }
  .cell-header span { font-size: 9px; color: #777; }
  .cell-title { text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 4px 0 8px; }
  .cell-info { font-size: 10px; margin-bottom: 8px; line-height: 1.5; }
  .cell-info b { color: #222; }
  th { font-size: 10px; padding: 3px 5px; }
  td { padding: 3px 5px; font-size: 10px; }
  .cell-spacer { flex: 1; }
  .cell-total { text-align: right; font-weight: 700; font-size: 13px; border-top: 1.5px solid #333; padding-top: 5px; }
  .cell-note { font-size: 8px; color: #888; margin-top: 4px; }
`;

// ─── RECEIPT ────────────────────────────────────────────

export function printReceipt(receipt: any) {
  const school = receipt.school || {};
  const student = receipt.student || {};
  const phoneLine = school.phone ? ` • ${school.phone}` : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt ${receipt.receiptNumber}</title>
<style>
  ${baseStyles}
  @page { size: auto; margin: 10mm; }
  body { max-width: 100%; padding: 0; }
  .receipt { max-width: 400px; margin: 0 auto; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 12px; }
  .header h1 { font-size: 16px; margin-bottom: 2px; }
  .header h2 { font-size: 13px; font-weight: 400; color: #555; }
  .header p { font-size: 10px; color: #777; }
  .receipt-label { text-align: center; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin: 10px 0; }
  .receipt-no { text-align: center; font-size: 11px; color: #555; margin-bottom: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 11px; margin-bottom: 12px; }
  .info-grid .label { color: #777; }
  .total-row td { border-top: 2px solid #333; border-bottom: none; font-weight: 700; font-size: 12px; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig { text-align: center; font-size: 10px; }
  .sig-line { width: 100px; border-top: 1px solid #555; margin: 0 auto 3px; }
  .footer { text-align: center; margin-top: 16px; font-size: 9px; color: #999; }
</style></head><body>
<div class="receipt">
  <div class="header">
    <h1>${school.nameNp || school.name || "School"}</h1>
    <h2>${school.name || ""}</h2>
    <p>${school.address || ""}${phoneLine}</p>
  </div>
  <div class="receipt-label">Fee Receipt</div>
  <div class="receipt-no">${receipt.receiptNumber}</div>
  <div class="info-grid">
    <div><span class="label">Student:</span> <b>${student.name}</b></div>
    <div><span class="label">Class:</span> <b>${student.className} — ${student.section}</b></div>
    <div><span class="label">Roll:</span> <b>${student.rollNo || "—"}</b></div>
    <div><span class="label">Date:</span> <b>${receipt.paymentDate}</b></div>
    <div><span class="label">Method:</span> <b>${receipt.paymentMethod || "Cash"}</b></div>
  </div>
  <table>
    <colgroup><col style="width:60%"><col style="width:20%"><col style="width:20%"></colgroup>
    <thead><tr><th>Description</th><th>Month</th><th class="text-right">Amount</th></tr></thead>
    <tbody>${receipt.items.map((item: any) => `<tr><td>${item.category}</td><td class="muted">${item.paidMonth || "—"}</td><td class="text-right">Rs ${item.amount.toLocaleString()}</td></tr>`).join("")}</tbody>
    <tfoot><tr class="total-row"><td colspan="2" class="text-right">Total</td><td class="text-right">Rs ${receipt.totalAmount.toLocaleString()}</td></tr></tfoot>
  </table>
  <div class="signatures">
    <div class="sig"><div class="sig-line"></div>Received By</div>
    <div class="sig"><div class="sig-line"></div>Accountant</div>
    <div class="sig"><div class="sig-line"></div>Principal</div>
  </div>
  <div class="footer">Computer generated receipt</div>
</div>
</body></html>`;

  openPrintWindow(html);
}

// ─── INDIVIDUAL INVOICE ─────────────────────────────────

export function printInvoice(invoice: any) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice — ${invoice.student?.name || ""}</title>
<style>
  ${baseStyles}
  @page { size: auto; margin: 0; }
  body { margin: 0; width: 100vw; height: 100vh; overflow: hidden; }
  .cell {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    padding: 4mm;
  }
  .cell-inner {
    border: 1.5px solid #333;
    border-radius: 3px;
    padding: 8px 10px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  ${invoiceSlipStyles}
</style></head><body>
<div class="cell">
  <div class="cell-inner">
    ${buildInvoiceSlipHtml(invoice)}
  </div>
</div>
</body></html>`;

  openPrintWindow(html);
}

// ─── BULK INVOICES ──────────────────────────────────────

export function printBulkInvoices(invoices: any[], mode: "compact" | "individual" = "compact") {
  if (mode === "compact") {
    printBulkCompact(invoices);
  } else {
    printBulkIndividual(invoices);
  }
}

// 4 A6 invoices per A4 page with dashed cut lines
function printBulkCompact(invoices: any[]) {
  const slips = invoices.map(
    (inv) => `<div class="cell"><div class="cell-inner">${buildInvoiceSlipHtml(inv)}</div></div>`
  );

  // Group 4 per page (2×2 = 4 A6 on 1 A4)
  const pages: string[] = [];
  for (let i = 0; i < slips.length; i += 4) {
    const group = slips.slice(i, i + 4);
    while (group.length < 4) group.push('<div class="cell empty"><div class="cell-inner"></div></div>');
    pages.push(`<div class="page">${group.join("")}</div>`);
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Fee Invoices — A6 Slips</title>
<style>
  ${baseStyles}
  @page { size: A4 portrait; margin: 0; }
  body { margin: 0; }
  .page {
    width: 210mm;
    height: 297mm;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    page-break-after: always;
    position: relative;
  }
  .page:last-child { page-break-after: auto; }
  /* Dashed cut lines */
  .page::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    border-top: 1px dashed #aaa;
  }
  .page::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    border-left: 1px dashed #aaa;
  }
  .cell {
    width: 105mm;
    height: 148.5mm;
    overflow: hidden;
    padding: 4mm;
  }
  .cell.empty {}
  .cell-inner {
    border: 1.5px solid #333;
    border-radius: 3px;
    padding: 8px 10px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  ${invoiceSlipStyles}
</style></head><body>${pages.join("")}</body></html>`;

  openPrintWindow(html);
}

// One A6 invoice per page — same .cell + .cell-inner structure as compact
function printBulkIndividual(invoices: any[]) {
  const pages = invoices
    .map(
      (inv) => `<div class="page"><div class="cell"><div class="cell-inner">${buildInvoiceSlipHtml(inv)}</div></div></div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Fee Invoices</title>
<style>
  ${baseStyles}
  @page { size: auto; margin: 0; }
  body { margin: 0; }
  .page { page-break-after: always; padding: 0; width: 100vw; height: 100vh; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .cell {
    width: 100%;
    height: 100%;
    overflow: hidden;
    padding: 4mm;
  }
  .cell-inner {
    border: 1.5px solid #333;
    border-radius: 3px;
    padding: 8px 10px;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  ${invoiceSlipStyles}
</style></head><body>${pages}</body></html>`;

  openPrintWindow(html);
}