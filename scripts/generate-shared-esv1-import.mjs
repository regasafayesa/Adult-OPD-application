import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('Usage: node scripts/generate-shared-esv1-import.mjs <output.sql>');
}

const sourcePath = fileURLToPath(new URL('../services/esv1Diagnoses.js', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const entryPattern = /^\s*\['([^']+)', '([^']+)'\],?$/gm;
const entries = [...source.matchAll(entryPattern)].map(([, code, name]) => ({
  id: `esv1-${code}`,
  code,
  name,
}));

if (entries.length !== 219) {
  throw new Error(`Expected 219 ESV-1 entries; found ${entries.length}. No SQL generated.`);
}

if (new Set(entries.map(({ code }) => code)).size !== entries.length) {
  throw new Error('Duplicate ESV-1 codes found. No SQL generated.');
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const values = entries
  .map(({ id, code, name }) => `      (${sqlString(id)}, ${sqlString(code)}, ${sqlString(name)})`)
  .join(',\n');

const sql = `begin;

do $seed$
declare
  conflicting_entries integer;
begin
  select count(*)
    into conflicting_entries
  from (values
${values}
  ) as esv(id, code, name)
  left join public.official_diagnoses existing
    on existing.id = esv.id or existing.code = esv.code
  where existing.id is not null
    and (existing.id <> esv.id or existing.code <> esv.code or existing.name <> esv.name);

  if conflicting_entries > 0 then
    raise exception
      'Found % conflicting ESV-1 entries; no shared catalog rows were inserted',
      conflicting_entries;
  end if;

  insert into public.official_diagnoses (id, code, name, active, source)
  select esv.id, esv.code, esv.name, true, 'ESV-1'
  from (values
${values}
  ) as esv(id, code, name)
  where not exists (
    select 1
    from public.official_diagnoses existing
    where existing.id = esv.id or existing.code = esv.code
  );
end
$seed$;

commit;
`;

writeFileSync(resolve(outputPath), sql, 'utf8');
console.log(`Generated ${entries.length} shared ESV-1 entries: ${resolve(outputPath)}`);
console.log('This step generated SQL only. It did not modify Supabase.');
