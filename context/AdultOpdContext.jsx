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
import {
  addFacilityDiagnosis,
  deleteEncounter,
  deleteFacilityEncounters,
  insertEncounter,
  loadFacilityData,
  updateEncounter as updateRemoteEncounter,
  updateFacilityDiagnosis,
  updateFacilitySettings,
} from '../services/supabaseData';

const AdultOpdContext = createContext(null);

export function AdultOpdProvider({ children, initialSettings, facilityId, role }) {
  const remote = Boolean(facilityId);
  const canManageFacility = !remote || role === 'owner' || role === 'admin';
  const [records, setRecords] = useState(() => (remote ? [] : loadRecords()));
  const [diagnoses, setDiagnoses] = useState(() => (remote ? [] : loadDiagnoses()));
  const [settings, setSettingsState] = useState(() => ({ ...loadSettings(), ...initialSettings }));
  const [demoLoaded, setDemoLoadedState] = useState(() => (remote ? false : isDemoLoaded()));
  const [syncStatus, setSyncStatus] = useState(remote ? 'loading' : 'ready');
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    if (remote) return;
    saveRecords(records);
  }, [records, remote]);

  useEffect(() => {
    if (remote) return;
    saveDiagnoses(diagnoses);
  }, [diagnoses, remote]);

  useEffect(() => {
    if (!remote) {
      saveSettings(settings);
      return undefined;
    }
    if (!canManageFacility) return undefined;

    const timeoutId = window.setTimeout(async () => {
      try {
        await updateFacilitySettings(facilityId, settings);
        setSyncError('');
      } catch (error) {
        setSyncError(error.message || 'Could not sync facility settings.');
      }
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [canManageFacility, facilityId, remote, settings]);

  useEffect(() => {
    if (!remote) return undefined;
    let active = true;

    async function refreshRemoteData() {
      try {
        const data = await loadFacilityData(facilityId);
        if (!active) return;
        setRecords(data.records);
        setDiagnoses(data.diagnoses);
        setDemoLoadedState(data.records.some((record) => record.isDemo));
        setSyncError('');
        setSyncStatus('ready');
      } catch (error) {
        if (!active) return;
        setSyncError(error.message || 'Could not sync facility data.');
        setSyncStatus('error');
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') refreshRemoteData();
    }

    refreshRemoteData();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [facilityId, remote]);

  const reportSyncError = useCallback((error) => {
    setSyncError(error.message || 'Could not sync facility data.');
    return { ok: false, error: error.message || 'Could not sync facility data.' };
  }, []);

  const hasDemoRecords = records.some((record) => record.isDemo);

  const addRecord = useCallback(async (input) => {
    const record = enrichEncounter(input);
    if (remote) {
      try {
        const savedRecord = await insertEncounter(facilityId, record);
        setRecords((prev) => [savedRecord, ...prev]);
        setSyncError('');
        return { ok: true, record: savedRecord };
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => [record, ...prev]);
    return { ok: true, record };
  }, [facilityId, remote, reportSyncError]);

  const updateRecord = useCallback(async (id, input) => {
    const existing = records.find((record) => record.id === id);
    if (!existing) return { ok: false, error: 'Encounter was not found.' };
    const updated = enrichEncounter(input, existing);
    if (remote) {
      try {
        const savedRecord = await updateRemoteEncounter(facilityId, updated);
        setRecords((prev) => prev.map((record) => (record.id === id ? savedRecord : record)));
        setSyncError('');
        return { ok: true, record: savedRecord };
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => prev.map((record) => (record.id === id ? updated : record)));
    return { ok: true, record: updated };
  }, [facilityId, records, remote, reportSyncError]);

  const deleteRecord = useCallback(async (id) => {
    if (remote) {
      if (!canManageFacility) {
        return reportSyncError(new Error('Only a facility admin or owner can delete encounters.'));
      }
      try {
        await deleteEncounter(facilityId, id);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => prev.filter((record) => record.id !== id));
    return { ok: true };
  }, [canManageFacility, facilityId, remote, reportSyncError]);

  const addDiagnosis = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Diagnosis name is required.' };
    const exists = diagnoses.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return { ok: false, error: 'That diagnosis already exists.' };
    if (remote && !canManageFacility) {
      return reportSyncError(new Error('Only a facility admin or owner can manage diagnoses.'));
    }
    const diagnosis = { id: createId('dx'), name: trimmed, active: true, official: false };
    if (remote) {
      try {
        const savedDiagnosis = await addFacilityDiagnosis(facilityId, diagnosis);
        setDiagnoses((prev) => [...prev, savedDiagnosis]);
        setSyncError('');
        return { ok: true };
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setDiagnoses((prev) => [...prev, diagnosis]);
    return { ok: true };
  }, [canManageFacility, diagnoses, facilityId, remote, reportSyncError]);

  const updateDiagnosis = useCallback(async (id, patch) => {
    if (remote) {
      if (!canManageFacility) {
        return reportSyncError(new Error('Only a facility admin or owner can manage diagnoses.'));
      }
      try {
        const savedDiagnosis = await updateFacilityDiagnosis(facilityId, id, patch);
        setDiagnoses((prev) => prev.map((item) => (item.id === id ? savedDiagnosis : item)));
        setSyncError('');
        return { ok: true };
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setDiagnoses((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    return { ok: true };
  }, [canManageFacility, facilityId, remote, reportSyncError]);

  const updateSettings = useCallback((patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadDemoData = useCallback(async () => {
    const year = Number(settings.reportingYear) || new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const demoRecords = buildDemoRecords(year, month);
    if (remote) {
      if (hasDemoRecords && !canManageFacility) {
        return reportSyncError(new Error('Only a facility admin or owner can replace demo encounters.'));
      }
      try {
        await deleteFacilityEncounters(facilityId, true);
        const savedRecords = await Promise.all(demoRecords.map((record) => insertEncounter(facilityId, record)));
        setRecords((prev) => [...savedRecords, ...prev.filter((record) => !record.isDemo)]);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    } else {
      setRecords((prev) => [...demoRecords, ...prev.filter((record) => !record.isDemo)]);
    }
    if (!remote) setDemoLoaded(true);
    setDemoLoadedState(true);
    return { ok: true };
  }, [canManageFacility, facilityId, hasDemoRecords, remote, reportSyncError, settings.reportingYear]);

  const clearDemoData = useCallback(async () => {
    if (remote) {
      if (!canManageFacility) {
        return reportSyncError(new Error('Only a facility admin or owner can delete demo encounters.'));
      }
      try {
        await deleteFacilityEncounters(facilityId, true);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => prev.filter((record) => !record.isDemo));
    if (!remote) setDemoLoaded(false);
    setDemoLoadedState(false);
    return { ok: true };
  }, [canManageFacility, facilityId, remote, reportSyncError]);

  const clearAllRecords = useCallback(async () => {
    if (remote) {
      if (!canManageFacility) {
        return reportSyncError(new Error('Only a facility admin or owner can delete facility encounters.'));
      }
      try {
        await deleteFacilityEncounters(facilityId);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords([]);
    if (!remote) setDemoLoaded(false);
    setDemoLoadedState(false);
    return { ok: true };
  }, [canManageFacility, facilityId, remote, reportSyncError]);

  const value = useMemo(
    () => ({
      records,
      diagnoses,
      settings,
      demoLoaded,
      hasDemoRecords,
      syncStatus,
      syncError,
      canManageFacility,
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
      syncStatus,
      syncError,
      canManageFacility,
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
