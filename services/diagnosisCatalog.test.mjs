import assert from 'node:assert/strict';
import test from 'node:test';
import { loadDiagnosisCatalog } from './diagnosisCatalog.mjs';

function createSupabaseStub(rowsByTable, errorsByTable = {}) {
  const queries = [];

  return {
    queries,
    from(table) {
      const query = {
        table,
        filters: [],
        rangeValue: null,
        select(columns) {
          this.columns = columns;
          return this;
        },
        eq(column, value) {
          this.filters.push([column, value]);
          return this;
        },
        order(column) {
          this.orderBy = column;
          return this;
        },
        range(from, to) {
          this.rangeValue = [from, to];
          return this;
        },
        then(resolve, reject) {
          queries.push({
            table: this.table,
            filters: this.filters,
            range: this.rangeValue,
          });
          const error = errorsByTable[this.table];
          if (error) return Promise.resolve({ data: null, error }).then(resolve, reject);

          let rows = rowsByTable[this.table] || [];
          for (const [column, value] of this.filters) {
            rows = rows.filter((row) => row[column] === value);
          }
          if (this.orderBy) {
            rows = [...rows].sort((left, right) => left[this.orderBy].localeCompare(right[this.orderBy]));
          }
          if (this.rangeValue) {
            rows = rows.slice(this.rangeValue[0], this.rangeValue[1] + 1);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test('loads shared active official diagnoses and only the requested facility diagnoses', async () => {
  const client = createSupabaseStub({
    diagnoses: [
      { id: 'facility-a-1', facility_id: 'facility-a', code: null, name: 'Facility A diagnosis', active: true, official: false },
      { id: 'facility-b-1', facility_id: 'facility-b', code: null, name: 'Facility B diagnosis', active: true, official: false },
    ],
    official_diagnoses: [
      { id: 'esv1-1A07', code: '1A07', name: 'Typhoid fever', active: true },
      { id: 'inactive', code: 'X1', name: 'Inactive diagnosis', active: false },
    ],
  });

  const catalog = await loadDiagnosisCatalog(client, 'facility-a');

  assert.deepEqual(catalog.map(({ name }) => name), [
    'Typhoid fever',
    'Facility A diagnosis',
  ]);
  assert.equal(catalog[0].official, true);
  assert.deepEqual(client.queries.map(({ table, filters }) => ({ table, filters })), [
    { table: 'diagnoses', filters: [['facility_id', 'facility-a']] },
    { table: 'official_diagnoses', filters: [['active', true]] },
  ]);
});

test('loads every page of the shared official catalog', async () => {
  const official = Array.from({ length: 1001 }, (_, index) => ({
    id: `esv1-${index}`,
    code: `C${index}`,
    name: `Diagnosis ${String(index).padStart(4, '0')}`,
    active: true,
  }));
  const client = createSupabaseStub({ diagnoses: [], official_diagnoses: official });

  const catalog = await loadDiagnosisCatalog(client, 'facility-a');

  assert.equal(catalog.length, official.length);
  assert.deepEqual(
    client.queries.filter(({ table }) => table === 'official_diagnoses').map(({ range }) => range),
    [[0, 499], [500, 999], [1000, 1499]]
  );
});

test('returns an empty catalog when both sources are empty', async () => {
  const client = createSupabaseStub({ diagnoses: [], official_diagnoses: [] });

  assert.deepEqual(await loadDiagnosisCatalog(client, 'facility-a'), []);
});

test('surfaces catalog read errors instead of treating them as an empty catalog', async () => {
  const client = createSupabaseStub(
    { diagnoses: [], official_diagnoses: [] },
    { official_diagnoses: new Error('permission denied') }
  );

  await assert.rejects(loadDiagnosisCatalog(client, 'facility-a'), /permission denied/);
});
