import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teacherGrades, timeRange, sortRoutine, isUpcoming } from './examRoutine.ts';

const g = (id: string, name = id) => ({ gradeId: id, gradeName: name, academicYearId: 'y1' });

test('teacherGrades merges class and subject grades without duplicates, skipping incomplete rows', () => {
  const out = teacherGrades([g('a', 'X')], [g('a', 'X'), g('b', 'IX'), { gradeId: 'c' }]);
  assert.deepEqual(out.map(x => x.gradeId), ['a', 'b']);
});

test('timeRange handles both, one or neither time', () => {
  assert.equal(timeRange({ startTime: '10:00', endTime: '12:00' }), '10:00 – 12:00');
  assert.equal(timeRange({ startTime: '10:00', endTime: null }), '10:00');
  assert.equal(timeRange({ startTime: ' ', endTime: undefined }), '');
});

test('sortRoutine orders by date then time then subject', () => {
  const e = (id: string, d: string, t: string | null, n: string) => ({ id, examDate: d, startTime: t, subject: { name: n } });
  const out = sortRoutine([e('3', '2083/07/05', '10:00', 'B'), e('1', '2083/07/04', null, 'Z'), e('2', '2083/07/05', '09:00', 'C')]);
  assert.deepEqual(out.map(x => x.id), ['1', '2', '3']);
});

test('isUpcoming includes today', () => {
  assert.equal(isUpcoming({ examDate: '2083/07/05' }, '2083/07/05'), true);
  assert.equal(isUpcoming({ examDate: '2083/07/04' }, '2083/07/05'), false);
});
