import React, { useMemo, useRef, useState } from 'react';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import { MONTH_NAMES } from '../constants';
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
    ...emptyMonthlyDiagnosisCounts(),
    diagnosisId: '',
    diagnosisName: '',
    registrationBookTotal: '',
    notes: '',
    discrepancyConfirmed: false,
  };
}

export default function AggregateEntry() {
  const {
    diagnoses,
    settings,
    monthlyDiagnosisCounts,
    monthlyDiagnosisCountsStatus,
    monthlyDiagnosisCountsError,
    canWriteMonthlyDiagnosisCounts,
    saveMonthlyDiagnosisCounts,
  } = useAdultOpd();
  const now = new Date();
  const [year, setYear] = useState(Number(settings.reportingYear) || now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entry, setEntry] = useState(blankEntry);
  const [queued, setQueued] = useState([]);
  const [editingId, setEditingId] = useState('');
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [uncertainIds, setUncertainIds] = useState([]);
  const savingRef = useRef(false);

  const totals = useMemo(() => calculateMonthlyDiagnosisTotals(entry), [entry]);
  const queuedValidations = useMemo(() => queued.map((item) => ({
    id: item.id,
    errors: validateMonthlyDiagnosisCount(item, { diagnoses }).errors,
  })), [diagnoses, queued]);
  const savedForPeriod = monthlyDiagnosisCounts.filter((item) =>
    Number(item.reportingYear) === Number(year)
    && Number(item.reportingMonth) === Number(month)
  );
  const selectedDiagnosis = diagnoses.find((item) => item.id === entry.diagnosisId);

  function changeCount(field, value) {
    setEntry((previous) => ({
      ...previous,
      [field]: value,
      ...(field === 'registrationBookTotal' || field.endsWith('Female') || field.endsWith('Male')
        ? { discrepancyConfirmed: false }
        : {}),
    }));
    setSuccess('');
  }

  function selectDiagnosis(value) {
    const diagnosis = diagnoses.find((item) => item.name === value && item.active !== false);
    setEntry((previous) => ({
      ...previous,
      diagnosisId: diagnosis?.id || '',
      diagnosisName: value,
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
    const original = queued.find((item) => item.id === editingId)
      || savedForPeriod.find((item) => item.id === editingId);
    if (original && original.diagnosisId !== diagnosis?.id) {
      setErrors({ diagnosisId: 'A saved summary cannot be moved to another diagnosis. Cancel and start a new summary.' });
      return;
    }
    const existing = savedForPeriod.find((item) => item.diagnosisId === diagnosis?.id);
    const next = {
      ...entry,
      id: editingId || existing?.id || createId('aggregate'),
      expectedUpdatedAt: editingId ? entry.expectedUpdatedAt : existing?.updatedAt,
      facilityId: existing?.facilityId || '',
      reportingYear: Number(year),
      reportingMonth: Number(month),
      diagnosisId: diagnosis?.id || '',
      diagnosisName: diagnosis?.name || entry.diagnosisName,
      diagnosisCode: diagnosis?.code || '',
      diagnosisSource: diagnosis?.official ? 'official' : 'facility',
    };
    const validation = validateMonthlyDiagnosisCount(next, { diagnoses });
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    if (queued.some((item) => item.diagnosisId === next.diagnosisId && item.id !== editingId)) {
      setErrors({ diagnosisId: 'This diagnosis already has a pending summary for this period.' });
      return;
    }
    setQueued((previous) => {
      const index = previous.findIndex((item) => item.id === editingId);
      if (index < 0) return [...previous, next];
      return previous.map((item) => (item.id === editingId ? next : item));
    });
    setSuccess(existing ? 'Saved summary update added to the pending queue.' : 'Counts added to the pending queue.');
    setEntry(blankEntry());
    setEditingId('');
    setErrors({});
  }

  function editEntry(item) {
    setYear(Number(item.reportingYear));
    setMonth(Number(item.reportingMonth));
    setEntry({ ...item, discrepancyConfirmed: false });
    setEditingId(item.id);
    setErrors({});
    setSaveError('');
  }

  function removeEntry(id) {
    const item = queued.find((record) => record.id === id);
    setQueued((previous) => previous.filter((record) => record.id !== id));
    setUncertainIds((previous) => previous.filter((diagnosisId) => diagnosisId !== item?.diagnosisId));
    if (editingId === id) {
      setEditingId('');
      setEntry(blankEntry());
    }
  }

  async function saveAll() {
    if (savingRef.current || queued.length === 0) return;
    const invalid = queuedValidations.filter(({ errors: validationErrors }) =>
      Object.keys(validationErrors).length > 0
    ).length;
    if (invalid > 0) {
      setSaveError(`${invalid} pending summary${invalid === 1 ? ' needs' : 'ies need'} correction.`);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    setSuccess('');
    setProgress({ completed: 0, total: queued.length, saved: 0 });
    try {
      const result = await saveMonthlyDiagnosisCounts(queued, {
        batchSize: BATCH_SIZE,
        verifyDiagnosisIds: uncertainIds,
        onProgress: setProgress,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      const savedIds = new Set(result.savedRecords.map((item) => item.diagnosisId));
      setQueued((previous) => previous.filter((item) => !savedIds.has(item.diagnosisId)));
      setUncertainIds(result.uncertainDiagnosisIds);
      setSuccess(`${savedIds.size} summary${savedIds.size === 1 ? '' : 'ies'} confirmed saved; ${queued.length - savedIds.size} remain pending.`);
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

  const discrepancy = entry.registrationBookTotal !== ''
    && /^\d+$/.test(String(entry.registrationBookTotal))
    && Number(entry.registrationBookTotal) !== totals.total;

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
              onChange={(event) => setYear(event.target.value)}
              disabled={saving || queued.length > 0}
            />
          </label>
          <label>
            Reporting month
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              disabled={saving || queued.length > 0}
            >
              {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select>
          </label>
        </div>
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
            <h3 id="aggregate-editor-heading">{editingId ? 'Edit diagnosis summary' : 'Add diagnosis counts'}</h3>
            <p>Choose a diagnosis from the existing official and facility catalog.</p>
          </div>
        </div>
        <form onSubmit={queueEntry}>
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

          <div className="aopd-table-wrap aopd-count-editor">
            <table>
              <thead><tr><th>Age group</th><th>Female</th><th>Male</th><th>Total</th></tr></thead>
              <tbody>
                {MONTHLY_DIAGNOSIS_AGE_GROUPS.map(({ key, label, femaleField, maleField }) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    {[femaleField, maleField].map((field) => (
                      <td key={field}>
                        <input
                          type="number"
                          min="0"
                          max="2147483647"
                          step="1"
                          inputMode="numeric"
                          aria-label={`${label} ${field === femaleField ? 'Female' : 'Male'} aggregate count`}
                          value={entry[field]}
                          onChange={(event) => changeCount(field, event.target.value)}
                          disabled={saving || !canWriteMonthlyDiagnosisCounts}
                        />
                        {errors[field] && <span className="aopd-error">{errors[field]}</span>}
                      </td>
                    ))}
                    <td className="num">{Number(entry[femaleField] || 0) + Number(entry[maleField] || 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th>Grand total</th><th className="num">{totals.female}</th><th className="num">{totals.male}</th><th className="num">{totals.total}</th></tr></tfoot>
            </table>
          </div>

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

          {discrepancy && (
            <div className="aopd-alert aopd-aggregate-discrepancy" role="alert">
              <strong>Registration-book total differs from the calculated total.</strong>
              <span>Book: {Number(entry.registrationBookTotal)}</span>
              <span>Calculated: {totals.total}</span>
              <span>Difference: {Number(entry.registrationBookTotal) - totals.total}</span>
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
              {editingId ? 'Update pending summary' : 'Add to queue'}
            </button>
            {editingId && (
              <button
                className="aopd-btn secondary"
                type="button"
                onClick={() => { setEditingId(''); setEntry(blankEntry()); setErrors({}); }}
                disabled={saving}
              >
                Cancel edit
              </button>
            )}
          </div>
          {!canWriteMonthlyDiagnosisCounts && <p className="aopd-aggregate-readonly">You have read-only access to registration-book summaries.</p>}
          {success && <p className="aopd-success" role="status">{success}</p>}
        </form>
      </section>

      <section className="aopd-pending aopd-aggregate-list" aria-labelledby="aggregate-saved-heading">
        <h3 id="aggregate-saved-heading">Saved summaries — {MONTH_NAMES[Number(month) - 1]} {year}</h3>
        <div className="aopd-table-wrap">
          <table className="aopd-pending-table">
            <thead><tr><th>Diagnosis</th><th>Female</th><th>Male</th><th>Total</th><th>Action</th></tr></thead>
            <tbody>
              {savedForPeriod.map((item) => {
                const savedTotals = calculateMonthlyDiagnosisTotals(item);
                return (
                  <tr key={item.id}>
                    <td>{item.diagnosisCode ? `${item.diagnosisCode} — ` : ''}{item.diagnosisName}</td>
                    <td className="num">{savedTotals.female}</td>
                    <td className="num">{savedTotals.male}</td>
                    <td className="num">{savedTotals.total}</td>
                    <td className="aopd-row-actions">
                      <button type="button" onClick={() => editEntry(item)} disabled={saving || !canWriteMonthlyDiagnosisCounts}>Edit</button>
                    </td>
                  </tr>
                );
              })}
              {!savedForPeriod.length && <tr><td colSpan="5" className="aopd-empty">No saved summaries for this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="aopd-pending aopd-aggregate-list" aria-labelledby="aggregate-queued-heading">
        <div className="aopd-pending-heading">
          <div>
            <h3 id="aggregate-queued-heading">Queued summaries ({queued.length})</h3>
            <p>Review, edit, or remove entries before saving them together.</p>
          </div>
          <button className="aopd-btn" type="button" onClick={saveAll} disabled={saving || !canWriteMonthlyDiagnosisCounts || queued.length === 0}>
            {saving ? 'Saving…' : `Save All (${queued.length})`}
          </button>
        </div>
        {progress && <p className="aopd-pending-progress" role="status">Processed {progress.completed} of {progress.total}; confirmed saved {progress.saved}.</p>}
        {saveError && <p className="aopd-error" role="alert">{saveError}</p>}
        {success && <p className="aopd-success" role="status">{success}</p>}
        <div className="aopd-table-wrap">
          <table className="aopd-pending-table">
            <thead><tr><th>Diagnosis</th><th>Female</th><th>Male</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {queued.map((item) => {
                const queuedTotals = calculateMonthlyDiagnosisTotals(item);
                const validation = queuedValidations.find((result) => result.id === item.id)?.errors || {};
                const uncertain = uncertainIds.includes(item.diagnosisId);
                return (
                  <tr key={item.id}>
                    <td>{item.diagnosisCode ? `${item.diagnosisCode} — ` : ''}{item.diagnosisName}{item.expectedUpdatedAt ? ' (update)' : ''}</td>
                    <td className="num">{queuedTotals.female}</td>
                    <td className="num">{queuedTotals.male}</td>
                    <td className="num">{queuedTotals.total}</td>
                    <td>{uncertain ? 'Save status unconfirmed' : Object.values(validation).filter(Boolean).join(' ') || 'Ready to save'}</td>
                    <td className="aopd-row-actions">
                      <button type="button" onClick={() => editEntry(item)} disabled={saving || uncertain}>Edit</button>
                      <button type="button" className="danger-text" onClick={() => removeEntry(item.id)} disabled={saving || uncertain}>Remove</button>
                    </td>
                  </tr>
                );
              })}
              {!queued.length && <tr><td colSpan="6" className="aopd-empty">No aggregate summaries are waiting to be saved.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
