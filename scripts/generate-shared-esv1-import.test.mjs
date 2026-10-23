import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildSharedDiagnosisSeed } from './generate-shared-esv1-import.mjs';

const sourceText = readFileSync(new URL('../services/esv1Diagnoses.js', import.meta.url), 'utf8');
const reviewText = readFileSync(new URL('../esv1-catalog-review.json', import.meta.url), 'utf8');

test('validates exact source duplicates against every unique reviewed ESV-1 entry', () => {
  const result = buildSharedDiagnosisSeed(sourceText, reviewText);

  assert.equal(result.sourceRows, 2684);
  assert.equal(result.uniqueEntries, 2461);
  assert.equal(result.repeatedRows, 223);
  assert.match(result.sql, /public\.official_diagnoses/);
  assert.doesNotMatch(result.sql, /target_facility|facility_id/);
  assert.equal([...result.sql.matchAll(/\('esv1-[^']+',\s*'[^']+',\s*'[^']+'\)/g)].length, 2461);
});

test('rejects duplicate source codes with conflicting names', () => {
  const source = `const ESV1_ENTRIES = [
  ['A1', 'First name'],
  ['A1', 'Different name']
];`;
  const review = JSON.stringify([{ code: 'A1', name: 'First name' }]);

  assert.throws(
    () => buildSharedDiagnosisSeed(source, review),
    /source code "A1" has conflicting names/
  );
});

test('rejects review rows that do not exactly match the unique source catalog', () => {
  const source = `const ESV1_ENTRIES = [
  ['A1', 'Source name']
];`;
  const review = JSON.stringify([{ code: 'A1', name: 'Different name' }]);

  assert.throws(
    () => buildSharedDiagnosisSeed(source, review),
    /1 name mismatches/
  );
});

test('generated seed checks ID/code conflicts and inserts only missing rows without updating', () => {
  const source = `const ESV1_ENTRIES = [
  ['A1', 'Diagnosis']
];`;
  const review = JSON.stringify([{ code: 'A1', name: 'Diagnosis' }]);
  const { sql } = buildSharedDiagnosisSeed(source, review);

  assert.match(sql, /join public\.official_diagnoses existing[\s\S]*?existing\.id = esv\.id\s+or existing\.code = esv\.code/);
  assert.match(sql, /Found % conflicting ESV-1 IDs or codes/);
  assert.match(sql, /insert into public\.official_diagnoses \(id, code, name, active, source\)/i);
  assert.match(sql, /where not exists[\s\S]*?existing\.id = esv\.id\s+or existing\.code = esv\.code/);
  assert.doesNotMatch(sql, /\b(update|delete)\s+public\./i);
  assert.equal((sql.match(/insert into public\.official_diagnoses/gi) || []).length, 1);
});
