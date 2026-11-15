import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAge } from './ageClassification.js';

test('classifies the four Adult OPD age groups and keeps ages under five outside individual reporting', () => {
  assert.equal(classifyAge(0).includedInAdultReport, false);
  assert.equal(classifyAge(4).includedInAdultReport, false);
  assert.equal(classifyAge(4).ageGroup, null);
  assert.deepEqual(classifyAge(5), { opdCategory: 'Adult OPD', ageGroup: '5–14', includedInAdultReport: true });
  assert.equal(classifyAge(14).ageGroup, '5–14');
  assert.equal(classifyAge(15).ageGroup, '15–29');
  assert.equal(classifyAge(29).ageGroup, '15–29');
  assert.equal(classifyAge(30).ageGroup, '30–64');
  assert.equal(classifyAge(64).ageGroup, '30–64');
  assert.equal(classifyAge(65).ageGroup, '≥65');
  assert.equal(classifyAge(120).ageGroup, '≥65');
  assert.equal(classifyAge(-1).includedInAdultReport, false);
  assert.equal(classifyAge(4.5).includedInAdultReport, false);
});
