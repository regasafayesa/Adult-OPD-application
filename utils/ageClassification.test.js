import { classifyAge } from './ageClassification';

describe('classifyAge', () => {
  test('age 7 is Adult OPD 5–14 and included', () => {
    expect(classifyAge(7)).toEqual({
      opdCategory: 'Adult OPD',
      ageGroup: '5–14',
      includedInAdultReport: true,
    });
  });

  test('age 19 is included in 15–29', () => {
    expect(classifyAge(19)).toEqual({
      opdCategory: 'Adult OPD',
      ageGroup: '15–29',
      includedInAdultReport: true,
    });
  });

  test('age 15 and 29 are included in 15–29', () => {
    expect(classifyAge(15).ageGroup).toBe('15–29');
    expect(classifyAge(29).ageGroup).toBe('15–29');
  });

  test('age 27 is Adult OPD 15–29 and included', () => {
    expect(classifyAge(27)).toEqual({
      opdCategory: 'Adult OPD',
      ageGroup: '15–29',
      includedInAdultReport: true,
    });
  });

  test('age 45 is Adult OPD 30–64 and included', () => {
    expect(classifyAge(45)).toEqual({
      opdCategory: 'Adult OPD',
      ageGroup: '30–64',
      includedInAdultReport: true,
    });
  });

  test('age 65 is Adult OPD ≥65 and included', () => {
    expect(classifyAge(65)).toEqual({
      opdCategory: 'Adult OPD',
      ageGroup: '≥65',
      includedInAdultReport: true,
    });
  });

  test('age 80 is Adult OPD ≥65 and included', () => {
    expect(classifyAge(80)).toEqual({
      opdCategory: 'Adult OPD',
      ageGroup: '≥65',
      includedInAdultReport: true,
    });
  });

  test('age 4 is outside Adult OPD categories', () => {
    expect(classifyAge(4)).toEqual({
      opdCategory: 'Outside Adult OPD Categories',
      ageGroup: null,
      includedInAdultReport: false,
    });
  });

  test('uses the requested age ranges', () => {
    expect(classifyAge(5).ageGroup).toBe('5–14');
    expect(classifyAge(14).ageGroup).toBe('5–14');
    expect(classifyAge(30).ageGroup).toBe('30–64');
    expect(classifyAge(64).ageGroup).toBe('30–64');
    expect(classifyAge(65).ageGroup).toBe('≥65');
    expect(classifyAge(32).ageGroup).toBe('30–64');
  });
});
