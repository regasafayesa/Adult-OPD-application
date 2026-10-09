import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  enrichEncounter,
  isDemoLoaded,
  loadDiagnoses,
  loadRecords,
  loadSettings,
  saveDiagnoses,
  saveRecords,
  saveSettings,
  setDemoLoaded,
  createId,
} from '../services/storage';
import { buildDemoRecords } from '../services/demoData';
import { generateDashboardStats, generateMonthlyReport, generateYearlyReport } from '../services/reporting';

const AdultOpdContext = createContext(null);

export function AdultOpdProvider({ children }) {
  const [records, setRecords] = useState(() => loadRecords());
  const [diagnoses, setDiagnoses] = useState(() => loadDiagnoses());
  const [settings, setSettingsState] = useState(() => loadSettings());
  const [demoLoaded, setDemoLoadedState] = useState(() => isDemoLoaded());

  useEffect(() => {
    saveRecords(records);
  }, [records]);

  useEffect(() => {
    saveDiagnoses(diagnoses);
  }, [diagnoses]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const addRecord = useCallback((input) => {
    const record = enrichEncounter(input);
    setRecords((prev) => [record, ...prev]);
    return record;
  }, []);

  const updateRecord = useCallback((id, input) => {
    setRecords((prev) =>
      prev.map((existing) => (existing.id === id ? enrichEncounter(input, existing) : existing))
    );
  }, []);

  const deleteRecord = useCallback((id) => {
    setRecords((prev) => prev.filter((record) => record.id !== id));
  }, []);

  const addDiagnosis = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Diagnosis name is required.' };
    const exists = diagnoses.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return { ok: false, error: 'That diagnosis already exists.' };
    setDiagnoses((prev) => [...prev, { id: createId('dx'), name: trimmed, active: true }]);
    return { ok: true };
  }, [diagnoses]);

  const updateDiagnosis = useCallback((id, patch) => {
    setDiagnoses((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadDemoData = useCallback(() => {
    const year = Number(settings.reportingYear) || new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const demoRecords = buildDemoRecords(year, month);
    setRecords((prev) => [...demoRecords, ...prev.filter((record) => !record.isDemo)]);
    setDemoLoaded(true);
    setDemoLoadedState(true);
  }, [settings.reportingYear]);

  const clearDemoData = useCallback(() => {
    setRecords((prev) => prev.filter((record) => !record.isDemo));
    setDemoLoaded(false);
    setDemoLoadedState(false);
  }, []);

  const clearAllRecords = useCallback(() => {
    setRecords([]);
    setDemoLoaded(false);
    setDemoLoadedState(false);
  }, []);

  const hasDemoRecords = records.some((record) => record.isDemo);

  const value = useMemo(
    () => ({
      records,
      diagnoses,
      settings,
      demoLoaded,
      hasDemoRecords,
      addRecord,
      updateRecord,
      deleteRecord,
      addDiagnosis,
      updateDiagnosis,
      updateSettings,
      loadDemoData,
      clearDemoData,
      clearAllRecords,
      generateMonthlyReport: (year, month) => generateMonthlyReport(records, year, month),
      generateYearlyReport: (year) => generateYearlyReport(records, year),
      generateDashboardStats: (year, month) => generateDashboardStats(records, year, month),
    }),
    [
      records,
      diagnoses,
      settings,
      demoLoaded,
      hasDemoRecords,
      addRecord,
      updateRecord,
      deleteRecord,
      addDiagnosis,
      updateDiagnosis,
      updateSettings,
      loadDemoData,
      clearDemoData,
      clearAllRecords,
    ]
  );

  return <AdultOpdContext.Provider value={value}>{children}</AdultOpdContext.Provider>;
}

export function useAdultOpd() {
  const context = useContext(AdultOpdContext);
  if (!context) {
    throw new Error('useAdultOpd must be used within AdultOpdProvider');
  }
  return context;
}
