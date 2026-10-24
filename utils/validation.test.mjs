import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEncounter } from './validation.js';

const diagnoses = [{ id: 'dx-typhoid', name: 'Typhoid fever', active: true }];

function encounter(age) {
  return {
    date: '2026-10-01',
    age,
    sex: 'Female',
    diagnosis: 'Typhoid fever',
  };
}

test('continues to reject individual patient entries younger than five', () => {
  for (const age of [0, 1, 4]) {
    assert.match(validateEncounter(encounter(age), { diagnoses }).errors.age, /Ages below 5/);
  }
  assert.equal(validateEncounter(encounter(5), { diagnoses }).errors.age, undefined);
});
