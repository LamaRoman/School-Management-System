import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRs, percent, barWidth, sortDefaulters, filterDefaulters, dialable, groupByReceipt, appendPage,
  type Defaulter, type PaymentLine,
} from './accountantReports.ts';

test('formatRs uses lakh grouping, rounds, and copes with nothing', () => {
  assert.equal(formatRs(0), 'Rs 0');
  assert.equal(formatRs(999), 'Rs 999');
  assert.equal(formatRs(1000), 'Rs 1,000');
  assert.equal(formatRs(12500), 'Rs 12,500');
  assert.equal(formatRs(123456), 'Rs 1,23,456');
  assert.equal(formatRs(12345678), 'Rs 1,23,45,678');
  assert.equal(formatRs(1234.6), 'Rs 1,235');
  assert.equal(formatRs(-1500), '-Rs 1,500');
  assert.equal(formatRs(undefined), 'Rs 0');
  assert.equal(formatRs(NaN), 'Rs 0');
});

test('percent and barWidth handle zero expected and over-collection', () => {
  assert.equal(percent(50, 200), 25);
  assert.equal(percent(5, 0), 0);
  assert.equal(barWidth(300, 200), 100); // collected more than expected: the bar stops at full
  assert.equal(barWidth(-5, 200), 0);
});

const D = (id: string, name: string, balance: number, extra: Partial<Defaulter> = {}): Defaulter => ({
  studentId: id, studentName: name, className: 'X', section: 'A', rollNo: 1, guardianPhone: '—',
  expectedUpTo: balance, totalPaid: 0, balance, monthsPending: 1, ...extra,
});

test('sortDefaulters puts the biggest balance first, ties by class then roll', () => {
  const out = sortDefaulters([D('a', 'A', 500, { className: 'X', rollNo: 3 }), D('b', 'B', 900), D('c', 'C', 500, { className: 'IX', rollNo: 9 }), D('d', 'D', 500, { className: 'X', rollNo: 1 })]);
  assert.deepEqual(out.map(d => d.studentId), ['b', 'c', 'd', 'a']);
});

test('filterDefaulters matches a name fragment or an exact roll number', () => {
  const list = [D('a', 'Aarav Sharma', 1, { rollNo: 1 }), D('b', 'Bipasha', 1, { rollNo: 12 })];
  assert.equal(filterDefaulters(list, '').length, 2);
  assert.deepEqual(filterDefaulters(list, 'SHAR').map(d => d.studentId), ['a']);
  assert.deepEqual(filterDefaulters(list, '1').map(d => d.studentId), ['a']);
  assert.deepEqual(filterDefaulters(list, '12').map(d => d.studentId), ['b']);
});

test('dialable accepts real numbers and rejects the server\'s "—" placeholder', () => {
  assert.equal(dialable('98-4123 4567'), '9841234567');
  assert.equal(dialable('+977 984 1234567'), '+9779841234567');
  assert.equal(dialable('—'), null);
  assert.equal(dialable(''), null);
  assert.equal(dialable(null), null);
});

const L = (id: string, rcpt: string, student: string, category: string, amount: number): PaymentLine => ({
  id, receiptNumber: rcpt, studentName: student, className: 'X', section: 'A', rollNo: 1, category, amount,
  paidMonth: 'Ashwin', paymentDate: '2083/06/10', paymentMethod: 'Cash',
});

test('groupByReceipt merges a receipt\'s lines and sums them, keeping order', () => {
  const out = groupByReceipt([L('1', 'R-1', 'Aarav', 'Tuition', 1000), L('2', 'R-1', 'Aarav', 'Exam', 250), L('3', 'R-2', 'Bipasha', 'Tuition', 900)]);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].receiptNumber, out[0].total, out[0].items.length], ['R-1', 1250, 2]);
  assert.equal(out[1].total, 900);
});

test('groupByReceipt never merges lines that have no receipt number', () => {
  const out = groupByReceipt([L('1', '—', 'Aarav', 'Tuition', 1000), L('2', '—', 'Aarav', 'Exam', 250)]);
  assert.equal(out.length, 2);
});

test('appendPage drops lines already shown', () => {
  const out = appendPage([{ id: '1' }, { id: '2' }], [{ id: '2' }, { id: '3' }]);
  assert.deepEqual(out.map(x => x.id), ['1', '2', '3']);
});
