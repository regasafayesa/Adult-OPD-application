import { supabase } from './supabase';
import {
  documentRecognitionError,
  documentRecognitionNetworkError,
} from './documentRecognitionErrors.mjs';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
]);

function assertCloudFacility(facilityId) {
  if (!supabase || !facilityId) {
    throw new Error('Document scanning requires a signed-in cloud facility.');
  }
}

export function validateDocumentFile(file) {
  if (!file) throw new Error('Select a document to upload.');
  if (file.size < 1 || file.size > MAX_FILE_SIZE) {
    throw new Error('Choose a non-empty document no larger than 10 MB.');
  }
  const extension = file.name.toLowerCase().match(/\.(pdf|jpe?g|png)$/)?.[0];
  const mimeType = extension === '.pdf'
    ? 'application/pdf'
    : extension === '.png'
      ? 'image/png'
      : extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : '';
  if (!mimeType || !FILE_TYPES.has(mimeType)) {
    throw new Error('Choose a JPG, PNG, or PDF document.');
  }
  if (file.type && file.type !== mimeType) {
    throw new Error('The selected file type does not match its file extension.');
  }
  return mimeType;
}

export async function hashDocument(file) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure document fingerprinting is unavailable in this browser.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createDocumentImport({
  facilityId,
  file,
  fileSha256,
  documentType,
}) {
  assertCloudFacility(facilityId);
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify your sign-in session: ${userError.message}`);
  if (!userData?.user?.id) throw new Error('Sign in before importing a document.');

  const { data, error } = await supabase
    .from('document_imports')
    .insert({
      facility_id: facilityId,
      uploaded_by: userData.user.id,
      file_name: file.name,
      file_size_bytes: file.size,
      file_sha256: fileSha256,
      document_type: documentType,
      status: 'uploaded',
    })
    .select('id')
    .single();
  if (error?.code === '23505') {
    const { data: existing, error: lookupError } = await supabase
      .from('document_imports')
      .select('id, status')
      .eq('facility_id', facilityId)
      .eq('file_sha256', fileSha256)
      .maybeSingle();
    if (lookupError) throw new Error(`This document may already be recorded, but its import history could not be checked: ${lookupError.message}`);
    if (existing?.status === 'failed') {
      const { error: retryError } = await supabase
        .from('document_imports')
        .update({
          status: 'uploaded',
          document_type: documentType,
          file_name: file.name,
          file_size_bytes: file.size,
          extraction_result: null,
          reporting_month: null,
          reporting_year: null,
          recognized_entries: 0,
          imported_entries: 0,
          imported_at: null,
        })
        .eq('facility_id', facilityId)
        .eq('id', existing.id);
      if (retryError) throw new Error(`Could not retry the failed document: ${retryError.message}`);
      return existing.id;
    }
    throw new Error('This exact document was already scanned for this facility. Review Document Import History.');
  }
  if (error) throw new Error(`Could not record this import: ${error.message}`);
  return data.id;
}

export async function extractDocument({ facilityId, file, documentType }) {
  assertCloudFacility(facilityId);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Could not verify your sign-in session: ${error.message}`);
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error('Your sign-in session expired. Sign in again before processing the document.');

  const form = new FormData();
  form.append('facilityId', facilityId);
  form.append('documentType', documentType);
  form.append('file', file, file.name);
  let response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/opd-document-extract`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: form,
      }
    );
  } catch {
    throw new Error(documentRecognitionNetworkError());
  }
  let result;
  try {
    result = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(documentRecognitionError(response.status));
    }
    throw new Error('The document recognition service returned an unreadable response.');
  }
  if (!response.ok) {
    throw new Error(documentRecognitionError(response.status, result));
  }
  if (!result.extraction || result.extraction.documentType !== documentType) {
    throw new Error('The AI provider returned an invalid response for the selected document type.');
  }
  return result.extraction;
}

export async function updateDocumentImport(facilityId, importId, patch) {
  assertCloudFacility(facilityId);
  const { data, error } = await supabase
    .from('document_imports')
    .update(patch)
    .eq('facility_id', facilityId)
    .eq('id', importId)
    .select('id')
    .single();
  if (error) throw new Error(`Could not update import history: ${error.message}`);
  if (!data) throw new Error('The import history update was not confirmed.');
}

export async function deleteImportedDocumentHistory(facilityId, importId) {
  assertCloudFacility(facilityId);
  const { data, error } = await supabase
    .from('document_imports')
    .delete()
    .eq('facility_id', facilityId)
    .eq('id', importId)
    .eq('status', 'imported')
    .select('id')
    .single();
  if (error) throw new Error(`Could not remove imported document history: ${error.message}`);
  if (!data) throw new Error('The imported document history removal was not confirmed.');
}

export async function loadDocumentImportHistory(facilityId) {
  assertCloudFacility(facilityId);
  const { data, error } = await supabase
    .from('document_imports')
    .select('id, uploaded_by, file_name, file_size_bytes, document_type, status, reporting_year, reporting_month, recognized_entries, imported_entries, extraction_result, created_at, updated_at, imported_at')
    .eq('facility_id', facilityId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Could not load document import history: ${error.message}`);
  return data || [];
}
