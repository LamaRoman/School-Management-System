import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchReady, summariseDues, statusLabel } from './studentLookup.ts';

test('search needs two characters, ignoring spaces', () => {
  assert.equal(searchReady(''), false);
  assert.equal(searchReady(' a '), false);
  assert.equal(searchReady('ab'), true);
  assert.equal(searchReady('  ab '), true);
});

test('summariseDues: nothing owing', () => {
  assert.deepEqual(summariseDues({ totalArrears: 0, totalCurrent: 0, totalOther: 0, grandTotal: 0 }, 'Ashwin'),
    { clear: true, headline: 'No dues up to Ashwin', lines: [] });
});

test('summariseDues: lists only the parts that are owing, in order', () => {
  const s = summariseDues({ totalArrears: 2000, totalCurrent: 1500, totalOther: 0, grandTotal: 3500 }, 'Ashwin');
  assert.equal(s.clear, false);
  assert.equal(s.headline, 'Due up to Ashwin');
  assert.deepEqual(s.lines, [{ label: 'Earlier months (arrears)', amount: 2000 }, { label: 'Ashwin fees', amount: 1500 }]);
});

test('statusLabel prettifies the enum', () => {
  assert.equal(statusLabel('ACTIVE'), 'Active');
  assert.equal(statusLabel('TRANSFERRED_OUT'), 'Transferred out');
  assert.equal(statusLabel(null), '—');
});
