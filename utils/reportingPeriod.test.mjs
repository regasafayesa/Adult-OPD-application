import assert from 'node:assert/strict';
import test from 'node:test';
import { reportingPeriodFromDate } from './dates.js';
import { currentEthiopianDate } from './ethiopianCalendar.js';

test('derives Ethiopian reporting periods without using the Gregorian month', () => {
  assert.deepEqual(reportingPeriodFromDate('2026-09-10'), {
    reportingMonth: 13,
    reportingYear: 2018,
    monthName: 'Pagume',
  });
  assert.deepEqual(reportingPeriodFromDate('2026-09-11'), {
    reportingMonth: 1,
    reportingYear: 2019,
    monthName: 'Meskerem',
  });
  assert.deepEqual(reportingPeriodFromDate('2026-11-13'), {
    reportingMonth: 3,
    reportingYear: 2019,
    monthName: 'Hidar',
  });
  assert.deepEqual(reportingPeriodFromDate('2019-02-16'), {
    reportingMonth: 6,
    reportingYear: 2011,
    monthName: 'Yekatit',
  });
});

test('keeps a date-only value on its Ethiopian day when a nearby timestamp crosses midnight in Addis Ababa', () => {
  const dateOnly = reportingPeriodFromDate('2026-09-10');
  const afterMidnightInAddis = reportingPeriodFromDate(new Date('2026-09-10T21:30:00.000Z'));
  assert.equal(dateOnly.reportingMonth, 13);
  assert.equal(dateOnly.reportingYear, 2018);
  assert.deepEqual(afterMidnightInAddis, {
    reportingMonth: 1,
    reportingYear: 2019,
    monthName: 'Meskerem',
  });
});

test('uses the Addis Ababa Ethiopian date for the current reporting period', () => {
  const period = currentEthiopianDate(new Date('2026-11-15T12:00:00.000Z'));
  assert.deepEqual(period, { year: 2019, month: 3, day: 6 });
});

test('rejects an impossible date instead of shifting it into another reporting period', () => {
  assert.deepEqual(reportingPeriodFromDate('2026-02-31'), {
    reportingMonth: null,
    reportingYear: null,
    monthName: null,
  });
});
