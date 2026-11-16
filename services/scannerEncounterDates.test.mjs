import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendExtractedEncounter,
  assignTodayToExtractedEncounters,
  ethiopianDateLabel,
  removeExtractedEncounter,
  reviewedEncounterDate,
  todayEncounterDateISO,
  updateExtractedEncounter,
} from './scannerEncounterDates.mjs';
import { ethiopianDateToGregorianISO } from '../utils/ethiopianCalendar.js';

const HIDAR_6_2019 = new Date('2026-11-15T12:00:00.000Z');

test('assigns today Ethiopian date to every extracted encounter and ignores document dates', () => {
  const extracted = Array.from({ length: 10 }, (_, index) => ({
    date: index % 2 === 0 ? `EC:2018-01-${index + 1}` : `2024-0${(index % 9) + 1}-15`,
    diagnosis: `Diagnosis ${index + 1}`,
    age: 20 + index,
    sex: index % 2 === 0 ? 'Female' : 'Male',
    issues: ['Missing encounter date.'],
  }));

  const assigned = assignTodayToExtractedEncounters(extracted, HIDAR_6_2019);
  const today = todayEncounterDateISO(HIDAR_6_2019);

  assert.equal(ethiopianDateLabel(today), '06 Hidar 2019');
  assert.equal(assigned.length, 10);
  assigned.forEach((row, index) => {
    assert.equal(row.date, today);
    assert.equal(ethiopianDateLabel(row.date), '06 Hidar 2019');
    assert.equal(row.diagnosis, extracted[index].diagnosis);
    assert.equal(row.age, extracted[index].age);
    assert.equal(row.sex, extracted[index].sex);
    assert.deepEqual(row.issues, []);
  });
});

test('changing a date updates that row and every subsequent row', () => {
  let encounters = assignTodayToExtractedEncounters(
    Array.from({ length: 10 }, (_, index) => ({ diagnosis: `Diagnosis ${index + 1}`, date: 'EC:2011-01-01' })),
    HIDAR_6_2019
  );
  const today = encounters[0].date;
  const hidar7 = ethiopianDateToGregorianISO({ year: 2019, month: 3, day: 7 });
  const hidar8 = ethiopianDateToGregorianISO({ year: 2019, month: 3, day: 8 });

  encounters = updateExtractedEncounter(encounters, 0, 'date', hidar7);
  assert.ok(encounters.every((row) => row.date === hidar7));

  encounters = updateExtractedEncounter(encounters, 4, 'date', hidar8);
  assert.ok(encounters.slice(0, 4).every((row) => row.date === hidar7));
  assert.ok(encounters.slice(4).every((row) => row.date === hidar8));

  encounters = updateExtractedEncounter(encounters, 2, 'diagnosis', 'Updated diagnosis');
  encounters = updateExtractedEncounter(encounters, 2, 'age', '44');
  encounters = updateExtractedEncounter(encounters, 2, 'sex', 'Male');

  assert.equal(ethiopianDateLabel(encounters[0].date), '07 Hidar 2019');
  assert.equal(ethiopianDateLabel(encounters[4].date), '08 Hidar 2019');
  assert.ok(encounters.slice(0, 4).every((row) => row.date === hidar7));
  assert.ok(encounters.slice(4).every((row) => row.date === hidar8));
  assert.equal(encounters[2].diagnosis, 'Updated diagnosis');
  assert.equal(encounters[2].age, '44');
  assert.equal(encounters[2].sex, 'Male');
  assert.equal(reviewedEncounterDate(encounters[2].date, HIDAR_6_2019), hidar7);
  assert.equal(reviewedEncounterDate('not-a-date', HIDAR_6_2019), today);
});

test('appending inherits the last row date and removing a row preserves remaining dates', () => {
  const today = todayEncounterDateISO(HIDAR_6_2019);
  const hidar8 = ethiopianDateToGregorianISO({ year: 2019, month: 3, day: 8 });
  const initial = assignTodayToExtractedEncounters([{ diagnosis: 'First' }], HIDAR_6_2019);
  const appendedToday = appendExtractedEncounter(initial, { diagnosis: 'Second' }, HIDAR_6_2019);

  assert.deepEqual(appendedToday.map((row) => row.date), [today, today]);

  const datedRows = updateExtractedEncounter(appendedToday, 0, 'date', hidar8);
  const appendedDated = appendExtractedEncounter(datedRows, { diagnosis: 'Third' }, HIDAR_6_2019);
  assert.deepEqual(appendedDated.map((row) => row.date), [hidar8, hidar8, hidar8]);

  const afterRemoval = removeExtractedEncounter(appendedDated, 1);
  assert.deepEqual(afterRemoval.map((row) => row.date), [hidar8, hidar8]);
});
