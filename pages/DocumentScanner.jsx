import React, { useEffect, useMemo, useState } from 'react';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import { MONTH_NAMES, SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import {
  calculateMonthlyDiagnosisTotals,
  emptyMonthlyDiagnosisCounts,
  MONTHLY_DIAGNOSIS_AGE_GROUPS,
  MONTHLY_DIAGNOSIS_COUNT_FIELDS,
  validateMonthlyDiagnosisCount,
} from '../services/monthlyDiagnosisCounts.mjs';
import {
  createDocumentImport,
  extractDocument,
  hashDocument,
  loadDocumentImportHistory,
  updateDocumentImport,
  validateDocumentFile,
} from '../services/documentImports';
import { createId } from '../services/storage';
import { validateEncounter } from '../utils/validation';

const EMPTY_EXTRACTION = {
  documentType: '',
  reportingMonth: null,
  reportingYear: null,
  encounters: [],
  summaries: [],
  notes: [],
};

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCode(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function exactDiagnosis(diagnoses, name, code) {
  const active = diagnoses.filter((item) => item.active !== false);
  const normalizedName = normalizeName(name);
  const normalizedCode = normalizeCode(code);
  return active.find((item) => normalizedName && normalizeName(item.name) === normalizedName)
    || active.find((item) => normalizedCode && normalizeCode(item.code) === normalizedCode)
    || null;
}

function recognizedExtraction(extraction, diagnoses, documentType) {
  if (documentType === 'individual') {
    return {
      ...EMPTY_EXTRACTION,
      ...extraction,
      encounters: (extraction.encounters || []).map((row) => {
        const diagnosis = exactDiagnosis(diagnoses, row.diagnosis, row.diagnosisCode);
        return {
          ...row,
          recordId: row.recordId || createId('enc'),
          date: row.date || '',
          diagnosis: diagnosis?.name || row.diagnosis || '',
          diagnosisId: diagnosis?.id || '',
          age: row.age == null ? '' : String(row.age),
          sex: row.sex === SEX.FEMALE || row.sex === SEX.MALE ? row.sex : '',
        };
      }),
      summaries: [],
    };
  }
  return {
    ...EMPTY_EXTRACTION,
    ...extraction,
    encounters: [],
    summaries: (extraction.summaries || []).map((summary) => {
      const diagnosis = exactDiagnosis(diagnoses, summary.diagnosis, summary.diagnosisCode);
      return {
        ...summary,
        diagnosis: diagnosis?.name || summary.diagnosis || '',
        diagnosisId: diagnosis?.id || '',
        ...Object.fromEntries(MONTHLY_DIAGNOSIS_COUNT_FIELDS.map((field) => [
          field,
          summary[field] == null ? '' : String(summary[field]),
        ])),
        registrationBookTotal: summary.registrationBookTotal == null
          ? ''
          : String(summary.registrationBookTotal),
        discrepancyConfirmed: false,
        id: createId('aggregate'),
      };
    }),
  };
}

function fileSizeLabel(size) {
  return size < 1024 * 1024
    ? `${(size / 1024).toFixed(0)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status) {
  return ({
    uploaded: 'Uploaded',
    processing: 'Processing',
    awaiting_review: 'Awaiting Review',
    draft: 'Draft',
    imported: 'Imported',
    failed: 'Failed',
    cancelled: 'Cancelled',
  })[status] || status;
}

function fieldErrors(row, diagnoses) {
  const diagnosis = diagnoses.find((item) =>
    item.id === row.diagnosisId && item.active !== false
  );
  return validateEncounter({
    date: row.date,
    age: row.age,
    sex: row.sex,
    diagnosis: diagnosis?.name || '',
  }, { diagnoses }).errors;
}

function isSameEncounter(left, right) {
  return left.date === right.date
    && Number(left.age) === Number(right.age)
    && left.sex === right.sex
    && normalizeName(left.diagnosis) === normalizeName(right.diagnosis);
}

function newMonthlySummary(row, year, month, diagnoses) {
  const diagnosis = diagnoses.find((item) => item.id === row.diagnosisId);
  return {
    ...emptyMonthlyDiagnosisCounts(),
    ...Object.fromEntries(MONTHLY_DIAGNOSIS_COUNT_FIELDS.map((field) => [
      field,
      row[field],
    ])),
    id: row.id,
    facilityId: '',
    reportingYear: Number(year),
    reportingMonth: Number(month),
    diagnosisId: row.diagnosisId,
    diagnosisName: diagnosis?.name || row.diagnosis,
    diagnosisCode: diagnosis?.code || '',
    diagnosisSource: row.diagnosisId.startsWith('official:') ? 'official' : 'facility',
    registrationBookTotal: row.registrationBookTotal,
    discrepancyConfirmed: Boolean(row.discrepancyConfirmed),
    notes: '',
  };
}

function summaryStatus(row, year, month, diagnoses, existing, allRows) {
  const candidate = newMonthlySummary(row, year, month, diagnoses);
  const validation = validateMonthlyDiagnosisCount(candidate, { diagnoses });
  const errors = { ...validation.errors };
  if (existing.some((item) =>
    Number(item.reportingYear) === Number(year)
    && Number(item.reportingMonth) === Number(month)
    && item.diagnosisId === row.diagnosisId
  )) {
    errors.conflict = 'A saved summary already exists for this diagnosis and reporting month. Reconcile it in Aggregate Entry before importing this sheet.';
  }
  if (allRows.some((item) => item.id !== row.id && item.diagnosisId && item.diagnosisId === row.diagnosisId)) {
    errors.duplicate = 'The document contains this diagnosis more than once. Resolve the duplicate rows before importing.';
  }
  const totals = calculateMonthlyDiagnosisTotals(candidate);
  return { errors, totals, candidate };
}

export default function DocumentScanner() {
  const {
    facilityId,
    isCloud,
    role,
    diagnoses,
    records,
    monthlyDiagnosisCounts,
    addRecords,
    saveMonthlyDiagnosisCounts,
  } = useAdultOpd();
  const [documentType, setDocumentType] = useState('individual');
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [extraction, setExtraction] = useState(null);
  const [importId, setImportId] = useState('');
  const [period, setPeriod] = useState({ month: '', year: '' });
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!file) {
      setFileUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!isCloud || !facilityId) {
      setHistory([]);
      setHistoryError('Document scanning requires a signed-in cloud facility and the migration.');
      return undefined;
    }
    let active = true;
    loadDocumentImportHistory(facilityId)
      .then((rows) => {
        if (active) {
          setHistory(rows);
          setHistoryError('');
        }
      })
      .catch((loadError) => {
        if (active) setHistoryError(loadError.message);
      });
    return () => {
      active = false;
    };
  }, [facilityId, isCloud]);

  const activeDiagnoses = useMemo(
    () => diagnoses.filter((item) => item.active !== false),
    [diagnoses]
  );
  const extractedRows = documentType === 'individual'
    ? extraction?.encounters || []
    : extraction?.summaries || [];
  const maxSourcePage = Math.max(
    1,
    ...extractedRows.map((row) => Number(row.page) || 1)
  );

  const encounterReview = useMemo(() => {
    if (documentType !== 'individual' || !extraction) return [];
    return extraction.encounters.map((row, index) => {
      const errors = fieldErrors(row, diagnoses);
      const duplicate = records.some((record) => isSameEncounter(row, record))
        || extraction.encounters.slice(0, index).some((previous) => isSameEncounter(row, previous));
      return { id: index, errors, duplicate };
    });
  }, [diagnoses, documentType, extraction, records]);

  const summaryReview = useMemo(() => {
    if (documentType !== 'monthly_tally' || !extraction) return [];
    return extraction.summaries.map((row) => ({
      id: row.id,
      ...summaryStatus(row, period.year, period.month, diagnoses, monthlyDiagnosisCounts, extraction.summaries),
    }));
  }, [diagnoses, documentType, extraction, monthlyDiagnosisCounts, period]);

  const invalidEncounterCount = encounterReview.filter((item) => Object.keys(item.errors).length).length;
  const potentialDuplicateCount = encounterReview.filter((item) => item.duplicate).length;
  const invalidSummaryCount = summaryReview.filter((item) => Object.keys(item.errors).length).length;
  const selectedSummaryCounts = extraction?.summaries || [];
  const aggregateTotals = selectedSummaryCounts.reduce((result, row) => {
    const totals = calculateMonthlyDiagnosisTotals(row);
    const hasMissingCells = MONTHLY_DIAGNOSIS_COUNT_FIELDS.some((field) => row[field] === '');
    result.female += totals.female;
    result.male += totals.male;
    result.overall += totals.total;
    result.hasMissingCells ||= hasMissingCells;
    return result;
  }, { female: 0, male: 0, overall: 0, hasMissingCells: false });

  function chooseFile(nextFile) {
    setError('');
    setMessage('');
    if (!nextFile) {
      setFile(null);
      setExtraction(null);
      setImportId('');
      setProgress(0);
      setReviewConfirmed(false);
      setDuplicateConfirmed(false);
      return;
    }
    try {
      validateDocumentFile(nextFile);
    } catch (validationError) {
      setError(validationError.message);
      return;
    }
    setFile(nextFile);
    setPreviewPage(1);
    setZoom(1);
    setExtraction(null);
    setImportId('');
    setReviewConfirmed(false);
    setDuplicateConfirmed(false);
    setProgress(0);
  }

  function updateEncounter(index, field, value) {
    setExtraction((previous) => ({
      ...previous,
      encounters: previous.encounters.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const updated = { ...row, [field]: value };
        if (field === 'diagnosis') {
          const diagnosis = activeDiagnoses.find((item) => item.name === value);
          updated.diagnosisId = diagnosis?.id || '';
        }
        return updated;
      }),
    }));
    setReviewConfirmed(false);
  }

  function updateSummary(index, field, value) {
    setExtraction((previous) => ({
      ...previous,
      summaries: previous.summaries.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const updated = { ...row, [field]: value };
        if (field === 'diagnosis') {
          const diagnosis = activeDiagnoses.find((item) => item.name === value);
          updated.diagnosisId = diagnosis?.id || '';
        }
        if (field === 'registrationBookTotal' || MONTHLY_DIAGNOSIS_COUNT_FIELDS.includes(field)) {
          updated.discrepancyConfirmed = false;
        }
        return updated;
      }),
    }));
    setReviewConfirmed(false);
  }

  async function refreshHistory() {
    const rows = await loadDocumentImportHistory(facilityId);
    setHistory(rows);
    setHistoryError('');
  }

  async function processDocument() {
    setError('');
    setMessage('');
    setProgress(5);
    setProcessing(true);
    let createdImportId = '';
    try {
      validateDocumentFile(file);
      const fileSha256 = await hashDocument(file);
      createdImportId = await createDocumentImport({
        facilityId,
        file,
        fileSha256,
        documentType,
      });
      setImportId(createdImportId);
      setProgress(20);
      await updateDocumentImport(facilityId, createdImportId, { status: 'processing' });
      setProgress(35);
      const result = await extractDocument({ facilityId, file, documentType });
      setProgress(85);
      const normalized = recognizedExtraction(result, activeDiagnoses, documentType);
      const reportingMonth = normalized.reportingMonth || null;
      const reportingYear = normalized.reportingYear || null;
      setExtraction(normalized);
      setPeriod({
        month: reportingMonth ? String(reportingMonth) : '',
        year: reportingYear ? String(reportingYear) : '',
      });
      setReviewConfirmed(false);
      setDuplicateConfirmed(false);
      await updateDocumentImport(facilityId, createdImportId, {
        status: 'awaiting_review',
        extraction_result: normalized,
        reporting_month: reportingMonth,
        reporting_year: reportingYear,
        recognized_entries: documentType === 'individual'
          ? normalized.encounters.length
          : normalized.summaries.length,
      });
      setProgress(100);
      setMessage('Extraction finished. Review every row; no information has been imported.');
      await refreshHistory();
    } catch (processError) {
      setError(processError.message || 'The document could not be processed.');
      if (createdImportId) {
        try {
          await updateDocumentImport(facilityId, createdImportId, { status: 'failed' });
          await refreshHistory();
        } catch (historyUpdateError) {
          setError(`${processError.message || 'The document could not be processed.'} Import history could not be updated: ${historyUpdateError.message}`);
        }
      }
    } finally {
      setProcessing(false);
    }
  }

  async function saveDraft() {
    if (!importId || !extraction) return;
    setError('');
    try {
      await updateDocumentImport(facilityId, importId, {
        status: 'draft',
        extraction_result: extraction,
        reporting_month: period.month ? Number(period.month) : null,
        reporting_year: period.year ? Number(period.year) : null,
        recognized_entries: extractedRows.length,
      });
      await refreshHistory();
      setMessage('Draft saved. The original document was not retained; reopen this draft from import history to continue reviewing.');
    } catch (draftError) {
      setError(draftError.message);
    }
  }

  async function cancelImport() {
    if (!importId) {
      setExtraction(null);
      setMessage('Review cancelled.');
      return;
    }
    setError('');
    try {
      await updateDocumentImport(facilityId, importId, {
        status: 'cancelled',
        extraction_result: null,
      });
      setExtraction(null);
      setImportId('');
      await refreshHistory();
      setMessage('Import cancelled. The original document was not retained.');
    } catch (cancelError) {
      setError(cancelError.message);
    }
  }

  async function markImported(importedEntries) {
    if (!importId) throw new Error('Import history could not be identified.');
    await updateDocumentImport(facilityId, importId, {
      status: 'imported',
      imported_at: new Date().toISOString(),
      imported_entries: importedEntries,
      extraction_result: null,
      reporting_month: period.month ? Number(period.month) : null,
      reporting_year: period.year ? Number(period.year) : null,
    });
    setExtraction(null);
    setMessage(`Import complete: ${importedEntries} ${documentType === 'individual' ? 'encounter(s)' : 'diagnosis summary row(s)'} confirmed saved.`);
    try {
      await refreshHistory();
    } catch (historyRefreshError) {
      setHistoryError(`Import was confirmed, but history could not be refreshed: ${historyRefreshError.message}`);
    }
  }

  async function importIndividualEncounters() {
    setError('');
    const duplicateRequiresConfirm = potentialDuplicateCount > 0 && !duplicateConfirmed;
    if (invalidEncounterCount || duplicateRequiresConfirm || !reviewConfirmed) return;
    setProcessing(true);
    try {
      const entries = extraction.encounters.map((row) => ({
        id: row.recordId || createId('enc'),
        date: row.date,
        age: Number(row.age),
        sex: row.sex,
        diagnosis: activeDiagnoses.find((item) => item.id === row.diagnosisId)?.name || '',
        diagnosisId: row.diagnosisId,
        diagnosisCode: activeDiagnoses.find((item) => item.id === row.diagnosisId)?.code || '',
      }));
      const result = await addRecords(entries);
      if (!result.ok) throw new Error(result.error);
      const savedCount = result.savedRecords.length;
      if (savedCount !== entries.length) {
        await updateDocumentImport(facilityId, importId, {
          status: 'awaiting_review',
          imported_entries: savedCount,
          extraction_result: extraction,
        });
        setError(`${savedCount} of ${entries.length} encounter(s) were confirmed saved. Review the saved and remaining rows before retrying.`);
        await refreshHistory();
        return;
      }
      await markImported(savedCount);
    } catch (importError) {
      setError(importError.message || 'The encounters could not be imported.');
    } finally {
      setProcessing(false);
    }
  }

  async function importMonthlySummaries() {
    setError('');
    if (invalidSummaryCount || !reviewConfirmed) return;
    setProcessing(true);
    try {
      const summaries = extraction.summaries.map((row) =>
        newMonthlySummary(row, period.year, period.month, activeDiagnoses)
      );
      const result = await saveMonthlyDiagnosisCounts(summaries);
      if (!result.ok) throw new Error(result.error);
      if (result.errors.length > 0 || result.savedRecords.length !== summaries.length) {
        setError('The cloud did not confirm every summary. Review Aggregate Entry and import history before retrying.');
        return;
      }
      await markImported(result.savedRecords.length);
    } catch (importError) {
      setError(importError.message || 'The summaries could not be imported.');
    } finally {
      setProcessing(false);
    }
  }

  function resumeDraft(row) {
    if (!row.extraction_result) return;
    setDocumentType(row.document_type);
    setExtraction(recognizedExtraction(row.extraction_result, activeDiagnoses, row.document_type));
    setImportId(row.id);
    setPeriod({
      month: row.reporting_month ? String(row.reporting_month) : '',
      year: row.reporting_year ? String(row.reporting_year) : '',
    });
    setFile(null);
    setReviewConfirmed(false);
    setDuplicateConfirmed(false);
    setError('');
    setMessage('Draft restored. The original document is not stored; review the saved extraction before importing.');
  }

  const canEdit = role === 'owner' || role === 'admin' || role === 'data_entry';
  const isPdf = file?.name.toLowerCase().endsWith('.pdf');
  const isValidPeriod = Number.isInteger(Number(period.year))
    && Number(period.year) >= 1 && Number(period.year) <= 9999
    && Number.isInteger(Number(period.month)) && Number(period.month) >= 1 && Number(period.month) <= 12;

  return (
    <main className="aopd-page aopd-document-scanner">
      <header className="aopd-scanner-heading">
        <div>
          <h2>AI Document Scanner</h2>
          <p className="aopd-lede">Upload an OPD document, review the extracted information, then explicitly import verified entries.</p>
        </div>
        <span className="aopd-scanner-icon" aria-hidden="true">▤</span>
      </header>

      <div className="aopd-scanner-notice" role="note">
        Uploaded originals are processed in memory and are not stored by this app. Document content is sent to OpenAI for extraction. Use only with facility authorization and in accordance with your privacy policy. Do not upload documents containing names or identifiers.
      </div>

      {(!isCloud || !facilityId || !canEdit) && (
        <p className="aopd-error" role="alert">
          The scanner is available to authorized facility staff in cloud mode only. Manual patient and aggregate entry remain available.
        </p>
      )}

      <section className="aopd-scanner-setup" aria-label="Document type and upload">
        <fieldset className="aopd-document-types" disabled={processing || Boolean(extraction)}>
          <legend>Select document type</legend>
          <label>
            <input
              type="radio"
              name="documentType"
              value="individual"
              checked={documentType === 'individual'}
              onChange={() => setDocumentType('individual')}
            />
            <span>
              <strong>Individual Patient Registration</strong>
              <small>Extract dated patient encounters with age, sex, and diagnosis.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name="documentType"
              value="monthly_tally"
              checked={documentType === 'monthly_tally'}
              onChange={() => setDocumentType('monthly_tally')}
            />
            <span>
              <strong>Monthly OPD Tally Sheet</strong>
              <small>Extract diagnosis-specific Female/Male counts for the six reporting age groups.</small>
            </span>
          </label>
        </fieldset>

        <div
          className={`aopd-document-dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            chooseFile(event.dataTransfer.files[0]);
          }}
        >
          <input
            id="aopd-document-file"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(event) => {
              chooseFile(event.target.files[0]);
              event.target.value = '';
            }}
            disabled={processing || !isCloud || !canEdit}
          />
          <label htmlFor="aopd-document-file">
            <strong>Drop an OPD document here</strong>
            <span>or browse for a JPG, PNG, or PDF (maximum 10 MB)</span>
            <span className="aopd-btn secondary">Browse files</span>
          </label>
          {file && (
            <div className="aopd-document-file-info">
              <span>{file.name} · {fileSizeLabel(file.size)}</span>
              <button
                type="button"
                className="aopd-btn secondary"
                onClick={() => chooseFile(null)}
                disabled={processing}
              >
                Remove
              </button>
            </div>
          )}
          <button
            type="button"
            className="aopd-btn"
            onClick={processDocument}
            disabled={!file || processing || !isCloud || !canEdit || Boolean(extraction)}
          >
            {processing && !extraction ? 'Processing document…' : 'Upload and recognize'}
          </button>
          {processing && !extraction && (
            <div className="aopd-document-progress" role="status" aria-live="polite">
              <progress max="100" value={progress} />
              <span>{progress < 35 ? 'Preparing secure upload…' : 'Recognizing document structure and handwriting…'}</span>
            </div>
          )}
        </div>
      </section>

      {error && <p className="aopd-error" role="alert">{error}</p>}
      {message && <p className="aopd-success" role="status">{message}</p>}

      {extraction && (
        <section className="aopd-scanner-review" aria-labelledby="aopd-scanner-review-title">
          <div className="aopd-scanner-section-heading">
            <div>
              <h3 id="aopd-scanner-review-title">Review extraction</h3>
              <p>Uncertain fields require correction. No data is imported until you confirm.</p>
            </div>
            <button type="button" className="aopd-btn secondary" onClick={cancelImport} disabled={processing}>
              Cancel Import
            </button>
          </div>

          <div className="aopd-document-review-grid">
            <section className="aopd-document-preview" aria-label="Original document preview">
              <div className="aopd-document-preview-toolbar">
                <strong>Original document</strong>
                <div>
                  {!isPdf && (
                    <>
                      <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}>−</button>
                      <span>{Math.round(zoom * 100)}%</span>
                      <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>+</button>
                    </>
                  )}
                  {isPdf && (
                    <>
                      <button
                        type="button"
                        aria-label="Previous source page"
                        onClick={() => setPreviewPage((page) => Math.max(1, page - 1))}
                        disabled={previewPage <= 1}
                      >‹</button>
                      <span>Page {previewPage}{maxSourcePage > 1 ? ` / at least ${maxSourcePage}` : ''}</span>
                      <button
                        type="button"
                        aria-label="Next source page"
                        onClick={() => setPreviewPage((page) => page + 1)}
                      >›</button>
                    </>
                  )}
                </div>
              </div>
              {fileUrl ? (
                isPdf
                  ? <iframe title="Uploaded document PDF preview" src={`${fileUrl}#page=${previewPage}`} />
                  : <div className="aopd-document-image-wrap"><img src={fileUrl} alt="Uploaded OPD document preview" style={{ transform: `scale(${zoom})` }} /></div>
              ) : (
                <div className="aopd-document-no-preview">
                  The original document is not retained. Reopen this draft with its original file to view it again.
                </div>
              )}
              {file && <small>{file.name} · {fileSizeLabel(file.size)}</small>}
            </section>

            <section className="aopd-document-extracted" aria-label="Extracted information">
              {documentType === 'individual' ? (
                <>
                  <div className="aopd-scanner-section-heading">
                    <h4>Individual encounters ({extraction.encounters.length})</h4>
                    <button
                      type="button"
                      className="aopd-btn secondary"
                      onClick={() => setExtraction((previous) => ({
                        ...previous,
                        encounters: [...previous.encounters, {
                          recordId: createId('enc'),
                          date: '', diagnosis: '', diagnosisId: '', age: '', sex: '',
                          confidence: 0, issues: ['Manually added; verify against the document.'], page: null,
                        }],
                      }))}
                    >
                      Add row
                    </button>
                  </div>
                  <div className="aopd-document-table-wrap">
                    <table className="aopd-document-table">
                      <thead><tr><th>Date</th><th>Diagnosis</th><th>Age</th><th>Sex</th><th>Confidence / review</th><th /></tr></thead>
                      <tbody>
                        {extraction.encounters.map((row, index) => {
                          const review = encounterReview[index];
                          return (
                            <tr key={`encounter-${index}`} className={Object.keys(review.errors).length ? 'has-review-error' : ''}>
                              <td>
                                <input aria-label={`Encounter ${index + 1} date`} type="date" value={row.date} onChange={(event) => updateEncounter(index, 'date', event.target.value)} />
                              </td>
                              <td>
                                <DiagnosisAutocomplete
                                  diagnoses={activeDiagnoses}
                                  value={row.diagnosis}
                                  onChange={(value) => updateEncounter(index, 'diagnosis', value)}
                                />
                              </td>
                              <td>
                                <input aria-label={`Encounter ${index + 1} age`} type="number" min="0" max="120" value={row.age} onChange={(event) => updateEncounter(index, 'age', event.target.value)} />
                              </td>
                              <td>
                                <select aria-label={`Encounter ${index + 1} sex`} value={row.sex} onChange={(event) => updateEncounter(index, 'sex', event.target.value)}>
                                  <option value="">Unclear</option>
                                  <option value={SEX.FEMALE}>Female</option>
                                  <option value={SEX.MALE}>Male</option>
                                </select>
                              </td>
                              <td>
                                <span className={`aopd-confidence${row.confidence < 0.7 ? ' is-low' : ''}`}>
                                  {Math.round((Number(row.confidence) || 0) * 100)}%
                                </span>
                                {row.page && (
                                  <button type="button" className="aopd-source-page" onClick={() => setPreviewPage(row.page)}>
                                    Page {row.page}
                                  </button>
                                )}
                                {Object.entries(review.errors).map(([field, detail]) => <small className="aopd-error-text" key={field}>{field}: {detail}</small>)}
                                {row.issues?.map((issue, issueIndex) => <small className="aopd-warn-text" key={issueIndex}>{issue}</small>)}
                                {review.duplicate && <small className="aopd-warn-text">Potential duplicate encounter</small>}
                              </td>
                              <td><button type="button" className="aopd-row-remove" onClick={() => setExtraction((previous) => ({ ...previous, encounters: previous.encounters.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</button></td>
                            </tr>
                          );
                        })}
                        {extraction.encounters.length === 0 && <tr><td colSpan="6">No encounters extracted. Add a row or cancel.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  <p className="aopd-scanner-summary">
                    {extraction.encounters.length} row(s) · {extraction.encounters.length - invalidEncounterCount} valid · {invalidEncounterCount} invalid · {potentialDuplicateCount} potential duplicate(s)
                  </p>
                  {extraction.notes?.map((note, index) => <p className="aopd-warn-text" key={index}>{note}</p>)}
                  {potentialDuplicateCount > 0 && (
                    <label className="aopd-scanner-check">
                      <input type="checkbox" checked={duplicateConfirmed} onChange={(event) => setDuplicateConfirmed(event.target.checked)} />
                      I reviewed the potential duplicates and want to import them.
                    </label>
                  )}
                </>
              ) : (
                <>
                  <div className="aopd-scanner-section-heading">
                    <h4>Monthly diagnosis summaries ({extraction.summaries.length})</h4>
                    <button
                      type="button"
                      className="aopd-btn secondary"
                      onClick={() => setExtraction((previous) => ({
                        ...previous,
                        summaries: [...previous.summaries, {
                          ...emptyMonthlyDiagnosisCounts(),
                          ...Object.fromEntries(MONTHLY_DIAGNOSIS_COUNT_FIELDS.map((field) => [field, ''])),
                          diagnosis: '', diagnosisId: '', registrationBookTotal: '',
                          discrepancyConfirmed: false, confidence: 0,
                          issues: ['Manually added; verify against the document.'], page: null, id: createId('aggregate'),
                        }],
                      }))}
                    >
                      Add row
                    </button>
                  </div>
                  <div className="aopd-period-selectors">
                    <label>Reporting month
                      <select value={period.month} onChange={(event) => { setPeriod((current) => ({ ...current, month: event.target.value })); setReviewConfirmed(false); }}>
                        <option value="">Select month</option>
                        {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                      </select>
                    </label>
                    <label>Reporting year
                      <input type="number" min="1" max="9999" value={period.year} onChange={(event) => { setPeriod((current) => ({ ...current, year: event.target.value })); setReviewConfirmed(false); }} />
                    </label>
                    {!isValidPeriod && <span className="aopd-error-text">Select a valid reporting month and year.</span>}
                  </div>
                  <div className="aopd-document-table-wrap">
                    <table className="aopd-document-table aopd-tally-table">
                      <thead>
                        <tr>
                          <th rowSpan="2">Diagnosis</th>
                          {MONTHLY_DIAGNOSIS_AGE_GROUPS.map((group) => <th key={group.key} colSpan="2">{group.label}</th>)}
                          <th rowSpan="2">Book total</th><th rowSpan="2">Review</th><th rowSpan="2" />
                        </tr>
                        <tr>{MONTHLY_DIAGNOSIS_AGE_GROUPS.flatMap((group) => [
                          <th key={`${group.key}-f`}>F</th>,
                          <th key={`${group.key}-m`}>M</th>,
                        ])}</tr>
                      </thead>
                      <tbody>
                        {extraction.summaries.map((row, index) => {
                          const review = summaryReview[index];
                          return (
                            <tr key={row.id} className={Object.keys(review.errors).length ? 'has-review-error' : ''}>
                              <td className="aopd-tally-diagnosis">
                                <DiagnosisAutocomplete diagnoses={activeDiagnoses} value={row.diagnosis} onChange={(value) => updateSummary(index, 'diagnosis', value)} />
                                {row.page && <button type="button" className="aopd-source-page" onClick={() => setPreviewPage(row.page)}>Page {row.page}</button>}
                              </td>
                              {MONTHLY_DIAGNOSIS_AGE_GROUPS.flatMap((group) => [
                                <td key={`${group.key}-f`}><input aria-label={`${row.diagnosis || `Row ${index + 1}`} ${group.label} Female`} type="number" min="0" value={row[group.femaleField]} onChange={(event) => updateSummary(index, group.femaleField, event.target.value)} /></td>,
                                <td key={`${group.key}-m`}><input aria-label={`${row.diagnosis || `Row ${index + 1}`} ${group.label} Male`} type="number" min="0" value={row[group.maleField]} onChange={(event) => updateSummary(index, group.maleField, event.target.value)} /></td>,
                              ])}
                              <td><input aria-label={`Row ${index + 1} registration book total`} type="number" min="0" value={row.registrationBookTotal} onChange={(event) => updateSummary(index, 'registrationBookTotal', event.target.value)} /></td>
                              <td className="aopd-tally-review">
                                <span className={`aopd-confidence${row.confidence < 0.7 ? ' is-low' : ''}`}>{Math.round((Number(row.confidence) || 0) * 100)}%</span>
                                <span>Calculated: F {review.totals.female}, M {review.totals.male}, Total {review.totals.total}</span>
                                {Object.entries(review.errors).map(([field, detail]) => <small className="aopd-error-text" key={field}>{field}: {detail}</small>)}
                                {row.issues?.map((issue, issueIndex) => <small className="aopd-warn-text" key={issueIndex}>{issue}</small>)}
                                {row.registrationBookTotal !== '' && Number(row.registrationBookTotal) !== review.totals.total && (
                                  <label className="aopd-scanner-check">
                                    <input type="checkbox" checked={Boolean(row.discrepancyConfirmed)} onChange={(event) => updateSummary(index, 'discrepancyConfirmed', event.target.checked)} />
                                    Confirm difference
                                  </label>
                                )}
                              </td>
                              <td><button type="button" className="aopd-row-remove" onClick={() => setExtraction((previous) => ({ ...previous, summaries: previous.summaries.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</button></td>
                            </tr>
                          );
                        })}
                        {extraction.summaries.length === 0 && <tr><td colSpan="16">No tally rows extracted. Add a row or cancel.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                  {extraction.summaries.length > 0 && (
                    <p className="aopd-scanner-summary">
                      {extraction.summaries.length} diagnosis row(s) · Female {aggregateTotals.hasMissingCells ? 'at least ' : ''}{aggregateTotals.female} · Male {aggregateTotals.hasMissingCells ? 'at least ' : ''}{aggregateTotals.male} · Overall {aggregateTotals.hasMissingCells ? 'at least ' : ''}{aggregateTotals.overall} · {invalidSummaryCount} row(s) need correction
                    </p>
                  )}
                  <p className="aopd-warn-text">A matching saved diagnosis/month blocks import to prevent overwriting or double-counting. Reconcile it in Aggregate Entry first.</p>
                  {extraction.notes?.map((note, index) => <p className="aopd-warn-text" key={index}>{note}</p>)}
                </>
              )}

              <label className="aopd-scanner-check aopd-review-confirm">
                <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} />
                I reviewed the source and all extracted information. Import only the corrected rows shown above.
              </label>
              <div className="aopd-scanner-actions">
                <button
                  type="button"
                  className="aopd-btn"
                  onClick={documentType === 'individual' ? importIndividualEncounters : importMonthlySummaries}
                  disabled={
                    processing || !reviewConfirmed || !extractedRows.length
                    || (documentType === 'individual'
                      ? invalidEncounterCount > 0 || (potentialDuplicateCount > 0 && !duplicateConfirmed)
                      : invalidSummaryCount > 0 || !isValidPeriod)
                  }
                >
                  {processing ? 'Importing…' : 'Accept and Import'}
                </button>
                <button type="button" className="aopd-btn secondary" onClick={saveDraft} disabled={processing || !importId}>
                  Save as Draft
                </button>
                <button type="button" className="aopd-btn secondary" onClick={cancelImport} disabled={processing}>
                  Cancel Import
                </button>
              </div>
            </section>
          </div>
        </section>
      )}

      <section className="aopd-document-history" aria-labelledby="aopd-document-history-heading">
        <div className="aopd-scanner-section-heading">
          <div>
            <h3 id="aopd-document-history-heading">Document Import History</h3>
            <p>History stores document metadata and draft extraction only. Original scans are not retained.</p>
          </div>
          <button type="button" className="aopd-btn secondary" onClick={() => refreshHistory().catch((loadError) => setHistoryError(loadError.message))}>
            Refresh
          </button>
        </div>
        {historyError && <p className="aopd-error" role="alert">{historyError}</p>}
        <div className="aopd-document-table-wrap">
          <table className="aopd-document-table">
            <thead><tr><th>Document</th><th>Type</th><th>Uploaded</th><th>Period</th><th>Status</th><th>Recognized / imported</th><th /></tr></thead>
            <tbody>
              {history.length === 0 && <tr><td colSpan="7">No document imports have been recorded.</td></tr>}
              {history.map((item) => (
                <tr key={item.id}>
                  <td>{item.file_name}<small>{fileSizeLabel(item.file_size_bytes)}</small></td>
                  <td>{item.document_type === 'individual' ? 'Patient registration' : 'Monthly tally'}</td>
                  <td>{new Date(item.created_at).toLocaleString()}<small>Staff ID: {item.uploaded_by?.slice(0, 8) || '—'}</small></td>
                  <td>{item.reporting_month && item.reporting_year ? `${MONTH_NAMES[item.reporting_month - 1]} ${item.reporting_year}` : '—'}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td>{item.recognized_entries} / {item.imported_entries}</td>
                  <td>
                    {item.extraction_result && ['draft', 'awaiting_review'].includes(item.status) && (
                      <button type="button" className="aopd-btn secondary" onClick={() => resumeDraft(item)}>
                        Resume review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
