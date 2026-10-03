import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthCells, toWeeks, monthEvents, shiftMonth, type CalEvent } from './calendarMonth.ts';
import { getDaysInBSMonth, getStartWeekday } from './bsDate.ts';

// Ashwin 2083: starts on a Thursday (1 Ashwin 2083 = Thu 17 Sep 2026); 17 Ashwin is Sat 3 Oct 2026.
const ev = (id: string, date: string, type: string, title = id): CalEvent => ({ id, title, date, type });

test('real library data: Ashwin 2083 has 31 days and starts on Thursday', () => {
  assert.equal(getDaysInBSMonth(2083, 6), 31);
  assert.equal(getStartWeekday(2083, 6), 4);
});

test('cells carry weekday, weekly-off, today and events; Saturday-only week', () => {
  const cells = buildMonthCells({
    year: 2083, month: 6, daysInMonth: 31, startWeekday: 4, weeklyOffDays: [6],
    events: [ev('a', '2083/06/17', 'EVENT'), ev('h', '2083/06/18', 'HOLIDAY', 'Dashain'), ev('b', '2083/06/18', 'MEETING')],
    today: '2083/06/17',
  });
  assert.equal(cells.length, 31);
  const d17 = cells[16];
  assert.equal(d17.date, '2083/06/17');
  assert.equal(d17.weekday, 6);           // Saturday
  assert.equal(d17.isWeeklyOff, true);
  assert.equal(d17.isToday, true);
  assert.equal(d17.hasHoliday, false);
  const d18 = cells[17];
  assert.equal(d18.weekday, 0);            // Sunday: open with a Saturday-only week
  assert.equal(d18.isWeeklyOff, false);
  assert.equal(d18.hasHoliday, true);      // the HOLIDAY event, not the MEETING, makes it a holiday
  assert.equal(d18.events.length, 2);
  assert.deepEqual(cells.filter(c => c.isWeeklyOff).map(c => c.day), [3, 10, 17, 24, 31]); // the five Saturdays
});

test('Saturday + Sunday week marks both', () => {
  const cells = buildMonthCells({ year: 2083, month: 6, daysInMonth: 31, startWeekday: 4, weeklyOffDays: [0, 6], events: [], today: '' });
  assert.equal(cells[17].isWeeklyOff, true); // Sunday 18
  assert.equal(cells[16].isWeeklyOff, true); // Saturday 17
  assert.equal(cells[15].isWeeklyOff, false); // Friday 16
});

test('weeks are 7 wide with blanks around the month', () => {
  const cells = buildMonthCells({ year: 2083, month: 6, daysInMonth: 31, startWeekday: 4, weeklyOffDays: [6], events: [], today: '' });
  const weeks = toWeeks(cells, 4);
  assert.ok(weeks.every(w => w.length === 7));
  assert.deepEqual(weeks[0].map(c => c?.day ?? null), [null, null, null, null, 1, 2, 3]);
  assert.equal(weeks.flat().filter(Boolean).length, 31);
});

test('monthEvents filters to the month and sorts by date', () => {
  const list = monthEvents([ev('x', '2083/07/01', 'EVENT'), ev('b', '2083/06/20', 'EVENT'), ev('a', '2083/06/03', 'HOLIDAY')], 2083, 6);
  assert.deepEqual(list.map(e => e.id), ['a', 'b']);
});

test('shiftMonth crosses year boundaries', () => {
  assert.deepEqual(shiftMonth(2083, 12, 1), { year: 2084, month: 1 });
  assert.deepEqual(shiftMonth(2083, 1, -1), { year: 2082, month: 12 });
  assert.deepEqual(shiftMonth(2083, 6, 1), { year: 2083, month: 7 });
});
