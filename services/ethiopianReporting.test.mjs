import assert from 'node:assert/strict';
import test from 'node:test';
import { generateMonthlyReport, generateYearlyReport } from './reporting.js';
import { emptyMonthlyDiagnosisCounts } from './monthlyDiagnosisCounts.mjs';
import { reportingPeriodFromDate } from '../utils/dates.js';
import { ethiopianDateToGregorianISO } from '../utils/ethiopianCalendar.js';

function encounter(isoDate, overrides = {}) {
  return {
    date: isoDate,
    ...reportingPeriodFromDate(isoDate),
    age: 30,
    sex: 'Female',
    diagnosis: 'Malaria',
    ...overrides,
  };
}

function aggregate(overrides = {}) {
  return {
    id: 'monthly-1',
    facilityId: 'facility-1',
    reportingYear: 2019,
    reportingMonth: 1,
    reportingCalendar: 'ethiopian',
    diagnosisId: 'official:esv1-1A07',
    diagnosisName: 'Malaria',
    diagnosisCode: '1F40',
    ...emptyMonthlyDiagnosisCounts(),
    ...overrides,
  };
}

test('groups encounters into reporting periods across the Ethiopian new year', () => {
  const records = [
    encounter('2026-09-11', { sex: 'Male', age: 40 }),
    encounter('2026-09-10', { diagnosis: 'Typhoid fever' }),
    encounter('2026-11-13', { diagnosis: 'Hypertension' }),
  ];
  const meskerem = generateMonthlyReport(records, 2019, 1);
  const hidar = generateMonthlyReport(records, 2019, 3);

  assert.equal(meskerem.month, 'Meskerem');
  assert.equal(meskerem.overall.total, 2);
  assert.equal(meskerem.overall.male, 1);
  assert.equal(meskerem.ageGroups['30–64'].total, 2);
  assert.equal(meskerem.periodRange.label, '21 Nehase 2018 – 20 Meskerem 2019');
  assert.equal(hidar.month, 'Hidar');
  assert.equal(hidar.overall.total, 1);
  assert.equal(hidar.diagnoses.Hypertension.total.total, 1);
});

test('filters encounters by inclusive report dates rather than saved calendar-month fields', () => {
  const date = (month, day) => ethiopianDateToGregorianISO({ year: 2019, month, day });
  const records = [
    encounter(date(2, 20), { reportingYear: 2019, reportingMonth: 3 }),
    encounter(date(2, 21), { reportingYear: 2019, reportingMonth: 2 }),
    encounter(date(3, 20), { reportingYear: 2018, reportingMonth: 13 }),
    encounter(date(3, 21), { reportingYear: 2019, reportingMonth: 3 }),
  ];
  const report = generateMonthlyReport(records, 2019, 3);

  assert.equal(report.recordCount, 2);
  assert.equal(report.overall.total, 2);
  assert.equal(generateMonthlyReport(records, 2019, 2).recordCount, 1);
});

test('reconciles the Ethiopian year with its twelve monthly reporting periods', () => {
  const records = [
    encounter('2026-09-11', { sex: 'Male' }),
    encounter('2026-11-13', { age: 70, diagnosis: 'Hypertension' }),
    encounter('2026-09-10', { diagnosis: 'Typhoid fever' }),
  ];
  const yearly = generateYearlyReport(records, 2019);

  assert.equal(yearly.months.length, 12);
  assert.equal(yearly.months[0].month, 'Meskerem');
  assert.equal(yearly.months[2].month, 'Hidar');
  assert.equal(yearly.months[11].month, 'Nehase');
  assert.equal(yearly.months[0].encounterTotal, 2);
  assert.equal(yearly.months[2].encounterTotal, 1);
  assert.equal(yearly.encounterYearTotal.total, 3);
  assert.equal(yearly.yearTotal.total, 3);
  assert.equal(yearly.periodRange.label, '21 Nehase 2018 – 20 Nehase 2019');
  assert.equal(yearly.validation.valid, true);
  assert.equal(
    yearly.months.reduce((sum, month) => sum + month.total, 0),
    yearly.yearTotal.total
  );
});

test('adds Ethiopian aggregate counts once and leaves Gregorian aggregate rows out', () => {
  const records = [encounter('2026-09-11', { sex: 'Male', age: 40, diagnosisCode: '1F40', diagnosisId: 'facility-malaria' })];
  const ethiopian = aggregate({
    years30To64Male: '4',
    below1Female: '2',
  });
  const duplicate = { ...ethiopian, id: 'duplicate', below1Female: '9' };
  const gregorian = aggregate({
    id: 'legacy-october',
    reportingCalendar: 'gregorian',
    reportingYear: 2026,
    reportingMonth: 10,
    years30To64Female: '50',
  });

  const monthly = generateMonthlyReport(records, 2019, 1, [ethiopian, duplicate, gregorian]);
  const yearly = generateYearlyReport(records, 2019, [ethiopian, duplicate, gregorian]);
  const wrongGregorianMonth = generateMonthlyReport(records, 2026, 10, [gregorian]);

  assert.deepEqual(monthly.combined.overall, { male: 5, female: 2, total: 7 });
  assert.equal(monthly.combined.ageGroups.below1.female, 2);
  assert.equal(monthly.combined.ageGroups.years30To64.male, 5);
  assert.equal(monthly.overall.total, 1);
  assert.equal(monthly.aggregate.overall.total, 6);
  assert.equal('legacyAggregateMessage' in monthly, false);
  assert.equal('legacyAggregateMessage' in yearly, false);
  assert.equal(wrongGregorianMonth.combined.overall.total, 0);
  assert.equal(yearly.yearTotal.total, 7);
  assert.equal(yearly.months[0].total, 7);
  assert.equal(yearly.months.reduce((sum, month) => sum + month.total, 0), yearly.yearTotal.total);
  assert.equal(yearly.encounterYearTotal.total, 1);
});
