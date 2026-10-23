import React from 'react';
import { ADULT_AGE_GROUPS } from '../../constants';

export function SexCountTable({ title, rows, totalLabel = 'TOTAL', total }) {
  return (
    <section className="aopd-table-card">
      {title && <h3>{title}</h3>}
      <div className="aopd-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{rows[0]?.labelHeader || 'Age Group'}</th>
              <th className="num">Male</th>
              <th className="num">Female</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td className="num">{row.male}</td>
                <td className="num">{row.female}</td>
                <td className="num">{row.total}</td>
              </tr>
            ))}
          </tbody>
          {total && (
            <tfoot>
              <tr>
                <th>{totalLabel}</th>
                <th className="num">{total.male}</th>
                <th className="num">{total.female}</th>
                <th className="num">{total.total}</th>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

export function AgeGroupSummaryTable({ ageGroups, overall, title = '2. Age-group summary' }) {
  return (
    <SexCountTable
      title={title}
      rows={ADULT_AGE_GROUPS.map((group) => ({
        label: group,
        ...ageGroups[group],
      }))}
      total={overall}
    />
  );
}

export function DiagnosisBreakdown({ name, block }) {
  return (
    <SexCountTable
      title={name}
      rows={ADULT_AGE_GROUPS.map((group) => ({
        label: group,
        ...block[group],
      }))}
      totalLabel={`${name.toUpperCase()} TOTAL`}
      total={block.total}
    />
  );
}

export function StatusBadge({ record }) {
  if (record.includedInAdultReport) {
    return <span className="aopd-badge aopd-badge-adult">OPD</span>;
  }
  return <span className="aopd-badge aopd-badge-outside">Outside OPD</span>;
}
