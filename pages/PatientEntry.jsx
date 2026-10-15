import React, { useMemo, useRef, useState } from 'react';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import { SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import { createId } from '../services/storage';
import { classifyAge } from '../utils/ageClassification';
import { todayISO } from '../utils/dates';
import { validateEncounter } from '../utils/validation';

const EMPTY = { date: todayISO(), age: '', sex: SEX.FEMALE, diagnosis: '' };

export default function PatientEntry({ editingRecord, onDone }) {
  const { diagnoses, addRecord, updateRecord } = useAdultOpd();
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
  const ageRef = useRef(null);
  const diagnosisRef = useRef(null);
  const pendingRecordId = useRef(null);

  const preview = useMemo(() => {
    if (form.age === '' || !Number.isInteger(Number(form.age))) return null;
    return classifyAge(Number(form.age));
  }, [form.age]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError('');
    const result = validateEncounter(form, { diagnoses });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!editingRecord && !pendingRecordId.current) {
      pendingRecordId.current = createId('enc');
    }
    const payload = {
      id: editingRecord?.id || pendingRecordId.current,
      date: form.date,
      age: Number(form.age),
      sex: form.sex,
      diagnosis: form.diagnosis.trim(),
    };
    setSaving(true);
    if (editingRecord) {
      const saveResult = await updateRecord(editingRecord.id, payload);
      setSaving(false);
      if (!saveResult.ok) {
        setSaveError(saveResult.error);
        return;
      }
      setSuccess(saveResult.refreshError
        ? 'Encounter updated in Supabase, but the latest facility records could not be reloaded.'
        : 'Encounter updated and synced to this facility.');
      onDone?.();
      return;
    }
    const saveResult = await addRecord(payload);
    setSaving(false);
    if (!saveResult.ok) {
      setSaveError(saveResult.error);
      return;
    }
    pendingRecordId.current = null;
    setSuccess(saveResult.refreshError
      ? 'Encounter saved in Supabase, but the latest facility records could not be reloaded.'
      : 'Encounter saved and synced to this facility. Enter the next patient.');
    setForm((prev) => ({ ...EMPTY, date: prev.date, sex: prev.sex }));
    ageRef.current?.focus();
  }

  return (
    <div className="aopd-page">
      <h2>{editingRecord ? 'Edit encounter' : 'Patient entry'}</h2>
      <p className="aopd-lede">
        Record each Adult OPD encounter once. Age group and OPD category are calculated automatically. Do not enter
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
                <dd>{preview.opdCategory}</dd>
              </div>
              <div>
                <dt>Included in Adult OPD report</dt>
                <dd>{preview.includedInAdultReport ? 'YES' : 'NO'}</dd>
              </div>
            </dl>
          )}
          {preview?.opdCategory === 'Outside Adult OPD Categories' && (
            <p className="aopd-warn">This age is outside Adult OPD reporting categories.</p>
          )}
        </div>

        <div className="aopd-actions">
          <button type="submit" className="aopd-btn" disabled={saving}>
            {saving ? 'Saving…' : editingRecord ? 'Save changes' : 'Save encounter'}
          </button>
          {editingRecord && (
            <button type="button" className="aopd-btn secondary" onClick={onDone}>
              Cancel
            </button>
          )}
        </div>
        {saveError && <p className="aopd-error" role="alert">{saveError}</p>}
        {success && <p className="aopd-success">{success}</p>}
      </form>
    </div>
  );
}
