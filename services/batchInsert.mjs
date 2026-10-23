function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function matchesRecord(left, right) {
  return left.id === right.id
    && left.date === right.date
    && left.age === right.age
    && left.sex === right.sex
    && left.diagnosis === right.diagnosis
    && Boolean(left.isDemo) === Boolean(right.isDemo);
}

export function retainPendingRecords(records, confirmedRecords) {
  const confirmedIds = new Set(confirmedRecords.map((record) => record.id));
  return records.filter((record) => !confirmedIds.has(record.id));
}

export async function insertEncounterBatches(
  records,
  { insertBatch, findByIds, batchSize = 100, verifyIds = [], onProgress = () => {} }
) {
  const savedRecords = new Map();
  const errors = [];
  const uncertainIds = new Set();
  const blockedIds = new Set();
  const processedIds = new Set();
  const verifySet = new Set(verifyIds);

  async function reconcile(ids, failureMessage) {
    try {
      const existingRecords = await findByIds(ids);
      const existingById = new Map(existingRecords.map((record) => [record.id, record]));
      for (const id of ids) {
        const existing = existingById.get(id);
        const attempted = records.find((record) => record.id === id);
        if (!existing) {
          if (failureMessage) errors.push({ id, message: failureMessage });
        } else if (matchesRecord(existing, attempted)) {
          savedRecords.set(id, existing);
        } else {
          blockedIds.add(id);
          errors.push({
            id,
            message: `Encounter ${id} already exists with different values and was not overwritten.`,
          });
        }
      }
    } catch (error) {
      for (const id of ids) uncertainIds.add(id);
      const detail = error.message || 'Could not verify whether the encounter was saved.';
      for (const id of ids) errors.push({ id, message: `${failureMessage || 'Save outcome is uncertain'} ${detail}` });
    }
  }

  const idsToVerify = records
    .filter((record) => verifySet.has(record.id))
    .map((record) => record.id);
  for (const ids of chunks(idsToVerify, batchSize)) {
    await reconcile(ids);
    ids.forEach((id) => processedIds.add(id));
    onProgress({ completed: processedIds.size, total: records.length, saved: savedRecords.size });
  }

  const eligibleRecords = records.filter((record) =>
    !savedRecords.has(record.id) && !blockedIds.has(record.id) && !uncertainIds.has(record.id)
  );
  for (const batch of chunks(eligibleRecords, batchSize)) {
    const ids = batch.map((record) => record.id);
    try {
      const insertedRecords = await insertBatch(batch);
      const insertedById = new Map(insertedRecords.map((record) => [record.id, record]));
      const missingIds = [];
      for (const record of batch) {
        const inserted = insertedById.get(record.id);
        if (!inserted) {
          missingIds.push(record.id);
        } else if (matchesRecord(inserted, record)) {
          savedRecords.set(record.id, inserted);
        } else {
          blockedIds.add(record.id);
          errors.push({
            id: record.id,
            message: `Supabase returned different values for encounter ${record.id}.`,
          });
        }
      }
      if (missingIds.length > 0) {
        await reconcile(missingIds, 'Supabase did not confirm this encounter insert.');
      }
    } catch (error) {
      await reconcile(ids, error.message || 'Supabase did not confirm the encounter batch insert.');
    }
    batch.forEach((record) => processedIds.add(record.id));
    onProgress({ completed: processedIds.size, total: records.length, saved: savedRecords.size });
  }

  return {
    savedRecords: records
      .map((record) => savedRecords.get(record.id))
      .filter(Boolean),
    errors,
    uncertainIds: [...uncertainIds],
  };
}
