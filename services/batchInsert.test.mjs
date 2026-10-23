import assert from 'node:assert/strict';
import test from 'node:test';
import { insertEncounterBatches, retainPendingRecords } from './batchInsert.mjs';

function makeRecord(id) {
  return {
    id,
    date: '2026-10-23',
    age: 30,
    sex: 'Female',
    diagnosis: 'Hypertension',
    isDemo: false,
  };
}

test('inserts multiple encounters in a single batch request', async () => {
  const records = Array.from({ length: 10 }, (_, index) => makeRecord(`enc-${index}`));
  const calls = [];
  const result = await insertEncounterBatches(records, {
    insertBatch: async (batch) => {
      calls.push(batch);
      return batch;
    },
    findByIds: async () => [],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 10);
  assert.equal(result.savedRecords.length, 10);
  assert.deepEqual(result.uncertainIds, []);
});

test('retains unresolved entries when insert and outcome verification fail', async () => {
  const records = [makeRecord('enc-uncertain')];
  const result = await insertEncounterBatches(records, {
    insertBatch: async () => {
      throw new Error('network interrupted');
    },
    findByIds: async () => {
      throw new Error('network still unavailable');
    },
  });

  assert.deepEqual(result.savedRecords, []);
  assert.deepEqual(result.uncertainIds, ['enc-uncertain']);
  assert.match(result.errors[0].message, /network still unavailable/);
  assert.deepEqual(retainPendingRecords(records, result.savedRecords), records);
});

test('reconciles a completed but unacknowledged insert without inserting a duplicate on retry', async () => {
  const record = makeRecord('enc-retry');
  let insertCalls = 0;
  const persisted = new Map();
  const firstAttempt = await insertEncounterBatches([record], {
    insertBatch: async (batch) => {
      insertCalls += 1;
      persisted.set(batch[0].id, batch[0]);
      throw new Error('response interrupted');
    },
    findByIds: async (ids) => ids.map((id) => persisted.get(id)).filter(Boolean),
  });

  assert.deepEqual(firstAttempt.savedRecords, [record]);
  assert.equal(insertCalls, 1);

  const retry = await insertEncounterBatches([record], {
    verifyIds: [record.id],
    insertBatch: async (batch) => {
      insertCalls += 1;
      return batch;
    },
    findByIds: async (ids) => ids.map((id) => persisted.get(id)).filter(Boolean),
  });

  assert.deepEqual(retry.savedRecords, [record]);
  assert.equal(insertCalls, 1);
});

test('splits large queues into bounded batches and saves confirmed entries only', async () => {
  const records = Array.from({ length: 5 }, (_, index) => makeRecord(`enc-${index}`));
  const batchSizes = [];
  const result = await insertEncounterBatches(records, {
    batchSize: 2,
    insertBatch: async (batch) => {
      batchSizes.push(batch.length);
      return batch;
    },
    findByIds: async () => [],
  });

  assert.deepEqual(batchSizes, [2, 2, 1]);
  assert.equal(result.savedRecords.length, 5);
});

test('removes only records confirmed as saved from the pending queue', () => {
  const records = [makeRecord('enc-saved'), makeRecord('enc-pending')];

  assert.deepEqual(
    retainPendingRecords(records, [records[0]]),
    [records[1]]
  );
});
