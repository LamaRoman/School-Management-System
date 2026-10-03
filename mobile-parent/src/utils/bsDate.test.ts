import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNextDayBS, getPreviousDayBS, parseBSDate, getTodayBS } from './bsDate.ts';

test('next/previous day are inverses on real dates, including every month boundary (2080-2083)', () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  let boundaries = 0;
  for (let y = 2080; y <= 2083; y++) for (let m = 1; m <= 12; m++) {
    const first = `${y}/${pad(m)}/01`;
    // The previous day of a month's first day is the previous month's last day, and
    // stepping forward from it lands exactly back on the first.
    const lastOfPrev = getPreviousDayBS(first);
    assert.equal(getNextDayBS(lastOfPrev), first, `next(prev(${first}))`);
    assert.notEqual(parseBSDate(lastOfPrev)!.month, m, `${first} -> ${lastOfPrev} should leave the month`);
    // Mid-month days round-trip too.
    for (const d of [2, 15, 28]) {
      const date = `${y}/${pad(m)}/${pad(d)}`;
      assert.equal(getPreviousDayBS(getNextDayBS(date)), date);
      assert.equal(getNextDayBS(getPreviousDayBS(date)), date);
    }
    boundaries++;
  }
  assert.equal(boundaries, 48);
});

test('stepping forward never skips or repeats a day (one year of consecutive days)', () => {
  let d = '2082/01/01';
  const seen = new Set<string>();
  for (let i = 0; i < 366; i++) {
    assert.ok(!seen.has(d), `repeated ${d}`);
    seen.add(d);
    const n = getNextDayBS(d);
    const pn = parseBSDate(n)!, pd = parseBSDate(d)!;
    // either the next day in the same month, or day 1 of the next month/year
    const sameMonth = pn.year === pd.year && pn.month === pd.month && pn.day === pd.day + 1;
    const rollover = pn.day === 1 && ((pn.year === pd.year && pn.month === pd.month + 1) || (pn.year === pd.year + 1 && pn.month === 1 && pd.month === 12));
    assert.ok(sameMonth || rollover, `${d} -> ${n}`);
    d = n;
  }
});

test('getTodayBS returns a valid BS date', () => {
  assert.ok(parseBSDate(getTodayBS()));
});
