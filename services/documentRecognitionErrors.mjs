export function documentRecognitionError(status, body = {}) {
  if (status === 401) return 'Your sign-in session is invalid or expired. Sign in again.';
  if (status === 403) return 'You do not have permission to scan documents for this facility.';
  if (status === 404) {
    return 'The document recognition Edge Function is not deployed to this Supabase project. Deploy opd-document-extract and verify the configured project.';
  }
  if (status === 413) return 'The document exceeds the 10 MB upload limit.';
  if (status === 415) return 'Unsupported document. Choose a valid JPG, PNG, or PDF file.';
  if (status === 502) return 'The AI provider could not process this document. Retry or enter the information manually.';
  if (status === 503 && /api key|secret/i.test(body?.error || '')) {
    return 'The AI vision API key is missing from the Supabase Edge Function secrets.';
  }
  if (status === 503) return 'The document recognition service is not configured on the server.';
  if (status === 504) return 'The AI provider request timed out. Retry or enter the information manually.';
  return body?.error || 'The document could not be processed.';
}

export function documentRecognitionNetworkError() {
  return 'Could not reach the document recognition service. The Edge Function may not be deployed, or a CORS, network, or project-URL issue blocked the request. Verify the configured Supabase project and deploy opd-document-extract.';
}
