import React, { useEffect, useState } from 'react';
import { useAdultOpd } from '../context/AdultOpdContext';
import { readLegacyLocalData } from '../services/storage';

export default function Settings() {
  const {
    settings,
    updateSettings,
    saveSettings,
    loadDemoData,
    clearDemoData,
    clearAllRecords,
    hasDemoRecords,
    isCloud,
    settingsSyncStatus,
    migrateLegacyData,
  } = useAdultOpd();
  const [legacyData, setLegacyData] = useState(null);
  const [legacyError, setLegacyError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [recordActionBusy, setRecordActionBusy] = useState(false);
  const [recordActionMessage, setRecordActionMessage] = useState('');
  const [recordActionIsError, setRecordActionIsError] = useState(false);

  useEffect(() => {
    try {
      setLegacyData(readLegacyLocalData());
    } catch (error) {
      setLegacyError(error.message || 'Could not inspect existing browser data.');
    }
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;
    updateSettings({ [name]: name === 'reportingYear' ? Number(value) : value });
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    await saveSettings();
  }

  async function handleImportLegacyData() {
    if (!window.confirm(
      'Copy this browser’s existing encounters, diagnoses, and blank cloud settings into the signed-in facility? Existing browser data will not be erased. Patient data will be sent to Supabase.'
    )) return;

    setImportBusy(true);
    setImportError('');
    setImportResult(null);
    const response = await migrateLegacyData();
    setImportBusy(false);
    if (!response.ok) {
      setImportError(response.error);
      return;
    }
    setImportResult(response.result);
  }

  async function handleRecordAction(action, successMessage) {
    setRecordActionBusy(true);
    setRecordActionMessage('');
    try {
      const result = await action();
      if (!result.ok) {
        setRecordActionMessage(result.error);
        setRecordActionIsError(true);
      } else {
        setRecordActionMessage(result.refreshError
          ? `${successMessage} The data was saved, but the latest facility records could not be reloaded.`
          : successMessage);
        setRecordActionIsError(Boolean(result.refreshError));
      }
    } catch (error) {
      setRecordActionMessage(error.message || 'The facility action failed.');
      setRecordActionIsError(true);
    } finally {
      setRecordActionBusy(false);
    }
  }

  const legacyItemCount = legacyData
    ? legacyData.records.length + legacyData.diagnoses.length
      + Object.values(legacyData.settings).filter((value) => String(value || '').trim()).length
    : 0;
  const importDetails = importResult
    ? [...importResult.diagnoses.details, ...importResult.records.details]
    : [];

  return (
    <div className="aopd-page">
      <h2>Settings</h2>
      <p className="aopd-lede">
        Facility details appear on exported monthly and yearly reports. Do not hard-code a health center name in the
        application.
      </p>

      <form className="aopd-settings" onSubmit={handleSaveSettings}>
        <label>
          Health center name
          <input name="healthCenterName" value={settings.healthCenterName} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <label>
          Region
          <input name="region" value={settings.region} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <label>
          Zone
          <input name="zone" value={settings.zone} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <label>
          Woreda
          <input name="woreda" value={settings.woreda} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <label>
          Reporting year
          <input type="number" name="reportingYear" value={settings.reportingYear} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <label>
          Responsible person name
          <input name="responsiblePersonName" value={settings.responsiblePersonName} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <label>
          Position
          <input name="position" value={settings.position} onChange={handleChange} disabled={settingsSyncStatus === 'saving'} />
        </label>
        <button type="submit" className="aopd-btn" disabled={settingsSyncStatus === 'saving' || settingsSyncStatus !== 'dirty' && settingsSyncStatus !== 'error'}>
          {settingsSyncStatus === 'saving' ? 'Saving…' : 'Save facility settings'}
        </button>
      </form>
      {isCloud && (
        <p className={`aopd-save-status${settingsSyncStatus === 'error' ? ' aopd-error' : ''}`} role="status">
          {settingsSyncStatus === 'saving' && 'Saving facility settings to Supabase…'}
          {settingsSyncStatus === 'saved' && 'Facility settings saved to Supabase.'}
          {settingsSyncStatus === 'error' && 'Facility settings could not be saved. Your unsaved edits are still here; correct the issue or retry.'}
        </p>
      )}

      {isCloud && (
        <section className="aopd-panel">
          <h3>Import this browser’s legacy data</h3>
          <p>
            Copies existing browser encounters and diagnoses to this facility. Exact existing IDs are counted as duplicates;
            conflicts and failures are reported. The original browser data is never deleted.
          </p>
          {legacyError && <p className="aopd-error" role="alert">{legacyError}</p>}
          {!legacyError && legacyData && (
            <p>
              Found {legacyData.records.length} encounters, {legacyData.diagnoses.length} diagnoses, and{' '}
              {Object.values(legacyData.settings).filter((value) => String(value || '').trim()).length} non-empty settings
              in this browser.
            </p>
          )}
          <button
            type="button"
            className="aopd-btn secondary"
            onClick={handleImportLegacyData}
            disabled={importBusy || Boolean(legacyError) || !legacyData || legacyItemCount === 0}
          >
            {importBusy ? 'Importing…' : 'Import browser data to Supabase'}
          </button>
          {importError && <p className="aopd-error" role="alert">{importError}</p>}
          {importResult && (
            <div className="aopd-import-result" role="status">
              <p>
                Diagnoses: {importResult.diagnoses.imported} imported, {importResult.diagnoses.duplicates} duplicates,{' '}
                {importResult.diagnoses.conflicts} conflicts, {importResult.diagnoses.failed} failed.
              </p>
              <p>
                Encounters: {importResult.records.imported} imported, {importResult.records.duplicates} duplicates,{' '}
                {importResult.records.conflicts} conflicts, {importResult.records.failed} failed.
              </p>
              <p>
                Settings filled: {importResult.settings.imported.length} fields.
                {importResult.settings.unchanged.length > 0
                  ? ` Existing cloud values were preserved for: ${importResult.settings.unchanged.join(', ')}.`
                  : ''}
              </p>
              {importResult.settings.failed && (
                <p className="aopd-error">Settings import failed: {importResult.settings.failed}</p>
              )}
              {importResult.refreshError && (
                <p className="aopd-error">Import completed, but refreshing the page data failed: {importResult.refreshError}</p>
              )}
              {importDetails.length > 0 && (
                <details>
                  <summary>{importDetails.length} import conflicts or failures</summary>
                  <ul>
                    {importDetails.slice(0, 20).map((detail) => <li key={detail}>{detail}</li>)}
                  </ul>
                  {importDetails.length > 20 && <p>Showing the first 20 details.</p>}
                </details>
              )}
            </div>
          )}
        </section>
      )}

      <section className="aopd-panel">
        <h3>Demo data</h3>
        <p>
          Demo encounters are labelled <strong>DEMO DATA — NOT REAL PATIENT DATA</strong> and can be removed before
          official use.
        </p>
        <div className="aopd-actions">
          <button
            type="button"
            className="aopd-btn secondary"
            onClick={() => handleRecordAction(loadDemoData, 'Demo encounters saved to Supabase.')}
            disabled={recordActionBusy}
          >
            {recordActionBusy ? 'Saving…' : hasDemoRecords ? 'Reload demo data' : 'Load demo data'}
          </button>
          {hasDemoRecords && (
            <button
              type="button"
              className="aopd-btn danger"
              onClick={() => handleRecordAction(clearDemoData, 'Demo encounters deleted from Supabase.')}
              disabled={recordActionBusy}
            >
              {recordActionBusy ? 'Saving…' : 'Clear demo data'}
            </button>
          )}
          <button
            type="button"
            className="aopd-btn danger"
            onClick={() => {
              if (window.confirm('Delete all Adult OPD encounters for this facility? This affects every authorized device.')) {
                handleRecordAction(clearAllRecords, 'All facility encounters deleted from Supabase.');
              }
            }}
            disabled={recordActionBusy}
          >
            {recordActionBusy ? 'Saving…' : 'Clear all encounters'}
          </button>
        </div>
        {recordActionMessage && (
          <p className={recordActionIsError ? 'aopd-error' : 'aopd-success'} role={recordActionIsError ? 'alert' : 'status'}>
            {recordActionMessage}
          </p>
        )}
      </section>

      <section className="aopd-panel">
        <h3>Privacy and future upgrades</h3>
        <p>
          Signed-in encounters and diagnoses are stored in the facility Supabase project and shared with authorized
          facility members. Facility settings are saved to Supabase. This app does not collect patient names, phone
          numbers, addresses, or national IDs; use only after your organization reviews its privacy, security, and
          backup requirements.
        </p>
      </section>
    </div>
  );
}
