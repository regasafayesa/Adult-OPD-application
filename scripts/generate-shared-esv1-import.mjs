import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

function parseReviewCatalog(reviewText) {
  let entries;
  try {
    entries = JSON.parse(reviewText);
  } catch (error) {
    throw new Error(`Could not parse the reviewed ESV-1 catalog: ${error.message}`);
  }

  if (!Array.isArray(entries)) {
    throw new Error('The reviewed ESV-1 catalog must be a JSON array.');
  }

  const byCode = new Map();
  for (const [index, entry] of entries.entries()) {
    if (
      !entry
      || typeof entry.code !== 'string'
      || typeof entry.name !== 'string'
      || !entry.code.trim()
      || !entry.name.trim()
    ) {
      throw new Error(`Invalid reviewed diagnosis at index ${index}.`);
    }

    const code = entry.code.trim();
    const name = entry.name.trim();
    if (byCode.has(code)) {
      throw new Error(`Duplicate ESV-1 code "${code}" in the reviewed catalog.`);
    }
    byCode.set(code, name);
  }

  return byCode;
}

function parseSourceCatalog(sourceText) {
  const match = sourceText.match(/const ESV1_ENTRIES = (\[[\s\S]*?\n\]);/);
  if (!match) {
    throw new Error('Could not find ESV1_ENTRIES in services/esv1Diagnoses.js.');
  }

  let entries;
  try {
    entries = runInNewContext(match[1]);
  } catch (error) {
    throw new Error(`Could not parse ESV1_ENTRIES: ${error.message}`);
  }
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('ESV1_ENTRIES must contain diagnosis code/name pairs.');
  }

  const byCode = new Map();
  for (const [index, entry] of entries.entries()) {
    if (
      !Array.isArray(entry)
      || entry.length !== 2
      || entry.some((value) => typeof value !== 'string' || !value.trim())
    ) {
      throw new Error(`Invalid source diagnosis at index ${index}.`);
    }

    const [code, name] = entry.map((value) => value.trim());
    const existingName = byCode.get(code);
    if (existingName && existingName !== name) {
      throw new Error(`ESV-1 source code "${code}" has conflicting names.`);
    }
    byCode.set(code, name);
  }

  return { rows: entries.length, byCode };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildSharedDiagnosisSeed(sourceText, reviewText) {
  const source = parseSourceCatalog(sourceText);
  const reviewed = parseReviewCatalog(reviewText);

  const missingFromReview = [...source.byCode.keys()].filter((code) => !reviewed.has(code));
  const missingFromSource = [...reviewed.keys()].filter((code) => !source.byCode.has(code));
  const nameMismatches = [...source.byCode.entries()].filter(
    ([code, name]) => reviewed.has(code) && reviewed.get(code) !== name
  );
  if (missingFromReview.length || missingFromSource.length || nameMismatches.length) {
    throw new Error(
      `Source/review catalog mismatch: ${missingFromReview.length} source-only codes, `
      + `${missingFromSource.length} review-only codes, ${nameMismatches.length} name mismatches.`
    );
  }

  const diagnoses = [...reviewed.entries()].map(([code, name]) => ({
    id: `esv1-${code}`,
    code,
    name,
  }));
  const values = diagnoses
    .map(({ id, code, name }) => `      (${sqlString(id)}, ${sqlString(code)}, ${sqlString(name)})`)
    .join(',\n');
  const repeatedRows = source.rows - source.byCode.size;
  const sql = `-- Shared ESV-1 catalog seed.
-- Validated ${source.rows} source rows: ${source.byCode.size} unique codes and ${repeatedRows} exact duplicate rows.
-- The reviewed catalog matches every unique source code and name.
-- Insert-only: exact existing rows are preserved; conflicting IDs or codes abort.
begin;

create temporary table esv1_seed (
  id text not null,
  code text not null,
  name text not null
) on commit drop;

insert into pg_temp.esv1_seed (id, code, name)
values
${values};

do $seed$
declare
  conflicting_entries integer;
begin
  select count(*)
    into conflicting_entries
  from pg_temp.esv1_seed esv
  join public.official_diagnoses existing
    on existing.id = esv.id
    or existing.code = esv.code
  where existing.id <> esv.id
     or existing.code <> esv.code
     or existing.name <> esv.name;

  if conflicting_entries > 0 then
    raise exception
      'Found % conflicting ESV-1 IDs or codes; no shared catalog rows were inserted',
      conflicting_entries;
  end if;
end
$seed$;

insert into public.official_diagnoses (id, code, name, active, source)
select esv.id, esv.code, esv.name, true, 'ESV-1'
from pg_temp.esv1_seed esv
where not exists (
  select 1
  from public.official_diagnoses existing
  where existing.id = esv.id
     or existing.code = esv.code
);

commit;
`;

  return {
    sql,
    sourceRows: source.rows,
    uniqueEntries: diagnoses.length,
    repeatedRows,
  };
}

export function generateSharedDiagnosisSeed(outputPath) {
  if (!outputPath) {
    throw new Error('Usage: node scripts/generate-shared-esv1-import.mjs <output.sql>');
  }

  const sourcePath = fileURLToPath(new URL('../services/esv1Diagnoses.js', import.meta.url));
  const reviewPath = fileURLToPath(new URL('../esv1-catalog-review.json', import.meta.url));
  const { sql, sourceRows, uniqueEntries, repeatedRows } = buildSharedDiagnosisSeed(
    readFileSync(sourcePath, 'utf8'),
    readFileSync(reviewPath, 'utf8')
  );
  const resolvedOutputPath = resolve(outputPath);
  writeFileSync(resolvedOutputPath, sql, 'utf8');

  console.log(
    `Validated ${sourceRows} source rows (${uniqueEntries} unique, ${repeatedRows} exact duplicates) `
    + `against the reviewed catalog.`
  );
  console.log(`Generated shared official catalog seed: ${resolvedOutputPath}`);
  console.log('This step generated SQL only. It did not modify Supabase.');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  generateSharedDiagnosisSeed(process.argv[2]);
}
