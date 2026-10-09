import React from 'react';
import { useAdultOpd } from '../context/AdultOpdContext';

export default function Settings() {
  const { settings, updateSettings, loadDemoData, clearDemoData, clearAllRecords, hasDemoRecords } = useAdultOpd();

  function handleChange(event) {
    const { name, value } = event.target;
    updateSettings({ [name]: name === 'reportingYear' ? Number(value) : value });
  }

  return (
    <div className="aopd-page">
      <h2>Settings</h2>
      <p className="aopd-lede">
        Facility details appear on exported monthly and yearly reports. Do not hard-code a health center name in the
        application.
      </p>

      <form className="aopd-settings" onSubmit={(event) => event.preventDefault()}>
        <label>
          Health center name
          <input name="healthCenterName" value={settings.healthCenterName} onChange={handleChange} />
        </label>
        <label>
          Region
          <input name="region" value={settings.region} onChange={handleChange} />
        </label>
        <label>
          Zone
          <input name="zone" value={settings.zone} onChange={handleChange} />
        </label>
        <label>
          Woreda
          <input name="woreda" value={settings.woreda} onChange={handleChange} />
        </label>
        <label>
          Reporting year
          <input type="number" name="reportingYear" value={settings.reportingYear} onChange={handleChange} />
        </label>
        <label>
          Responsible person name
          <input name="responsiblePersonName" value={settings.responsiblePersonName} onChange={handleChange} />
        </label>
        <label>
          Position
          <input name="position" value={settings.position} onChange={handleChange} />
        </label>
      </form>

      <section className="aopd-panel">
        <h3>Demo data</h3>
        <p>
          Demo encounters are labelled <strong>DEMO DATA — NOT REAL PATIENT DATA</strong> and can be removed before
          official use.
        </p>
        <div className="aopd-actions">
          <button type="button" className="aopd-btn secondary" onClick={loadDemoData}>
            {hasDemoRecords ? 'Reload demo data' : 'Load demo data'}
          </button>
          {hasDemoRecords && (
            <button type="button" className="aopd-btn danger" onClick={clearDemoData}>
              Clear demo data
            </button>
          )}
          <button
            type="button"
            className="aopd-btn danger"
            onClick={() => {
              if (window.confirm('Delete all stored Adult OPD encounters on this device?')) {
                clearAllRecords();
              }
            }}
          >
            Clear all encounters
          </button>
        </div>
      </section>

      <section className="aopd-panel">
        <h3>Privacy and future upgrades</h3>
        <p>
          This MVP stores aggregate reporting encounters in the browser. It does not collect patient names, phone
          numbers, addresses, or national IDs. The data layer is structured so authentication, role-based access, a
          secure backend, backup, and audit logs can be added later.
        </p>
      </section>
    </div>
  );
}
