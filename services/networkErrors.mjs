const NETWORK_ERROR_PATTERN = /failed to fetch|fetch failed|network|timeout|timed out/i;

export function isNetworkError(error) {
  return NETWORK_ERROR_PATTERN.test(String(error?.message || error || ''));
}

export function getErrorMessage(error, fallback = '') {
  if (isNetworkError(error)) return '';
  return String(error?.message || fallback || '');
}
