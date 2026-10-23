function unwrap(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export function mapDiagnosisRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    official: row.official,
  };
}

export function mergeDiagnosisCatalog(officialRows, facilityRows) {
  const officialDiagnoses = officialRows.map((row) => ({
    ...mapDiagnosisRow(row),
    id: `official:${row.id}`,
    official: true,
  }));
  const exactOfficialEntries = new Set(
    officialDiagnoses.map((item) => `${item.code || ''}\u0000${item.name.toLocaleLowerCase()}`)
  );
  const legacyAndCustomDiagnoses = facilityRows
    .map(mapDiagnosisRow)
    .filter((item) => !(
      item.official
      && exactOfficialEntries.has(`${item.code || ''}\u0000${item.name.toLocaleLowerCase()}`)
    ));

  return [...officialDiagnoses, ...legacyAndCustomDiagnoses];
}

export async function loadDiagnosisCatalog(client, facilityId) {
  if (!facilityId) throw new Error('A facility ID is required to load diagnoses.');

  const pageSize = 500;
  const facilityDiagnoses = [];
  let offset = 0;
  let page;

  do {
    page = unwrap(await client
      .from('diagnoses')
      .select('id, code, name, active, official')
      .eq('facility_id', facilityId)
      .order('name')
      .range(offset, offset + pageSize - 1));
    facilityDiagnoses.push(...page);
    offset += pageSize;
  } while (page.length === pageSize);

  const officialDiagnoses = [];
  offset = 0;

  do {
    page = unwrap(await client
      .from('official_diagnoses')
      .select('id, code, name, active')
      .eq('active', true)
      .order('name')
      .range(offset, offset + pageSize - 1));
    officialDiagnoses.push(...page);
    offset += pageSize;
  } while (page.length === pageSize);

  return mergeDiagnosisCatalog(officialDiagnoses, facilityDiagnoses);
}
