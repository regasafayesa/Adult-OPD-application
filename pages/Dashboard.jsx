import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADULT_AGE_GROUPS, MONTH_NAMES } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';

export default function Dashboard() {
  const { settings, generateDashboardStats, hasDemoRecords, loadDemoData, clearDemoData } = useAdultOpd();
  const now = new Date();
  const [year, setYear] = useState(Number(settings.reportingYear) || now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const stats = useMemo(() => generateDashboardStats(year, month), [generateDashboardStats, year, month]);
  const { monthly } = stats;
  const ageMax = Math.max(...ADULT_AGE_GROUPS.map((group) => monthly.ageGroups[group].total), 1);
  const diagnosisMax = Math.max(...stats.diagnosisBars.map((item) => item.total), 1);
  const trendMax = Math.max(...stats.trend.map((item) => item.total), 1);
  const sexTotal = monthly.overall.male + monthly.overall.female || 1;

  return (
    <div className="aopd-page">
      <div className="aopd-toolbar">
        <div>
          <h2>Dashboard</h2>
          <p>Live totals calculated from stored patient encounters.</p>
        </div>
        <div className="aopd-filters">
          <label>
            Year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <label>
            Month
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Link className="aopd-btn" to="/adult-opd/entry">
            New encounter
          </Link>
        </div>
      </div>

      <div className="aopd-card-grid">
        <StatCard label="Adult OPD patients" value={monthly.overall.total} />
        <StatCard label="Male" value={monthly.overall.male} />
        <StatCard label="Female" value={monthly.overall.female} />
        {ADULT_AGE_GROUPS.map((group) => (
          <StatCard key={group} label={group} value={monthly.ageGroups[group].total} />
        ))}
      </div>

      <div className="aopd-grid-2">
        <section className="aopd-panel">
          <h3>Patients by age group</h3>
          {ADULT_AGE_GROUPS.map((group) => (
            <BarRow key={group} label={group} value={monthly.ageGroups[group].total} max={ageMax} />
          ))}
        </section>
        <section className="aopd-panel">
          <h3>Male vs Female</h3>
          <div className="aopd-stacked">
            <span className="male" style={{ width: `${(monthly.overall.male / sexTotal) * 100}%` }}>
              M {monthly.overall.male}
            </span>
            <span className="female" style={{ width: `${(monthly.overall.female / sexTotal) * 100}%` }}>
              F {monthly.overall.female}
            </span>
          </div>
        </section>
        <section className="aopd-panel">
          <h3>Patients by diagnosis</h3>
          {stats.diagnosisBars.length === 0 && <p>No Adult OPD diagnoses this month.</p>}
          {stats.diagnosisBars.slice(0, 8).map((item) => (
            <BarRow key={item.name} label={item.name} value={item.total} max={diagnosisMax} />
          ))}
        </section>
        <section className="aopd-panel">
          <h3>Monthly Adult OPD trend ({year})</h3>
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
