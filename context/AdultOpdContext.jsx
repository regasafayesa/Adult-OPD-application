import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '../constants';
import { enrichEncounter, createId, readLegacyLocalData } from '../services/storage';
import { buildDemoRecords } from '../services/demoData';
import { generateDashboardStats, generateMonthlyReport, generateYearlyReport } from '../services/reporting';
import { validateMonthlyDiagnosisCount } from '../services/monthlyDiagnosisCounts.mjs';
import {
  addFacilityDiagnosis,
  deleteEncounter,
  deleteFacilityEncounters,
  deleteFacilityMonthlyDiagnosisCounts,
  insertEncounters,
  insertEncounter,
  importLegacyFacilityData,
  loadFacilityData,
  loadFacilityMonthlyDiagnosisCounts,
  saveFacilityMonthlyDiagnosisCounts,
  updateEncounter as updateRemoteEncounter,
  updateFacilityDiagnosis,
  updateFacilitySettings,
} from '../services/supabaseData';

const AdultOpdContext = createContext(null);

export function AdultOpdProvider({ children, initialSettings, facilityId, role = 'local demo' }) {
  const remote = Boolean(facilityId);
  const canManageFacility = !remote || role === 'owner' || role === 'admin';
  const canWriteEncounters = !remote || canManageFacility || role === 'data_entry';
  const canWriteMonthlyDiagnosisCounts = !remote
    || ['owner', 'admin', 'data_entry'].includes(role);
  const [records, setRecords] = useState([]);
  const [diagnoses, setDiagnoses] = useState([]);
  const [monthlyDiagnosisCounts, setMonthlyDiagnosisCounts] = useState([]);
  const [monthlyDiagnosisCountsStatus, setMonthlyDiagnosisCountsStatus] = useState(remote ? 'loading' : 'ready');
  const [monthlyDiagnosisCountsError, setMonthlyDiagnosisCountsError] = useState('');
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

  useEffect(() => {
    if (!remote) {
      setMonthlyDiagnosisCounts([]);
      setMonthlyDiagnosisCountsStatus('ready');
      setMonthlyDiagnosisCountsError('');
      return undefined;
    }
    if (syncStatus !== 'ready') {
      setMonthlyDiagnosisCountsStatus(syncStatus === 'error' ? 'error' : 'loading');
      return undefined;
    }

    let active = true;
    async function refreshMonthlyDiagnosisCounts() {
      setMonthlyDiagnosisCountsStatus('loading');
      try {
        const summaries = await loadFacilityMonthlyDiagnosisCounts(facilityId, diagnoses);
        if (!active) return;
        setMonthlyDiagnosisCounts(summaries);
        setMonthlyDiagnosisCountsError('');
        setMonthlyDiagnosisCountsStatus('ready');
      } catch (error) {
        if (!active) return;
        setMonthlyDiagnosisCountsError(error.message || 'Could not load monthly aggregate summaries.');
        setMonthlyDiagnosisCountsStatus('error');
      }
    }
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') refreshMonthlyDiagnosisCounts();
    }
    refreshMonthlyDiagnosisCounts();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [diagnoses, facilityId, remote, syncStatus]);

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

  const saveMonthlyDiagnosisCounts = useCallback(async (entries, options = {}) => {
    if (!canWriteMonthlyDiagnosisCounts) {
      return { ok: false, error: 'Only facility owners, administrators, and data-entry users can save aggregate summaries.' };
    }
    if (!Array.isArray(entries) || entries.length === 0) {
      return { ok: false, error: 'Add at least one diagnosis summary before saving.' };
    }
    const batchYear = Number(entries[0]?.reportingYear);
    const batchMonth = Number(entries[0]?.reportingMonth);
    if (entries.some((entry) =>
      Number(entry.reportingYear) !== batchYear
      || Number(entry.reportingMonth) !== batchMonth
    )) {
      return {
        ok: false,
        error: 'Save aggregate summaries for one reporting month at a time.',
      };
    }
    if (remote && syncStatus !== 'ready') {
      return {
        ok: false,
        error: 'Facility access is not ready. No aggregate summaries were saved; retry after access is restored.',
      };
    }

    const seenDiagnosisIds = new Set();
    const validationErrors = [];
    entries.forEach((entry) => {
      const validation = validateMonthlyDiagnosisCount(entry, {
        diagnoses,
      });
      if (!validation.valid) {
        validationErrors.push({
          diagnosis: entry.diagnosisName || entry.diagnosisId,
          errors: validation.errors,
        });
      }
      if (seenDiagnosisIds.has(entry.diagnosisId)) {
        validationErrors.push({
          diagnosis: entry.diagnosisName || entry.diagnosisId,
          errors: { diagnosisId: 'This diagnosis is duplicated in the pending batch.' },
        });
      }
      seenDiagnosisIds.add(entry.diagnosisId);
    });
    if (validationErrors.length > 0) {
      return {
        ok: false,
        error: `${validationErrors.length} aggregate entr${validationErrors.length === 1 ? 'y needs' : 'ies need'} correction.`,
        validationErrors,
      };
    }

    if (!remote) {
      const savedRecords = entries.map((entry) => {
        const savedAt = new Date().toISOString();
        return {
          ...entry,
          facilityId: '',
          createdAt: entry.createdAt || savedAt,
          updatedAt: savedAt,
        };
      });
      setMonthlyDiagnosisCounts((current) => {
        const next = [...current];
        savedRecords.forEach((saved) => {
          const index = next.findIndex((item) => item.id === saved.id);
          if (index < 0) next.push(saved);
          else next[index] = saved;
        });
        return next;
      });
      return { ok: true, savedRecords, errors: [], uncertainDiagnosisIds: [] };
    }

    try {
      const result = await saveFacilityMonthlyDiagnosisCounts(
        facilityId,
        entries,
        diagnoses,
        options
      );
      if (result.savedRecords.length > 0) {
        setMonthlyDiagnosisCounts((current) => {
          const next = [...current];
          result.savedRecords.forEach((saved) => {
            const index = next.findIndex((item) =>
              item.facilityId === saved.facilityId
              && item.reportingYear === saved.reportingYear
              && item.reportingMonth === saved.reportingMonth
              && item.diagnosisId === saved.diagnosisId
            );
            if (index < 0) next.push(saved);
            else next[index] = saved;
          });
          return next;
        });
        setMonthlyDiagnosisCountsError('');
        setMonthlyDiagnosisCountsStatus('ready');
      }
      if (result.errors.length > 0) {
        setMonthlyDiagnosisCountsError(result.errors.map((item) => item.message).join(' '));
        try {
          const latest = await loadFacilityMonthlyDiagnosisCounts(facilityId, diagnoses);
          setMonthlyDiagnosisCounts(latest);
        } catch (refreshError) {
          setMonthlyDiagnosisCountsError(
            `${result.errors.map((item) => item.message).join(' ')} Could not refresh saved summaries: ${refreshError.message}`
          );
        }
      }
      return { ok: true, ...result };
    } catch (error) {
      setMonthlyDiagnosisCountsError(error.message || 'Could not save monthly aggregate summaries.');
      return { ok: false, error: error.message || 'Could not save monthly aggregate summaries.' };
    }
  }, [
    canWriteMonthlyDiagnosisCounts,
    diagnoses,
    facilityId,
    remote,
    settings.reportingYear,
    syncStatus,
  ]);

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

  const addRecords = useCallback(async (inputs, options = {}) => {
    if (!canWriteEncounters) {
      return { ok: false, error: 'You do not have permission to add facility encounters.' };
    }
    if (remote && syncStatus !== 'ready') {
      return reportSyncError(new Error('Cloud data is not loaded. No encounters were saved; retry after connection is restored.'));
    }
    const batch = inputs.map((input) => enrichEncounter(input));
    if (!remote) {
      setRecords((prev) => [...batch, ...prev]);
      return { ok: true, savedRecords: batch, errors: [], uncertainIds: [] };
    }

    try {
      const result = await insertEncounters(facilityId, batch, options);
      if (result.savedRecords.length > 0) {
        setRecords((prev) => [
          ...result.savedRecords.filter((saved) => !prev.some((record) => record.id === saved.id)),
          ...prev,
        ]);
        setSyncError('');
        try {
          await refreshFacilityData();
        } catch (refreshError) {
          result.refreshError = refreshError.message;
          setSyncError(`Encounters saved, but the refreshed facility data could not be loaded: ${refreshError.message}`);
        }
      }
      if (result.errors.length > 0) {
        setSyncError(result.errors.map((item) => item.message).join(' '));
      }
      return { ok: true, ...result };
    } catch (error) {
      return reportSyncError(error);
    }
  }, [canWriteEncounters, facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

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
    if (!remote) return { ok: false, error: 'Legacy import requires a signed-in facility.' };
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

  const clearMonthlyDiagnosisCounts = useCallback(async (reportingYear, reportingMonth) => {
    if (!canManageFacility) {
      return { ok: false, error: 'Only facility owners and administrators can clear aggregate summaries.' };
    }
    if (!Number.isInteger(Number(reportingYear)) || Number(reportingYear) < 1 || Number(reportingYear) > 9999
        || !Number.isInteger(Number(reportingMonth)) || Number(reportingMonth) < 1 || Number(reportingMonth) > 12) {
      return { ok: false, error: 'Select a valid reporting year and month before clearing aggregate summaries.' };
    }
    try {
      if (remote) {
        await deleteFacilityMonthlyDiagnosisCounts(facilityId, reportingYear, reportingMonth);
      }
      setMonthlyDiagnosisCounts((current) => current.filter((item) =>
        Number(item.reportingYear) !== Number(reportingYear)
        || Number(item.reportingMonth) !== Number(reportingMonth)
      ));
      setMonthlyDiagnosisCountsError('');
      setMonthlyDiagnosisCountsStatus('ready');
      return { ok: true };
    } catch (error) {
      const message = error.message || 'Could not clear aggregate summaries for this reporting period.';
      setMonthlyDiagnosisCountsError(message);
      return { ok: false, error: message };
    }
  }, [canManageFacility, facilityId, remote]);

  const demoLoaded = hasDemoRecords;

  const value = useMemo(
    () => ({
      records,
      diagnoses,
      monthlyDiagnosisCounts,
      monthlyDiagnosisCountsStatus,
      monthlyDiagnosisCountsError,
      settings,
      demoLoaded,
      settingsSyncStatus,
      isCloud: remote,
      facilityId,
      role,
      canManageFacility,
      canWriteEncounters,
      canWriteMonthlyDiagnosisCounts,
      hasDemoRecords,
      syncStatus,
      syncError,
      addRecord,
      addRecords,
      saveMonthlyDiagnosisCounts,
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
      clearMonthlyDiagnosisCounts,
      generateMonthlyReport: (year, month) => generateMonthlyReport(records, year, month, monthlyDiagnosisCounts, diagnoses),
      generateYearlyReport: (year) => generateYearlyReport(records, year, monthlyDiagnosisCounts, diagnoses),
      generateDashboardStats: (year, month) => generateDashboardStats(records, year, month, monthlyDiagnosisCounts, diagnoses),
    }),
    [
      records,
      diagnoses,
      monthlyDiagnosisCounts,
      monthlyDiagnosisCountsStatus,
      monthlyDiagnosisCountsError,
      settings,
      demoLoaded,
      settingsSyncStatus,
      remote,
      facilityId,
      role,
      canManageFacility,
      canWriteEncounters,
      canWriteMonthlyDiagnosisCounts,
      hasDemoRecords,
      syncStatus,
      syncError,
      addRecord,
      addRecords,
      saveMonthlyDiagnosisCounts,
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
      clearMonthlyDiagnosisCounts,
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
