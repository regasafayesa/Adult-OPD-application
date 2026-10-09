import { DEFAULT_SETTINGS, STARTER_DIAGNOSES, STORAGE_KEYS } from '../constants';
import { ESV1_DIAGNOSES } from './esv1Diagnoses';
import { classifyAge } from '../utils/ageClassification';
import { reportingPeriodFromDate } from '../utils/dates';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
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

export function loadRecords() {
  return readJSON(STORAGE_KEYS.RECORDS, []).map((record) => enrichEncounter(record, record));
}

export function saveRecords(records) {
  writeJSON(STORAGE_KEYS.RECORDS, records);
}

export function loadDiagnoses() {
  const savedDiagnoses = readJSON(STORAGE_KEYS.DIAGNOSES, []);
  const stored = Array.isArray(savedDiagnoses) ? savedDiagnoses : [];
  const merged = [...ESV1_DIAGNOSES, ...STARTER_DIAGNOSES].map((item) => ({ ...item }));
  const byId = new Map(merged.map((item) => [item.id, item]));
  const byCode = new Map(merged.filter((item) => item.code).map((item) => [item.code, item]));
  const customByName = new Map(
    merged.filter((item) => !item.official).map((item) => [item.name.trim().toLowerCase(), item])
  );

  stored.forEach((item) => {
    if (!item || typeof item.name !== 'string' || !item.name.trim()) return;

    const existing = byId.get(item.id) || (item.code && byCode.get(item.code));
    if (existing) {
      Object.assign(existing, item, {
        id: existing.id,
        code: existing.code || item.code,
        name: existing.name,
        official: existing.official || item.official,
      });
      return;
    }

    const legacyCustom = !item.code && !item.official && customByName.get(item.name.trim().toLowerCase());
    if (legacyCustom) {
      Object.assign(legacyCustom, item, { id: legacyCustom.id, name: legacyCustom.name });
      return;
    }

    const saved = { ...item };
    merged.push(saved);
    byId.set(saved.id, saved);
    if (saved.code) byCode.set(saved.code, saved);
    if (!saved.official) customByName.set(saved.name.trim().toLowerCase(), saved);
  });

  return merged;
}

export function saveDiagnoses(diagnoses) {
  writeJSON(STORAGE_KEYS.DIAGNOSES, diagnoses);
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...readJSON(STORAGE_KEYS.SETTINGS, {}) };
}

export function saveSettings(settings) {
  writeJSON(STORAGE_KEYS.SETTINGS, settings);
}

export function isDemoLoaded() {
  return localStorage.getItem(STORAGE_KEYS.DEMO_LOADED) === 'true';
}

export function setDemoLoaded(value) {
  localStorage.setItem(STORAGE_KEYS.DEMO_LOADED, value ? 'true' : 'false');
}
