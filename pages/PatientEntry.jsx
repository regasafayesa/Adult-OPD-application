import React, { useMemo, useRef, useState } from 'react';
import DiagnosisAutocomplete from '../components/common/DiagnosisAutocomplete';
import { SEX } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
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
  const ageRef = useRef(null);
  const diagnosisRef = useRef(null);

  const preview = useMemo(() => {
    if (form.age === '' || !Number.isInteger(Number(form.age))) return null;
    return classifyAge(Number(form.age));
  }, [form.age]);

  function handleChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  function handleSubmit(event) {
    event.preventDefault();
    const result = validateEncounter(form, { diagnoses });
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    const payload = {
      date: form.date,
      age: Number(form.age),
      sex: form.sex,
      diagnosis: form.diagnosis.trim(),
    };
    if (editingRecord) {
      updateRecord(editingRecord.id, payload);
      setSuccess('Encounter updated. Reports will recalculate automatically.');
      onDone?.();
      return;
    }
    addRecord(payload);
    setSuccess('Encounter saved. Enter the next patient.');
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
          <input type="date" value={form.date} onChange={(e) => handleChange('date', e.target.value)} required />
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
            />
            Male
          </label>
          <label className="aopd-inline">
            <input
              type="radio"
              name="sex"
              checked={form.sex === SEX.FEMALE}
              onChange={() => handleChange('sex', SEX.FEMALE)}
            />
            Female
          </label>
          {errors.sex && <span className="aopd-error">{errors.sex}</span>}
        </fieldset>

        <label>
          Diagnosis
          <DiagnosisAutocomplete
            diagnoses={diagnoses}
            value={form.diagnosis}
            onChange={(value) => handleChange('diagnosis', value)}
            inputRef={diagnosisRef}
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
          <button type="submit" className="aopd-btn">
            {editingRecord ? 'Save changes' : 'Save encounter'}
          </button>
          {editingRecord && (
            <button type="button" className="aopd-btn secondary" onClick={onDone}>
              Cancel
            </button>
          )}
        </div>
        {success && <p className="aopd-success">{success}</p>}
      </form>
    </div>
  );
}
