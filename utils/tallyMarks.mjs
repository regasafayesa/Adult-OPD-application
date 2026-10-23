export function normalizeTallyCount(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function getTallyGroupSizes(value) {
  const count = normalizeTallyCount(value);
  const completeGroups = Math.floor(count / 5);
  const remainder = count % 5;

  return [
    ...Array(completeGroups).fill(5),
    ...(remainder ? [remainder] : []),
  ];
}

export function tallyMarks(value) {
  return getTallyGroupSizes(value)
    .map((groupSize) => (groupSize === 5 ? '||||/' : '|'.repeat(groupSize)))
    .join(' ');
}
