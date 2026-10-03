import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withDefaults, toggled, countStatuses, unsavedCount, needsSave, toPayload, savedSummary } from './attendanceForm.ts';

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
