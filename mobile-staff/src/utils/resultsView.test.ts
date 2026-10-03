import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusInfo, availableAction, missingLine, progressFraction, type SubjectRow } from './resultsView.ts';

const row = (n: number): SubjectRow => ({
  subjectId: 's', subjectName: 'Maths', isOptional: false, expected: 10, entered: 10 - n,
  missingStudents: Array.from({ length: n }, (_, i) => ({ id: `${i}`, name: `S${i + 1}`, rollNo: i + 1 })),
});

test('statusInfo names who marked it complete and says families cannot see it yet', () => {
  assert.equal(statusInfo('READY', 'Bijaya').detail.includes('by Bijaya'), true);
  assert.equal(statusInfo('READY', null).detail.includes(' by '), false);
  assert.equal(statusInfo('PUBLISHED', null).tone, 'success');
  assert.equal(statusInfo('DRAFT', null).title, 'Entry in progress');
});

test('a class teacher can mark complete from DRAFT, reopen from READY, and nothing once PUBLISHED', () => {
  assert.equal(availableAction('DRAFT'), 'ready');
  assert.equal(availableAction('READY'), 'reopen');
  assert.equal(availableAction('PUBLISHED'), null);
});

test('missingLine lists up to four names then counts the rest', () => {
  assert.equal(missingLine(row(0)), null);
  assert.equal(missingLine(row(2)), 'No mark for S1, S2');
  assert.equal(missingLine(row(6)), 'No mark for S1, S2, S3, S4 and 2 more');
});

test('progressFraction handles zero subjects and caps at 1', () => {
  assert.equal(progressFraction(0, 0), 0);
  assert.equal(progressFraction(3, 6), 0.5);
  assert.equal(progressFraction(7, 6), 1);
});
