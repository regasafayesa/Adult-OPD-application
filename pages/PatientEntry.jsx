import React, { useMemo, useRef, useState } from 'react';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import { OPD_CATEGORY, SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import { retainPendingRecords } from '../services/batchInsert.mjs';
import { createId } from '../services/storage';
import { classifyAge } from '../utils/ageClassification';
import { todayISO } from '../utils/dates';
import { validateEncounter } from '../utils/validation';

const EMPTY = { date: todayISO(), age: '', sex: SEX.FEMALE, diagnosis: '' };
const BATCH_SIZE = 100;

export default function PatientEntry({ editingRecord, onDone }) {
  const {
    diagnoses,
    addRecords,
    addRecord,
    updateRecord,
  } = useAdultOpd();
  const [form, setForm] = useState(
    editingRecord
      ? {
          date: editingRecord.date,
          age: String(editingRecord.age),
          sex: editingRecord.sex,
          diagnosis: editingRecord.diagnosis,
        }
      : EMPTY
  );
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingRecords, setPendingRecords] = useState([]);
  const [editingPendingId, setEditingPendingId] = useState(null);
  const [uncertainIds, setUncertainIds] = useState([]);
  const [saveProgress, setSaveProgress] = useState(null);
  const ageRef = useRef(null);
  const diagnosisRef = useRef(null);
  const savingRef = useRef(false);

  const preview = useMemo(() => {
    if (form.age === '' || !Number.isInteger(Number(form.age))) return null;
    return classifyAge(Number(form.age));
  }, [form.age]);

  const pendingValidations = useMemo(() => pendingRecords.map((record) => ({
    id: record.id,
    errors: validateEncounter(record, { diagnoses }).errors,
  })), [diagnoses, pendingRecords]);
  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  function resetForm() {
    setForm((prev) => ({ ...EMPTY, date: prev.date, sex: prev.sex }));
    setEditingPendingId(null);
    setErrors({});
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError('');
    setSuccess('');
    const result = validateEncounter(form, { diagnoses });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const payload = {
      id: editingRecord?.id || editingPendingId || createId('enc'),
      date: form.date,
      age: Number(form.age),
      sex: form.sex,
      diagnosis: form.diagnosis.trim(),
      diagnosisId: diagnoses.find((item) => item.name === form.diagnosis)?.id || '',
      diagnosisCode: diagnoses.find((item) => item.name === form.diagnosis)?.code || '',
    };

    if (!editingRecord) {
      setPendingRecords((previous) => editingPendingId
        ? previous.map((record) => (record.id === editingPendingId ? payload : record))
        : [...previous, payload]);
      setSuccess(editingPendingId ? 'Pending encounter updated.' : 'Encounter added to the pending queue.');
      resetForm();
      ageRef.current?.focus();
      return;
    }

    setSaving(true);
    const saveResult = await (editingRecord ? updateRecord(editingRecord.id, payload) : addRecord(payload));
    setSaving(false);
    if (!saveResult.ok) {
      setSaveError(saveResult.error);
      return;
    }
    setSuccess(saveResult.refreshError
      ? 'Encounter updated in the cloud, but the latest facility records could not be reloaded.'
      : 'Encounter updated and synced to this facility.');
    onDone?.();
  }

  function editPendingRecord(record) {
    setForm({
      date: record.date,
      age: String(record.age),
      sex: record.sex,
      diagnosis: record.diagnosis,
    });
    setEditingPendingId(record.id);
    setErrors({});
    setSuccess('');
    setSaveError('');
    ageRef.current?.focus();
  }

  function removePendingRecord(id) {
    setPendingRecords((previous) => previous.filter((record) => record.id !== id));
    setUncertainIds((previous) => previous.filter((uncertainId) => uncertainId !== id));
    if (editingPendingId === id) resetForm();
  }

  async function handleSaveAll() {
    if (savingRef.current || pendingRecords.length === 0) return;
    const invalidCount = pendingValidations.filter(({ errors: validationErrors }) =>
      Object.keys(validationErrors).length > 0
    ).length;
    if (invalidCount > 0) {
      setSaveError(`${invalidCount} pending encounter${invalidCount === 1 ? '' : 's'} need correction before saving.`);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError('');
    setSuccess('');
    setSaveProgress({ completed: 0, total: pendingRecords.length, saved: 0 });
    try {
      const result = await addRecords(pendingRecords, {
        verifyIds: uncertainIds,
        batchSize: BATCH_SIZE,
        onProgress: setSaveProgress,
      });
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      const savedIds = new Set(result.savedRecords.map((record) => record.id));
      setPendingRecords((previous) => retainPendingRecords(previous, result.savedRecords));
      setUncertainIds(result.uncertainIds);
      const remainingCount = pendingRecords.length - savedIds.size;
      const errorSummary = result.errors.map(({ id, message }) => `${id}: ${message}`).join(' ');
      setSuccess(`${savedIds.size} saved; ${remainingCount} still pending.${result.refreshError
        ? ' Facility records could not be refreshed.'
        : ''}`);
      if (errorSummary) setSaveError(errorSummary);
    } catch (error) {
      setSaveError(error.message || 'The batch could not be saved. Pending encounters were retained.');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setSaveProgress(null);
    }
  }

  return (
    <div className="aopd-page aopd-entry-page">
      <h2>{editingRecord ? 'Edit encounter' : 'Patient entry'}</h2>
      <p className="aopd-lede">
        Record each OPD encounter once. Age group and OPD category are calculated automatically. Do not enter
        patient names or other identifiers.
      </p>

      <form className="aopd-entry" onSubmit={handleSubmit}>
        <label>
          Date
          <input type="date" value={form.date} onChange={(e) => handleChange('date', e.target.value)} required disabled={saving} />
          {errors.date && <span className="aopd-error">{errors.date}</span>}
        </label>

        <label>
          Age (years)
          <input
            ref={ageRef}
            type="number"
            min="0"
            step="1"
            value={form.age}
            onChange={(e) => handleChange('age', e.target.value)}
            required
            disabled={saving}
          />
          {errors.age && <span className="aopd-error">{errors.age}</span>}
        </label>

        <fieldset>
          <legend>Sex</legend>
          <label className="aopd-inline">
            <input
              type="radio"
              name="sex"
              checked={form.sex === SEX.MALE}
              onChange={() => handleChange('sex', SEX.MALE)}
              disabled={saving}
            />
            Male
          </label>
          <label className="aopd-inline">
            <input
              type="radio"
              name="sex"
              checked={form.sex === SEX.FEMALE}
              onChange={() => handleChange('sex', SEX.FEMALE)}
              disabled={saving}
            />
            Female
          </label>
          {errors.sex && <span className="aopd-error">{errors.sex}</span>}
        </fieldset>

        <label>
          Diagnosis
          {diagnoses.filter((item) => item.active !== false).length === 0 && (
            <span className="aopd-error" role="status">
              This facility has no active diagnosis catalog yet. Ask an owner or admin to initialize it.
            </span>
          )}
          <DiagnosisAutocomplete
            diagnoses={diagnoses}
            value={form.diagnosis}
            onChange={(value) => handleChange('diagnosis', value)}
            inputRef={diagnosisRef}
            disabled={saving}
          />
          {errors.diagnosis && <span className="aopd-error">{errors.diagnosis}</span>}
        </label>

        <div className="aopd-classification" aria-live="polite">
          <h3>Automatic classification</h3>
          {!preview && <p>Enter age to see age group and OPD category.</p>}
          {preview && (
            <dl>
              <div>
                <dt>Age group</dt>
                <dd>{preview.ageGroup || 'None'}</dd>
              </div>
              <div>
                <dt>OPD category</dt>
                <dd>
                  {preview.opdCategory === OPD_CATEGORY.ADULT
                    ? 'OPD'
                    : preview.opdCategory === OPD_CATEGORY.OUTSIDE
                      ? 'Outside OPD Categories'
                      : preview.opdCategory}
                </dd>
              </div>
              <div>
                <dt>Included in OPD report</dt>
                <dd>{preview.includedInAdultReport ? 'YES' : 'NO'}</dd>
              </div>
            </dl>
          )}
          {preview?.opdCategory === OPD_CATEGORY.OUTSIDE && (
            <p className="aopd-warn">This age is outside OPD reporting categories.</p>
          )}
        </div>

        <div className="aopd-actions">
          <button type="submit" className="aopd-btn" disabled={saving}>
            {editingRecord
              ? (saving ? 'Saving…' : 'Save changes')
              : (editingPendingId ? 'Update pending entry' : 'Add to pending queue')}
          </button>
          {(editingRecord || editingPendingId) && (
            <button
              type="button"
              className="aopd-btn secondary"
              onClick={editingRecord ? onDone : resetForm}
              disabled={saving}
            >
              Cancel
            </button>
          )}
        </div>
        {saveError && <p className="aopd-error" role="alert">{saveError}</p>}
        {success && <p className="aopd-success" role="status">{success}</p>}
      </form>

      {!editingRecord && (
        <section className="aopd-pending" aria-labelledby="aopd-pending-heading">
          <div className="aopd-pending-heading">
            <div>
              <h3 id="aopd-pending-heading">Pending encounters ({pendingRecords.length})</h3>
              <p>Entries remain here until the cloud confirms they were saved.</p>
            </div>
            <button
              type="button"
              className="aopd-btn"
              onClick={handleSaveAll}
              disabled={saving || pendingRecords.length === 0}
            >
              {saving ? 'Saving batch…' : 'Save All to the cloud'}
            </button>
          </div>

          {saveProgress && (
            <p className="aopd-pending-progress" role="status">
              Processed {saveProgress.completed} of {saveProgress.total}; confirmed saved: {saveProgress.saved}.
            </p>
          )}
          <div className="aopd-table-wrap">
            <table className="aopd-pending-table">
              <thead>
                <tr>
                  <th>Date / reporting year</th>
                  <th>Age</th>
                  <th>Age group</th>
                  <th>Sex</th>
                  <th>Diagnosis</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingRecords.length === 0 && (
                  <tr><td colSpan="7" className="aopd-empty">Add encounters above to create a batch.</td></tr>
                )}
                {pendingRecords.map((record) => {
                  const classification = classifyAge(record.age);
                  const validation = pendingValidations.find((item) => item.id === record.id)?.errors || {};
                  const uncertain = uncertainIds.includes(record.id);
                  const rowError = Object.values(validation).join(' ');
                  return (
                    <tr key={record.id}>
                      <td>{record.date} ({record.date.slice(0, 4)})</td>
                      <td className="num">{record.age}</td>
                      <td>{classification.ageGroup || '—'}</td>
                      <td>{record.sex}</td>
                      <td>{record.diagnosis}</td>
                      <td>
                        {uncertain
                          ? 'Save status unconfirmed'
                          : rowError || 'Ready to save'}
                      </td>
                      <td className="aopd-row-actions">
                        <button type="button" onClick={() => editPendingRecord(record)} disabled={saving || uncertain}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="danger-text"
                          onClick={() => removePendingRecord(record.id)}
                          disabled={saving || uncertain}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {uncertainIds.length > 0 && (
            <p className="aopd-warn" role="status">
              Some save results could not be checked. Save again to verify those IDs before retrying; uncertain entries cannot be edited or removed yet.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
