import React, { useEffect, useMemo, useRef, useState } from 'react';
import { findDiagnosisMatches } from '../../utils/diagnosisSearch';

export default function DiagnosisAutocomplete({
  diagnoses,
  value,
  onChange,
  inputRef,
  placeholder = 'Search diagnosis name or ESV-1 code',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const activeDiagnoses = useMemo(
    () => diagnoses.filter((item) => item.active !== false),
    [diagnoses]
  );

  const matches = useMemo(
    () => findDiagnosisMatches(activeDiagnoses, value),
    [activeDiagnoses, value]
  );
  const selectedDiagnosis = useMemo(
    () => activeDiagnoses.find((item) => item.name === value),
    [activeDiagnoses, value]
  );

  useEffect(() => {
    setHighlight(0);
  }, [value]);

  useEffect(() => {
    function handleClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function select(item) {
    onChange(item.name);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((index) => (matches.length ? (index + 1) % matches.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((index) => (matches.length ? (index - 1 + matches.length) % matches.length : 0));
    } else if (event.key === 'Enter' && open && matches.length > 0) {
      event.preventDefault();
      select(matches[highlight] || matches[0]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="aopd-autocomplete" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        aria-autocomplete="list"
        aria-controls="diagnosis-autocomplete-list"
        aria-activedescendant={open && matches[highlight] ? `diagnosis-option-${matches[highlight].id}` : undefined}
        aria-expanded={open}
      />
      {open && (
        <ul className="aopd-autocomplete-list" id="diagnosis-autocomplete-list" role="listbox">
          {!value.trim() && <li className="aopd-empty">Search by diagnosis name or ESV-1 code</li>}
          {value.trim() && matches.length === 0 && <li className="aopd-empty">No matching diagnosis</li>}
          {value.trim() && matches.length > 0 && (
            <li className="aopd-match-count" role="presentation">
              {matches.length} matching {matches.length === 1 ? 'diagnosis' : 'diagnoses'} — scroll to view all
            </li>
          )}
          {matches.map((item, index) => (
            <li key={item.id}>
              <button
                id={`diagnosis-option-${item.id}`}
                type="button"
                disabled={disabled}
                className={index === highlight ? 'is-active' : ''}
                role="option"
                aria-selected={index === highlight}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
              >
                <span className="aopd-diagnosis-option-name">{item.name}</span>
                {item.code && <span className="aopd-diagnosis-option-code">{item.code}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedDiagnosis?.code && !open && (
        <span className="aopd-diagnosis-selected-code">ESV-1 {selectedDiagnosis.code}</span>
      )}
    </div>
  );
}
