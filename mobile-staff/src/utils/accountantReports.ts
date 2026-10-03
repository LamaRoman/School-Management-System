// Pure helpers for the accountant's Reports screens (cash book, defaulters, payment history,
// monthly summary). No React / network, so they are unit-tested with plain `node --test`.

/** "Rs 1,23,456" — Nepali/Indian digit grouping (last three digits, then pairs). Rounds to whole rupees. */
export function formatRs(amount: number | null | undefined): string {
  const n = Math.round(Number.isFinite(amount as number) ? (amount as number) : 0);
  const sign = n < 0 ? '-' : '';
  const digits = String(Math.abs(n));
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${sign}Rs ${grouped}`;
}

/** Whole-number percentage of `part` in `whole`; 0 when there is nothing expected. Never above 100 in a bar. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
export const barWidth = (part: number, whole: number): number => Math.min(100, Math.max(0, percent(part, whole)));

export interface Defaulter {
  studentId: string; studentName: string; className: string; section: string; rollNo: number | null;
  guardianPhone: string; expectedUpTo: number; totalPaid: number; balance: number; monthsPending: number;
}

/** Biggest balance first, then class/roll, so the people owing the most are at the top. */
export function sortDefaulters<T extends Defaulter>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    b.balance - a.balance || a.className.localeCompare(b.className) || (a.rollNo ?? 0) - (b.rollNo ?? 0));
}

export function filterDefaulters<T extends Defaulter>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(d => d.studentName.toLowerCase().includes(q) || (d.rollNo != null && String(d.rollNo) === q));
}

/** A number we can dial, or null ("—" is what the server sends when there is none). */
export function dialable(phone?: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '');
  return cleaned.replace(/\D/g, '').length >= 7 ? cleaned : null;
}

export interface PaymentLine {
  id: string; receiptNumber: string; studentName: string; className: string; section: string;
  rollNo: number | null; category: string; amount: number; paidMonth: string | null;
  paymentDate: string | null; paymentMethod: string;
}
export interface ReceiptGroup {
  key: string; receiptNumber: string; studentName: string; className: string; section: string;
  paymentDate: string | null; paymentMethod: string; total: number;
  items: { category: string; amount: number; paidMonth: string | null }[];
}

/**
 * One row per receipt: a receipt is paid in several lines (one per fee category). Lines with no
 * receipt number ("—") are NOT merged with each other — each stays its own row.
 */
export function groupByReceipt(lines: PaymentLine[]): ReceiptGroup[] {
  const out: ReceiptGroup[] = [];
  const byKey = new Map<string, ReceiptGroup>();
  for (const l of lines) {
    const hasNumber = !!l.receiptNumber && l.receiptNumber !== '—';
    const key = hasNumber ? `${l.receiptNumber}|${l.studentName}` : `line|${l.id}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key, receiptNumber: l.receiptNumber, studentName: l.studentName, className: l.className, section: l.section,
        paymentDate: l.paymentDate, paymentMethod: l.paymentMethod, total: 0, items: [],
      };
      byKey.set(key, g);
      out.push(g);
    }
    g.items.push({ category: l.category, amount: l.amount, paidMonth: l.paidMonth });
    g.total += l.amount;
  }
  return out;
}

/** Appending the next page without showing a line twice (pages can overlap when a payment arrives meanwhile). */
export function appendPage<T extends { id: string }>(existing: T[], next: T[]): T[] {
  const seen = new Set(existing.map(x => x.id));
  return [...existing, ...next.filter(x => !seen.has(x.id))];
}
