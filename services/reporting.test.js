import { generateMonthlyReport } from '../services/reporting';
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
