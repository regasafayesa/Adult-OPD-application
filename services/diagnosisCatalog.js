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
