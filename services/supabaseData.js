import { supabase } from './supabase';
import { STARTER_DIAGNOSES } from '../constants';
import { ESV1_DIAGNOSES } from './esv1Diagnoses';
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

  let diagnosesResponse = await supabase
    .from('diagnoses')
    .select('id, code, name, active, official')
    .eq('facility_id', facilityId)
    .order('name');
  let facilityDiagnoses = unwrap(diagnosesResponse);

  if (facilityDiagnoses.length === 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from('facility_memberships')
      .select('role')
      .eq('facility_id', facilityId);
    if (membershipError) throw new Error(membershipError.message);
    const canSeedCatalog = memberships.length > 0;

    if (canSeedCatalog) {
      const bundledCatalog = [
        ...ESV1_DIAGNOSES,
        ...STARTER_DIAGNOSES.map((diagnosis) => ({ ...diagnosis, code: null, official: false })),
      ];
      const uniqueCatalog = new Map();
      const uniqueCodes = new Set();
      bundledCatalog.forEach((diagnosis) => {
        const key = diagnosis.name.trim().toLowerCase();
        const code = diagnosis.code?.trim().toUpperCase();
        if (uniqueCatalog.has(key) || (code && uniqueCodes.has(code))) return;
        uniqueCatalog.set(key, diagnosis);
        if (code) uniqueCodes.add(code);
      });
      const catalog = [...uniqueCatalog.values()].map((diagnosis) => ({
        facility_id: facilityId,
        id: diagnosis.id,
        code: diagnosis.code || null,
        name: diagnosis.name,
        active: diagnosis.active !== false,
        official: Boolean(diagnosis.official),
      }));

      for (let index = 0; index < catalog.length; index += 100) {
        const batch = catalog.slice(index, index + 100);
        const { error } = await supabase
          .from('diagnoses')
          .upsert(batch, { onConflict: 'facility_id,id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }

      diagnosesResponse = await supabase
        .from('diagnoses')
        .select('id, code, name, active, official')
        .eq('facility_id', facilityId)
        .order('name');
      facilityDiagnoses = unwrap(diagnosesResponse);
    }
  }

  return {
    records: records.map(mapEncounterRow),
    diagnoses: facilityDiagnoses.map(mapDiagnosisRow),
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

export async function updateFacilitySettings(facilityId, settings) {
  assertSupabase();
  const data = unwrap(await supabase
    .from('facility_settings')
    .update({
      health_center_name: settings.healthCenterName,
      region: settings.region,
      zone: settings.zone,
      woreda: settings.woreda,
      reporting_year: settings.reportingYear,
      responsible_person_name: settings.responsiblePersonName,
      position: settings.position,
    })
    .eq('facility_id', facilityId)
    .select('facility_id')
    .single());
  return data;
}

export async function deleteFacilityEncounters(facilityId, demoOnly = false) {
  assertSupabase();
  let query = supabase.from('encounters').delete().eq('facility_id', facilityId);
  if (demoOnly) query = query.eq('is_demo', true);
  unwrap(await query);
}
