import { ADULT_AGE_GROUPS, MONTH_NAMES } from '../constants.js';
import { classifyAge } from '../utils/ageClassification.js';
import {
  calculateMonthlyDiagnosisTotals,
  MONTHLY_DIAGNOSIS_AGE_GROUPS,
} from './monthlyDiagnosisCounts.mjs';
import {
  emptyAgeGroupTable,
  emptySexCounts,
  incrementSexCounts,
  rowAddsUp,
  sumAgeGroupTable,
} from '../utils/calculations.js';

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

function uniqueMonthlySummaries(summaries, year, month) {
  const uniqueSummaries = new Map();
  summaries.filter((summary) =>
    Number(summary.reportingYear) === Number(year)
    && (month === undefined || Number(summary.reportingMonth) === Number(month))
  ).forEach((summary) => {
    const key = `${summary.facilityId || ''}|${summary.reportingYear}|${summary.reportingMonth}|${summary.diagnosisId}`;
    const previous = uniqueSummaries.get(key);
    if (!previous || String(summary.updatedAt || '') > String(previous.updatedAt || '')) {
      uniqueSummaries.set(key, summary);
    }
  });
  return [...uniqueSummaries.values()];
}

export function generateMonthlyAggregateReport(summaries, year, month) {
  const matchingSummaries = uniqueMonthlySummaries(summaries, year, month);
  const ageGroups = Object.fromEntries(
    MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ key, label }) => [key, {
      label,
      male: 0,
      female: 0,
      total: 0,
    }])
  );
  let overall = emptySexCounts();
  const diagnoses = matchingSummaries.map((summary) => {
    const totals = calculateMonthlyDiagnosisTotals(summary);
    MONTHLY_DIAGNOSIS_AGE_GROUPS.forEach(({ key }) => {
      const group = totals.ageGroups[key];
      ageGroups[key].male += group.male;
      ageGroups[key].female += group.female;
      ageGroups[key].total += group.total;
    });
    overall = {
      male: overall.male + totals.male,
      female: overall.female + totals.female,
      total: overall.total + totals.total,
    };
    return {
      ...summary,
      totals,
    };
  }).sort((left, right) =>
    left.diagnosisName.localeCompare(right.diagnosisName)
  );

  return {
    year: Number(year),
    month: Number(month),
    diagnoses,
    ageGroups,
    overall,
    summaryCount: diagnoses.length,
  };
}

export function generateYearlyAggregateReport(summaries, year) {
  const matchingSummaries = uniqueMonthlySummaries(summaries, year);
  const months = MONTH_NAMES.map((monthName, index) => {
    const report = generateMonthlyAggregateReport(matchingSummaries, year, index + 1);
    return {
      month: monthName,
      monthNumber: index + 1,
      male: report.overall.male,
      female: report.overall.female,
      total: report.overall.total,
    };
  });
  const diagnosesById = new Map();
  matchingSummaries.forEach((summary) => {
    const totals = calculateMonthlyDiagnosisTotals(summary);
    const identity = summary.diagnosisCode
      ? `code:${String(summary.diagnosisCode).trim().toLocaleUpperCase()}`
      : `id:${summary.diagnosisId}`;
    const current = diagnosesById.get(identity) || {
      diagnosisId: summary.diagnosisId,
      diagnosisName: summary.diagnosisName,
      diagnosisCode: summary.diagnosisCode,
      male: 0,
      female: 0,
      total: 0,
      months: Array(12).fill(0),
      ageGroups: Object.fromEntries(MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ key }) => [key, {
        male: 0,
        female: 0,
        total: 0,
      }])),
    };
    current.male += totals.male;
    current.female += totals.female;
    current.total += totals.total;
    current.months[Number(summary.reportingMonth) - 1] += totals.total;
    MONTHLY_DIAGNOSIS_AGE_GROUPS.forEach(({ key }) => {
      current.ageGroups[key].male += totals.ageGroups[key].male;
      current.ageGroups[key].female += totals.ageGroups[key].female;
      current.ageGroups[key].total += totals.ageGroups[key].total;
    });
    diagnosesById.set(identity, current);
  });
  const ageGroups = Object.fromEntries(
    MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ key, label }) => [key, {
      label,
      male: 0,
      female: 0,
      total: 0,
    }])
  );
  diagnosesById.forEach((diagnosis) => {
    MONTHLY_DIAGNOSIS_AGE_GROUPS.forEach(({ key }) => {
      ageGroups[key].male += diagnosis.ageGroups[key].male;
      ageGroups[key].female += diagnosis.ageGroups[key].female;
      ageGroups[key].total += diagnosis.ageGroups[key].total;
    });
  });
  const overall = months.reduce((result, row) => ({
    male: result.male + row.male,
    female: result.female + row.female,
    total: result.total + row.total,
  }), emptySexCounts());

  return {
    year: Number(year),
    months,
    diagnoses: [...diagnosesById.values()].sort((a, b) =>
      b.total - a.total || a.diagnosisName.localeCompare(b.diagnosisName)
    ),
    ageGroups,
    overall,
    summaryCount: matchingSummaries.length,
  };
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
    warnings.push('Sum of age-group totals does not match overall OPD total.');
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
    warnings.push('Sum of diagnosis totals does not match overall OPD total.');
  }

  if (adultCount !== overall.total) {
    warnings.push('Overall total does not match the number of OPD records.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

function diagnosisMetadata(record, diagnoses) {
  const diagnosisCatalog = Array.isArray(diagnoses) ? diagnoses : [];
  return diagnosisCatalog.find((diagnosis) => diagnosis.id === record.diagnosisId)
    || diagnosisCatalog.find((diagnosis) =>
      diagnosis.name.toLocaleLowerCase() === String(record.diagnosis || '').toLocaleLowerCase()
    );
}

const COMBINED_AGE_GROUPS = [
  { key: 'below1', label: 'Below 1 year', encounterKey: null, aggregateKey: 'below1' },
  { key: 'months12To59', label: '12–59 months', encounterKey: null, aggregateKey: 'months12To59' },
  { key: 'years5To14', label: '5–14 years', encounterKey: '5–14', aggregateKey: 'years5To14' },
  { key: 'years15To29', label: '15–29 years', encounterKey: '15–29', aggregateKey: 'years15To29' },
  { key: 'years30To64', label: '30–64 years', encounterKey: '30–64', aggregateKey: 'years30To64' },
  { key: 'years65Plus', label: '65 years and above', encounterKey: '≥65', aggregateKey: 'years65Plus' },
];

function combinedDiagnosisIdentity({ diagnosisId, diagnosisCode, diagnosisName }) {
  if (diagnosisCode) return `code:${String(diagnosisCode).trim().toLocaleUpperCase()}`;
  if (diagnosisId) return `id:${String(diagnosisId).replace(/^official:/, '')}`;
  return `name:${String(diagnosisName || '').trim().toLocaleLowerCase()}`;
}

function createCombinedDiagnosis(metadata) {
  return {
    diagnosisId: metadata.diagnosisId || '',
    diagnosisCode: metadata.diagnosisCode || '',
    diagnosisName: metadata.diagnosisName || 'Unspecified',
    male: 0,
    female: 0,
    total: 0,
    ageGroups: Object.fromEntries(COMBINED_AGE_GROUPS.map(({ key, label }) => [key, {
      label,
      male: 0,
      female: 0,
      total: 0,
    }])),
  };
}

function addCombinedDiagnosisCount(diagnoses, metadata, ageKey, sex, count) {
  const identity = combinedDiagnosisIdentity(metadata);
  if (!diagnoses.has(identity)) diagnoses.set(identity, createCombinedDiagnosis(metadata));
  const diagnosis = diagnoses.get(identity);
  diagnosis[sex] += count;
  diagnosis.total += count;
  if (ageKey) {
    diagnosis.ageGroups[ageKey][sex] += count;
    diagnosis.ageGroups[ageKey].total += count;
  }
}

function combineMonthlyCounts(report) {
  const ageGroups = Object.fromEntries(COMBINED_AGE_GROUPS.map(({ key, label }) => [key, {
    label,
    male: 0,
    female: 0,
    total: 0,
  }]));
  const diagnoses = new Map();
  const overall = {
    male: report.overall.male + report.aggregate.overall.male,
    female: report.overall.female + report.aggregate.overall.female,
    total: report.overall.total + report.aggregate.overall.total,
  };

  COMBINED_AGE_GROUPS.forEach(({ key, label, encounterKey, aggregateKey }) => {
    const encounterCounts = encounterKey ? report.ageGroups[encounterKey] : emptySexCounts();
    const aggregateCounts = report.aggregate.ageGroups[aggregateKey];
    ageGroups[key] = {
      label,
      male: encounterCounts.male + aggregateCounts.male,
      female: encounterCounts.female + aggregateCounts.female,
      total: encounterCounts.total + aggregateCounts.total,
    };
  });

  Object.entries(report.diagnoses).forEach(([name, block]) => {
    const metadata = {
      diagnosisId: block.diagnosisId,
      diagnosisCode: block.diagnosisCode,
      diagnosisName: block.canonicalDiagnosisName || name,
    };
    COMBINED_AGE_GROUPS.forEach(({ key, encounterKey }) => {
      if (!encounterKey) return;
      addCombinedDiagnosisCount(diagnoses, metadata, key, 'male', block[encounterKey].male);
      addCombinedDiagnosisCount(diagnoses, metadata, key, 'female', block[encounterKey].female);
    });
  });

  report.aggregate.diagnoses.forEach((entry) => {
    const metadata = {
      diagnosisId: entry.diagnosisId,
      diagnosisCode: entry.diagnosisCode,
      diagnosisName: entry.diagnosisName,
    };
    COMBINED_AGE_GROUPS.forEach(({ key, aggregateKey }) => {
      const group = entry.totals.ageGroups[aggregateKey];
      addCombinedDiagnosisCount(diagnoses, metadata, key, 'male', group.male);
      addCombinedDiagnosisCount(diagnoses, metadata, key, 'female', group.female);
    });
  });

  return {
    overall,
    ageGroups,
    diagnoses: [...diagnoses.values()]
      .filter((diagnosis) => diagnosis.total > 0)
      .sort((left, right) =>
        right.total - left.total || left.diagnosisName.localeCompare(right.diagnosisName)
      ),
  };
}

export function generateMonthlyReport(records, year, month, aggregateSummaries = [], diagnosisCatalog = []) {
  const monthRecords = recordsForMonth(records, year, month);
  const adultRecords = monthRecords.filter(isAdultRecord);
  const outsideRecords = monthRecords.filter((record) => !isAdultRecord(record));
  let overall = emptySexCounts();
  const ageGroups = emptyAgeGroupTable();
  const diagnosesByIdentity = new Map();

  adultRecords.forEach((record) => {
    const ageGroup = classifyAge(record.age).ageGroup;
    overall = incrementSexCounts(overall, record.sex);
    ageGroups[ageGroup] = incrementSexCounts(ageGroups[ageGroup], record.sex);

    const diagnosisName = record.diagnosis || 'Unspecified';
    const metadata = diagnosisMetadata(record, diagnosisCatalog);
    const diagnosisCode = metadata?.code || record.diagnosisCode;
    const diagnosisId = metadata?.id || record.diagnosisId;
    const diagnosisIdentity = diagnosisCode
      ? `code:${String(diagnosisCode).trim().toLocaleUpperCase()}`
      : diagnosisId
        ? `id:${diagnosisId}`
        : `name:${diagnosisName.toLocaleLowerCase()}`;
    if (!diagnosesByIdentity.has(diagnosisIdentity)) {
      diagnosesByIdentity.set(diagnosisIdentity, {
        ...emptyAgeGroupTable(),
        total: emptySexCounts(),
        diagnosisId: diagnosisId || '',
        diagnosisCode: diagnosisCode || '',
        canonicalDiagnosisName: metadata?.name || diagnosisName,
      });
    }
    const diagnosis = diagnosesByIdentity.get(diagnosisIdentity);
    diagnosis[ageGroup] = incrementSexCounts(
      diagnosis[ageGroup],
      record.sex
    );
    diagnosis.total = incrementSexCounts(diagnosis.total, record.sex);
  });

  const sortedDiagnoses = {};
  [...diagnosesByIdentity.entries()]
    .sort(([, left], [, right]) =>
      left.canonicalDiagnosisName.localeCompare(right.canonicalDiagnosisName)
      || left.diagnosisCode.localeCompare(right.diagnosisCode)
    )
    .forEach(([identity, diagnosis]) => {
      const name = diagnosis.canonicalDiagnosisName;
      const key = Object.hasOwn(sortedDiagnoses, name)
        ? `${name} (${diagnosis.diagnosisCode || diagnosis.diagnosisId || identity})`
        : name;
      sortedDiagnoses[key] = diagnosis;
    });

  const validation = validateReport({
    overall,
    ageGroups,
    diagnoses: sortedDiagnoses,
    adultCount: adultRecords.length,
  });

  const report = {
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
    aggregate: generateMonthlyAggregateReport(aggregateSummaries, year, month),
  };
  report.combined = combineMonthlyCounts(report);
  return report;
}

export function generateYearlyReport(records, year, aggregateSummaries = [], diagnosisCatalog = []) {
  const yearRecords = recordsForYear(records, year);
  const monthlyReports = MONTH_NAMES.map((_, index) => {
    return generateMonthlyReport(records, year, index + 1, aggregateSummaries, diagnosisCatalog);
  });
  const months = monthlyReports.map((monthly, index) => ({
    month: MONTH_NAMES[index],
    monthNumber: index + 1,
    male: monthly.combined.overall.male,
    female: monthly.combined.overall.female,
    total: monthly.combined.overall.total,
    encounterMale: monthly.overall.male,
    encounterFemale: monthly.overall.female,
    encounterTotal: monthly.overall.total,
  }));

  const yearTotal = months.reduce(
    (sum, row) => ({
      male: sum.male + row.male,
      female: sum.female + row.female,
      total: sum.total + row.total,
    }),
    emptySexCounts()
  );
  const encounterYearTotal = months.reduce((sum, row) => ({
    male: sum.male + row.encounterMale,
    female: sum.female + row.encounterFemale,
    total: sum.total + row.encounterTotal,
  }), emptySexCounts());
  const ageGroups = Object.fromEntries(COMBINED_AGE_GROUPS.map(({ key, label }) => [key, {
    label,
    male: 0,
    female: 0,
    total: 0,
  }]));
  monthlyReports.forEach((monthly) => {
    COMBINED_AGE_GROUPS.forEach(({ key }) => {
      ageGroups[key].male += monthly.combined.ageGroups[key].male;
      ageGroups[key].female += monthly.combined.ageGroups[key].female;
      ageGroups[key].total += monthly.combined.ageGroups[key].total;
    });
  });
  const adultRecords = yearRecords.filter(isAdultRecord);
  const combinedDiagnoses = new Map();
  monthlyReports.forEach((monthly, index) => {
    monthly.combined.diagnoses.forEach((diagnosis) => {
      const identity = combinedDiagnosisIdentity(diagnosis);
      if (!combinedDiagnoses.has(identity)) {
        combinedDiagnoses.set(identity, {
          diagnosisId: diagnosis.diagnosisId,
          diagnosisCode: diagnosis.diagnosisCode,
          diagnosisName: diagnosis.diagnosisName,
          male: 0,
          female: 0,
          total: 0,
          months: Array(12).fill(0),
        });
      }
      const yearlyDiagnosis = combinedDiagnoses.get(identity);
      yearlyDiagnosis.male += diagnosis.male;
      yearlyDiagnosis.female += diagnosis.female;
      yearlyDiagnosis.total += diagnosis.total;
      yearlyDiagnosis.months[index] += diagnosis.total;
    });
  });
  const sortedCombinedDiagnoses = [...combinedDiagnoses.values()].sort((left, right) =>
    right.total - left.total || left.diagnosisName.localeCompare(right.diagnosisName)
  );
  const diagnoses = {};
  const diagnosisByMonth = {};
  sortedCombinedDiagnoses.forEach((diagnosis) => {
    const name = Object.hasOwn(diagnoses, diagnosis.diagnosisName)
      ? `${diagnosis.diagnosisName} (${diagnosis.diagnosisCode || diagnosis.diagnosisId})`
      : diagnosis.diagnosisName;
    diagnoses[name] = {
      male: diagnosis.male,
      female: diagnosis.female,
      total: diagnosis.total,
      diagnosisId: diagnosis.diagnosisId,
      diagnosisCode: diagnosis.diagnosisCode,
    };
    diagnosisByMonth[name] = diagnosis.months;
  });
  const sortedDiagnosisSummary = Object.fromEntries(
    Object.entries(diagnoses).sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
  );

  return {
    year: Number(year),
    months,
    yearTotal,
    ageGroups,
    encounterYearTotal,
    combinedYearTotal: yearTotal,
    diagnoses: sortedDiagnosisSummary,
    diagnosisByMonth,
    adultCount: adultRecords.length,
    validation: {
      valid: encounterYearTotal.male + encounterYearTotal.female === encounterYearTotal.total
        && encounterYearTotal.total === adultRecords.length,
      warnings:
        encounterYearTotal.total === adultRecords.length
          ? []
          : ['Individual encounter total does not match OPD records for the selected year.'],
    },
    aggregate: generateYearlyAggregateReport(aggregateSummaries, year),
  };
}

export function generateDashboardStats(records, year, month, aggregateSummaries = [], diagnosisCatalog = []) {
  const monthly = generateMonthlyReport(records, year, month, aggregateSummaries, diagnosisCatalog);
  const yearly = generateYearlyReport(records, year, aggregateSummaries, diagnosisCatalog);

  return {
    monthly,
    yearly,
    diagnosisBars: monthly.combined.diagnoses
      .map(({ diagnosisName, diagnosisCode, diagnosisId, total }) => ({
        name: diagnosisCode ? `${diagnosisCode} — ${diagnosisName}` : diagnosisName || diagnosisId,
        total,
      })),
    trend: yearly.months.map((row) => ({
      month: row.month.slice(0, 3),
      total: row.total,
    })),
  };
}
