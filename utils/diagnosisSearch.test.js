import { findDiagnosisMatches } from './diagnosisSearch';
import { ESV1_DIAGNOSES } from '../services/esv1Diagnoses';

describe('ESV-1 diagnosis catalogue', () => {
  test('contains all 219 supplied entries with unique official codes', () => {
    expect(ESV1_DIAGNOSES).toHaveLength(219);
    expect(new Set(ESV1_DIAGNOSES.map((item) => item.code)).size).toBe(219);
    expect(ESV1_DIAGNOSES.every((item) => item.code && item.name && item.official)).toBe(true);
  });
});

describe('findDiagnosisMatches', () => {
  const diagnoses = [
    { id: 'cholera', code: '1A00', name: 'Cholera', active: true },
    { id: 'tb', code: '1B10.0', name: 'Respiratory tuberculosis, confirmed', active: true },
    { id: 'custom', name: 'Urinary tract infection', aliases: ['UTI'], active: true },
    { id: 'disabled', code: '1A02', name: 'Intestinal infections due to Shigella', active: false },
  ];

  test('matches partial case-insensitive diagnosis names', () => {
    expect(findDiagnosisMatches(diagnoses, 'CHOL')).toContain(diagnoses[0]);
  });

  test('matches partial words and multiple diagnosis-name terms', () => {
    expect(findDiagnosisMatches(diagnoses, 'respiratory tuberc')).toContain(diagnoses[1]);
    expect(findDiagnosisMatches(diagnoses, 'tract infect')).toContain(diagnoses[2]);
  });

  test('matches official codes with or without punctuation', () => {
    expect(findDiagnosisMatches(diagnoses, '1b10.0')).toContain(diagnoses[1]);
    expect(findDiagnosisMatches(diagnoses, '1B100')).toContain(diagnoses[1]);
  });

  test('matches supplied aliases and reasonable one-character spelling variations', () => {
    expect(findDiagnosisMatches(diagnoses, 'UTI')).toContain(diagnoses[2]);
    expect(findDiagnosisMatches(diagnoses, 'tuberculosos')).toContain(diagnoses[1]);
  });

  test('does not offer inactive diagnoses or list all diagnoses for an empty query', () => {
    expect(findDiagnosisMatches(diagnoses, 'Shigella')).toEqual([]);
    expect(findDiagnosisMatches(diagnoses, '')).toEqual([]);
  });
});