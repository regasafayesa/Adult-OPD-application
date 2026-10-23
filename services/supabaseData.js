import { supabase } from './supabase';
import { enrichEncounter } from './storage';
import { loadDiagnosisCatalog, mapDiagnosisRow } from './diagnosisCatalog.mjs';

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

  return {
    records: records.map(mapEncounterRow),
    diagnoses: await loadDiagnosisCatalog(supabase, facilityId),
  };
}

function quoteFilterValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export async function searchFacilityEncounters(facilityId, filters) {
  assertSupabase();
  let query = supabase
    .from('encounters')
    .select('*')
    .eq('facility_id', facilityId);

  if (filters.date) query = query.eq('encounter_date', filters.date);
  if (filters.month) query = query.eq('reporting_month', Number(filters.month));
  if (filters.year) query = query.eq('reporting_year', Number(filters.year));
  if (filters.sex) query = query.eq('sex', filters.sex);
  if (filters.ageGroup) query = query.eq('adult_report_age_group', filters.ageGroup);
  if (filters.diagnosis) query = query.eq('diagnosis', filters.diagnosis);
  if (filters.opdCategory) query = query.eq('opd_category', filters.opdCategory);
  if (filters.status === 'adult') query = query.eq('included_in_adult_report', true);
  if (filters.status === 'outside') query = query.eq('included_in_adult_report', false);

  const searchText = String(filters.query || '').trim();
  if (searchText) {
    const pattern = quoteFilterValue(`%${searchText}%`);
    const alternatives = [
      `diagnosis.ilike.${pattern}`,
      `sex.ilike.${pattern}`,
      `age_group.ilike.${pattern}`,
      `opd_category.ilike.${pattern}`,
    ];
    if (/^\d+$/.test(searchText)) alternatives.push(`age.eq.${Number(searchText)}`);
    query = query.or(alternatives.join(','));
  }

  const records = [];
  const pageSize = 500;
  let offset = 0;
  while (true) {
    const page = unwrap(await query
      .order('encounter_date', { ascending: false })
      .order('id')
      .range(offset, offset + pageSize - 1));
    records.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return records.map(mapEncounterRow);
}

export async function insertEncounter(facilityId, record) {
  assertSupabase();
  const response = await supabase
    .from('encounters')
    .insert({ facility_id: facilityId, id: record.id, ...encounterPayload(record) })
    .select('*')
    .single();
  if (!response.error && response.data) return mapEncounterRow(response.data);

  const existingResponse = await supabase
    .from('encounters')
    .select('*')
    .eq('facility_id', facilityId)
    .eq('id', record.id)
    .maybeSingle();
  if (existingResponse.error) {
    throw new Error(
      `${response.error?.message || 'Encounter insert was not confirmed.'} Could not verify whether it was saved: ${existingResponse.error.message}`
    );
  }
  if (existingResponse.data) {
    const existing = mapEncounterRow(existingResponse.data);
    const matchesAttempt = existing.date === record.date
      && existing.age === record.age
      && existing.sex === record.sex
      && existing.diagnosis === record.diagnosis
      && existing.isDemo === record.isDemo;
    if (matchesAttempt) return existing;
    throw new Error('This encounter ID already exists with different values; it was not overwritten.');
  }
  throw new Error(response.error?.message || 'Supabase did not confirm the encounter insert.');
}

export async function updateEncounter(facilityId, record) {
  assertSupabase();
  const response = await supabase
    .from('encounters')
    .update(encounterPayload(record))
    .eq('facility_id', facilityId)
    .eq('id', record.id)
    .select('*')
    .single();
  if (!response.error && response.data) return mapEncounterRow(response.data);

  const currentResponse = await supabase
    .from('encounters')
    .select('*')
    .eq('facility_id', facilityId)
    .eq('id', record.id)
    .maybeSingle();
  if (currentResponse.error) {
    throw new Error(
      `${response.error?.message || 'Encounter update was not confirmed.'} Could not verify its saved state: ${currentResponse.error.message}`
    );
  }
  if (currentResponse.data) {
    const current = mapEncounterRow(currentResponse.data);
    const matchesAttempt = current.date === record.date
      && current.age === record.age
      && current.sex === record.sex
      && current.diagnosis === record.diagnosis
      && current.isDemo === record.isDemo;
    if (matchesAttempt) return current;
  }
  throw new Error(response.error?.message || 'Supabase did not confirm the encounter update.');
}

export async function deleteEncounter(facilityId, id) {
  assertSupabase();
  const response = await supabase
    .from('encounters')
    .delete()
    .eq('facility_id', facilityId)
    .eq('id', id)
    .select('id')
    .single();
  if (!response.error && response.data) return response.data;

  const remainingResponse = await supabase
    .from('encounters')
    .select('id')
    .eq('facility_id', facilityId)
    .eq('id', id)
    .maybeSingle();
  if (remainingResponse.error) {
    throw new Error(
      `${response.error?.message || 'Encounter deletion was not confirmed.'} Could not verify its saved state: ${remainingResponse.error.message}`
    );
  }
  if (!remainingResponse.data) return { id };
  throw new Error(response.error?.message || 'Supabase did not confirm the encounter deletion.');
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
    .select('health_center_name, region, zone, woreda, reporting_year, responsible_person_name, position')
    .single());
  return data;
}

export async function deleteFacilityEncounters(facilityId, demoOnly = false) {
  assertSupabase();
  let query = supabase.from('encounters').delete().eq('facility_id', facilityId);
  if (demoOnly) query = query.eq('is_demo', true);
  unwrap(await query);

  let verificationQuery = supabase
    .from('encounters')
    .select('id')
    .eq('facility_id', facilityId)
    .limit(1);
  if (demoOnly) verificationQuery = verificationQuery.eq('is_demo', true);
  const remaining = unwrap(await verificationQuery);
  if (remaining.length > 0) {
    throw new Error('Supabase did not confirm deletion of all matching facility encounters.');
  }
}

function diagnosisKey(name) {
  return String(name || '').trim().toLowerCase();
}

function sameDiagnosis(left, right) {
  return diagnosisKey(left.name) === diagnosisKey(right.name)
    && (left.code || null) === (right.code || null)
    && (left.active !== false) === (right.active !== false)
    && Boolean(left.official) === Boolean(right.official);
}

function normalizedLegacyEncounter(record) {
  const age = Number(record.age);
  const date = String(record.date || '');
  const diagnosis = String(record.diagnosis || '').trim();
  if (!record.id || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isInteger(age) || age < 0 || age > 120
      || !['Male', 'Female'].includes(record.sex) || !diagnosis) {
    throw new Error('Encounter is missing a valid ID, date, age, sex, or diagnosis.');
  }
  return enrichEncounter({ ...record, id: String(record.id), date, age, diagnosis }, record);
}

export async function importLegacyFacilityData(facilityId, legacyData) {
  assertSupabase();
  const current = await loadFacilityData(facilityId);
  const settingsResponse = await supabase
    .from('facility_settings')
    .select('health_center_name, region, zone, woreda, reporting_year, responsible_person_name, position')
    .eq('facility_id', facilityId)
    .single();
  const currentSettings = unwrap(settingsResponse);

  const result = {
    diagnoses: { imported: 0, duplicates: 0, conflicts: 0, failed: 0, details: [] },
    records: { imported: 0, duplicates: 0, conflicts: 0, failed: 0, details: [] },
    settings: { imported: [], unchanged: [], failed: '', values: { ...currentSettings } },
  };
  const diagnosisById = new Map(current.diagnoses.map((item) => [String(item.id), item]));
  const diagnosisByName = new Map(current.diagnoses.map((item) => [diagnosisKey(item.name), item]));
  const diagnosisByCode = new Map(current.diagnoses.filter((item) => item.code).map((item) => [item.code, item]));

  for (let index = 0; index < legacyData.diagnoses.length; index += 1) {
    const source = legacyData.diagnoses[index];
    const diagnosis = {
      id: String(source?.id || ''),
      code: source?.code ? String(source.code).trim() : null,
      name: String(source?.name || '').trim(),
      active: source?.active !== false,
      official: Boolean(source?.official),
    };
    if (!diagnosis.id || !diagnosis.name) {
      result.diagnoses.failed += 1;
      result.diagnoses.details.push(`Diagnosis ${index + 1}: missing ID or name.`);
      continue;
    }

    const sameId = diagnosisById.get(diagnosis.id);
    const sameName = diagnosisByName.get(diagnosisKey(diagnosis.name));
    const sameCode = diagnosis.code ? diagnosisByCode.get(diagnosis.code) : null;
    const existing = sameId || sameName || sameCode;
    if (existing) {
      const isExactDuplicate = sameId
        ? sameDiagnosis(existing, diagnosis)
        : diagnosisKey(existing.name) === diagnosisKey(diagnosis.name)
          && (existing.code || null) === diagnosis.code
          && (existing.active !== false) === (diagnosis.active !== false)
          && Boolean(existing.official) === diagnosis.official;
      if (isExactDuplicate) {
        result.diagnoses.duplicates += 1;
      } else {
        result.diagnoses.conflicts += 1;
        result.diagnoses.details.push(`Diagnosis "${diagnosis.name}" conflicts with an existing catalog entry and was not changed.`);
      }
      continue;
    }

    if (diagnosis.code || diagnosis.official) {
      result.diagnoses.failed += 1;
      result.diagnoses.details.push(
        `Diagnosis "${diagnosis.name}" has a code or approved status and was not imported; only a trusted operator can add approved catalog entries.`
      );
      continue;
    }

    const { data, error } = await supabase
      .from('diagnoses')
      .insert({
        facility_id: facilityId,
        id: diagnosis.id,
        name: diagnosis.name,
        active: diagnosis.active,
      })
      .select('id, code, name, active, official')
      .single();
    if (error) {
      result.diagnoses.failed += 1;
      result.diagnoses.details.push(`Diagnosis "${diagnosis.name}": ${error.message}`);
      continue;
    }
    const saved = mapDiagnosisRow(data);
    result.diagnoses.imported += 1;
    diagnosisById.set(String(saved.id), saved);
    diagnosisByName.set(diagnosisKey(saved.name), saved);
    if (saved.code) diagnosisByCode.set(saved.code, saved);
  }

  const recordById = new Map(current.records.map((item) => [String(item.id), item]));
  for (let index = 0; index < legacyData.records.length; index += 1) {
    const source = legacyData.records[index];
    let record;
    try {
      record = normalizedLegacyEncounter(source || {});
    } catch (error) {
      result.records.failed += 1;
      result.records.details.push(`Encounter ${index + 1}: ${error.message}`);
      continue;
    }

    const existing = recordById.get(String(record.id));
    if (existing) {
      if (existing.date === record.date && existing.age === record.age
          && existing.sex === record.sex && existing.diagnosis === record.diagnosis
          && existing.isDemo === record.isDemo) {
        result.records.duplicates += 1;
      } else {
        result.records.conflicts += 1;
        result.records.details.push(`Encounter ID "${record.id}" already exists with different values; it was not changed.`);
      }
      continue;
    }

    try {
      const saved = await insertEncounter(facilityId, record);
      result.records.imported += 1;
      recordById.set(String(saved.id), saved);
    } catch (error) {
      result.records.failed += 1;
      result.records.details.push(`Encounter ${record.id}: ${error.message}`);
    }
  }

  const settingsColumnMap = {
    healthCenterName: 'health_center_name',
    region: 'region',
    zone: 'zone',
    woreda: 'woreda',
    responsiblePersonName: 'responsible_person_name',
    position: 'position',
  };
  const settingsPatch = {};
  Object.entries(settingsColumnMap).forEach(([legacyKey, databaseKey]) => {
    const localValue = String(legacyData.settings[legacyKey] || '').trim();
    const cloudValue = String(currentSettings[databaseKey] || '').trim();
    if (localValue && !cloudValue) settingsPatch[databaseKey] = localValue;
    else if (localValue && localValue !== cloudValue) result.settings.unchanged.push(legacyKey);
  });
  if (Object.keys(settingsPatch).length > 0) {
    const { data, error } = await supabase
      .from('facility_settings')
      .update(settingsPatch)
      .eq('facility_id', facilityId)
      .select('facility_id')
      .single();
    if (error) result.settings.failed = error.message;
    else {
      if (!data) {
        result.settings.failed = 'Supabase did not confirm the facility settings update.';
      } else {
        result.settings.imported = Object.keys(settingsPatch);
        Object.assign(result.settings.values, settingsPatch);
      }
    }
  }
  if (Number(legacyData.settings.reportingYear)
      && Number(legacyData.settings.reportingYear) !== Number(currentSettings.reporting_year)) {
    result.settings.unchanged.push('reportingYear');
  }

  return result;
}
