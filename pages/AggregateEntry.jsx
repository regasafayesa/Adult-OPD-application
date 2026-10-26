import React, { useMemo, useRef, useState } from 'react';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import { MONTH_NAMES, SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import {
  calculateMonthlyDiagnosisTotals,
  emptyMonthlyDiagnosisCounts,
  MONTHLY_DIAGNOSIS_AGE_GROUPS,
  validateMonthlyDiagnosisCount,
} from '../services/monthlyDiagnosisCounts.mjs';
import { createId } from '../services/storage';

const BATCH_SIZE = 100;

function blankEntry() {
  return {
    diagnosisId: '',
    diagnosisName: '',
    ageGroupKey: MONTHLY_DIAGNOSIS_AGE_GROUPS[0].key,
    sex: SEX.FEMALE,
    count: '',
    registrationBookTotal: '',
    notes: '',
    discrepancyConfirmed: false,
  };
}

function getCountField(ageGroupKey, sex) {
  const group = MONTHLY_DIAGNOSIS_AGE_GROUPS.find(({ key }) => key === ageGroupKey);
  if (!group) return '';
  return sex === SEX.FEMALE ? group.femaleField : group.maleField;
}

export default function AggregateEntry() {
  const {
    diagnoses,
    settings,
    monthlyDiagnosisCounts,
    monthlyDiagnosisCountsStatus,
    monthlyDiagnosisCountsError,
    canManageFacility,
    canWriteMonthlyDiagnosisCounts,
    saveMonthlyDiagnosisCounts,
    clearMonthlyDiagnosisCounts,
  } = useAdultOpd();
  const now = new Date();
  const [year, setYear] = useState(Number(settings.reportingYear) || now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entry, setEntry] = useState(blankEntry);
  const [queued, setQueued] = useState([]);
  const [editingId, setEditingId] = useState('');
  const [editingSaved, setEditingSaved] = useState(false);
  const [editingDiagnosisId, setEditingDiagnosisId] = useState('');
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [progress, setProgress] = useState(null);
  const [uncertainIds, setUncertainIds] = useState([]);
  const savingRef = useRef(false);

  const savedForPeriod = monthlyDiagnosisCounts.filter((item) =>
    Number(item.reportingYear) === Number(year)
    && Number(item.reportingMonth) === Number(month)
  );
  const queuedSummaries = useMemo(() => {
    const summariesByDiagnosis = new Map();
    queued.forEach((item) => {
      let summary = summariesByDiagnosis.get(item.diagnosisId);
      if (!summary) {
        const saved = savedForPeriod.find((record) => record.diagnosisId === item.diagnosisId);
        summary = saved
          ? { ...saved }
          : {
              ...emptyMonthlyDiagnosisCounts(),
              id: item.summaryId,
              facilityId: item.facilityId || '',
              registrationBookTotal: '',
              notes: '',
              discrepancyConfirmed: false,
            };
        summary = {
          ...summary,
          id: summary.id || item.summaryId,
          reportingYear: Number(year),
          reportingMonth: Number(month),
          diagnosisId: item.diagnosisId,
          diagnosisName: item.diagnosisName,
          diagnosisCode: item.diagnosisCode,
          diagnosisSource: item.diagnosisSource,
          expectedUpdatedAt: summary.updatedAt || summary.expectedUpdatedAt,
        };
      }
      const field = getCountField(item.ageGroupKey, item.sex);
      if (field) summary[field] = item.count;
      summary.registrationBookTotal = item.registrationBookTotal;
      summary.notes = item.notes;
      summary.discrepancyConfirmed = item.discrepancyConfirmed;
      summariesByDiagnosis.set(item.diagnosisId, summary);
    });
    return [...summariesByDiagnosis.values()];
  }, [month, queued, savedForPeriod, year]);
  const queuedValidations = useMemo(() => queuedSummaries.map((item) => ({
    id: item.id,
    errors: validateMonthlyDiagnosisCount(item, { diagnoses }).errors,
  })), [diagnoses, queuedSummaries]);
  const selectedDiagnosis = diagnoses.find((item) => item.id === entry.diagnosisId);
  const selectedSummary = queuedSummaries.find((item) => item.diagnosisId === entry.diagnosisId)
    || savedForPeriod.find((item) => item.diagnosisId === entry.diagnosisId);
  const countField = getCountField(entry.ageGroupKey, entry.sex);
  const candidateSummary = selectedDiagnosis && countField
    ? {
        ...(selectedSummary || emptyMonthlyDiagnosisCounts()),
        reportingYear: Number(year),
        reportingMonth: Number(month),
        diagnosisId: selectedDiagnosis.id,
        diagnosisName: selectedDiagnosis.name,
        [countField]: entry.count,
        registrationBookTotal: entry.registrationBookTotal,
        notes: entry.notes,
        discrepancyConfirmed: entry.discrepancyConfirmed,
      }
    : null;
  const candidateTotals = candidateSummary
    ? calculateMonthlyDiagnosisTotals(candidateSummary)
    : null;
  const savedBucketRows = savedForPeriod.flatMap((item) => {
    const buckets = MONTHLY_DIAGNOSIS_AGE_GROUPS.flatMap((group) => [
      { ...group, sex: SEX.FEMALE, field: group.femaleField },
      { ...group, sex: SEX.MALE, field: group.maleField },
    ]).filter(({ field }) => Number(item[field]) > 0);
    return buckets.map((bucket) => ({ ...item, ...bucket }));
  });
  const periodLocked = queued.length > 0 || Boolean(editingId) || editingSaved;

  function changeCount(field, value) {
    setEntry((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'count'
        || field === 'ageGroupKey'
        || field === 'sex'
        || field === 'registrationBookTotal'
        ? { discrepancyConfirmed: false }
        : {}),
    }));
    setSuccess('');
  }

  function selectDiagnosis(value) {
    const diagnosis = diagnoses.find((item) => item.name === value && item.active !== false);
    const summary = diagnosis
      ? queuedSummaries.find((item) => item.diagnosisId === diagnosis.id)
        || savedForPeriod.find((item) => item.diagnosisId === diagnosis.id)
      : null;
    setEntry((previous) => ({
      ...previous,
      diagnosisId: diagnosis?.id || '',
      diagnosisName: value,
      registrationBookTotal: summary?.registrationBookTotal ?? '',
      notes: summary?.notes || '',
      discrepancyConfirmed: false,
    }));
    setErrors((previous) => ({ ...previous, diagnosisId: '' }));
    setSuccess('');
  }

  function queueEntry(event) {
    event.preventDefault();
    setSaveError('');
    setSuccess('');
    const diagnosis = diagnoses.find((item) =>
      item.id === entry.diagnosisId && item.active !== false
    );
    const originalQueued = queued.find((item) => item.id === editingId);
    const originalDiagnosisId = originalQueued?.diagnosisId || editingDiagnosisId;
    if (diagnosis && originalDiagnosisId && originalDiagnosisId !== diagnosis.id) {
      setErrors({ diagnosisId: 'A pending count cannot be moved to another diagnosis. Cancel and start a new count.' });
      return;
    }
    if (diagnosis && uncertainIds.includes(diagnosis.id)) {
      setErrors({ diagnosisId: 'This diagnosis has an unconfirmed save. Retry or resolve that save before adding more counts.' });
      return;
    }
    const field = getCountField(entry.ageGroupKey, entry.sex);
    const nextCount = String(entry.count).trim();
    const nextErrors = {};
    if (!diagnosis) nextErrors.diagnosisId = 'Select an active diagnosis from the configured list.';
    if (!field) nextErrors.ageGroupKey = 'Select an age group.';
    if (![SEX.MALE, SEX.FEMALE].includes(entry.sex)) nextErrors.sex = 'Select a sex.';
    if (!Number.isInteger(Number(year)) || Number(year) < 1 || Number(year) > 9999) {
      nextErrors.reportingYear = 'Select a valid reporting year.';
    }
    if (!Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12) {
      nextErrors.reportingMonth = 'Select a valid reporting month.';
    }
    if (!/^\d+$/.test(nextCount)) {
      nextErrors.count = 'Number of cases must be a non-negative whole number.';
    } else if (!Number.isSafeInteger(Number(nextCount)) || Number(nextCount) > 2147483647) {
      nextErrors.count = 'Number of cases is larger than the supported whole-number range.';
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const existingSummary = queuedSummaries.find((item) => item.diagnosisId === diagnosis.id)
      || savedForPeriod.find((item) => item.diagnosisId === diagnosis.id);
    const nextSummary = {
      ...(existingSummary || emptyMonthlyDiagnosisCounts()),
      id: existingSummary?.id || createId('aggregate'),
      reportingYear: Number(year),
      reportingMonth: Number(month),
      diagnosisId: diagnosis.id,
      diagnosisName: diagnosis.name,
      diagnosisCode: diagnosis.code || '',
      diagnosisSource: diagnosis.official ? 'official' : 'facility',
      [field]: nextCount,
      registrationBookTotal: entry.registrationBookTotal,
      notes: entry.notes,
      discrepancyConfirmed: entry.discrepancyConfirmed,
    };
    const validation = validateMonthlyDiagnosisCount(nextSummary, { diagnoses });
    if (!validation.valid) {
      setErrors({
        ...(validation.errors.discrepancyConfirmed
          ? { discrepancyConfirmed: validation.errors.discrepancyConfirmed }
          : {}),
        ...(validation.errors.registrationBookTotal
          ? { registrationBookTotal: validation.errors.registrationBookTotal }
          : {}),
        ...(validation.errors[field]
          ? { count: validation.errors[field] }
          : {}),
      });
      return;
    }
    const duplicate = queued.find((item) =>
      item.diagnosisId === diagnosis.id
      && item.ageGroupKey === entry.ageGroupKey
      && item.sex === entry.sex
      && item.id !== editingId
    );
    const next = {
      id: editingId || duplicate?.id || createId('aggregate-count'),
      summaryId: nextSummary.id,
      facilityId: existingSummary?.facilityId || '',
      reportingYear: Number(year),
      reportingMonth: Number(month),
      diagnosisId: diagnosis.id,
      diagnosisName: diagnosis.name,
      diagnosisCode: diagnosis.code || '',
      diagnosisSource: diagnosis.official ? 'official' : 'facility',
      ageGroupKey: entry.ageGroupKey,
      sex: entry.sex,
      count: nextCount,
      registrationBookTotal: entry.registrationBookTotal,
      notes: entry.notes,
      discrepancyConfirmed: entry.discrepancyConfirmed,
    };
    setQueued((previous) => {
      const withoutReplaced = previous.filter((item) =>
        item.id !== editingId && item.id !== duplicate?.id
      );
      return [...withoutReplaced, next];
    });
    setSuccess(duplicate
      ? `${entry.sex} ${MONTHLY_DIAGNOSIS_AGE_GROUPS.find(({ key }) => key === entry.ageGroupKey)?.label} count replaced in the pending queue.`
      : 'Count added to the pending queue.');
    setEntry(blankEntry());
    setEditingId('');
    setEditingSaved(false);
    setEditingDiagnosisId('');
    setErrors({});
  }

  function editEntry(item, ageGroupKey, sex, isSaved = false) {
    const group = MONTHLY_DIAGNOSIS_AGE_GROUPS.find(({ key }) => key === ageGroupKey);
    const field = group && (sex === SEX.FEMALE ? group.femaleField : group.maleField);
    setYear(Number(item.reportingYear));
    setMonth(Number(item.reportingMonth));
    setEntry({
      diagnosisId: item.diagnosisId,
      diagnosisName: item.diagnosisName,
      ageGroupKey,
      sex,
      count: String(item[field] ?? '0'),
      registrationBookTotal: item.registrationBookTotal ?? '',
      notes: item.notes || '',
      discrepancyConfirmed: false,
    });
    setEditingId(isSaved ? '' : item.id);
    setEditingSaved(isSaved);
    setEditingDiagnosisId(item.diagnosisId);
    setErrors({});
    setSaveError('');
  }

  function removeEntry(id) {
    setQueued((previous) => previous.filter((record) => record.id !== id));
    if (editingId === id) {
      setEditingId('');
      setEditingSaved(false);
      setEditingDiagnosisId('');
      setEntry(blankEntry());
      setErrors({});
    }
  }

  async function saveAll() {
    if (savingRef.current || queuedSummaries.length === 0) return;
    const invalid = queuedValidations.filter(({ errors: validationErrors }) =>
      Object.keys(validationErrors).length > 0
    ).length;
    if (invalid > 0) {
      setSaveError(`${invalid} pending summar${invalid === 1 ? 'y needs' : 'ies need'} correction.`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    setSuccess('');
    setProgress({ completed: 0, total: queuedSummaries.length, saved: 0 });
    try {
      const result = await saveMonthlyDiagnosisCounts(queuedSummaries, {
        batchSize: BATCH_SIZE,
        verifyDiagnosisIds: uncertainIds,
        onProgress: setProgress,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      const savedIds = new Set(result.savedRecords.map((item) => item.diagnosisId));
      const remainingCount = queued.filter((item) => !savedIds.has(item.diagnosisId)).length;
      setQueued((previous) => previous.filter((item) => !savedIds.has(item.diagnosisId)));
      setUncertainIds(result.uncertainDiagnosisIds);
      setSuccess(`${savedIds.size} summary${savedIds.size === 1 ? '' : 'ies'} confirmed saved; ${remainingCount} counts remain pending.`);
      if (result.errors.length) {
        setSaveError(result.errors.map(({ diagnosisId, message }) => {
          const diagnosis = diagnoses.find((item) => item.id === diagnosisId);
          return `${diagnosis?.name || diagnosisId}: ${message}`;
        }).join(' '));
      }
    } catch (error) {
      setSaveError(error.message || 'The aggregate batch could not be saved. Pending summaries were retained.');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setProgress(null);
    }
  }

  async function clearPeriod() {
    const periodLabel = `${MONTH_NAMES[Number(month) - 1]} ${year}`;
    if (!window.confirm(
      `Permanently delete all ${savedForPeriod.length} saved registration-book summaries for ${periodLabel}? Individual patient encounters will not be changed.`
    )) return;
    setClearing(true);
    setSaveError('');
    setSuccess('');
    const result = await clearMonthlyDiagnosisCounts(year, month);
    setClearing(false);
    if (!result.ok) {
      setSaveError(result.error);
      return;
    }
    setSuccess(`Saved aggregate summaries for ${periodLabel} were cleared. Individual encounters were not changed.`);
  }

  const discrepancy = candidateTotals && entry.count !== '' && entry.registrationBookTotal !== ''
    && /^\d+$/.test(String(entry.registrationBookTotal))
    && Number(entry.registrationBookTotal) !== candidateTotals.total;

  return (
    <main className="aopd-page aopd-aggregate-page">
      <header className="aopd-aggregate-hero">
        <div>
          <span className="aopd-aggregate-eyebrow">Monthly reporting</span>
          <h2>Registration-book counts</h2>
          <p className="aopd-lede">
            Enter monthly diagnosis totals separately from individual patient records. Counts for children under five are supported.
          </p>
        </div>
        <div className="aopd-aggregate-period">
          <label>
            Reporting year
            <input
              type="number"
              min="1"
              max="9999"
              step="1"
              value={year}
              onChange={(event) => {
                setYear(event.target.value);
                setErrors((previous) => ({ ...previous, reportingYear: '' }));
              }}
              disabled={saving || periodLocked}
            />
            {errors.reportingYear && <span className="aopd-error">{errors.reportingYear}</span>}
          </label>
          <label>
            Reporting month
            <select
              value={month}
              onChange={(event) => {
                setMonth(Number(event.target.value));
                setErrors((previous) => ({ ...previous, reportingMonth: '' }));
              }}
              disabled={saving || periodLocked}
            >
              {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
            {errors.reportingMonth && <span className="aopd-error">{errors.reportingMonth}</span>}
          </label>
        </div>
        {periodLocked && (
          <p className="aopd-aggregate-period-note">
            Finish or cancel the current queued/editing summaries before changing the reporting period.
          </p>
        )}
      </header>

      {monthlyDiagnosisCountsStatus === 'error' && (
        <p className="aopd-error aopd-aggregate-migration" role="alert">
          {monthlyDiagnosisCountsError} Review and apply
          {' '}<code>supabase/migrations/20261024_monthly_diagnosis_counts.sql</code>
          {' '}in Supabase SQL Editor before saving.
        </p>
      )}

      <section className="aopd-panel aopd-aggregate-editor" aria-labelledby="aggregate-editor-heading">
        <div className="aopd-aggregate-section-heading">
          <span className="aopd-aggregate-step">01</span>
          <div>
            <h3 id="aggregate-editor-heading">{editingId || editingSaved ? 'Edit aggregate count' : 'Add aggregate count'}</h3>
            <p>Enter one diagnosis, age group, and sex count at a time.</p>
          </div>
        </div>
        <form className="aopd-aggregate-count-form" onSubmit={queueEntry}>
          <label className="aopd-aggregate-diagnosis-field">
            Diagnosis
            <DiagnosisAutocomplete
              diagnoses={diagnoses}
              value={entry.diagnosisName}
              onChange={selectDiagnosis}
              disabled={saving || !canWriteMonthlyDiagnosisCounts}
            />
            {selectedDiagnosis?.code && <span className="aopd-diagnosis-selected-code">{selectedDiagnosis.code}</span>}
            {diagnoses.filter((item) => item.active !== false).length === 0 && (
              <span className="aopd-error" role="status">No active diagnosis catalog is configured for this facility.</span>
            )}
            {errors.diagnosisId && <span className="aopd-error">{errors.diagnosisId}</span>}
          </label>

          <label className="aopd-aggregate-age-field">
            Age group
            <select
              value={entry.ageGroupKey}
              onChange={(event) => changeCount('ageGroupKey', event.target.value)}
              disabled={saving || !canWriteMonthlyDiagnosisCounts}
            >
              {MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {errors.ageGroupKey && <span className="aopd-error">{errors.ageGroupKey}</span>}
          </label>

          <fieldset className="aopd-aggregate-sex-field">
            <legend>Sex</legend>
            {[SEX.MALE, SEX.FEMALE].map((sex) => (
              <label className="aopd-inline" key={sex}>
                <input
                  type="radio"
                  name="aggregate-sex"
                  value={sex}
                  checked={entry.sex === sex}
                  onChange={() => changeCount('sex', sex)}
                  disabled={saving || !canWriteMonthlyDiagnosisCounts}
                />
                {sex}
              </label>
            ))}
            {errors.sex && <span className="aopd-error">{errors.sex}</span>}
          </fieldset>

          <label className="aopd-aggregate-count-field">
            Number of cases
            <input
              type="number"
              min="0"
              max="2147483647"
              step="1"
              inputMode="numeric"
              value={entry.count}
              onChange={(event) => changeCount('count', event.target.value)}
              required
              disabled={saving || !canWriteMonthlyDiagnosisCounts}
            />
            {errors.count && <span className="aopd-error">{errors.count}</span>}
          </label>

          <details className="aopd-aggregate-optional">
            <summary>Optional registration-book details</summary>
            <div className="aopd-aggregate-meta">
              <label>
                Registration-book total (optional)
                <input
                  type="number"
                  min="0"
                  max="9007199254740991"
                  step="1"
                  inputMode="numeric"
                  value={entry.registrationBookTotal}
                  onChange={(event) => changeCount('registrationBookTotal', event.target.value)}
                  disabled={saving || !canWriteMonthlyDiagnosisCounts}
                />
                {errors.registrationBookTotal && <span className="aopd-error">{errors.registrationBookTotal}</span>}
              </label>
              <label>
                Notes or source reference (optional)
                <textarea
                  value={entry.notes}
                  onChange={(event) => setEntry((previous) => ({ ...previous, notes: event.target.value }))}
                  disabled={saving || !canWriteMonthlyDiagnosisCounts}
                />
              </label>
            </div>
          </details>

          {discrepancy && (
            <div className="aopd-alert aopd-aggregate-discrepancy" role="alert">
              <strong>Registration-book total differs from the calculated total.</strong>
              <span>Book: {Number(entry.registrationBookTotal)}</span>
              <span>Calculated: {candidateTotals.total}</span>
              <span>Difference: {Number(entry.registrationBookTotal) - candidateTotals.total}</span>
              <label className="aopd-inline">
                <input
                  type="checkbox"
                  checked={entry.discrepancyConfirmed}
                  onChange={(event) => setEntry((previous) => ({ ...previous, discrepancyConfirmed: event.target.checked }))}
                  disabled={saving || !canWriteMonthlyDiagnosisCounts}
                />
                I reviewed and confirm this discrepancy
              </label>
              {errors.discrepancyConfirmed && <span className="aopd-error">{errors.discrepancyConfirmed}</span>}
            </div>
          )}

          <div className="aopd-actions">
            <button className="aopd-btn" type="submit" disabled={saving || !canWriteMonthlyDiagnosisCounts}>
              {editingId || editingSaved ? 'Update pending count' : 'Add to pending queue'}
            </button>
            {(editingId || editingSaved) && (
              <button
                className="aopd-btn secondary"
                type="button"
                onClick={() => {
                  setEditingId('');
                  setEditingSaved(false);
                  setEditingDiagnosisId('');
                  setEntry(blankEntry());
                  setErrors({});
                }}
                disabled={saving}
              >
                Cancel
              </button>
            )}
          </div>
          {!canWriteMonthlyDiagnosisCounts && <p className="aopd-aggregate-readonly">You have read-only access to registration-book summaries.</p>}
          {success && <p className="aopd-success" role="status">{success}</p>}
        </form>
      </section>

      <section className="aopd-pending aopd-aggregate-list" aria-labelledby="aggregate-saved-heading">
        <div className="aopd-pending-heading">
          <div>
            <h3 id="aggregate-saved-heading">Saved summaries — {MONTH_NAMES[Number(month) - 1]} {year}</h3>
            <p>These registration-book counts are separate from individual encounter records.</p>
          </div>
          {canManageFacility && (
            <button
              className="aopd-btn danger"
              type="button"
              onClick={clearPeriod}
              disabled={clearing || saving || queued.length > 0 || Boolean(editingId) || editingSaved || savedForPeriod.length === 0}
            >
              {clearing ? 'Clearing…' : `Clear saved summaries (${savedForPeriod.length})`}
            </button>
          )}
        </div>
        <div className="aopd-table-wrap">
          <table className="aopd-pending-table">
            <thead><tr><th>Diagnosis</th><th>Age group</th><th>Sex</th><th className="num">Cases</th><th>Action</th></tr></thead>
            <tbody>
              {savedBucketRows.map((item) => (
                <tr key={`${item.id}:${item.key}:${item.sex}`}>
                  <td>{item.diagnosisCode ? `${item.diagnosisCode} — ` : ''}{item.diagnosisName}</td>
                  <td>{item.label}</td>
                  <td>{item.sex}</td>
                  <td className="num">{item[item.field]}</td>
                  <td className="aopd-row-actions">
                    <button
                      type="button"
                      onClick={() => editEntry(item, item.key, item.sex, true)}
                      disabled={saving || !canWriteMonthlyDiagnosisCounts || uncertainIds.includes(item.diagnosisId)}
                    >
                      Edit count
                    </button>
                  </td>
                </tr>
              ))}
              {!savedBucketRows.length && <tr><td colSpan="5" className="aopd-empty">No saved summaries for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aopd-pending aopd-aggregate-list" aria-labelledby="aggregate-queued-heading">
        <div className="aopd-pending-heading">
          <div>
            <h3 id="aggregate-queued-heading">Pending counts ({queued.length})</h3>
            <p>Repeated diagnosis, age group, and sex entries replace the pending count.</p>
          </div>
          <button className="aopd-btn" type="button" onClick={saveAll} disabled={saving || !canWriteMonthlyDiagnosisCounts || queuedSummaries.length === 0}>
            {saving ? 'Saving…' : `Save All (${queuedSummaries.length})`}
          </button>
        </div>
        {progress && <p className="aopd-pending-progress" role="status">Processed {progress.completed} of {progress.total}; confirmed saved {progress.saved}.</p>}
        {saveError && <p className="aopd-error" role="alert">{saveError}</p>}
        {success && <p className="aopd-success" role="status">{success}</p>}
        <div className="aopd-table-wrap">
          <table className="aopd-pending-table">
            <thead><tr><th>Diagnosis</th><th>Age group</th><th>Sex</th><th className="num">Cases</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {queued.map((item) => {
                const validation = queuedValidations.find((result) => result.id === item.summaryId)?.errors || {};
                const uncertain = uncertainIds.includes(item.diagnosisId);
                const ageGroup = MONTHLY_DIAGNOSIS_AGE_GROUPS.find(({ key }) => key === item.ageGroupKey);
                return (
                  <tr key={item.id}>
                    <td>{item.diagnosisCode ? `${item.diagnosisCode} — ` : ''}{item.diagnosisName}</td>
                    <td>{ageGroup?.label || '—'}</td>
                    <td>{item.sex}</td>
                    <td className="num">{item.count}</td>
                    <td>{uncertain ? 'Save status unconfirmed' : Object.values(validation).filter(Boolean).join(' ') || 'Ready to save'}</td>
                    <td className="aopd-row-actions">
                      <button type="button" onClick={() => editEntry(item, item.ageGroupKey, item.sex)} disabled={saving || uncertain}>Edit</button>
                      <button type="button" className="danger-text" onClick={() => removeEntry(item.id)} disabled={saving || uncertain}>Remove</button>
                    </td>
                  </tr>
                );
              })}
              {!queued.length && <tr><td colSpan="6" className="aopd-empty">No counts are waiting to be saved.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
