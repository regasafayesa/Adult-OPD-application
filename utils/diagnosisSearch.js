function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokens(value) {
  return normalize(value).match(/[a-z0-9]+/g) || [];
}

function oneEditAway(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}

function diagnosisScore(diagnosis, queryTokens, normalizedQuery) {
  const name = normalize(diagnosis.name);
  const code = normalize(diagnosis.code).replace(/[^a-z0-9]/g, '');
  const nameTokens = tokens(diagnosis.name);
  const aliasTokens = (diagnosis.aliases || []).flatMap(tokens);
  const codeTokens = tokens(diagnosis.code);
  const normalizedCodeQuery = normalizedQuery.replace(/[^a-z0-9]/g, '');

  if (code && normalizedCodeQuery && code === normalizedCodeQuery) return 0;
  if (code && normalizedCodeQuery && code.startsWith(normalizedCodeQuery)) return 1;
  if (name.trim() === normalizedQuery) return 2;
  if (name.startsWith(normalizedQuery)) return 3;
  if (name.includes(normalizedQuery)) return 4;

  const allTermsMatch = queryTokens.every((queryToken) => {
    const looksLikeCode = /[a-z]/.test(queryToken) && /[0-9]/.test(queryToken);
    if (looksLikeCode) return code.includes(queryToken.replace(/[^a-z0-9]/g, ''));

    return [...nameTokens, ...aliasTokens].some(
      (candidateToken) =>
        candidateToken.includes(queryToken) ||
        (queryToken.length >= 4 && oneEditAway(queryToken, candidateToken))
    );
  });
  return allTermsMatch ? 5 : Number.POSITIVE_INFINITY;
}

export function findDiagnosisMatches(diagnoses, query, limit = 25) {
  const normalizedQuery = normalize(query).trim();
  const queryTokens = tokens(normalizedQuery);
  if (!queryTokens.length) return [];

  return diagnoses
    .filter((item) => item.active !== false)
    .map((item) => ({ item, score: diagnosisScore(item, queryTokens, normalizedQuery) }))
    .filter((result) => Number.isFinite(result.score))
    .sort((left, right) => left.score - right.score || left.item.name.localeCompare(right.item.name))
    .slice(0, limit)
    .map(({ item }) => item);
}