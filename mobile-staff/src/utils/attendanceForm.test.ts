import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDefaults, toggled, countStatuses, unsavedCount, needsSave, toPayload, savedSummary, closedMode, reasonText } from './attendanceForm.ts';

const rec = (id: string, status: 'PRESENT' | 'ABSENT' | null, isMarked: boolean) =>
  ({ studentId: id, studentName: id, rollNo: 1, status, isMarked });

test('an unmarked day is shown all PRESENT, so ONE tap makes a student absent', () => {
  const shown = withDefaults([rec('a', null, false), rec('b', null, false)]);
  assert.deepEqual(shown.map(r => r.status), ['PRESENT', 'PRESENT']);
  assert.equal(toggled(shown[0].status), 'ABSENT'); // the first tap
  assert.equal(toggled('ABSENT'), 'PRESENT');       // and back
});

test('saved statuses are kept as stored (absent stays absent)', () => {
  const shown = withDefaults([rec('a', 'ABSENT', true), rec('b', 'PRESENT', true), rec('c', null, false)]);
  assert.deepEqual(shown.map(r => r.status), ['ABSENT', 'PRESENT', 'PRESENT']);
  assert.deepEqual(shown.map(r => r.isMarked), [true, true, false]);
});

test('counts and the unsaved count', () => {
  const shown = withDefaults([rec('a', 'ABSENT', true), rec('b', 'PRESENT', true), rec('c', null, false)]);
  assert.deepEqual(countStatuses(shown), { present: 2, absent: 1 });
  assert.equal(unsavedCount(shown), 1);
});

test('Save is offered for an untouched unsaved day, but not for a fully saved untouched day', () => {
  const fresh = withDefaults([rec('a', null, false), rec('b', null, false)]);
  assert.equal(needsSave(false, fresh), true, 'nothing saved yet: allow saving all-present with one press');
  const saved = withDefaults([rec('a', 'PRESENT', true), rec('b', 'ABSENT', true)]);
  assert.equal(needsSave(false, saved), false);
  assert.equal(needsSave(true, saved), true, 'an edit on a saved day');
  assert.equal(needsSave(true, []), false, 'no students -> nothing to save');
});

test('payload carries each student\'s shown status; an untouched day saves everyone present', () => {
  const shown = withDefaults([rec('a', null, false), rec('b', null, false)]);
  assert.deepEqual(toPayload(shown), [{ studentId: 'a', status: 'PRESENT' }, { studentId: 'b', status: 'PRESENT' }]);
  const edited = [{ ...shown[0], status: toggled(shown[0].status) }, shown[1]];
  assert.deepEqual(toPayload(edited).map(r => r.status), ['ABSENT', 'PRESENT']);
});

test('savedSummary', () => {
  assert.equal(savedSummary(9, 1), 'Saved: 9 present, 1 absent');
});

const sat = { date: '2083/06/17', closed: true, reasons: [{ kind: 'WEEKLY_OFF' as const, title: 'Saturday' }] };
const open = { date: '2083/06/16', closed: false, reasons: [] };

test('closedMode: an open day, or an unknown one, is never blocked', () => {
  assert.equal(closedMode(open, false, null, '2083/06/16'), 'open');
  assert.equal(closedMode(null, false, null, '2083/06/17'), 'open', 'a failed lookup must not block attendance');
  assert.equal(closedMode(undefined, false, null, '2083/06/17'), 'open');
});

test('closedMode: a closed day with nothing recorded asks first', () => {
  assert.equal(closedMode(sat, false, null, '2083/06/17'), 'blocking');
  assert.equal(closedMode(sat, false, '2083/06/10', '2083/06/17'), 'blocking', 'a confirmation for another date does not carry over');
});

test('closedMode: confirming, or existing records, show the day', () => {
  assert.equal(closedMode(sat, false, '2083/06/17', '2083/06/17'), 'recorded');
  assert.equal(closedMode(sat, true, null, '2083/06/17'), 'recorded', 'saved records are never hidden');
});

test('reasonText reads naturally for each kind', () => {
  assert.equal(reasonText({ kind: 'WEEKLY_OFF', title: 'Saturday' }), 'Saturday (weekly day off)');
  assert.equal(reasonText({ kind: 'SCHOOL_HOLIDAY', title: "Founders' Day" }), "Founders' Day (school holiday)");
  assert.equal(reasonText({ kind: 'NATIONAL_HOLIDAY', title: 'Dashain' }), 'Dashain (public holiday)');
});
