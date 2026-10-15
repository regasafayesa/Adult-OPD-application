import { STORAGE_KEYS } from '../constants';
import { classifyAge } from '../utils/ageClassification';
import { reportingPeriodFromDate } from '../utils/dates';

function readLegacyJSON(key, fallback) {
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch (error) {
    throw new Error(`Could not read existing browser data for ${key}: ${error.message}`);
  }
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Existing browser data for ${key} is not valid JSON. It was left unchanged.`);
  }
}

export function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function enrichEncounter(input, existing = {}) {
  const age = Number(input.age);
  const classification = classifyAge(age);
  const period = reportingPeriodFromDate(input.date);
  const now = new Date().toISOString();

  return {
    id: existing.id || input.id || createId('enc'),
    date: input.date,
    age,
    sex: input.sex,
    diagnosis: String(input.diagnosis || '').trim(),
    ageGroup: classification.ageGroup,
    opdCategory: classification.opdCategory,
    includedInAdultReport: classification.includedInAdultReport,
    reportingMonth: period.reportingMonth,
    reportingYear: period.reportingYear,
    isDemo: Boolean(existing.isDemo || input.isDemo),
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };
}

export function readLegacyLocalData() {
  const records = readLegacyJSON(STORAGE_KEYS.RECORDS, []);
  const diagnoses = readLegacyJSON(STORAGE_KEYS.DIAGNOSES, []);
  const settings = readLegacyJSON(STORAGE_KEYS.SETTINGS, {});

  if (!Array.isArray(records)) {
    throw new Error('Existing browser encounter data is not a list. It was left unchanged.');
  }
  if (!Array.isArray(diagnoses)) {
    throw new Error('Existing browser diagnosis data is not a list. It was left unchanged.');
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('Existing browser settings are invalid. They were left unchanged.');
  }

  return { records, diagnoses, settings };
}
