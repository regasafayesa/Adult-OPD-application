import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdultOpd } from '../context/AdultOpdContext';
import {
  currentEthiopianReportingPeriod,
  ETHIOPIAN_REPORTING_MONTH_NAMES,
} from '../utils/ethiopianCalendar';
import './Dashboard.css';

export default function Dashboard() {
  const {
    generateDashboardStats,
    hasDemoRecords,
    loadDemoData,
    clearDemoData,
    canManageFacility,
    canWriteEncounters,
    monthlyDiagnosisCountsStatus,
    monthlyDiagnosisCountsError,
    syncStatus,
    syncError,
    isOnline,
  } = useAdultOpd();
  const initialPeriod = currentEthiopianReportingPeriod();
  const [year, setYear] = useState(initialPeriod.year);
  const [month, setMonth] = useState(initialPeriod.month);
  const totalsReady = syncStatus === 'ready' && monthlyDiagnosisCountsStatus !== 'loading';
  const stats = useMemo(() => generateDashboardStats(year, month), [generateDashboardStats, year, month]);
  const { monthly } = stats;
  const ageMax = Math.max(...Object.values(monthly.combined.ageGroups).map((group) => group.total), 1);
  const diagnosisMax = Math.max(...stats.diagnosisBars.map((item) => item.total), 1);
  const trendMax = Math.max(...stats.trend.map((item) => item.total), 1);
  const sexTotal = monthly.combined.overall.male + monthly.combined.overall.female || 1;

  return (
    <div className="aopd-page aopd-dashboard">
      <div className="aopd-toolbar">
        <div>
          <h2>Dashboard</h2>
          <p>Ethiopian monthly totals combine individual encounters with registration-book summaries.</p>
          <p>Reporting dates: {monthly.periodRange?.label || '—'}</p>
        </div>
        <div className="aopd-filters">
          <label>
            Ethiopian year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label>
            Ethiopian month
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {ETHIOPIAN_REPORTING_MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {canWriteEncounters && (
            <Link className="aopd-btn" to="/adult-opd/entry">
              New encounter
            </Link>
          )}
        </div>
      </div>

      {(syncStatus === 'loading' || monthlyDiagnosisCountsStatus === 'loading') && (
        <p className="aopd-alert" role="status">Loading facility records. Totals are not final yet.</p>
      )}
      {isOnline && syncStatus === 'error' && (
        <p className="aopd-alert" role="alert">{syncError || 'Facility records could not be loaded. Totals are not shown as zero.'}</p>
      )}
      <div className="aopd-card-grid">
        <StatCard label="Total cases" value={totalsReady ? monthly.combined.overall.total : '…'} />
        <StatCard label="Male cases" value={totalsReady ? monthly.combined.overall.male : '…'} />
        <StatCard label="Female cases" value={totalsReady ? monthly.combined.overall.female : '…'} />
        {Object.entries(monthly.combined.ageGroups).map(([key, group]) => (
          <StatCard key={key} label={group.label} value={totalsReady ? group.total : '…'} />
        ))}
      </div>
      {totalsReady && monthly.combined.overall.total === 0 && (
        <p>No individual encounters or Ethiopian registration-book counts in this month.</p>
      )}
      {isOnline && monthlyDiagnosisCountsStatus === 'error' && (
        <p className="aopd-alert" role="alert">
          Dashboard totals include individual encounters only because aggregate counts could not load:
          {' '}{monthlyDiagnosisCountsError} Review and apply
          {' '}<code>supabase/migrations/20261024_monthly_diagnosis_counts.sql</code> in Supabase SQL Editor.
        </p>
      )}

      <div className="aopd-grid-2">
        {canManageFacility && <section className="aopd-panel">
          <h3>Cases by age group</h3>
          {Object.entries(monthly.combined.ageGroups).map(([key, group]) => (
            <BarRow key={key} label={group.label} value={group.total} max={ageMax} />
          ))}
        </section>}
        <section className="aopd-panel">
          <h3>Male vs Female cases</h3>
          <div className="aopd-stacked">
            <span className="male" style={{ width: `${(monthly.combined.overall.male / sexTotal) * 100}%` }}>
              M {totalsReady ? monthly.combined.overall.male : '…'}
            </span>
            <span className="female" style={{ width: `${(monthly.combined.overall.female / sexTotal) * 100}%` }}>
              F {totalsReady ? monthly.combined.overall.female : '…'}
            </span>
          </div>
        </section>
        <section className="aopd-panel">
          <h3>Cases by diagnosis</h3>
          {!totalsReady && <p>Loading diagnosis totals…</p>}
          {totalsReady && stats.diagnosisBars.length === 0 && <p>No diagnoses this Ethiopian month.</p>}
          {stats.diagnosisBars.slice(0, 8).map((item) => (
            <BarRow key={item.name} label={item.name} value={item.total} max={diagnosisMax} />
          ))}
        </section>
        <section className="aopd-panel">
          <h3>Monthly OPD trend ({year})</h3>
          <div className="aopd-trend">
            {stats.trend.map((item) => (
              <div key={item.month} className="aopd-trend-col">
                <div
                  className="aopd-trend-bar"
                  style={{ height: `${(item.total / trendMax) * 140}px` }}
                  title={`${item.month}: ${item.total}`}
                />
                <span>{item.month}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="aopd-panel">
        <h3>Demo data</h3>
        <div className="aopd-actions">
          {!hasDemoRecords ? (
            <button type="button" className="aopd-btn secondary" onClick={loadDemoData}>
              Load labelled demo data
            </button>
          ) : (
            <button type="button" className="aopd-btn danger" onClick={clearDemoData}>
              Clear demo data
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <article className={`aopd-stat ${tone || ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function BarRow({ label, value, max }) {
  return (
    <div className="aopd-bar-row">
      <span>{label}</span>
      <div className="aopd-bar-track">
        <div className="aopd-bar-fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}
