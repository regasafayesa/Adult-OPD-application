import { ADULT_AGE_GROUPS, MONTH_NAMES } from '../constants';
import { classifyAge } from '../utils/ageClassification';
import {
  emptyAgeGroupTable,
  emptySexCounts,
  incrementSexCounts,
  rowAddsUp,
  sumAgeGroupTable,
} from '../utils/calculations';

export function isAdultRecord(record) {
  return classifyAge(record?.age).includedInAdultReport;
}

function recordsForMonth(records, year, month) {
  return records.filter(
    (record) => record.reportingYear === Number(year) && record.reportingMonth === Number(month)
  );
}

function recordsForYear(records, year) {
  return records.filter((record) => record.reportingYear === Number(year));
}

function validateReport({ overall, ageGroups, diagnoses, adultCount }) {
  const warnings = [];

  ADULT_AGE_GROUPS.forEach((group) => {
    if (!rowAddsUp(ageGroups[group])) {
      warnings.push(`Age group ${group}: Male + Female does not equal Total.`);
    }
  });

  const ageGroupSum = sumAgeGroupTable(ageGroups);
  if (ageGroupSum.total !== overall.total || ageGroupSum.male !== overall.male || ageGroupSum.female !== overall.female) {
    warnings.push('Sum of age-group totals does not match overall Adult OPD total.');
  }

  if (!rowAddsUp(overall)) {
    warnings.push('Overall Male + Female does not equal Total.');
  }

  let diagnosisSum = emptySexCounts();
  Object.entries(diagnoses).forEach(([name, block]) => {
    ADULT_AGE_GROUPS.forEach((group) => {
      if (!rowAddsUp(block[group])) {
        warnings.push(`${name} / ${group}: Male + Female does not equal Total.`);
      }
    });
    const blockSum = sumAgeGroupTable(block);
    if (blockSum.total !== block.total.total || blockSum.male !== block.total.male || blockSum.female !== block.total.female) {
      warnings.push(`${name}: diagnosis total does not equal the sum of age groups.`);
    }
    diagnosisSum = {
      male: diagnosisSum.male + block.total.male,
      female: diagnosisSum.female + block.total.female,
      total: diagnosisSum.total + block.total.total,
    };
  });

  if (diagnosisSum.total !== overall.total || diagnosisSum.male !== overall.male || diagnosisSum.female !== overall.female) {
    warnings.push('Sum of diagnosis totals does not match overall Adult OPD total.');
  }

  if (adultCount !== overall.total) {
    warnings.push('Overall total does not match the number of Adult OPD records.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

export function generateMonthlyReport(records, year, month) {
  const monthRecords = recordsForMonth(records, year, month);
  const adultRecords = monthRecords.filter(isAdultRecord);
  const outsideRecords = monthRecords.filter((record) => !isAdultRecord(record));

  let overall = emptySexCounts();
  const ageGroups = emptyAgeGroupTable();
  const diagnoses = {};

  adultRecords.forEach((record) => {
    const ageGroup = classifyAge(record.age).ageGroup;
    overall = incrementSexCounts(overall, record.sex);
    ageGroups[ageGroup] = incrementSexCounts(ageGroups[ageGroup], record.sex);

    const diagnosisName = record.diagnosis || 'Unspecified';
    if (!diagnoses[diagnosisName]) {
      diagnoses[diagnosisName] = {
        ...emptyAgeGroupTable(),
        total: emptySexCounts(),
      };
    }
    diagnoses[diagnosisName][ageGroup] = incrementSexCounts(
      diagnoses[diagnosisName][ageGroup],
      record.sex
    );
    diagnoses[diagnosisName].total = incrementSexCounts(diagnoses[diagnosisName].total, record.sex);
  });

  const sortedDiagnoses = Object.fromEntries(
    Object.entries(diagnoses).sort(([a], [b]) => a.localeCompare(b))
  );

  const validation = validateReport({
    overall,
    ageGroups,
    diagnoses: sortedDiagnoses,
    adultCount: adultRecords.length,
  });

  return {
    month: MONTH_NAMES[Number(month) - 1],
    monthNumber: Number(month),
    year: Number(year),
    overall,
    ageGroups,
    diagnoses: sortedDiagnoses,
    outsideCount: outsideRecords.length,
    recordCount: monthRecords.length,
    adultCount: adultRecords.length,
    validation,
  };
}

export function generateYearlyReport(records, year) {
  const yearRecords = recordsForYear(records, year);
  const months = MONTH_NAMES.map((name, index) => {
    const monthNumber = index + 1;
    const monthly = generateMonthlyReport(records, year, monthNumber);
    return {
      month: name,
      monthNumber,
      male: monthly.overall.male,
      female: monthly.overall.female,
      total: monthly.overall.total,
    };
  });

  const yearTotal = months.reduce(
    (sum, row) => ({
      male: sum.male + row.male,
      female: sum.female + row.female,
      total: sum.total + row.total,
    }),
    emptySexCounts()
  );

  const adultRecords = yearRecords.filter(isAdultRecord);
  const diagnosisSummary = {};
  const diagnosisByMonth = {};

  adultRecords.forEach((record) => {
    const name = record.diagnosis || 'Unspecified';
    if (!diagnosisSummary[name]) diagnosisSummary[name] = emptySexCounts();
    diagnosisSummary[name] = incrementSexCounts(diagnosisSummary[name], record.sex);

    if (!diagnosisByMonth[name]) {
      diagnosisByMonth[name] = MONTH_NAMES.map(() => 0);
    }
    diagnosisByMonth[name][record.reportingMonth - 1] += 1;
  });

  const sortedDiagnosisSummary = Object.fromEntries(
    Object.entries(diagnosisSummary).sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
  );

  return {
    year: Number(year),
    months,
    yearTotal,
    diagnoses: sortedDiagnosisSummary,
    diagnosisByMonth,
    adultCount: adultRecords.length,
    validation: {
      valid: yearTotal.male + yearTotal.female === yearTotal.total && yearTotal.total === adultRecords.length,
      warnings:
        yearTotal.total === adultRecords.length
          ? []
          : ['Year total does not match Adult OPD records for the selected year.'],
    },
  };
}

export function generateDashboardStats(records, year, month) {
  const monthly = generateMonthlyReport(records, year, month);
  const yearly = generateYearlyReport(records, year);

  return {
    monthly,
    yearly,
    diagnosisBars: Object.entries(monthly.diagnoses)
      .map(([name, block]) => ({ name, total: block.total.total }))
      .sort((a, b) => b.total - a.total),
    trend: yearly.months.map((row) => ({
      month: row.month.slice(0, 3),
      total: row.total,
    })),
  };
}
