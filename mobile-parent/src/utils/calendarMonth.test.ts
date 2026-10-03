import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthCells, toWeeks, monthEvents, shiftMonth, coversDate, type CalEvent } from './calendarMonth.ts';
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

const range = (id: string, date: string, endDate: string, type = 'HOLIDAY'): CalEvent => ({ id, title: id, date, endDate, type });

test('coversDate: single day vs range, boundaries inclusive', () => {
  assert.equal(coversDate({ date: '2083/06/10' }, '2083/06/10'), true);
  assert.equal(coversDate({ date: '2083/06/10' }, '2083/06/11'), false);
  const r = { date: '2083/06/10', endDate: '2083/06/20' };
  assert.deepEqual(['09', '10', '15', '20', '21'].map(d => coversDate(r, `2083/06/${d}`)), [false, true, true, true, false]);
});

test('a holiday range marks EVERY day it covers, and only those', () => {
  const cells = buildMonthCells({
    year: 2083, month: 6, daysInMonth: 31, startWeekday: 4, weeklyOffDays: [6],
    events: [range('Summer Holiday', '2083/06/10', '2083/06/20')], today: '',
  });
  const holidayDays = cells.filter(c => c.hasHoliday).map(c => c.day);
  assert.deepEqual(holidayDays, [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(cells[14].events[0].title, 'Summer Holiday'); // the middle of the range carries the name
});

test('a range that starts in an earlier month still marks the days it reaches into this month', () => {
  // Starts 28 Bhadra (month 5), ends 4 Ashwin (month 6)
  const e = range('Break', '2083/05/28', '2083/06/04');
  const cells = buildMonthCells({ year: 2083, month: 6, daysInMonth: 31, startWeekday: 4, weeklyOffDays: [6], events: [e], today: '' });
  assert.deepEqual(cells.filter(c => c.hasHoliday).map(c => c.day), [1, 2, 3, 4]);
  assert.deepEqual(monthEvents([e], 2083, 6).map(x => x.id), ['Break'], 'listed under the month it continues into');
  assert.deepEqual(monthEvents([e], 2083, 5).map(x => x.id), ['Break'], 'and the month it starts in');
  assert.deepEqual(monthEvents([e], 2083, 7), [], 'but not a month it never touches');
});

test('a non-holiday range (exam week) shows on its days but is not a holiday', () => {
  const cells = buildMonthCells({ year: 2083, month: 7, daysInMonth: 30, startWeekday: 6, weeklyOffDays: [6], events: [range('Exams', '2083/07/02', '2083/07/04', 'EXAM')], today: '' });
  assert.deepEqual(cells.filter(c => c.events.length > 0).map(c => c.day), [2, 3, 4]);
  assert.equal(cells.some(c => c.hasHoliday), false);
});
