import React, { useMemo, useState } from 'react';
import { MONTH_NAMES } from '../constants';
import { useAdultOpd } from '../context/AdultOpdContext';
import TallyMarks from '../components/common/TallyMarks';
import HelpHint from '../components/common/HelpHint';
import {
  buildMonthlyIctTallyRows,
  exportMonthlyReportExcel,
  exportMonthlyReportPdf,
  ICT_TALLY_AGE_GROUPS,
  printMonthlyReport,
} from '../services/export';

export default function MonthlyReport() {
  const {
    settings,
    generateMonthlyReport,
    monthlyDiagnosisCountsStatus,
    monthlyDiagnosisCountsError,
  } = useAdultOpd();
  const now = new Date();
  const [year, setYear] = useState(Number(settings.reportingYear) || now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [exportError, setExportError] = useState('');
  const report = useMemo(() => generateMonthlyReport(year, month), [generateMonthlyReport, year, month]);
  const tallyRows = useMemo(() => buildMonthlyIctTallyRows(report), [report]);

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
          <p>ICT tally sheet by sex and age group.</p>
          <HelpHint label="Reporting period">Choose the year and month for this sheet. It combines eligible individual encounters and saved registration-book counts for this period.</HelpHint>
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
      {monthlyDiagnosisCountsStatus === 'error' && (
        <p className="aopd-error no-print" role="alert">
          The patient report is available, but registration-book counts could not load: {monthlyDiagnosisCountsError}
          {' '}Review and apply <code>supabase/migrations/20261024_monthly_diagnosis_counts.sql</code> in Supabase SQL Editor, then reload.
        </p>
      )}
      {!report.validation.valid && (
        <div className="aopd-alert no-print">
          Calculation warning: {report.validation.warnings.join(' ')}
        </div>
      )}

      <article className="aopd-report">
        <header className="aopd-report-header aopd-ict-header">
          <h2>OPD – ICT TALLY SHEET</h2>
          <h3>{settings.healthCenterName || 'Health Center Name not set'}</h3>
          <p>
            {[settings.region && `Region: ${settings.region}`, settings.zone && `Zone: ${settings.zone}`, settings.woreda && `Woreda: ${settings.woreda}`]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
          <div className="aopd-ict-period">
            <span>Year: {report.year}</span>
            <span>Month: {report.month.toUpperCase()}</span>
            <span>Reporting period: {report.month.toUpperCase()} {report.year}</span>
          </div>
        </header>

        <section className="aopd-ict-table-wrap" aria-label="Monthly ICT tally">
          <table className="aopd-ict-table">
            <colgroup>
              <col className="aopd-ict-diagnosis-column" />
              {Array.from({ length: ICT_TALLY_AGE_GROUPS.length * 2 }, (_, index) => (
                <React.Fragment key={index}>
                  <col className="aopd-ict-tally-column" />
                  <col className="aopd-ict-count-column" />
                </React.Fragment>
              ))}
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={3} className="aopd-ict-diagnosis">
                  DIAGNOSIS
                  <br />
                  Code / Name
                </th>
                <th colSpan={ICT_TALLY_AGE_GROUPS.length * 2}>MALE</th>
                <th colSpan={ICT_TALLY_AGE_GROUPS.length * 2}>FEMALE</th>
              </tr>
              <tr>
                {[...ICT_TALLY_AGE_GROUPS, ...ICT_TALLY_AGE_GROUPS].map(({ label }, index) => (
                  <th key={`${index}-${label}`} colSpan={2}>
                    {label}
                  </th>
                ))}
              </tr>
              <tr>
                {Array.from({ length: ICT_TALLY_AGE_GROUPS.length * 2 }, (_, groupIndex) => (
                  <React.Fragment key={groupIndex}>
                    <th>Tally</th>
                    <th>Count</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {tallyRows.map(({ code, name, counts, hasAggregate }) => (
                <tr key={`${code}-${name}`}>
                  <td
                    className="aopd-ict-diagnosis"
                    title={hasAggregate
                      ? 'This row includes monthly registration-book aggregate counts.'
                      : undefined}
                  >
                    {code ? (
                      <>
                        <strong>{code}</strong>
                        <br />
                        {name}{hasAggregate && <sup aria-label="Includes aggregate counts">*</sup>}
                      </>
                    ) : <>{name}{hasAggregate && <sup aria-label="Includes aggregate counts">*</sup>}</>}
                  </td>
                  {counts.map(({ male }, index) => (
                    <React.Fragment key={index}>
                      <td className="aopd-ict-tally"><TallyMarks count={male} /></td>
                      <td className="aopd-ict-count">{male || ''}</td>
                    </React.Fragment>
                  ))}
                  {counts.map(({ female }, index) => (
                    <React.Fragment key={`female-${index}`}>
                      <td className="aopd-ict-tally"><TallyMarks count={female} /></td>
                      <td className="aopd-ict-count">{female || ''}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
              {tallyRows.length === 0 && (
                <tr>
                  <td colSpan={1 + ICT_TALLY_AGE_GROUPS.length * 4}>
                    No OPD diagnoses were recorded for this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {tallyRows.some((row) => row.hasAggregate) && (
            <p className="aopd-aggregate-source-note">
              * Includes registration-book aggregate counts combined with individual encounters.
            </p>
          )}
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
