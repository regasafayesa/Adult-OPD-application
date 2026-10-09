import React, { useMemo, useState } from 'react';
import { MONTH_NAMES } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import { exportYearlyReportExcel } from '../services/export';

export default function YearlyReport() {
  const { settings, generateYearlyReport } = useAdultOpd();
  const [year, setYear] = useState(Number(settings.reportingYear) || new Date().getFullYear());
  const [showTrends, setShowTrends] = useState(true);
  const [exportError, setExportError] = useState('');
  const report = useMemo(() => generateYearlyReport(year), [generateYearlyReport, year]);

  async function handleExcel() {
    try {
      setExportError('');
      await exportYearlyReportExcel(report, settings);
    } catch (error) {
      setExportError(error.message || 'Excel export is unavailable until the export library is installed.');
    }
  }

  return (
    <div className="aopd-page">
      <div className="aopd-toolbar no-print">
        <div>
          <h2>Yearly report</h2>
          <p>Age groups: 5–14, 15–29, 30–64, and ≥65.</p>
        </div>
        <div className="aopd-filters">
          <label>
            Year
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </label>
          <button type="button" className="aopd-btn secondary" onClick={handleExcel}>
            Excel
          </button>
          <button type="button" className="aopd-btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      {exportError && <p className="aopd-error no-print">{exportError}</p>}
      {!report.validation.valid && (
        <div className="aopd-alert no-print">{report.validation.warnings.join(' ')}</div>
      )}

      <article className="aopd-report">
        <header className="aopd-report-header">
          <h2>{settings.healthCenterName || 'Health Center Name not set'}</h2>
          <h3>ADULT OPD YEARLY REPORT</h3>
          <p>Reporting Year: {report.year}</p>
        </header>

        <section className="aopd-table-card">
          <h3>Monthly Adult OPD totals</h3>
          <div className="aopd-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Male</th>
                  <th className="num">Female</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.months.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}</td>
                    <td className="num">{row.male}</td>
                    <td className="num">{row.female}</td>
                    <td className="num">{row.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>YEAR TOTAL</th>
                  <th className="num">{report.yearTotal.male}</th>
                  <th className="num">{report.yearTotal.female}</th>
                  <th className="num">{report.yearTotal.total}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="aopd-table-card">
          <h3>Yearly diagnosis statistics</h3>
          <div className="aopd-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Diagnosis</th>
                  <th className="num">Male</th>
                  <th className="num">Female</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(report.diagnoses).length === 0 && (
                  <tr>
                    <td colSpan={4}>No Adult OPD diagnoses for this year.</td>
                  </tr>
                )}
                {Object.entries(report.diagnoses).map(([name, counts]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="num">{counts.male}</td>
                    <td className="num">{counts.female}</td>
                    <td className="num">{counts.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <label className="aopd-inline no-print">
          <input type="checkbox" checked={showTrends} onChange={(e) => setShowTrends(e.target.checked)} />
          Show diagnosis trends by month
        </label>

        {showTrends && Object.keys(report.diagnosisByMonth).length > 0 && (
          <section className="aopd-table-card">
            <h3>Diagnosis trends by month</h3>
            <div className="aopd-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Diagnosis</th>
                    {MONTH_NAMES.map((name) => (
                      <th key={name} className="num">
                        {name.slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.diagnosisByMonth).map(([name, months]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      {months.map((count, index) => (
                        <td key={index} className="num">
                          {count}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
