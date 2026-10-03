import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studentPdfPath, classPdfPath, safeFilename, filenameFromDisposition, looksLikePdf } from './reportCards.ts';

const term = { id: 'e1', name: 'First Terminal' };
const fin = { id: 'e3', name: 'Final', isFinal: true };

test('a term exam uses the term routes; a final exam uses the year routes', () => {
  assert.equal(studentPdfPath(term, 's1', 'y1', 'color'), '/pdf/term/s1/e1?mode=color');
  assert.equal(studentPdfPath(fin, 's1', 'y1', 'bw'), '/pdf/final/s1/y1?mode=bw');
  assert.equal(classPdfPath(term, 'sec', 'y1', 'bw'), '/pdf/class/term/sec/e1?mode=bw');
  assert.equal(classPdfPath(fin, 'sec', 'y1', 'color'), '/pdf/class/final/sec/y1?mode=color');
});

test('safeFilename strips unsafe characters and always ends in .pdf', () => {
  assert.equal(safeFilename('Aarav Sharma/First Terminal 2082.pdf'), 'Aarav_Sharma_First_Terminal_2082.pdf');
  assert.equal(safeFilename('../../etc/passwd'), '.._.._etc_passwd.pdf');
  assert.equal(safeFilename('***'), 'report-card.pdf');
});

test('filenameFromDisposition reads the server name, else the fallback', () => {
  assert.equal(filenameFromDisposition('attachment; filename="Aarav_Final_2082.pdf"', 'x'), 'Aarav_Final_2082.pdf');
  assert.equal(filenameFromDisposition(undefined, 'Class X-A'), 'Class_X-A.pdf');
});

test('looksLikePdf checks the %PDF header', () => {
  assert.equal(looksLikePdf(new TextEncoder().encode('%PDF-1.7 ...')), true);
  assert.equal(looksLikePdf(new TextEncoder().encode('{"error":"nope"}')), false);
  assert.equal(looksLikePdf(new Uint8Array(2)), false);
});
