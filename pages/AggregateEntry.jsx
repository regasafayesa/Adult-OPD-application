import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import HelpHint from '../components/common/HelpHint';
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
  const location = useLocation();
  const navigate = useNavigate();
  const {
    diagnoses,
    settings,
    monthlyDiagnosisCounts,
    canWriteMonthlyDiagnosisCounts,
    saveMonthlyDiagnosisCounts,
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
  const [progress, setProgress] = useState(null);
  const [uncertainIds, setUncertainIds] = useState([]);
  const savingRef = useRef(false);

  useEffect(() => {
    const editRequest = location.state?.aggregateEdit;
    if (!editRequest) return;

    const { item, ageGroupKey, sex } = editRequest;
    const group = MONTHLY_DIAGNOSIS_AGE_GROUPS.find(({ key }) => key === ageGroupKey);
    const field = group && (sex === SEX.FEMALE ? group.femaleField : group.maleField);
    if (!item || !field || !item.diagnosisId) {
      navigate(location.pathname, { replace: true, state: null });
      return;
    }

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
    setEditingSaved(true);
    setEditingDiagnosisId(item.diagnosisId);
    setErrors({});
    setSaveError('');
    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);

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
  const queuedTotals = useMemo(() => queued.reduce((totals, item) => {
    const count = Number(item.count) || 0;
    totals.cases += count;
    totals[item.sex === SEX.MALE ? 'male' : 'female'] += count;
    return totals;
  }, { cases: 0, male: 0, female: 0 }), [queued]);
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

  function editEntry(item, ageGroupKey, sex) {
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
    setEditingId(item.id);
    setEditingSaved(false);
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

  const discrepancy = candidateTotals && entry.count !== '' && entry.registrationBookTotal !== ''
    && /^\d+$/.test(String(entry.registrationBookTotal))
    && Number(entry.registrationBookTotal) !== candidateTotals.total;
  const periodLocked = saving || queued.length > 0 || Boolean(editingId || editingSaved);

  return (
    <main className="aopd-page aopd-aggregate-page">
      <header className="aopd-aggregate-page-heading">
        <div>
          <span className="aopd-aggregate-eyebrow">Monthly reporting workspace</span>
          <h2>Aggregate Reporting</h2>
          <p>Monthly registration-book data entry</p>
        </div>
        <HelpHint label="Registration-book counts">Enter monthly counts from the book by diagnosis, age group, and sex. These numbers are added to eligible encounter counts in reports; do not include the same cases in both sources.</HelpHint>
      </header>

      <section className="aopd-aggregate-period-bar" aria-label="Reporting period">
        <div className="aopd-aggregate-period-title">
          <span className="aopd-aggregate-period-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M7 3v3m10-3v3M4 9h16M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5Z" /><path d="M8 12h2m4 0h2M8 16h2" /></svg>
          </span>
          <div>
            <strong>Reporting period</strong>
            <span>Choose the month and year for these registration-book counts.</span>
          </div>
        </div>
        <div className="aopd-aggregate-period-selector">
          <label>
            Month
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              disabled={periodLocked}
              aria-label="Aggregate reporting month"
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Year
            <input
              type="number"
              min="1"
              max="9999"
              step="1"
              value={year}
              onChange={(event) => setYear(event.target.value === '' ? '' : Number(event.target.value))}
              disabled={periodLocked}
              aria-label="Aggregate reporting year"
            />
          </label>
        </div>
        <p className="aopd-aggregate-period-note">
          {periodLocked
            ? 'Save or remove pending counts, or finish editing, before changing the reporting period.'
            : 'Pending counts will be saved for this selected month and year.'}
        </p>
      </section>

      <div className="aopd-aggregate-workspace">
        <section className="aopd-panel aopd-aggregate-editor" aria-labelledby="aggregate-editor-heading">
          <div className="aopd-aggregate-section-heading">
            <div className="aopd-aggregate-heading-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 5H6.5A2.5 2.5 0 0 0 4 7.5v10A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12" /><path d="m15 5 4 4M10 14l7.8-7.8a1.7 1.7 0 0 1 2.4 2.4L12.4 17 9 18z" /></svg>
            </div>
            <div>
              <h3 id="aggregate-editor-heading">{editingId || editingSaved ? 'Edit aggregate count' : 'Add a count'}</h3>
              <p>Choose a diagnosis, age group, sex, and case total.</p>
            </div>
          </div>
          <form className="aopd-aggregate-count-form" onSubmit={queueEntry}>
            <label className="aopd-aggregate-diagnosis-field">
              <span>Diagnosis</span>
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
              <div className="aopd-aggregate-sex-options">
                {[SEX.MALE, SEX.FEMALE].map((sex) => (
                  <label key={sex}>
                    <input
                      type="radio"
                      name="aggregate-sex"
                      value={sex}
                      checked={entry.sex === sex}
                      onChange={() => changeCount('sex', sex)}
                      disabled={saving || !canWriteMonthlyDiagnosisCounts}
                    />
                    <span>{sex === SEX.MALE ? '♂' : '♀'}</span>
                    {sex}
                  </label>
                ))}
              </div>
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
              <summary>Registration-book total and notes <span>Optional</span></summary>
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

            <div className="aopd-aggregate-form-actions">
              <button className="aopd-btn" type="submit" disabled={saving || !canWriteMonthlyDiagnosisCounts}>
                <span aria-hidden="true">{editingId || editingSaved ? '✓' : '+'}</span>
                {editingId || editingSaved ? 'Update count' : 'Add count'}
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
                  Cancel edit
                </button>
              )}
            </div>
            {!canWriteMonthlyDiagnosisCounts && <p className="aopd-aggregate-readonly">You have read-only access to registration-book summaries.</p>}
          </form>
        </section>

        <section className="aopd-pending aopd-aggregate-list" aria-labelledby="aggregate-queued-heading">
          <div className="aopd-aggregate-list-heading">
            <div>
              <span className="aopd-aggregate-eyebrow">Submission queue</span>
              <h3 id="aggregate-queued-heading">Added counts</h3>
              <p>Review and save all entries for {MONTH_NAMES[Number(month) - 1]} {year}.</p>
            </div>
            <span className="aopd-aggregate-queue-count" aria-label={`${queued.length} aggregate entries`}>
              {queued.length}
            </span>
          </div>

          <div className="aopd-aggregate-summary" aria-label="Pending count summary">
            <div><span>Total entries</span><strong>{queued.length}</strong></div>
            <div><span>Total cases</span><strong>{queuedTotals.cases.toLocaleString()}</strong></div>
            <div><span>Male cases</span><strong>{queuedTotals.male.toLocaleString()}</strong></div>
            <div><span>Female cases</span><strong>{queuedTotals.female.toLocaleString()}</strong></div>
          </div>

          {progress && (
            <p className="aopd-pending-progress" role="status">
              Saving summaries: {progress.completed} of {progress.total} processed; {progress.saved} confirmed.
            </p>
          )}
          {saveError && <p className="aopd-error aopd-aggregate-feedback" role="alert">{saveError}</p>}
          {success && <p className="aopd-success aopd-aggregate-feedback" role="status">{success}</p>}

          {queued.length > 0 ? (
            <ul className="aopd-aggregate-queue">
              {queued.map((item) => {
                const validation = queuedValidations.find((result) => result.id === item.summaryId)?.errors || {};
                const uncertain = uncertainIds.includes(item.diagnosisId);
                const ageGroup = MONTHLY_DIAGNOSIS_AGE_GROUPS.find(({ key }) => key === item.ageGroupKey);
                return (
                  <li className="aopd-aggregate-queue-item" key={item.id}>
                    <div className="aopd-aggregate-entry-main">
                      <strong>{item.diagnosisName}</strong>
                      {item.diagnosisCode && <span className="aopd-aggregate-entry-code">{item.diagnosisCode}</span>}
                    </div>
                    <div className="aopd-aggregate-entry-details">
                      <span>{ageGroup?.label || '—'}</span>
                      <span className={`aopd-aggregate-sex-tag${item.sex === SEX.MALE ? ' is-male' : ' is-female'}`}>{item.sex}</span>
                      <strong className="aopd-aggregate-entry-count">{Number(item.count).toLocaleString()}</strong>
                    </div>
                    <div className="aopd-aggregate-entry-actions">
                      <span className={uncertain ? 'is-uncertain' : Object.values(validation).some(Boolean) ? 'has-validation' : 'is-ready'}>
                        {uncertain ? 'Save unconfirmed' : Object.values(validation).filter(Boolean).join(' ') || 'Ready to save'}
                      </span>
                      <button type="button" onClick={() => editEntry(item, item.ageGroupKey, item.sex)} disabled={saving || uncertain}>Edit</button>
                      <button type="button" className="danger-text" onClick={() => removeEntry(item.id)} disabled={saving || uncertain}>Remove</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="aopd-aggregate-empty">
              <span aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M7 3.75h7l4 4v12.5H7a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
                  <path d="M14 3.75v4h4M8.5 12h7M8.5 15.5h7" />
                </svg>
              </span>
              <strong>No counts added yet</strong>
              <p>Add one or more diagnosis counts. They’ll stay here until you save them.</p>
            </div>
          )}

          <div className="aopd-aggregate-save-bar">
            <span>{queued.length ? `${queued.length} ${queued.length === 1 ? 'entry' : 'entries'} ready for review` : 'Add counts to enable saving'}</span>
            <button
              className="aopd-btn"
              type="button"
              onClick={saveAll}
              disabled={saving || !canWriteMonthlyDiagnosisCounts || queuedSummaries.length === 0}
            >
              {saving ? 'Saving to cloud…' : `Save All to the Cloud${queuedSummaries.length ? ` (${queuedSummaries.length})` : ''}`}
            </button>
          </div>
        </section>
      </div>

    </main>
  );
}
