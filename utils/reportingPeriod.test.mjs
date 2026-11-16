import assert from 'node:assert/strict';
import test from 'node:test';
import { reportingPeriodFromDate } from './dates.js';
import {
  currentEthiopianDate,
  currentEthiopianPeriod,
  currentEthiopianReportingPeriod,
  ethiopianDateToGregorianISO,
} from './ethiopianCalendar.js';

test('assigns the 21st through 20th Ethiopian reporting months', () => {
  const date = (year, month, day) => ethiopianDateToGregorianISO({ year, month, day });
  const cases = [
    [date(2019, 2, 20), 2019, 2, 'Tikimt'],
    [date(2019, 2, 21), 2019, 3, 'Hidar'],
    [date(2019, 3, 20), 2019, 3, 'Hidar'],
    [date(2019, 3, 21), 2019, 4, 'Tahsas'],
    [date(2019, 12, 20), 2019, 12, 'Nehase'],
    [date(2019, 12, 21), 2020, 1, 'Meskerem'],
  ];

  cases.forEach(([isoDate, year, month, monthName]) => {
    assert.deepEqual(reportingPeriodFromDate(isoDate), {
      reportingMonth: month,
      reportingYear: year,
      monthName,
    });
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
  assert.equal(dateOnly.reportingMonth, 1);
  assert.equal(dateOnly.reportingYear, 2019);
  assert.deepEqual(afterMidnightInAddis, {
    reportingMonth: 1,
    reportingYear: 2019,
    monthName: 'Meskerem',
  });
});

test('uses the Addis Ababa Ethiopian date for the current reporting period', () => {
  const period = currentEthiopianDate(new Date('2026-11-15T12:00:00.000Z'));
  assert.deepEqual(period, { year: 2019, month: 3, day: 6 });
  const date = new Date('2026-11-15T12:00:00.000Z');
  assert.deepEqual(currentEthiopianPeriod(date), {
    year: 2019,
    month: 3,
  });
  assert.deepEqual(currentEthiopianReportingPeriod(date), { year: 2019, month: 3 });
  assert.deepEqual(currentEthiopianReportingPeriod(new Date('2026-12-10T12:00:00.000Z')), {
    year: 2019,
    month: 4,
  });
});

test('rejects an impossible date instead of shifting it into another reporting period', () => {
  assert.deepEqual(reportingPeriodFromDate('2026-02-31'), {
    reportingMonth: null,
    reportingYear: null,
    monthName: null,
  });
});
