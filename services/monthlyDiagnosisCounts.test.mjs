import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateMonthlyDiagnosisTotals,
  emptyMonthlyDiagnosisCounts,
  MONTHLY_DIAGNOSIS_AGE_GROUPS,
  monthlyDiagnosisCountRowsMatch,
  saveMonthlyDiagnosisCountBatches,
  validateMonthlyDiagnosisCount,
} from './monthlyDiagnosisCounts.mjs';

const diagnoses = [{ id: 'dx-typhoid', name: 'Typhoid fever', active: true }];

function makeEntry(overrides = {}) {
  return {
    id: 'aggregate-1',
    facilityId: 'facility-1',
    reportingYear: 2026,
    reportingMonth: 10,
    diagnosisId: 'dx-typhoid',
    diagnosisName: 'Typhoid fever',
    registrationBookTotal: '',
    notes: '',
    discrepancyConfirmed: false,
    ...emptyMonthlyDiagnosisCounts(),
    ...overrides,
  };
}

test('keeps the six aggregate age groups in the required order', () => {
  assert.deepEqual(MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ label }) => label), [
    'Below 1 year',
    '12–59 months',
    '5–14 years',
    '15–29 years',
    '30–64 years',
    '65 years and above',
  ]);
});

test('calculates age-group, female, male, and grand totals', () => {
  const totals = calculateMonthlyDiagnosisTotals(makeEntry({
    below1Female: '2',
    months12To59Male: '3',
    years5To14Female: '4',
  }));

  assert.deepEqual(totals.ageGroups.below1, {
    label: 'Below 1 year',
    female: 2,
    male: 0,
    total: 2,
  });
  assert.equal(totals.female, 6);
  assert.equal(totals.male, 3);
  assert.equal(totals.total, 9);
});

test('accepts zero and positive whole-number counts including under-five ages', () => {
  assert.equal(validateMonthlyDiagnosisCount(makeEntry({
    below1Female: '0',
    months12To59Male: '8',
  }), { diagnoses, reportingYear: 2026 }).valid, true);
});

test('rejects negative, decimal, invalid, and unsafe count values', () => {
  for (const invalidCount of ['-1', '1.5', 'not-a-count', '9007199254740992']) {
    const result = validateMonthlyDiagnosisCount(makeEntry({ below1Female: invalidCount }), {
      diagnoses,
      reportingYear: 2026,
    });
    assert.equal(result.valid, false, invalidCount);
    assert.ok(result.errors.below1Female);
  }
});

test('accepts selected reporting years and rejects invalid periods or diagnoses', () => {
  assert.ok(validateMonthlyDiagnosisCount(makeEntry({ reportingMonth: 13 }), {
    diagnoses,
    reportingYear: 2026,
  }).errors.reportingMonth);
  assert.equal(validateMonthlyDiagnosisCount(makeEntry({ reportingYear: 2025 }), {
    diagnoses,
    reportingYear: 2026,
  }).valid, true);
  assert.ok(validateMonthlyDiagnosisCount(makeEntry({ reportingYear: 10000 }), {
    diagnoses,
    reportingYear: 2026,
  }).errors.reportingYear);
  assert.ok(validateMonthlyDiagnosisCount(makeEntry({ diagnosisId: 'inactive' }), {
    diagnoses,
    reportingYear: 2026,
  }).errors.diagnosisId);
});

test('requires explicit confirmation of registration-book total discrepancies', () => {
  const entry = makeEntry({ below1Female: '2', registrationBookTotal: '3' });
  assert.ok(validateMonthlyDiagnosisCount(entry, { diagnoses, reportingYear: 2026 }).errors.discrepancyConfirmed);
  assert.equal(validateMonthlyDiagnosisCount({
    ...entry,
    discrepancyConfirmed: true,
  }, { diagnoses, reportingYear: 2026 }).valid, true);
});

test('saves multiple summaries through one batch request', async () => {
  const entries = [
    makeEntry({ below1Female: '2', months12To59Male: '3' }),
    makeEntry({ id: 'aggregate-2', diagnosisId: 'dx-uti', below1Male: '1' }),
  ];
  const requests = [];
  const result = await saveMonthlyDiagnosisCountBatches(entries, {
    saveBatch: async (batch) => {
      requests.push(batch);
      return batch;
    },
    findByDiagnosisIds: async () => [],
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].length, 2);
  assert.equal(result.savedRecords.length, 2);
  assert.equal(result.savedRecords[0].below1Female, '2');
  assert.deepEqual(result.uncertainDiagnosisIds, []);
});

test('updates an explicitly loaded monthly summary in a single batch', async () => {
  const existing = makeEntry({
    expectedUpdatedAt: '2026-10-01T10:00:00.000Z',
    below1Female: '1',
  });
  let requests = 0;
  const result = await saveMonthlyDiagnosisCountBatches([existing], {
    saveBatch: async (batch) => {
      requests += 1;
      assert.equal(batch[0].expectedUpdatedAt, existing.expectedUpdatedAt);
      return [batch[0]];
    },
    findByDiagnosisIds: async () => [],
  });

  assert.equal(requests, 1);
  assert.deepEqual(result.savedRecords, [existing]);
});

test('retains uncertain submissions and verifies before retrying', async () => {
  const entry = makeEntry();
  const interrupted = await saveMonthlyDiagnosisCountBatches([entry], {
    saveBatch: async () => {
      throw new Error('network interrupted');
    },
    findByDiagnosisIds: async () => {
      throw new Error('verification unavailable');
    },
  });
  assert.deepEqual(interrupted.uncertainDiagnosisIds, ['dx-typhoid']);
  assert.deepEqual(interrupted.savedRecords, []);

  let insertCalls = 0;
  const reconciled = await saveMonthlyDiagnosisCountBatches([entry], {
    verifyDiagnosisIds: ['dx-typhoid'],
    saveBatch: async () => {
      insertCalls += 1;
      return [entry];
    },
    findByDiagnosisIds: async () => [entry],
  });
  assert.equal(insertCalls, 0);
  assert.deepEqual(reconciled.savedRecords, [entry]);
});

test('does not treat a different saved value as a confirmed update', async () => {
  const attempted = makeEntry({ below1Female: '4' });
  const current = makeEntry({ below1Female: '2' });
  assert.equal(monthlyDiagnosisCountRowsMatch(current, attempted), false);
  const result = await saveMonthlyDiagnosisCountBatches([attempted], {
    saveBatch: async () => {
      throw new Error('response interrupted');
    },
    findByDiagnosisIds: async () => [current],
  });
  assert.deepEqual(result.savedRecords, []);
  assert.match(result.errors[0].message, /different saved summary/);
  assert.deepEqual(result.blockedDiagnosisIds, ['dx-typhoid']);
  assert.deepEqual(result.uncertainDiagnosisIds, []);
});

test('splits large submissions into bounded batch requests', async () => {
  const entries = Array.from({ length: 5 }, (_, index) => makeEntry({
    id: `aggregate-${index}`,
    diagnosisId: `dx-${index}`,
  }));
  const sizes = [];
  await saveMonthlyDiagnosisCountBatches(entries, {
    batchSize: 2,
    saveBatch: async (batch) => {
      sizes.push(batch.length);
      return batch;
    },
    findByDiagnosisIds: async () => [],
  });
  assert.deepEqual(sizes, [2, 2, 1]);
});
