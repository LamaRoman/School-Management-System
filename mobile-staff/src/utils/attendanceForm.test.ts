import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  showRecords, nextStatus, countStatuses, unsavedCount, needsSave, toPayload, savedSummary,
  isClosed, reasonText, withEdit, clearAllEdits, toClears, type ServerRecord,
} from './attendanceForm.ts';

const rec = (id: string, status: 'PRESENT' | 'ABSENT' | null, isMarked: boolean): ServerRecord =>
  ({ studentId: id, studentName: id, rollNo: 1, status, isMarked });

const unrecorded = [rec('a', null, false), rec('b', null, false), rec('c', null, false)];

// ── ordinary school day ─────────────────────────────────────────────────────────────
test('open day: unrecorded students are shown PRESENT, so ONE tap makes a student absent', () => {
  const shown = showRecords(unrecorded, {}, false);
  assert.deepEqual(shown.map(r => r.status), ['PRESENT', 'PRESENT', 'PRESENT']);
  assert.equal(nextStatus(shown[0].status), 'ABSENT');
});

test('open day: stored statuses are kept, edits win over stored', () => {
  const raw = [rec('a', 'ABSENT', true), rec('b', 'PRESENT', true), rec('c', null, false)];
  assert.deepEqual(showRecords(raw, {}, false).map(r => r.status), ['ABSENT', 'PRESENT', 'PRESENT']);
  assert.deepEqual(showRecords(raw, { a: 'PRESENT' }, false).map(r => r.status), ['PRESENT', 'PRESENT', 'PRESENT']);
});

test('open day: Save is offered for an untouched unsaved day (one press saves all present)', () => {
  assert.equal(needsSave(false, unrecorded, false), true);
  assert.equal(needsSave(false, [rec('a', 'PRESENT', true)], false), false, 'fully saved, untouched');
  assert.equal(needsSave(true, [rec('a', 'PRESENT', true)], false), true, 'an edit on a saved day');
  assert.equal(needsSave(true, [], false), false, 'no students');
});

test('open day: payload sends everyone', () => {
  assert.equal(toPayload(showRecords(unrecorded, {}, false)).length, 3);
});

// ── closed day (weekly day off / holiday) ────────────────────────────────────────────
test('closed day: unrecorded students are GREY (null), nobody is assumed present', () => {
  const shown = showRecords(unrecorded, {}, true);
  assert.deepEqual(shown.map(r => r.status), [null, null, null]);
  assert.deepEqual(countStatuses(shown), { present: 0, absent: 0 });
});

test('closed day: the first tap marks a grey student PRESENT, then it flips', () => {
  assert.equal(nextStatus(null), 'PRESENT');
  assert.equal(nextStatus('PRESENT'), 'ABSENT');
  assert.equal(nextStatus('ABSENT'), 'PRESENT');
});

test('closed day: Mark All Present (edits for every student) turns the whole list present', () => {
  const edits = { a: 'PRESENT', b: 'PRESENT', c: 'PRESENT' } as const;
  const shown = showRecords(unrecorded, { ...edits }, true);
  assert.deepEqual(shown.map(r => r.status), ['PRESENT', 'PRESENT', 'PRESENT']);
});

test('closed day: records that were already saved keep their stored colours', () => {
  const raw = [rec('a', 'ABSENT', true), rec('b', 'PRESENT', true), rec('c', null, false)];
  assert.deepEqual(showRecords(raw, {}, true).map(r => r.status), ['ABSENT', 'PRESENT', null]);
});

test('closed day: nothing is saved unless the teacher marks something', () => {
  assert.equal(needsSave(false, unrecorded, true), false, 'a closed day is never an "unsaved day" to nag about');
  assert.equal(needsSave(true, unrecorded, true), true, 'once something is marked');
});

test('closed day: only the students that were marked are sent (partial save)', () => {
  const shown = showRecords(unrecorded, { a: 'PRESENT', c: 'ABSENT' }, true);
  assert.deepEqual(toPayload(shown), [
    { studentId: 'a', status: 'PRESENT' },
    { studentId: 'c', status: 'ABSENT' },
  ]);
  assert.deepEqual(toPayload(showRecords(unrecorded, {}, true)), [], 'no taps -> empty payload');
});

test('closed day: a third tap puts a student back to grey; an open day never goes grey', () => {
  assert.equal(nextStatus('ABSENT', true), null);
  assert.equal(nextStatus('ABSENT', false), 'PRESENT');
  assert.equal(nextStatus('PRESENT', true), 'ABSENT');
});

test('closed day: a grey edit beats the stored status and is sent as a clear, not a record', () => {
  const raw = [rec('a', 'PRESENT', true), rec('b', 'ABSENT', true), rec('c', null, false)];
  const edits = withEdit({}, raw[0], null);
  const shown = showRecords(raw, edits, true);
  assert.deepEqual(shown.map(r => r.status), [null, 'ABSENT', null]);
  assert.deepEqual(toPayload(shown), [{ studentId: 'b', status: 'ABSENT' }]);
  assert.deepEqual(toClears(edits), ['a']);
  assert.equal(needsSave(true, raw, true), true);
});

test('withEdit drops an edit that lands back on what is stored, so a full tap cycle saves nothing', () => {
  const grey = rec('c', null, false);
  let edits = withEdit({}, grey, nextStatus(null, true));        // grey -> present
  assert.deepEqual(edits, { c: 'PRESENT' });
  edits = withEdit(edits, grey, nextStatus('PRESENT', true));    // -> absent
  edits = withEdit(edits, grey, nextStatus('ABSENT', true));     // -> grey again
  assert.deepEqual(edits, {});
});

test('Set All Grey clears only the students that have something stored', () => {
  const raw = [rec('a', 'PRESENT', true), rec('b', null, false), rec('c', 'ABSENT', true)];
  const edits = clearAllEdits(raw);
  assert.deepEqual(toClears(edits), ['a', 'c']);
  assert.deepEqual(showRecords(raw, edits, true).map(r => r.status), [null, null, null]);
});

// ── shared ──────────────────────────────────────────────────────────────────────────
test('counts and unsaved count', () => {
  const shown = showRecords([rec('a', 'ABSENT', true), rec('b', 'PRESENT', true), rec('c', null, false)], {}, false);
  assert.deepEqual(countStatuses(shown), { present: 2, absent: 1 });
  assert.equal(unsavedCount([rec('a', 'ABSENT', true), rec('c', null, false)]), 1);
});

test('isClosed: a missing or failed lookup is an ordinary day', () => {
  assert.equal(isClosed(null), false);
  assert.equal(isClosed(undefined), false);
  assert.equal(isClosed({ date: 'd', closed: false, reasons: [] }), false);
  assert.equal(isClosed({ date: 'd', closed: true, reasons: [] }), true);
});

test('reasonText and savedSummary', () => {
  assert.equal(reasonText({ kind: 'WEEKLY_OFF', title: 'Saturday' }), 'Saturday (weekly day off)');
  assert.equal(reasonText({ kind: 'SCHOOL_HOLIDAY', title: "Founders' Day" }), "Founders' Day (school holiday)");
  assert.equal(reasonText({ kind: 'NATIONAL_HOLIDAY', title: 'Dashain' }), 'Dashain (public holiday)');
  assert.equal(savedSummary(9, 1), 'Saved: 9 present, 1 absent');
});
