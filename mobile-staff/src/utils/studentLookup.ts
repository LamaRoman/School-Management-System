// Pure helpers for the accountant's Students lookup.

/** The global search only fires for two or more characters (one letter matches half the school). */
export const SEARCH_MIN_CHARS = 2;
export const searchReady = (q: string): boolean => q.trim().length >= SEARCH_MIN_CHARS;

export interface InvoiceTotals { totalArrears: number; totalCurrent: number; totalOther: number; grandTotal: number }

export interface DuesSummary { clear: boolean; headline: string; lines: { label: string; amount: number }[] }

/**
 * What to tell the accountant about a student's fees for one month: nothing owing, or the
 * breakdown (earlier months' arrears, this month, other charges) and the total.
 */
export function summariseDues(inv: InvoiceTotals, month: string): DuesSummary {
  const lines = [
    { label: 'Earlier months (arrears)', amount: inv.totalArrears },
    { label: `${month} fees`, amount: inv.totalCurrent },
    { label: 'Other charges', amount: inv.totalOther },
  ].filter(l => l.amount > 0);
  if (inv.grandTotal <= 0) return { clear: true, headline: `No dues up to ${month}`, lines: [] };
  return { clear: false, headline: `Due up to ${month}`, lines };
}

/** Status label for a student record ("ACTIVE" -> "Active"). */
export function statusLabel(status?: string | null): string {
  if (!status) return '—';
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}
