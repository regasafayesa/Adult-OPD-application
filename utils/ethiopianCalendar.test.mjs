import assert from 'node:assert/strict';
import test from 'node:test';
import { toEC, toGC } from 'kenat';
import {
  daysInEthiopianMonth,
  ethiopianDateToGregorianISO,
  formatEthiopianDate,
  getEthiopianDateParts,
  getEthiopianEncounterDateBounds,
  getEthiopianReportingPeriodBounds,
  getEthiopianReportingYearBounds,
  isEthiopianLeapYear,
  matchesEthiopianEncounterDate,
  matchesEthiopianReportingPeriod,
} from './ethiopianCalendar.js';

test('converts a known Gregorian date to Ethiopian and back', () => {
  assert.deepEqual(toEC(2025, 9, 19), { year: 2018, month: 1, day: 9 });
  assert.deepEqual(toGC(2018, 1, 8), { year: 2025, month: 9, day: 18 });
  assert.equal(ethiopianDateToGregorianISO({ year: 2018, month: 1, day: 8 }), '2025-09-18');
  assert.equal(formatEthiopianDate('2025-09-19'), '09 Meskerem 2018');
});

test('converts historical dates and round-trips the resulting date parts', () => {
  const ethiopian = getEthiopianDateParts('1910-01-01');
  const gregorian = ethiopianDateToGregorianISO(ethiopian);
  assert.equal(gregorian, '1910-01-01');
});

test('computes Ethiopian month boundaries with an exclusive end', () => {
  assert.deepEqual(getEthiopianEncounterDateBounds({ year: '2018', month: '1' }), {
    from: '2025-09-11',
    before: '2025-10-11',
  });
  assert.deepEqual(getEthiopianEncounterDateBounds({ year: '2018', month: '13' }), {
    from: '2026-09-06',
    before: '2026-09-11',
  });
  assert.deepEqual(getEthiopianEncounterDateBounds({ year: '2015', month: '13' }), {
    from: '2023-09-06',
    before: '2023-09-12',
  });
  assert.deepEqual(getEthiopianEncounterDateBounds({ year: '2016', month: '13' }), {
    from: '2024-09-06',
    before: '2024-09-11',
  });
});

test('computes inclusive reporting-period and reporting-year boundaries', () => {
  const hidar = getEthiopianReportingPeriodBounds({ year: '2019', month: '3' });
  const year = getEthiopianReportingYearBounds('2019');
  const meskeremAfterLeapPagume = getEthiopianReportingPeriodBounds({ year: '2016', month: '1' });

  assert.deepEqual(hidar, {
    from: ethiopianDateToGregorianISO({ year: 2019, month: 2, day: 21 }),
    through: ethiopianDateToGregorianISO({ year: 2019, month: 3, day: 20 }),
    before: ethiopianDateToGregorianISO({ year: 2019, month: 3, day: 21 }),
  });
  assert.equal(matchesEthiopianReportingPeriod(hidar.from, 2019, 3), true);
  assert.equal(matchesEthiopianReportingPeriod(hidar.through, 2019, 3), true);
  assert.equal(matchesEthiopianReportingPeriod(
    ethiopianDateToGregorianISO({ year: 2019, month: 3, day: 21 }),
    2019,
    3
  ), false);
  assert.equal(year.from, ethiopianDateToGregorianISO({ year: 2018, month: 12, day: 21 }));
  assert.equal(year.through, ethiopianDateToGregorianISO({ year: 2019, month: 12, day: 20 }));
  assert.equal(year.before, getEthiopianReportingPeriodBounds({ year: 2019, month: 12 }).before);
  assert.equal(matchesEthiopianReportingPeriod(
    ethiopianDateToGregorianISO({ year: 2015, month: 13, day: 6 }),
    2016,
    1
  ), true);
  assert.equal(matchesEthiopianReportingPeriod(
    ethiopianDateToGregorianISO({ year: 2016, month: 13, day: 5 }),
    2017,
    1
  ), true);
  assert.equal(meskeremAfterLeapPagume.from, ethiopianDateToGregorianISO({
    year: 2015,
    month: 12,
    day: 21,
  }));
});

test('supports five- and six-day Pagume and leap-year validation', () => {
  assert.equal(isEthiopianLeapYear(2015), true);
  assert.equal(daysInEthiopianMonth(2015, 13), 6);
  assert.equal(isEthiopianLeapYear(2016), false);
  assert.equal(daysInEthiopianMonth(2016, 13), 5);
  assert.equal(ethiopianDateToGregorianISO({ year: 2015, month: 13, day: 6 }), '2023-09-11');
  assert.equal(ethiopianDateToGregorianISO({ year: 2016, month: 13, day: 6 }), null);
});

test('uses the Addis Ababa date for timestamps without shifting date-only values', () => {
  const midnightInAddis = new Date('2025-09-18T21:00:00.000Z');
  assert.deepEqual(getEthiopianDateParts(midnightInAddis), { year: 2018, month: 1, day: 9 });
  assert.deepEqual(getEthiopianDateParts('2025-09-19'), { year: 2018, month: 1, day: 9 });
});

test('combines Ethiopian year, month, exact-date, and date-range filters', () => {
  const filters = {
    year: '2018',
    month: '1',
    date: { year: '', month: '', day: '' },
    startDate: { year: '2018', month: '1', day: '8' },
    endDate: { year: '2018', month: '1', day: '9' },
  };
  assert.equal(matchesEthiopianEncounterDate('2025-09-18', filters), true);
  assert.equal(matchesEthiopianEncounterDate('2025-09-19', filters), true);
  assert.equal(matchesEthiopianEncounterDate('2025-09-20', filters), false);
  assert.equal(matchesEthiopianEncounterDate('2025-09-18', {
    ...filters,
    date: { year: '2018', month: '1', day: '8' },
  }), true);
  assert.equal(matchesEthiopianEncounterDate('2025-09-19', {
    ...filters,
    date: { year: '2018', month: '1', day: '8' },
  }), false);
});
