import React, { useMemo, useState } from 'react';
import { AgeGroupSummaryTable, DiagnosisBreakdown } from '../components/common/ReportTables';
import { MONTH_NAMES } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import { exportMonthlyReportExcel, exportMonthlyReportPdf, printMonthlyReport } from '../services/export';

export default function MonthlyReport() {
  const { settings, generateMonthlyReport } = useAdultOpd();
  const now = new Date();
  const [year, setYear] = useState(Number(settings.reportingYear) || now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exportError, setExportError] = useState('');
  const report = useMemo(() => generateMonthlyReport(year, month), [generateMonthlyReport, year, month]);

  async function handleExcel() {
    try {
      setExportError('');
      await exportMonthlyReportExcel(report, settings);
    } catch (error) {
      setExportError(error.message || 'Excel export is unavailable until the export library is installed.');
    }
  }

  async function handlePdf() {
    try {
      setExportError('');
      await exportMonthlyReportPdf(report, settings);
    } catch (error) {
      setExportError(error.message || 'PDF export is unavailable until the export library is installed.');
    }
  }

  return (
    <div className="aopd-page">
      <div className="aopd-toolbar no-print">
        <div>
          <h2>Monthly report</h2>
          <p>Age groups: 5–14, 15–29, 30–64, and ≥65.</p>
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
          <button type="button" className="aopd-btn secondary" onClick={handleExcel}>
            Excel
          </button>
          <button type="button" className="aopd-btn secondary" onClick={handlePdf}>
            PDF
          </button>
          <button type="button" className="aopd-btn" onClick={printMonthlyReport}>
            Print
          </button>
        </div>
      </div>

      {exportError && <p className="aopd-error no-print">{exportError}</p>}
      {!report.validation.valid && (
        <div className="aopd-alert no-print">
          Calculation warning: {report.validation.warnings.join(' ')}
        </div>
      )}

      <article className="aopd-report">
        <header className="aopd-report-header">
          <h2>{settings.healthCenterName || 'Health Center Name not set'}</h2>
          <h3>ADULT OPD MONTHLY REPORT</h3>
          <p>Reporting Month: {report.month}</p>
          <p>Reporting Year: {report.year}</p>
          <p>
            {[settings.region && `Region: ${settings.region}`, settings.zone && `Zone: ${settings.zone}`, settings.woreda && `Woreda: ${settings.woreda}`]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
        </header>

        <section className="aopd-table-card">
          <h3>1. Overall summary</h3>
          <div className="aopd-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Indicator</th>
                  <th className="num">Male</th>
                  <th className="num">Female</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Adult OPD Patients</td>
                  <td className="num">{report.overall.male}</td>
                  <td className="num">{report.overall.female}</td>
                  <td className="num">{report.overall.total}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <AgeGroupSummaryTable ageGroups={report.ageGroups} overall={report.overall} />

        <section>
          <h3>3. Diagnosis report</h3>
          <p className="aopd-lede">Each diagnosis is broken down by the four Adult OPD age groups, then by sex.</p>
          {Object.keys(report.diagnoses).length === 0 && (
            <p>No Adult OPD encounters were recorded for this month.</p>
          )}
          {Object.entries(report.diagnoses).map(([name, block]) => (
            <DiagnosisBreakdown key={name} name={name} block={block} />
          ))}
        </section>

        {(settings.responsiblePersonName || settings.position) && (
          <footer className="aopd-signoff">
            {settings.responsiblePersonName && <p>Prepared by: {settings.responsiblePersonName}</p>}
            {settings.position && <p>Position: {settings.position}</p>}
          </footer>
        )}
      </article>
    </div>
  );
}
