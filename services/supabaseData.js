import { supabase } from './supabase';
import { enrichEncounter } from './storage';

function assertSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.');
}

function unwrap(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export function mapEncounterRow(row) {
  return enrichEncounter(
    {
      id: row.id,
      date: row.encounter_date,
      age: row.age,
      sex: row.sex,
      diagnosis: row.diagnosis,
      isDemo: row.is_demo,
    },
    { id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, isDemo: row.is_demo }
  );
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

function encounterPayload(record) {
  return {
    encounter_date: record.date,
    age: record.age,
    age_unit: 'years',
    sex: record.sex,
    diagnosis: record.diagnosis,
    is_demo: record.isDemo,
  };
}

export async function loadFacilityData(facilityId) {
  assertSupabase();
  const records = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const page = unwrap(await supabase
      .from('encounters')
      .select('*')
      .eq('facility_id', facilityId)
      .order('encounter_date', { ascending: false })
      .order('id')
      .range(offset, offset + pageSize - 1));
    records.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const diagnosesResponse = await supabase
    .from('diagnoses')
    .select('id, code, name, active, official')
    .eq('facility_id', facilityId)
    .order('name');

  return {
    records: records.map(mapEncounterRow),
    diagnoses: unwrap(diagnosesResponse).map(mapDiagnosisRow),
  };
}

export async function insertEncounter(facilityId, record) {
  assertSupabase();
  const data = unwrap(await supabase
    .from('encounters')
    .insert({ facility_id: facilityId, id: record.id, ...encounterPayload(record) })
    .select('*')
    .single());
  return mapEncounterRow(data);
}

export async function updateEncounter(facilityId, record) {
  assertSupabase();
  const data = unwrap(await supabase
    .from('encounters')
    .update(encounterPayload(record))
    .eq('facility_id', facilityId)
    .eq('id', record.id)
    .select('*')
    .single());
  return mapEncounterRow(data);
}

export async function deleteEncounter(facilityId, id) {
  assertSupabase();
  unwrap(await supabase
    .from('encounters')
    .delete()
    .eq('facility_id', facilityId)
    .eq('id', id));
}

export async function addFacilityDiagnosis(facilityId, diagnosis) {
  assertSupabase();
  const data = unwrap(await supabase
    .from('diagnoses')
    .insert({
      facility_id: facilityId,
      id: diagnosis.id,
      name: diagnosis.name,
      active: diagnosis.active,
      official: false,
    })
    .select('id, code, name, active, official')
    .single());
  return mapDiagnosisRow(data);
}

export async function updateFacilityDiagnosis(facilityId, diagnosisId, patch) {
  assertSupabase();
  const data = unwrap(await supabase
    .from('diagnoses')
    .update(patch)
    .eq('facility_id', facilityId)
    .eq('id', diagnosisId)
    .select('id, code, name, active, official')
    .single());
  return mapDiagnosisRow(data);
}

export async function deleteFacilityEncounters(facilityId, demoOnly = false) {
  assertSupabase();
  let query = supabase.from('encounters').delete().eq('facility_id', facilityId);
  if (demoOnly) query = query.eq('is_demo', true);
  unwrap(await query);
}
