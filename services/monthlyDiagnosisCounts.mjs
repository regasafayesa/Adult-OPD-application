export const MONTHLY_DIAGNOSIS_AGE_GROUPS = [
  { key: 'below1', label: 'Below 1 year', femaleField: 'below1Female', maleField: 'below1Male' },
  { key: 'months12To59', label: '12–59 months', femaleField: 'months12To59Female', maleField: 'months12To59Male' },
  { key: 'years5To14', label: '5–14 years', femaleField: 'years5To14Female', maleField: 'years5To14Male' },
  { key: 'years15To29', label: '15–29 years', femaleField: 'years15To29Female', maleField: 'years15To29Male' },
  { key: 'years30To64', label: '30–64 years', femaleField: 'years30To64Female', maleField: 'years30To64Male' },
  { key: 'years65Plus', label: '65 years and above', femaleField: 'years65PlusFemale', maleField: 'years65PlusMale' },
];

export const MONTHLY_DIAGNOSIS_COUNT_FIELDS = MONTHLY_DIAGNOSIS_AGE_GROUPS.flatMap(
  ({ femaleField, maleField }) => [femaleField, maleField]
);
const MAX_DATABASE_COUNT = 2147483647;

const DATABASE_FIELD_NAMES = {
  below1Female: 'below_1_female',
  below1Male: 'below_1_male',
  months12To59Female: 'months_12_59_female',
  months12To59Male: 'months_12_59_male',
  years5To14Female: 'years_5_14_female',
  years5To14Male: 'years_5_14_male',
  years15To29Female: 'years_15_29_female',
  years15To29Male: 'years_15_29_male',
  years30To64Female: 'years_30_64_female',
  years30To64Male: 'years_30_64_male',
  years65PlusFemale: 'years_65_plus_female',
  years65PlusMale: 'years_65_plus_male',
};

export function emptyMonthlyDiagnosisCounts() {
  return Object.fromEntries(MONTHLY_DIAGNOSIS_COUNT_FIELDS.map((field) => [field, '0']));
}

export function calculateMonthlyDiagnosisTotals(counts) {
  const ageGroups = {};
  let female = 0;
  let male = 0;

  MONTHLY_DIAGNOSIS_AGE_GROUPS.forEach(({ key, label, femaleField, maleField }) => {
    const groupFemale = Number(counts[femaleField]) || 0;
    const groupMale = Number(counts[maleField]) || 0;
    ageGroups[key] = {
      label,
      female: groupFemale,
      male: groupMale,
      total: groupFemale + groupMale,
    };
    female += groupFemale;
    male += groupMale;
  });

  return {
    ageGroups,
    female,
    male,
    total: female + male,
  };
}

export function validateMonthlyDiagnosisCount(entry, { diagnoses = [] } = {}) {
  const errors = {};

  if (!Number.isInteger(Number(entry.reportingYear))
      || Number(entry.reportingYear) < 1
      || Number(entry.reportingYear) > 9999) {
    errors.reportingYear = 'Select a valid reporting year.';
  }
  if (!Number.isInteger(Number(entry.reportingMonth))
      || Number(entry.reportingMonth) < 1
      || Number(entry.reportingMonth) > 12) {
    errors.reportingMonth = 'Select a valid reporting month.';
  }

  const diagnosis = diagnoses.find((item) => item.id === entry.diagnosisId && item.active !== false);
  if (!diagnosis) errors.diagnosisId = 'Select an active diagnosis from the configured list.';

  MONTHLY_DIAGNOSIS_COUNT_FIELDS.forEach((field) => {
    const value = entry[field];
    if (value === '' || value === null || value === undefined
        || !/^\d+$/.test(String(value).trim())) {
      errors[field] = 'Count must be a non-negative whole number.';
    } else if (!Number.isSafeInteger(Number(value)) || Number(value) > MAX_DATABASE_COUNT) {
      errors[field] = 'Count is larger than the supported whole-number range.';
    }
  });

  if (entry.registrationBookTotal !== '' && entry.registrationBookTotal !== null
      && entry.registrationBookTotal !== undefined) {
    if (!/^\d+$/.test(String(entry.registrationBookTotal).trim())
        || !Number.isSafeInteger(Number(entry.registrationBookTotal))) {
      errors.registrationBookTotal = 'Registration-book total must be a non-negative whole number.';
    } else {
      const total = calculateMonthlyDiagnosisTotals(entry).total;
      if (Number(entry.registrationBookTotal) !== total && !entry.discrepancyConfirmed) {
        errors.discrepancyConfirmed = 'Review and confirm the difference before saving this summary.';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function monthlyDiagnosisCountPayload(entry, facilityId) {
  const payload = {
    id: entry.id,
    facility_id: facilityId,
    reporting_year: Number(entry.reportingYear),
    reporting_month: Number(entry.reportingMonth),
    diagnosis_id: entry.diagnosisId,
    diagnosis_source: entry.diagnosisId.startsWith('official:') ? 'official' : 'facility',
    registration_book_total: entry.registrationBookTotal === ''
      || entry.registrationBookTotal === null
      || entry.registrationBookTotal === undefined
      ? null
      : Number(entry.registrationBookTotal),
    notes: String(entry.notes || '').trim(),
    discrepancy_confirmed: Boolean(entry.discrepancyConfirmed),
  };
  if (entry.expectedUpdatedAt) payload.expected_updated_at = entry.expectedUpdatedAt;

  Object.entries(DATABASE_FIELD_NAMES).forEach(([field, databaseField]) => {
    payload[databaseField] = Number(entry[field]);
  });
  return payload;
}

export function mapMonthlyDiagnosisCountRow(row, diagnoses = []) {
  const diagnosis = diagnoses.find((item) => item.id === row.diagnosis_id);
  const entry = {
    id: row.id,
    facilityId: row.facility_id,
    reportingYear: row.reporting_year,
    reportingMonth: row.reporting_month,
    diagnosisId: row.diagnosis_id,
    diagnosisSource: row.diagnosis_source,
    diagnosisName: diagnosis?.name || 'Unavailable diagnosis',
    diagnosisCode: diagnosis?.code || '',
    registrationBookTotal: row.registration_book_total ?? '',
    notes: row.notes || '',
    discrepancyConfirmed: Boolean(row.discrepancy_confirmed),
    discrepancyConfirmedBy: row.discrepancy_confirmed_by,
    discrepancyConfirmedAt: row.discrepancy_confirmed_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expectedUpdatedAt: row.updated_at,
  };
  Object.entries(DATABASE_FIELD_NAMES).forEach(([field, databaseField]) => {
    entry[field] = row[databaseField];
  });
  return entry;
}

export function monthlyDiagnosisCountRowsMatch(left, right) {
  return (!left.facilityId || !right.facilityId || left.facilityId === right.facilityId)
    && Number(left.reportingYear) === Number(right.reportingYear)
    && Number(left.reportingMonth) === Number(right.reportingMonth)
    && left.diagnosisId === right.diagnosisId
    && (left.diagnosisSource || (left.diagnosisId.startsWith('official:') ? 'official' : 'facility'))
      === (right.diagnosisSource || (right.diagnosisId.startsWith('official:') ? 'official' : 'facility'))
    && MONTHLY_DIAGNOSIS_COUNT_FIELDS.every((field) => Number(left[field]) === Number(right[field]))
    && Number(left.registrationBookTotal || 0) === Number(right.registrationBookTotal || 0)
    && (left.registrationBookTotal === '' || left.registrationBookTotal == null)
      === (right.registrationBookTotal === '' || right.registrationBookTotal == null)
    && String(left.notes || '') === String(right.notes || '')
    && Boolean(left.discrepancyConfirmed) === Boolean(right.discrepancyConfirmed);
}

export async function saveMonthlyDiagnosisCountBatches(
  entries,
  { saveBatch, findByDiagnosisIds, batchSize = 100, verifyDiagnosisIds = [], onProgress = () => {} }
) {
  const savedByDiagnosis = new Map();
  const errors = [];
  const uncertainDiagnosisIds = new Set();
  const blockedDiagnosisIds = new Set();
  const verifiedMissingIds = new Set();
  const verifySet = new Set(verifyDiagnosisIds);
  const batches = [];
  for (let index = 0; index < entries.length; index += batchSize) {
    batches.push(entries.slice(index, index + batchSize));
  }
  let processed = 0;

  async function reconcile(diagnosisIds, failureMessage) {
    let existingRows;
    try {
      existingRows = await findByDiagnosisIds(diagnosisIds);
    } catch (error) {
      diagnosisIds.forEach((id) => uncertainDiagnosisIds.add(id));
      diagnosisIds.forEach((id) => errors.push({
        diagnosisId: id,
        message: `${failureMessage || 'Save outcome is uncertain.'} Could not verify the saved state: ${error.message || 'connection unavailable'}`,
      }));
      return;
    }

    const existingByDiagnosis = new Map(existingRows.map((row) => [row.diagnosisId, row]));
    diagnosisIds.forEach((diagnosisId) => {
      const attempted = entries.find((entry) => entry.diagnosisId === diagnosisId);
      const existing = existingByDiagnosis.get(diagnosisId);
      if (existing && monthlyDiagnosisCountRowsMatch(existing, attempted)) {
        savedByDiagnosis.set(diagnosisId, existing);
      } else if (existing) {
        blockedDiagnosisIds.add(diagnosisId);
        errors.push({
          diagnosisId,
          message: 'A different saved summary already exists. Remove this pending copy, then edit the saved summary.',
        });
      } else {
        verifiedMissingIds.add(diagnosisId);
        if (failureMessage) errors.push({ diagnosisId, message: failureMessage });
      }
    });
  }

  const entriesToVerify = entries.filter((entry) => verifySet.has(entry.diagnosisId));
  if (entriesToVerify.length > 0) {
    await reconcile(entriesToVerify.map((entry) => entry.diagnosisId));
    processed += entriesToVerify.length;
    onProgress({ completed: processed, total: entries.length, saved: savedByDiagnosis.size });
  }

  const entriesToSave = entries.filter((entry) =>
    !savedByDiagnosis.has(entry.diagnosisId)
    && !blockedDiagnosisIds.has(entry.diagnosisId)
    && !uncertainDiagnosisIds.has(entry.diagnosisId)
    && (!verifySet.has(entry.diagnosisId) || verifiedMissingIds.has(entry.diagnosisId))
  );

  for (const batch of batchesFor(entriesToSave, batchSize)) {
    const diagnosisIds = batch.map((entry) => entry.diagnosisId);
    try {
      const savedRows = await saveBatch(batch);
      const savedById = new Map(savedRows.map((row) => [row.diagnosisId, row]));
      const missingIds = [];
      batch.forEach((entry) => {
        const saved = savedById.get(entry.diagnosisId);
        if (saved && monthlyDiagnosisCountRowsMatch(saved, entry)) {
          savedByDiagnosis.set(entry.diagnosisId, saved);
        } else if (saved) {
          errors.push({
            diagnosisId: entry.diagnosisId,
            message: 'The cloud returned a different summary than the one submitted.',
          });
        } else {
          missingIds.push(entry.diagnosisId);
        }
      });
      if (missingIds.length > 0) {
        await reconcile(missingIds, 'The cloud did not confirm this summary.');
      }
    } catch (error) {
      await reconcile(
        diagnosisIds,
        error.message || 'The batch response was interrupted.'
      );
    }
    processed += batch.length;
    onProgress({ completed: processed, total: entries.length, saved: savedByDiagnosis.size });
  }

  return {
    savedRecords: entries
      .map((entry) => savedByDiagnosis.get(entry.diagnosisId))
      .filter(Boolean),
    errors,
    uncertainDiagnosisIds: [...uncertainDiagnosisIds],
    blockedDiagnosisIds: [...blockedDiagnosisIds],
    verifiedMissingIds: [...verifiedMissingIds],
  };
}

function* batchesFor(entries, batchSize) {
  for (let index = 0; index < entries.length; index += batchSize) {
    yield entries.slice(index, index + batchSize);
  }
}
