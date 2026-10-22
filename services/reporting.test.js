import { generateMonthlyReport } from '../services/reporting';
import { buildMonthlyIctPdfRows, buildMonthlyIctTallyRows } from '../services/export';
import { enrichEncounter } from '../services/storage';

function record(partial) {
  return enrichEncounter({
    date: '2026-09-10',
    ...partial,
  });
}

describe('generateMonthlyReport', () => {
  const records = [
    record({ age: 7, sex: 'Female', diagnosis: 'UTI' }),
    record({ age: 19, sex: 'Male', diagnosis: 'UTI' }),
    record({ age: 27, sex: 'Female', diagnosis: 'Hypertension' }),
    record({ age: 45, sex: 'Male', diagnosis: 'Diabetes Mellitus' }),
    record({ age: 65, sex: 'Female', diagnosis: 'Hypertension' }),
    record({ age: 8, sex: 'Male', diagnosis: 'UTI' }),
  ];

  const report = generateMonthlyReport(records, 2026, 9);

  test('includes all age groups from age 5 in Adult totals', () => {
    expect(report.overall.total).toBe(6);
    expect(report.diagnoses.UTI.total.total).toBe(3);
  });

  test('classifies legacy records using age instead of saved Youth metadata', () => {
    const legacyRecord = {
      ...records.find((item) => item.age === 19),
      ageGroup: '10–24',
      opdCategory: 'Youth OPD',
      includedInAdultReport: false,
    };
    const legacyReport = generateMonthlyReport([legacyRecord], 2026, 9);

    expect(legacyReport.ageGroups['15–29'].total).toBe(1);
    expect(legacyReport.overall.total).toBe(1);
  });

  test('uses only the four Adult OPD age groups', () => {
    expect(Object.keys(report.ageGroups)).toEqual(['5–14', '15–29', '30–64', '≥65']);
    expect(report.ageGroups['5–14'].total).toBe(3);
    expect(report.ageGroups['15–29'].total).toBe(1);
    expect(report.ageGroups['30–64'].total).toBe(1);
    expect(report.ageGroups['≥65'].total).toBe(1);
  });

  test('breaks each diagnosis down by age group and sex', () => {
    expect(report.diagnoses.UTI['5–14']).toEqual({ male: 1, female: 2, total: 3 });
    expect(report.diagnoses.UTI['15–29']).toEqual({ male: 0, female: 0, total: 0 });
    expect(report.diagnoses.Hypertension.total).toEqual({ male: 0, female: 2, total: 2 });
  });

  test('builds the ICT tally rows with fixed and facility diagnoses', () => {
    const tallyRows = buildMonthlyIctTallyRows(report);
    const utiRow = tallyRows.find((row) => row.code === 'N39.0');
    const otherRow = tallyRows.find((row) => row.name === 'Diabetes Mellitus');

    expect(tallyRows.filter(({ code }) => code).map(({ code }) => code).sort()).toEqual([
      'A01', 'A09', 'B65-B83', 'E56.9', 'H66', 'J03', 'J18.9',
      'K02', 'K30', 'L30.9', 'N39.0', 'R51', 'T14.9',
    ]);
    expect(utiRow.counts[0]).toEqual({ male: 1, female: 2 });
    expect(utiRow.counts[1]).toEqual({ male: 1, female: 0 });
    expect(utiRow.counts[4]).toEqual({ male: 0, female: 0 });
    expect(otherRow.code).toBe('');
    expect(otherRow.counts[2]).toEqual({ male: 1, female: 0 });
  });

  test('orders monthly tally diagnoses by descending total count', () => {
    const frequencyRecords = [
      ...Array.from({ length: 45 }, () => record({ age: 30, sex: 'Female', diagnosis: 'Helminthiasis' })),
      ...Array.from({ length: 30 }, () => record({ age: 30, sex: 'Male', diagnosis: 'Typhoid fever' })),
    ];
    const frequencyReport = generateMonthlyReport(frequencyRecords, 2026, 9);
    const tallyRows = buildMonthlyIctTallyRows(frequencyReport);

    expect(tallyRows.slice(0, 2).map(({ name }) => name)).toEqual([
      'Helminthiasis',
      'Typhoid fever',
    ]);
    expect(tallyRows[0].counts.reduce((total, count) => total + count.male + count.female, 0)).toBe(45);
    expect(tallyRows[1].counts.reduce((total, count) => total + count.male + count.female, 0)).toBe(30);
  });

  test('includes only diagnoses with at least one case in monthly PDF rows', () => {
    const pdfRows = buildMonthlyIctPdfRows(report);

    expect(pdfRows.map(({ name }) => name)).not.toContain('Typhoid fever');
    expect(pdfRows.every(
      ({ counts }) => counts.reduce((total, count) => total + count.male + count.female, 0) > 0
    )).toBe(true);
  });

  test('validates that diagnosis and age-group totals match overall total', () => {
    expect(report.validation.valid).toBe(true);
    expect(report.overall).toEqual({ male: 3, female: 3, total: 6 });
  });

  test('recalculates after an age edit', () => {
    const edited = records.map((item) =>
      item.age === 19 ? enrichEncounter({ ...item, age: 30, sex: 'Male', diagnosis: 'UTI', date: item.date }, item) : item
    );
    const next = generateMonthlyReport(edited, 2026, 9);
    expect(next.overall.total).toBe(6);
    expect(next.diagnoses.UTI.total.total).toBe(3);
    expect(next.ageGroups['30–64'].total).toBe(2);
  });

  test('recalculates after a delete', () => {
    const remaining = records.filter((item) => item.age !== 45);
    const next = generateMonthlyReport(remaining, 2026, 9);
    expect(next.overall.total).toBe(4);
    expect(next.diagnoses['Diabetes Mellitus']).toBeUndefined();
  });
});
