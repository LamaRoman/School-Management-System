import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeOf, setGrade, fillBlank, toEntries, unsavedCount, gradedCount, type ObsStudent } from './observationsForm.ts';

const S = (id: string, grades: Record<string, string> = {}): ObsStudent => ({ id, name: id, rollNo: 1, grades });

test('gradeOf prefers the edit, then the saved grade, then blank', () => {
  const s = S('a', { c1: 'B' });
  assert.equal(gradeOf(s, {}, 'c1'), 'B');
  assert.equal(gradeOf(s, { a: { c1: 'A' } }, 'c1'), 'A');
  assert.equal(gradeOf(s, {}, 'c2'), '');
});

test('setGrade back to the saved grade removes the edit', () => {
  const s = S('a', { c1: 'B' });
  const e1 = setGrade({}, s, 'c1', 'A');
  assert.deepEqual(e1, { a: { c1: 'A' } });
  assert.deepEqual(setGrade(e1, s, 'c1', 'B'), {});
  assert.equal(unsavedCount(e1), 1);
});

test('fillBlank only fills students without a grade and never overwrites', () => {
  const list = [S('a', { c1: 'B' }), S('b'), S('c')];
  const e = fillBlank(list, { c: { c1: 'D' } }, 'c1', 'A');
  assert.deepEqual(e, { c: { c1: 'D' }, b: { c1: 'A' } });
  assert.equal(gradedCount(list, e, 'c1'), 3);
});

test('toEntries sends only edited cells with a real grade', () => {
  assert.deepEqual(toEntries({ a: { c1: 'A+', c2: '—' }, b: { c1: '' } }), [{ studentId: 'a', categoryId: 'c1', grade: 'A+' }]);
});
