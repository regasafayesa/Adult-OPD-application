import { ADULT_AGE_GROUPS, SEX } from '../constants.js';

export function emptySexCounts() {
  return { male: 0, female: 0, total: 0 };
}

export function incrementSexCounts(counts, sex) {
  const next = { ...counts };
  if (sex === SEX.MALE) next.male += 1;
  if (sex === SEX.FEMALE) next.female += 1;
  next.total = next.male + next.female;
  return next;
}

export function emptyAgeGroupTable() {
  return ADULT_AGE_GROUPS.reduce((table, group) => {
    table[group] = emptySexCounts();
    return table;
  }, {});
}

export function sumAgeGroupTable(table) {
  return ADULT_AGE_GROUPS.reduce(
    (sum, group) => {
      const row = table[group] || emptySexCounts();
      return {
        male: sum.male + row.male,
        female: sum.female + row.female,
        total: sum.total + row.total,
      };
    },
    emptySexCounts()
  );
}

export function rowAddsUp({ male, female, total }) {
  return male + female === total;
}
