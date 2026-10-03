import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortRoster, filterRoster, detailRows, dialable } from './studentList.ts';

const S = (id: string, name: string, rollNo: number | null, extra = {}) => ({ id, name, rollNo, ...extra });

test('sortRoster orders by roll number, unnumbered last, ties by name', () => {
  const out = sortRoster([S('a', 'Zed', null), S('b', 'Bea', 2), S('c', 'Amy', 1), S('d', 'Abe', null)]);
  assert.deepEqual(out.map(s => s.id), ['c', 'b', 'd', 'a']);
});

test('filterRoster matches name, Nepali name and exact roll number; blank keeps all', () => {
  const list = [S('a', 'Aarav Sharma', 1, { nameNp: 'आराव' }), S('b', 'Bipasha Thapa', 12)];
  assert.equal(filterRoster(list, '  ').length, 2);
  assert.deepEqual(filterRoster(list, 'SHAR').map(s => s.id), ['a']);
  assert.deepEqual(filterRoster(list, 'आराव').map(s => s.id), ['a']);
  assert.deepEqual(filterRoster(list, '1').map(s => s.id), ['a']); // roll 1, not 12
  assert.deepEqual(filterRoster(list, '12').map(s => s.id), ['b']);
});

test('detailRows leaves out empty values', () => {
  const rows = detailRows(S('a', 'A', 1, { fatherName: 'Ram', motherName: '  ', address: 'Pokhara' }));
  assert.deepEqual(rows, [{ label: 'Father', value: 'Ram' }, { label: 'Address', value: 'Pokhara' }]);
});

test('dialable keeps digits and a leading +, rejects short junk', () => {
  assert.equal(dialable('98-4123 4567'), '9841234567');
  assert.equal(dialable('+977 984 1234567'), '+9779841234567');
  assert.equal(dialable('123'), null);
  assert.equal(dialable(null), null);
});
