import { ADULT_AGE_GROUPS } from '../constants';

function facilityLines(settings) {
  return [
    settings.healthCenterName || 'Health Center Name not set',
    settings.region ? `Region: ${settings.region}` : null,
    settings.zone ? `Zone: ${settings.zone}` : null,
    settings.woreda ? `Woreda: ${settings.woreda}` : null,
  ].filter(Boolean);
}

function preparedBy(settings) {
  const lines = [];
  if (settings.responsiblePersonName) lines.push(`Prepared by: ${settings.responsiblePersonName}`);
  if (settings.position) lines.push(`Position: ${settings.position}`);
  return lines;
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function cell(value) {
  return `<td>${value ?? 0}</td>`;
}

function monthlyHtml(report, settings) {
  const diagnosisSections = Object.entries(report.diagnoses)
    .map(([name, block]) => {
      const rows = ADULT_AGE_GROUPS.map(
        (group) =>
          `<tr><td>${group}</td>${cell(block[group].male)}${cell(block[group].female)}${cell(block[group].total)}</tr>`
      ).join('');
      return `
        <h3>DIAGNOSIS: ${name}</h3>
        <table border="1" cellspacing="0" cellpadding="6">
          <tr><th>Age Group</th><th>Male</th><th>Female</th><th>Total</th></tr>
          ${rows}
          <tr><th>${name.toUpperCase()} TOTAL</th><th>${block.total.male}</th><th>${block.total.female}</th><th>${block.total.total}</th></tr>
        </table>
      `;
    })
    .join('');

  const ageRows = ADULT_AGE_GROUPS.map(
    (group) =>
      `<tr><td>${group}</td>${cell(report.ageGroups[group].male)}${cell(report.ageGroups[group].female)}${cell(report.ageGroups[group].total)}</tr>`
  ).join('');

  return `
    <html><head><meta charset="utf-8" /></head><body>
      ${facilityLines(settings).map((line) => `<p><strong>${line}</strong></p>`).join('')}
      <h1>ADULT OPD MONTHLY REPORT</h1>
      <p>Reporting Month: ${report.month}</p>
      <p>Reporting Year: ${report.year}</p>
      <h2>1. Overall Summary</h2>
      <table border="1" cellspacing="0" cellpadding="6">
        <tr><th>Indicator</th><th>Male</th><th>Female</th><th>Total</th></tr>
        <tr><td>Adult OPD Patients</td>${cell(report.overall.male)}${cell(report.overall.female)}${cell(report.overall.total)}</tr>
      </table>
      <h2>2. Age Group Summary</h2>
      <table border="1" cellspacing="0" cellpadding="6">
        <tr><th>Age Group</th><th>Male</th><th>Female</th><th>Total</th></tr>
        ${ageRows}
        <tr><th>TOTAL</th><th>${report.overall.male}</th><th>${report.overall.female}</th><th>${report.overall.total}</th></tr>
      </table>
      <h2>3. Diagnosis Report</h2>
      ${diagnosisSections || '<p>No Adult OPD diagnoses for this month.</p>'}
      ${preparedBy(settings).map((line) => `<p>${line}</p>`).join('')}
    </body></html>
  `;
}

export function printMonthlyReport() {
  window.print();
}

export async function exportMonthlyReportExcel(report, settings) {
  try {
    const XLSX = await import('xlsx');
    const rows = [];
    rows.push([settings.healthCenterName || 'Health Center Name not set']);
    rows.push(['ADULT OPD MONTHLY REPORT']);
    rows.push([`Reporting Month: ${report.month}`]);
    rows.push([`Reporting Year: ${report.year}`]);
    if (settings.region) rows.push([`Region: ${settings.region}`]);
    if (settings.zone) rows.push([`Zone: ${settings.zone}`]);
    if (settings.woreda) rows.push([`Woreda: ${settings.woreda}`]);
    rows.push([]);
    rows.push(['1. OVERALL SUMMARY']);
    rows.push(['Indicator', 'Male', 'Female', 'Total']);
    rows.push(['Adult OPD Patients', report.overall.male, report.overall.female, report.overall.total]);
    rows.push([]);
    rows.push(['2. AGE GROUP SUMMARY']);
    rows.push(['Age Group', 'Male', 'Female', 'Total']);
    ADULT_AGE_GROUPS.forEach((group) => {
      const row = report.ageGroups[group];
      rows.push([group, row.male, row.female, row.total]);
    });
    rows.push(['TOTAL', report.overall.male, report.overall.female, report.overall.total]);
    rows.push([]);
    rows.push(['3. DIAGNOSIS REPORT']);
    Object.entries(report.diagnoses).forEach(([name, block]) => {
      rows.push([`DIAGNOSIS: ${name}`]);
      rows.push(['Age Group', 'Male', 'Female', 'Total']);
      ADULT_AGE_GROUPS.forEach((group) => {
        const row = block[group];
        rows.push([group, row.male, row.female, row.total]);
      });
      rows.push([`${name.toUpperCase()} TOTAL`, block.total.male, block.total.female, block.total.total]);
      rows.push([]);
    });
    preparedBy(settings).forEach((line) => rows.push([line]));
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Adult OPD Monthly');
    XLSX.writeFile(workbook, `Adult-OPD-Monthly-${report.month}-${report.year}.xlsx`);
  } catch {
    downloadBlob(
      `Adult-OPD-Monthly-${report.month}-${report.year}.xls`,
      'application/vnd.ms-excel',
      monthlyHtml(report, settings)
    );
  }
}

export async function exportMonthlyReportPdf(report, settings) {
  try {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48;
    let y = 48;
    const titleLines = [
      ...facilityLines(settings),
      'ADULT OPD MONTHLY REPORT',
      `Reporting Month: ${report.month}`,
      `Reporting Year: ${report.year}`,
    ];
    titleLines.forEach((line, index) => {
      doc.setFont('helvetica', index <= 1 ? 'bold' : 'normal');
      doc.setFontSize(index === 1 ? 14 : 11);
      doc.text(line, margin, y);
      y += index === 1 ? 20 : 16;
    });
    autoTable(doc, {
      startY: y + 8,
      head: [['Indicator', 'Male', 'Female', 'Total']],
      body: [['Adult OPD Patients', report.overall.male, report.overall.female, report.overall.total]],
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 76, 92] },
      margin: { left: margin, right: margin },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 18,
      head: [['Age Group', 'Male', 'Female', 'Total']],
      body: [
        ...ADULT_AGE_GROUPS.map((group) => [
          group,
          report.ageGroups[group].male,
          report.ageGroups[group].female,
          report.ageGroups[group].total,
        ]),
        ['TOTAL', report.overall.male, report.overall.female, report.overall.total],
      ],
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 76, 92] },
      margin: { left: margin, right: margin },
    });
    Object.entries(report.diagnoses).forEach(([name, block]) => {
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 16,
        head: [[`DIAGNOSIS: ${name}`, 'Male', 'Female', 'Total']],
        body: [
          ...ADULT_AGE_GROUPS.map((group) => [group, block[group].male, block[group].female, block[group].total]),
          [`${name.toUpperCase()} TOTAL`, block.total.male, block.total.female, block.total.total],
        ],
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [15, 76, 92] },
        margin: { left: margin, right: margin },
      });
    });
    const footerY = doc.lastAutoTable.finalY + 28;
    doc.setFont('helvetica', 'normal');
    preparedBy(settings).forEach((line, index) => {
      doc.text(line, margin, footerY + index * 16);
    });
    doc.save(`Adult-OPD-Monthly-${report.month}-${report.year}.pdf`);
  } catch {
    window.print();
  }
}

export async function exportYearlyReportExcel(report, settings) {
  try {
    const XLSX = await import('xlsx');
    const rows = [
      [settings.healthCenterName || 'Health Center Name not set'],
      ['ADULT OPD YEARLY REPORT'],
      [`Reporting Year: ${report.year}`],
      [],
      ['Month', 'Male', 'Female', 'Total'],
      ...report.months.map((row) => [row.month, row.male, row.female, row.total]),
      ['YEAR TOTAL', report.yearTotal.male, report.yearTotal.female, report.yearTotal.total],
      [],
      ['Diagnosis', 'Male', 'Female', 'Total'],
      ...Object.entries(report.diagnoses).map(([name, counts]) => [name, counts.male, counts.female, counts.total]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Adult OPD Yearly');
    XLSX.writeFile(workbook, `Adult-OPD-Yearly-${report.year}.xlsx`);
  } catch {
    const monthRows = report.months
      .map((row) => `<tr><td>${row.month}</td>${cell(row.male)}${cell(row.female)}${cell(row.total)}</tr>`)
      .join('');
    const html = `<html><body>
      <h1>ADULT OPD YEARLY REPORT</h1>
      <p>${settings.healthCenterName || 'Health Center Name not set'}</p>
      <p>Year: ${report.year}</p>
      <table border="1">${monthRows}<tr><th>YEAR TOTAL</th><th>${report.yearTotal.male}</th><th>${report.yearTotal.female}</th><th>${report.yearTotal.total}</th></tr></table>
    </body></html>`;
    downloadBlob(`Adult-OPD-Yearly-${report.year}.xls`, 'application/vnd.ms-excel', html);
  }
}
