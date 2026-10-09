import { SEX } from '../constants';
import { parseISODate } from './dates';
import { classifyAge } from './ageClassification';

export function validateEncounter({ date, age, sex, diagnosis }, { diagnoses = [] } = {}) {
  const errors = {};

  if (!date) {
    errors.date = 'Date is required.';
  } else if (!parseISODate(date)) {
    errors.date = 'Enter a valid date.';
  }

  if (age === '' || age === null || age === undefined) {
    errors.age = 'Age is required.';
  } else {
    const numericAge = Number(age);
    if (!Number.isInteger(numericAge) || String(age).trim() === '' || Number.isNaN(numericAge)) {
      errors.age = 'Age must be a whole number.';
    } else if (numericAge < 0) {
      errors.age = 'Age cannot be negative.';
    } else if (numericAge < 5) {
      errors.age = 'Ages below 5 are not included in Adult OPD reporting. Do not assign this patient to an Adult OPD age group.';
    } else if (numericAge > 120) {
      errors.age = 'Enter a realistic age (0–120).';
    }
  }

  if (!sex) {
    errors.sex = 'Sex is required.';
  } else if (sex !== SEX.MALE && sex !== SEX.FEMALE) {
    errors.sex = 'Sex must be Male or Female.';
  }

  const diagnosisName = typeof diagnosis === 'string' ? diagnosis.trim() : '';
  if (!diagnosisName) {
    errors.diagnosis = 'Diagnosis is required.';
  } else {
    const knownNames = diagnoses.map((item) => item.name);
    if (knownNames.length > 0 && !knownNames.includes(diagnosisName)) {
      errors.diagnosis = 'Select a diagnosis from the configured list.';
    }
  }

  const classification = Number.isInteger(Number(age)) ? classifyAge(Number(age)) : null;

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    classification,
  };
}
