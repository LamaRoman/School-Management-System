import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMarksForm, parseMark, overFullMarks, unparseableMarks, toBulkPayload } from './marksForm.ts';

const ids = ['a', 'b', 'c'];

test('buildMarksForm fills saved marks and leaves everyone else EMPTY (no carry-over between exams)', () => {
  // Exam 1 has marks for a and b; exam 2 only for a.
  const exam1 = buildMarksForm(ids, [
    { studentId: 'a', theoryMarks: 40, practicalMarks: 10, isAbsent: false },
    { studentId: 'b', theoryMarks: 33, practicalMarks: null, isAbsent: false },
  ]);
  assert.deepEqual(exam1.b, { theoryMarks: '33', practicalMarks: '', isAbsent: false });

  const exam2 = buildMarksForm(ids, [{ studentId: 'a', theoryMarks: 12, practicalMarks: null, isAbsent: false }]);
  assert.deepEqual(exam2.b, { theoryMarks: '', practicalMarks: '', isAbsent: false }, 'b must NOT keep exam 1 values');
  assert.deepEqual(exam2.c, { theoryMarks: '', practicalMarks: '', isAbsent: false });
});

test('buildMarksForm: absent student shows no numbers; zero is a real mark', () => {
  const f = buildMarksForm(ids, [
    { studentId: 'a', theoryMarks: 0, practicalMarks: 0, isAbsent: false },
    { studentId: 'b', theoryMarks: 9, practicalMarks: 9, isAbsent: true },
  ]);
  assert.deepEqual(f.a, { theoryMarks: '0', practicalMarks: '0', isAbsent: false });
  assert.deepEqual(f.b, { theoryMarks: '', practicalMarks: '', isAbsent: true });
});

test('buildMarksForm ignores marks for students not in the roster', () => {
  const f = buildMarksForm(['a'], [{ studentId: 'zzz', theoryMarks: 5, practicalMarks: null, isAbsent: false }]);
  assert.deepEqual(Object.keys(f), ['a']);
});

test('parseMark', () => {
  assert.equal(parseMark(''), null);
  assert.equal(parseMark('  '), null);
  assert.equal(parseMark('0'), 0);
  assert.equal(parseMark('72.5'), 72.5);
  assert.equal(parseMark('abc'), null);
  assert.equal(parseMark('-3'), null);
});

test('overFullMarks / unparseableMarks', () => {
  const form = {
    a: { theoryMarks: '80', practicalMarks: '', isAbsent: false },   // theory over 75
    b: { theoryMarks: '75', practicalMarks: '25', isAbsent: false }, // exactly full: ok
    c: { theoryMarks: '99', practicalMarks: '99', isAbsent: true },  // absent: ignored
    d: { theoryMarks: '7x', practicalMarks: '', isAbsent: false },   // junk
  };
  assert.deepEqual(overFullMarks(form, 75, 25), ['a']);
  assert.deepEqual(unparseableMarks(form), ['d']);
});

test('toBulkPayload sends nulls for blank/absent and numbers otherwise, in roster order', () => {
  const form = buildMarksForm(ids, [
    { studentId: 'a', theoryMarks: 40, practicalMarks: null, isAbsent: false },
    { studentId: 'b', theoryMarks: 9, practicalMarks: 9, isAbsent: true },
  ]);
  assert.deepEqual(toBulkPayload(ids, form), [
    { studentId: 'a', theoryMarks: 40, practicalMarks: null, isAbsent: false },
    { studentId: 'b', theoryMarks: null, practicalMarks: null, isAbsent: true },
    { studentId: 'c', theoryMarks: null, practicalMarks: null, isAbsent: false },
  ]);
});
