import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS } from '../constants';
import { enrichEncounter, createId, readLegacyLocalData } from '../services/storage';
import { buildDemoRecords } from '../services/demoData';
import { getErrorMessage, isNetworkError } from '../services/networkErrors.mjs';
import { generateDashboardStats, generateMonthlyReport, generateYearlyReport } from '../services/reporting';
import { currentEthiopianReportingPeriod } from '../utils/ethiopianCalendar';
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
  const [aggregateCalendarReady, setAggregateCalendarReady] = useState(!remote);
  const [monthlyDiagnosisCountsError, setMonthlyDiagnosisCountsError] = useState('');
  const [settings, setSettingsState] = useState(() => ({ ...DEFAULT_SETTINGS, ...initialSettings }));
  const [syncStatus, setSyncStatus] = useState(remote ? 'loading' : 'ready');
  const [syncError, setSyncError] = useState('');
  const [settingsSyncStatus, setSettingsSyncStatus] = useState('idle');
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }
    function handleOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(typeof navigator === 'undefined' || navigator.onLine !== false);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!remote) return undefined;
    let active = true;

    async function refreshRemoteData() {
      try {
        const data = await loadFacilityData(facilityId);
        if (!active) return;
        setIsOnline(true);
        setRecords(data.records);
        setDiagnoses(data.diagnoses);
        setSyncError('');
        setSyncStatus('ready');
      } catch (error) {
        if (!active) return;
        if (isNetworkError(error)) setIsOnline(false);
        setSyncError(getErrorMessage(error, 'Could not sync facility data.'));
        setSyncStatus('error');
      }
    }

    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') refreshRemoteData();
    }

    refreshRemoteData();
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', refreshRemoteData);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', refreshRemoteData);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [facilityId, remote]);

  useEffect(() => {
    if (!remote) {
      setMonthlyDiagnosisCounts([]);
      setMonthlyDiagnosisCountsStatus('ready');
      setMonthlyDiagnosisCountsError('');
      setAggregateCalendarReady(true);
      return undefined;
    }
    if (syncStatus === 'loading') {
      setMonthlyDiagnosisCountsStatus('loading');
      return undefined;
    }
    if (syncStatus !== 'ready') {
      setMonthlyDiagnosisCountsStatus('error');
      return undefined;
    }

    let active = true;
    async function refreshMonthlyDiagnosisCounts() {
      setMonthlyDiagnosisCountsStatus('loading');
      try {
        const summaries = await loadFacilityMonthlyDiagnosisCounts(facilityId, diagnoses);
        if (!active) return;
        setIsOnline(true);
        setMonthlyDiagnosisCounts(summaries);
        setAggregateCalendarReady(summaries.ethiopianCalendarSupported !== false);
        setMonthlyDiagnosisCountsError('');
        setMonthlyDiagnosisCountsStatus('ready');
      } catch (error) {
        if (!active) return;
        if (isNetworkError(error)) {
          setIsOnline(false);
          setMonthlyDiagnosisCountsError('Registration-book counts could not be loaded because the connection failed. Report totals do not include them until the connection succeeds.');
          setMonthlyDiagnosisCountsStatus('error');
          return;
        }
        setMonthlyDiagnosisCountsError(getErrorMessage(error, 'Could not load monthly aggregate summaries.'));
        setMonthlyDiagnosisCountsStatus('error');
      }
    }
    function refreshWhenVisible() {
      if (document.visibilityState === 'visible') refreshMonthlyDiagnosisCounts();
    }
    refreshMonthlyDiagnosisCounts();
    window.addEventListener('focus', refreshWhenVisible);
    window.addEventListener('online', refreshMonthlyDiagnosisCounts);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshWhenVisible);
      window.removeEventListener('online', refreshMonthlyDiagnosisCounts);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [diagnoses, facilityId, remote, syncStatus]);

  const reportSyncError = useCallback((error) => {
    const message = getErrorMessage(error, 'Could not sync facility data.');
    setSyncError(message);
    return { ok: false, error: message };
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
    if (remote && !aggregateCalendarReady) {
      return {
        ok: false,
        error: 'Ethiopian aggregate months cannot be saved until supabase/migrations/20261115_ethiopian_reporting_calendar.sql is applied. Existing summaries were not changed.',
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
              && (item.reportingCalendar === 'gregorian' ? 'gregorian' : 'ethiopian')
                === (saved.reportingCalendar === 'gregorian' ? 'gregorian' : 'ethiopian')
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
          setAggregateCalendarReady(latest.ethiopianCalendarSupported !== false);
        } catch (refreshError) {
          setMonthlyDiagnosisCountsError(
            `${result.errors.map((item) => item.message).join(' ')} Could not refresh saved summaries: ${refreshError.message}`
          );
        }
      }
      return { ok: true, ...result };
    } catch (error) {
      const message = getErrorMessage(error, 'Could not save monthly aggregate summaries.');
      setMonthlyDiagnosisCountsError(message);
      return { ok: false, error: message };
    }
  }, [
    aggregateCalendarReady,
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

  const deleteRecord = useCallback(async (id, password) => {
    if (remote) {
      if (syncStatus !== 'ready') {
        return reportSyncError(new Error('Cloud data is not loaded. No encounter was deleted; retry after connection is restored.'));
      }
      try {
        await deleteEncounter(facilityId, id, password);
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

  const deleteRecords = useCallback(async (ids, password) => {
    if (!canManageFacility) {
      return { ok: false, error: 'Only facility owners and administrators can delete encounters.' };
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      return { ok: false, error: 'Select at least one encounter to delete.' };
    }
    if (remote && syncStatus !== 'ready') {
      return reportSyncError(new Error('Cloud data is not loaded. No encounters were deleted; retry after connection is restored.'));
    }

    const deletedIds = [];
    if (remote) {
      for (const id of uniqueIds) {
        try {
          await deleteEncounter(facilityId, id, password);
          deletedIds.push(id);
        } catch (error) {
          if (deletedIds.length === 0) return reportSyncError(error);

          setRecords((prev) => prev.filter((record) => !deletedIds.includes(record.id)));
          let refreshError;
          try {
            await refreshFacilityData();
          } catch (errorWhileRefreshing) {
            refreshError = errorWhileRefreshing;
          }
          const message = `Deleted ${deletedIds.length} of ${uniqueIds.length} selected encounters. ${getErrorMessage(error, 'Could not delete the remaining encounters.')}${refreshError
            ? ` Facility records could not be refreshed: ${getErrorMessage(refreshError, 'Refresh failed.')}`
            : ''}`;
          setSyncError(message);
          return { ok: false, error: message, deletedIds };
        }
      }
      setSyncError('');
    }

    setRecords((prev) => prev.filter((record) => !uniqueIds.includes(record.id)));
    if (remote) {
      try {
        await refreshFacilityData();
      } catch (refreshError) {
        setSyncError(`Selected encounters were deleted, but the refreshed facility data could not be loaded: ${getErrorMessage(refreshError, 'Refresh failed.')}`);
        return { ok: true, deletedIds: uniqueIds, refreshError: getErrorMessage(refreshError, 'Refresh failed.') };
      }
    }
    return { ok: true, deletedIds: uniqueIds };
  }, [canManageFacility, facilityId, refreshFacilityData, remote, reportSyncError, syncStatus]);

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
      setSyncError(getErrorMessage(error, 'Could not save facility settings.'));
      setSettingsSyncStatus('error');
      return { ok: false, error: getErrorMessage(error, 'Could not save facility settings.') };
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

  const loadDemoData = useCallback(async (deletePassword) => {
    const period = currentEthiopianReportingPeriod();
    const demoRecords = buildDemoRecords(period.year, period.month);
    if (remote) {
      try {
        if (hasDemoRecords) {
          await deleteFacilityEncounters(facilityId, true, deletePassword);
        }
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
  }, [facilityId, hasDemoRecords, refreshFacilityData, remote, reportSyncError, syncStatus]);

  const clearDemoData = useCallback(async (deletePassword) => {
    if (remote) {
      try {
        await deleteFacilityEncounters(facilityId, true, deletePassword);
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

  const clearAllRecords = useCallback(async (deletePassword) => {
    if (remote) {
      try {
        await deleteFacilityEncounters(facilityId, false, deletePassword);
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
        await deleteFacilityMonthlyDiagnosisCounts(
          facilityId,
          reportingYear,
          reportingMonth,
          aggregateCalendarReady ? 'ethiopian' : undefined
        );
      }
      setMonthlyDiagnosisCounts((current) => current.filter((item) =>
        item.reportingCalendar === 'gregorian'
        || Number(item.reportingYear) !== Number(reportingYear)
        || Number(item.reportingMonth) !== Number(reportingMonth)
      ));
      setMonthlyDiagnosisCountsError('');
      setMonthlyDiagnosisCountsStatus('ready');
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage(error, 'Could not clear aggregate summaries for this reporting period.');
      setMonthlyDiagnosisCountsError(message);
      return { ok: false, error: message };
    }
  }, [aggregateCalendarReady, canManageFacility, facilityId, remote]);

  const demoLoaded = hasDemoRecords;

  const value = useMemo(
    () => ({
      records,
      diagnoses,
      monthlyDiagnosisCounts,
      monthlyDiagnosisCountsStatus,
      monthlyDiagnosisCountsError,
      aggregateCalendarReady,
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
      isOnline,
      addRecord,
      addRecords,
      saveMonthlyDiagnosisCounts,
      updateRecord,
      deleteRecord,
      deleteRecords,
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
      aggregateCalendarReady,
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
      isOnline,
      addRecord,
      addRecords,
      saveMonthlyDiagnosisCounts,
      updateRecord,
      deleteRecord,
      deleteRecords,
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
