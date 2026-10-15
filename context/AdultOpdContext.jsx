import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '../constants';
import { enrichEncounter, createId, readLegacyLocalData } from '../services/storage';
import { buildDemoRecords } from '../services/demoData';
import { generateDashboardStats, generateMonthlyReport, generateYearlyReport } from '../services/reporting';
import {
  addFacilityDiagnosis,
  deleteEncounter,
  deleteFacilityEncounters,
  insertEncounter,
  importLegacyFacilityData,
  loadFacilityData,
  updateEncounter as updateRemoteEncounter,
  updateFacilityDiagnosis,
  updateFacilitySettings,
} from '../services/supabaseData';

const AdultOpdContext = createContext(null);

export function AdultOpdProvider({ children, initialSettings, facilityId }) {
  const remote = Boolean(facilityId);
  const [records, setRecords] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [settings, setSettingsState] = useState(() => ({ ...DEFAULT_SETTINGS, ...initialSettings }));
  const [syncStatus, setSyncStatus] = useState(remote ? 'loading' : 'ready');
  const [syncError, setSyncError] = useState('');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState('idle');

  useEffect(() => {
    if (!remote) return undefined;
    let active = true;

    async function refreshRemoteData() {
      try {
        const data = await loadFacilityData(facilityId);
        if (!active) return;
        setRecords(data.records);
        setDiagnoses(data.diagnoses);
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

  const refreshFacilityData = useCallback(async () => {
    const data = await loadFacilityData(facilityId);
    setRecords(data.records);
    setDiagnoses(data.diagnoses);
    setSyncError('');
    return data;
  }, [facilityId]);

  const hasDemoRecords = records.some((record) => record.isDemo);

  const addRecord = useCallback(async (input) => {
    const record = enrichEncounter(input);
    if (remote) {
      if (syncStatus !== 'ready') {
        return reportSyncError(new Error('Cloud data is not loaded. No encounter was saved; retry after connection is restored.'));
      }
      try {
        const savedRecord = await insertEncounter(facilityId, record);
        setRecords((prev) => [savedRecord, ...prev]);
        setSyncError('');
        try {
          await refreshFacilityData();
          return { ok: true, record: savedRecord };
        } catch (refreshError) {
          setSyncError(`Encounter saved, but the refreshed facility data could not be loaded: ${refreshError.message}`);
          return { ok: true, record: savedRecord, refreshError: refreshError.message };
        }
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => [record, ...prev]);
    return { ok: true, record };
  }, [facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const updateRecord = useCallback(async (id, input) => {
    const existing = records.find((record) => record.id === id);
    if (!existing) return { ok: false, error: 'Encounter was not found.' };
    const updated = enrichEncounter(input, existing);
    if (remote) {
      if (syncStatus !== 'ready') {
        return reportSyncError(new Error('Cloud data is not loaded. No encounter was changed; retry after connection is restored.'));
      }
      try {
        const savedRecord = await updateRemoteEncounter(facilityId, updated);
        setRecords((prev) => prev.map((record) => (record.id === id ? savedRecord : record)));
        setSyncError('');
        try {
          await refreshFacilityData();
          return { ok: true, record: savedRecord };
        } catch (refreshError) {
          setSyncError(`Encounter updated, but the refreshed facility data could not be loaded: ${refreshError.message}`);
          return { ok: true, record: savedRecord, refreshError: refreshError.message };
        }
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => prev.map((record) => (record.id === id ? updated : record)));
    return { ok: true, record: updated };
  }, [facilityId, records, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const deleteRecord = useCallback(async (id) => {
    if (remote) {
      if (syncStatus !== 'ready') {
        return reportSyncError(new Error('Cloud data is not loaded. No encounter was deleted; retry after connection is restored.'));
      }
      try {
        await deleteEncounter(facilityId, id);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => prev.filter((record) => record.id !== id));
    if (remote) {
      try {
        await refreshFacilityData();
      } catch (refreshError) {
        setSyncError(`Encounter deleted, but the refreshed facility data could not be loaded: ${refreshError.message}`);
        return { ok: true, refreshError: refreshError.message };
      }
    }
    return { ok: true };
  }, [facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const addDiagnosis = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: 'Diagnosis name is required.' };
    const exists = diagnoses.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) return { ok: false, error: 'That diagnosis already exists.' };
    const diagnosis = { id: createId('dx'), name: trimmed, active: true, official: false };
    if (remote) {
      if (syncStatus !== 'ready') {
        return reportSyncError(new Error('Cloud data is not loaded. No diagnosis was saved; retry after connection is restored.'));
      }
      try {
        const savedDiagnosis = await addFacilityDiagnosis(facilityId, diagnosis);
        setDiagnoses((prev) => [...prev, savedDiagnosis]);
        setSyncError('');
        try {
          await refreshFacilityData();
        } catch (refreshError) {
          setSyncError(`Diagnosis saved, but the refreshed facility data could not be loaded: ${refreshError.message}`);
        }
        return { ok: true };
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setDiagnoses((prev) => [...prev, diagnosis]);
    return { ok: true };
  }, [diagnoses, facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const updateDiagnosis = useCallback(async (id, patch) => {
    const existingDiagnosis = diagnoses.find((item) => item.id === id);
    if (existingDiagnosis?.official) {
      return { ok: false, error: 'Approved diagnosis catalog entries cannot be changed here.' };
    }
    if (remote) {
      if (syncStatus !== 'ready') {
        return reportSyncError(new Error('Cloud data is not loaded. No diagnosis was changed; retry after connection is restored.'));
      }
      try {
        const savedDiagnosis = await updateFacilityDiagnosis(facilityId, id, patch);
        setDiagnoses((prev) => prev.map((item) => (item.id === id ? savedDiagnosis : item)));
        setSyncError('');
        try {
          await refreshFacilityData();
        } catch (refreshError) {
          setSyncError(`Diagnosis updated, but the refreshed facility data could not be loaded: ${refreshError.message}`);
        }
        return { ok: true };
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setDiagnoses((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    return { ok: true };
  }, [diagnoses, facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const updateSettings = useCallback((patch) => {
    setSettingsState((prev) => ({ ...prev, ...patch }));
    setSettingsSyncStatus('dirty');
  }, []);

  const saveSettings = useCallback(async () => {
    if (!remote) {
      setSettingsSyncStatus('saved');
      return { ok: true };
    }
    if (syncStatus !== 'ready') {
      setSettingsSyncStatus('error');
      return { ok: false, error: 'Cloud data is not loaded. Settings were not saved; retry after connection is restored.' };
    }

    setSettingsSyncStatus('saving');
    try {
      const savedSettings = await updateFacilitySettings(facilityId, settings);
      setSettingsState({
        healthCenterName: savedSettings.health_center_name,
        region: savedSettings.region,
        zone: savedSettings.zone,
        woreda: savedSettings.woreda,
        reportingYear: savedSettings.reporting_year,
        responsiblePersonName: savedSettings.responsible_person_name,
        position: savedSettings.position,
      });
      setSyncError('');
      setSettingsSyncStatus('saved');
      return { ok: true };
    } catch (error) {
      setSyncError(error.message || 'Could not save facility settings.');
      setSettingsSyncStatus('error');
      return { ok: false, error: error.message || 'Could not save facility settings.' };
    }
  }, [facilityId, remote, settings, syncStatus]);

  const migrateLegacyData = useCallback(async () => {
    if (!remote) return { ok: false, error: 'Legacy import requires a signed-in Supabase facility.' };
    if (syncStatus !== 'ready') {
      return { ok: false, error: 'Cloud data is not loaded. Retry after connection is restored.' };
    }
    try {
      const legacyData = readLegacyLocalData();
      const result = await importLegacyFacilityData(facilityId, legacyData);
      if (result.settings.imported.length > 0) {
        const cloudSettings = result.settings.values;
        setSettingsState((currentSettings) => ({
          ...currentSettings,
          healthCenterName: cloudSettings.health_center_name,
          region: cloudSettings.region,
          zone: cloudSettings.zone,
          woreda: cloudSettings.woreda,
          reportingYear: cloudSettings.reporting_year,
          responsiblePersonName: cloudSettings.responsible_person_name,
          position: cloudSettings.position,
        }));
        setSettingsSyncStatus('saved');
      }
      try {
        const data = await loadFacilityData(facilityId);
        setRecords(data.records);
        setDiagnoses(data.diagnoses);
      } catch (error) {
        result.refreshError = error.message || 'Imported data, but could not refresh the current view.';
      }
      return { ok: true, result };
    } catch (error) {
      return reportSyncError(error);
    }
  }, [facilityId, remote, reportSyncError, syncStatus]);

  const loadDemoData = useCallback(async () => {
    const year = Number(settings.reportingYear) || new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const demoRecords = buildDemoRecords(year, month);
    if (remote) {
      try {
        await deleteFacilityEncounters(facilityId, true);
        const savedRecords = await Promise.all(demoRecords.map((record) => insertEncounter(facilityId, record)));
        setRecords((prev) => [...savedRecords, ...prev.filter((record) => !record.isDemo)]);
        setSyncError('');
        try {
          await refreshFacilityData();
        } catch (refreshError) {
          setSyncError(`Demo encounters saved, but the refreshed facility data could not be loaded: ${refreshError.message}`);
          return { ok: true, refreshError: refreshError.message };
        }
      } catch (error) {
        const result = reportSyncError(error);
        try {
          await refreshFacilityData();
        } catch (refreshError) {
          const message = `${result.error} Facility records could not be reloaded: ${refreshError.message}`;
          setSyncError(message);
          return { ok: false, error: message };
        }
        return result;
      }
    } else {
      setRecords((prev) => [...demoRecords, ...prev.filter((record) => !record.isDemo)]);
    }
    return { ok: true };
  }, [facilityId, hasDemoRecords, refreshFacilityData, remote, reportSyncError, settings.reportingYear, syncStatus]);

  const clearDemoData = useCallback(async () => {
    if (remote) {
      try {
        await deleteFacilityEncounters(facilityId, true);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords((prev) => prev.filter((record) => !record.isDemo));
    if (remote) {
      try {
        await refreshFacilityData();
      } catch (refreshError) {
        setSyncError(`Demo encounters deleted, but the refreshed facility data could not be loaded: ${refreshError.message}`);
        return { ok: true, refreshError: refreshError.message };
      }
    }
    return { ok: true };
  }, [facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const clearAllRecords = useCallback(async () => {
    if (remote) {
      try {
        await deleteFacilityEncounters(facilityId);
        setSyncError('');
      } catch (error) {
        return reportSyncError(error);
      }
    }
    setRecords([]);
    if (remote) {
      try {
        await refreshFacilityData();
      } catch (refreshError) {
        setSyncError(`Facility encounters deleted, but the refreshed facility data could not be loaded: ${refreshError.message}`);
        return { ok: true, refreshError: refreshError.message };
      }
    }
    return { ok: true };
  }, [facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const demoLoaded = hasDemoRecords;

  const value = useMemo(
    () => ({
      records,
      diagnoses,
      settings,
      demoLoaded,
      settingsSyncStatus,
      isCloud: remote,
      facilityId,
      hasDemoRecords,
      syncStatus,
      syncError,
      addRecord,
      updateRecord,
      deleteRecord,
      addDiagnosis,
      updateDiagnosis,
      updateSettings,
      saveSettings,
      migrateLegacyData,
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
      settingsSyncStatus,
      remote,
      facilityId,
      hasDemoRecords,
      syncStatus,
      syncError,
      addRecord,
      updateRecord,
      deleteRecord,
      addDiagnosis,
      updateDiagnosis,
      updateSettings,
      saveSettings,
      migrateLegacyData,
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
