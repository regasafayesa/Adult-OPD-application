
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const facilityId = process.argv[2];
const outputPath = process.argv[3];

if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    facilityId || ''
  )
) {
  throw new Error(
    'Usage: node scripts/generate-esv1-catalog-import.mjs <facility-uuid> <output.sql>'
  );
}

if (!outputPath) {
  throw new Error('Provide an output SQL file path.');
}

const reviewPath = fileURLToPath(
  new URL('../esv1-catalog-review.json', import.meta.url)
);

const rawEntries = JSON.parse(readFileSync(reviewPath, 'utf8'));

if (!Array.isArray(rawEntries)) {
  throw new Error('The catalogue review file must contain a JSON array.');
}

const diagnoses = rawEntries.map((entry, index) => {
  if (
    !entry ||
    typeof entry.code !== 'string' ||
    typeof entry.name !== 'string' ||
    !entry.code.trim() ||
    !entry.name.trim()
  ) {
    throw new Error(`Invalid diagnosis at catalogue index ${index}.`);
  }

  const code = entry.code.trim();
  const name = entry.name.trim();

  return {
    id: `esv1-${code}`,
    code,
    name,
  };
});

const codes = diagnoses.map(({ code }) => code);
const ids = diagnoses.map(({ id }) => id);

if (diagnoses.length !== 2461) {
  throw new Error(
    `Expected 2461 deduplicated catalogue entries; found ${diagnoses.length}. No SQL generated.`
  );
}

if (new Set(codes).size !== diagnoses.length) {
  throw new Error('Duplicate diagnosis codes found. No SQL generated.');
}

if (new Set(ids).size !== diagnoses.length) {
  throw new Error('Duplicate diagnosis IDs found. No SQL generated.');
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const values = diagnoses
  .map(
    ({ id, code, name }) =>
      `      (${sqlString(id)}, ${sqlString(code)}, ${sqlString(name)})`
  )
  .join(',\n');

const sql = `begin;

do $$
declare
  target_facility uuid := '${facilityId}';
  conflicting_entries integer;
begin
  if not exists (
    select 1
    from public.facilities
    where id = target_facility
  ) then
    raise exception 'Facility % does not exist', target_facility;
  end if;

  select count(*)
    into conflicting_entries
  from (values
${values}
  ) as esv(id, code, name)
  join public.diagnoses existing
    on existing.facility_id = target_facility
   and (
     existing.id = esv.id
     or existing.code = esv.code
     or lower(existing.name) = lower(esv.name)
   )
  where not (
    existing.id = esv.id
    and existing.code = esv.code
    and existing.name = esv.name
    and existing.active
    and existing.official
  );

  if conflicting_entries > 0 then
    raise exception
      'Found % conflicting diagnosis entries for facility %; no catalog rows were inserted',
      conflicting_entries,
      target_facility;
  end if;

  insert into public.diagnoses
    (facility_id, id, code, name, active, official)
  select
    target_facility, esv.id, esv.code, esv.name, true, true
  from (values
${values}
  ) as esv(id, code, name)
  where not exists (
    select 1
    from public.diagnoses existing
    where existing.facility_id = target_facility
      and (
        existing.id = esv.id
        or existing.code = esv.code
        or lower(existing.name) = lower(esv.name)
      )
  );
end
$$;

commit;
`;

const resolvedOutputPath = resolve(outputPath);

writeFileSync(resolvedOutputPath, sql, 'utf8');

console.log(
  `Generated ${diagnoses.length} catalogue entries for facility ${facilityId}: ${resolvedOutputPath}`
);
console.log('This step generated SQL only. It did not modify Supabase.');