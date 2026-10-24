import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDashboardStats, generateMonthlyReport, generateYearlyReport } from './reporting.js';
import { emptyMonthlyDiagnosisCounts } from './monthlyDiagnosisCounts.mjs';
import { buildMonthlyIctTallyRows, buildMonthlyIctPdfRows, tallyMarks } from './export.js';

function aggregate(overrides = {}) {
  return {
    id: 'monthly-1',
    facilityId: 'facility-1',
    reportingYear: 2026,
    reportingMonth: 10,
    diagnosisId: 'official:esv1-1A07',
    diagnosisName: 'Typhoid fever',
    diagnosisCode: '1A07',
    ...emptyMonthlyDiagnosisCounts(),
    ...overrides,
  };
}

test('keeps aggregate totals separate from encounter-only statistics and accepts under-five ages', () => {
  const report = generateMonthlyReport([
    { date: '2026-10-04', reportingYear: 2026, reportingMonth: 10, age: 30, sex: 'Female', diagnosis: 'Typhoid fever' },
  ], 2026, 10, [
    aggregate({ below1Female: '2', months12To59Male: '3', years5To14Female: '4' }),
  ]);

  assert.equal(report.overall.total, 1);
  assert.equal(report.aggregate.overall.total, 9);
  assert.equal(report.aggregate.ageGroups.below1.female, 2);
  assert.equal(report.aggregate.ageGroups.months12To59.male, 3);
  assert.equal(report.aggregate.diagnoses[0].totals.female, 6);
  assert.equal(report.aggregate.diagnoses[0].totals.male, 3);
});

test('merges aggregate and encounter counts into one canonical diagnosis row across all cells', () => {
  const encounter = {
    date: '2026-10-04',
    reportingYear: 2026,
    reportingMonth: 10,
    age: 30,
    sex: 'Male',
    diagnosis: 'Typhoid encounter label',
    diagnosisId: 'facility-typhoid',
    diagnosisCode: '1A07',
  };
  const summary = aggregate({
    diagnosisName: 'Typhoid aggregate label',
    below1Female: '1',
    below1Male: '2',
    months12To59Female: '3',
    months12To59Male: '4',
    years5To14Female: '5',
    years5To14Male: '6',
    years15To29Female: '7',
    years15To29Male: '8',
    years30To64Female: '9',
    years30To64Male: '10',
    years65PlusFemale: '11',
    years65PlusMale: '12',
  });
  const catalog = [{ id: 'facility-typhoid', name: 'Typhoid encounter label', code: '1A07' }];
  const report = generateMonthlyReport([encounter], 2026, 10, [summary], catalog);
  const rows = buildMonthlyIctTallyRows(report);
  const pdfRows = buildMonthlyIctPdfRows(report);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, '1A07');
  assert.equal(rows[0].hasAggregate, true);
  assert.deepEqual(rows[0].counts, [
    { male: 2, female: 1 },
    { male: 4, female: 3 },
    { male: 6, female: 5 },
    { male: 8, female: 7 },
    { male: 11, female: 9 },
    { male: 12, female: 11 },
  ]);
  assert.equal(tallyMarks(rows[0].counts[5].male), tallyMarks(12));
  assert.deepEqual(pdfRows, rows);
});

test('includes aggregate-only diagnoses and counts duplicate summaries once', () => {
  const summary = aggregate({ below1Female: '2', years5To14Male: '4' });
  const duplicate = { ...summary, id: 'duplicate', below1Female: '200' };
  const report = generateMonthlyReport([], 2026, 10, [summary, duplicate]);
  const rows = buildMonthlyIctTallyRows(report);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Typhoid fever');
  assert.deepEqual(rows[0].counts[0], { male: 0, female: 2 });
  assert.deepEqual(rows[0].counts[2], { male: 4, female: 0 });
  assert.equal(rows[0].counts.flatMap(({ male, female }) => [male, female]).reduce((sum, count) => sum + count, 0), 6);
});

test('keeps distinct catalog diagnoses separate when their display names match', () => {
  const encounters = [
    {
      reportingYear: 2026,
      reportingMonth: 10,
      age: 30,
      sex: 'Male',
      diagnosis: 'Same display name',
      diagnosisId: 'facility-dx-a',
      diagnosisCode: 'A01',
    },
    {
      reportingYear: 2026,
      reportingMonth: 10,
      age: 30,
      sex: 'Female',
      diagnosis: 'Same display name',
      diagnosisId: 'facility-dx-b',
      diagnosisCode: 'B02',
    },
  ];
  const catalog = [
    { id: 'facility-dx-a', name: 'Same display name', code: 'A01' },
    { id: 'facility-dx-b', name: 'Same display name', code: 'B02' },
  ];
  const report = generateMonthlyReport(encounters, 2026, 10, [], catalog);
  const rows = buildMonthlyIctTallyRows(report);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(({ code }) => code).sort(), ['A01', 'B02']);
  assert.deepEqual(rows.map((row) => row.counts[4]).sort((left, right) => left.male - right.male), [
    { male: 0, female: 1 },
    { male: 1, female: 0 },
  ]);
});

test('yearly aggregate summaries retain their source totals while contributing to combined year totals', () => {
  const report = generateYearlyReport([], 2026, [
    aggregate({ below1Female: '2', years65PlusMale: '1' }),
    aggregate({
      id: 'monthly-2',
      reportingMonth: 11,
      below1Female: '3',
      years65PlusMale: '4',
    }),
  ]);

  assert.equal(report.yearTotal.total, 10);
  assert.equal(report.encounterYearTotal.total, 0);
  assert.equal(report.ageGroups.below1.female, 5);
  assert.equal(report.ageGroups.years65Plus.male, 5);
  assert.equal(report.aggregate.overall.total, 10);
  assert.equal(report.aggregate.months[9].total, 3);
  assert.equal(report.aggregate.months[10].total, 7);
  assert.equal(report.aggregate.diagnoses[0].ageGroups.below1.female, 5);
  assert.equal(report.aggregate.diagnoses[0].ageGroups.years65Plus.male, 5);
});

test('dashboard and yearly totals combine encounters and aggregate counts exactly once', () => {
  const records = [{
    date: '2026-10-04',
    reportingYear: 2026,
    reportingMonth: 10,
    age: 30,
    sex: 'Male',
    diagnosis: 'Typhoid fever',
    diagnosisId: 'facility-typhoid',
    diagnosisCode: '1A07',
  }];
  const summary = aggregate({
    below1Female: '2',
    years30To64Female: '3',
  });
  const duplicate = { ...summary, id: 'duplicate', below1Female: '200' };

  const dashboard = generateDashboardStats(records, 2026, 10, [summary, duplicate]);
  const yearly = generateYearlyReport(records, 2026, [summary, duplicate]);
  const diagnosis = Object.values(yearly.diagnoses)[0];

  assert.deepEqual(dashboard.monthly.combined.overall, { male: 1, female: 5, total: 6 });
  assert.equal(dashboard.monthly.combined.ageGroups.below1.female, 2);
  assert.equal(dashboard.monthly.combined.ageGroups.years30To64.female, 3);
  assert.equal(dashboard.diagnosisBars.length, 1);
  assert.equal(dashboard.diagnosisBars[0].total, 6);
  assert.equal(dashboard.trend[9].total, 6);
  assert.deepEqual(yearly.yearTotal, { male: 1, female: 5, total: 6 });
  assert.deepEqual(yearly.encounterYearTotal, { male: 1, female: 0, total: 1 });
  assert.equal(yearly.ageGroups.below1.female, 2);
  assert.equal(yearly.ageGroups.years30To64.total, 4);
  assert.deepEqual(
    { male: diagnosis.male, female: diagnosis.female, total: diagnosis.total },
    { male: 1, female: 5, total: 6 }
  );
  assert.equal(yearly.diagnosisByMonth['Typhoid fever'][9], 6);
});
