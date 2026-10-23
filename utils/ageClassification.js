import { OPD_CATEGORY } from '../constants';

/**
 * Single source of truth for OPD age classification.
 * OPD reporting age groups are: 5–14, 15–29, 30–64, and ≥65.
 * Ages below 5 are outside OPD categories.
 */
export function classifyAge(age) {
  const numericAge = Number(age);

  if (!Number.isInteger(numericAge) || numericAge < 0) {
    return {
      opdCategory: OPD_CATEGORY.OUTSIDE,
      ageGroup: null,
      includedInAdultReport: false,
    };
  }

  if (numericAge >= 5 && numericAge <= 14) {
    return {
      opdCategory: OPD_CATEGORY.ADULT,
      ageGroup: '5–14',
      includedInAdultReport: true,
    };
  }

  if (numericAge >= 15 && numericAge <= 29) {
    return {
      opdCategory: OPD_CATEGORY.ADULT,
      ageGroup: '15–29',
      includedInAdultReport: true,
    };
  }

  if (numericAge >= 30 && numericAge <= 64) {
    return {
      opdCategory: OPD_CATEGORY.ADULT,
      ageGroup: '30–64',
      includedInAdultReport: true,
    };
  }

  if (numericAge >= 65) {
    return {
      opdCategory: OPD_CATEGORY.ADULT,
      ageGroup: '≥65',
      includedInAdultReport: true,
    };
  }

  return {
    opdCategory: OPD_CATEGORY.OUTSIDE,
    ageGroup: null,
    includedInAdultReport: false,
  };
}
