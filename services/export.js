import { ADULT_AGE_GROUPS } from '../constants.js';
import { getTallyGroupSizes, tallyMarks } from '../utils/tallyMarks.mjs';
import { MONTHLY_DIAGNOSIS_AGE_GROUPS } from './monthlyDiagnosisCounts.mjs';

export { tallyMarks };

export const ICT_TALLY_AGE_GROUPS = [
  { label: 'Below 1 year', reportKey: null },
  { label: '12–59 months', reportKey: null },
  { label: '5–14 years', reportKey: '5–14' },
  { label: '15–29 years', reportKey: '15–29' },
  { label: '30–64 years', reportKey: '30–64' },
  { label: '65+ years', reportKey: '≥65' },
];

const ICT_TALLY_DIAGNOSES = [
  { code: '1A07', name: 'Typhoid fever', aliases: ['typhoid fever'] },
  { code: '1F9Z', name: 'Helminthiasis', aliases: ['helminthiasis'] },
  { code: 'MD92', name: 'Dyspepsia', aliases: ['dyspepsia'] },
  { code: 'GBS1', name: 'Urinary tract infection', aliases: ['urinary tract infection', 'uti'] },
  { code: 'A09', name: 'Diarrhea', aliases: ['diarrhea', 'diarrhoea'] },
  { code: 'R51', name: 'Headache', aliases: ['headache'] },
  { code: 'E56.9', name: 'Avitaminosis', aliases: ['avitaminosis'] },
  { code: 'T14.9', name: 'Injury / unspecified', aliases: ['injury / unspecified', 'injury unspecified'] },
  { code: 'J03', name: 'Tonsillitis', aliases: ['tonsillitis'] },
  { code: 'L30.9', name: 'Dermatitis', aliases: ['dermatitis'] },
  { code: 'CA40', name: 'Pneumonia', aliases: ['pneumonia'] },
  { code: 'K02', name: 'Tooth decay', aliases: ['tooth decay'] },
  { code: 'H66', name: 'Otitis media', aliases: ['otitis media'] },
];

function normalizedDiagnosisName(value) {
  return String(value)
    .replace(/^(?:[A-Z]\d{2}(?:\.\d+)?(?:-[A-Z]?\d{2}(?:\.\d+)?)?)\s*/i, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLocaleLowerCase();
}

function matchesIctDiagnosis(name, definition) {
  const normalizedName = normalizedDiagnosisName(name);
  return definition.aliases.some((alias) => normalizedDiagnosisName(alias) === normalizedName);
}

function diagnosisRowTotal({ counts }) {
  return counts.reduce((total, { male, female }) => total + male + female, 0);
}

function diagnosisIdentity({ diagnosisId, code, name }) {
  if (code) return `code:${String(code).trim().toLocaleUpperCase()}`;
  if (diagnosisId) return `id:${String(diagnosisId).replace(/^official:/, '')}`;
  return `legacy:${normalizedDiagnosisName(name)}`;
}

function emptyTallyCounts() {
  return ICT_TALLY_AGE_GROUPS.map(() => ({ male: 0, female: 0 }));
}

function addEncounterCounts(row, block) {
  ICT_TALLY_AGE_GROUPS.forEach(({ reportKey }, index) => {
    if (!ADULT_AGE_GROUPS.includes(reportKey)) return;
    row.counts[index].male += block[reportKey]?.male || 0;
    row.counts[index].female += block[reportKey]?.female || 0;
  });
}

function addAggregateCounts(row, summary) {
  MONTHLY_DIAGNOSIS_AGE_GROUPS.forEach(({ key }, index) => {
    row.counts[index].male += summary.totals.ageGroups[key].male;
    row.counts[index].female += summary.totals.ageGroups[key].female;
  });
  row.hasAggregate = true;
  row.aggregateSummaries.push(summary);
}

export function buildMonthlyIctTallyRows(report) {
  const rowsByIdentity = new Map();
  const rowsByLegacyAlias = new Map();
  const rows = [];
  const rowFor = (metadata) => {
    const key = diagnosisIdentity(metadata);
    if (!rowsByIdentity.has(key)) {
      const row = {
        diagnosisId: metadata.diagnosisId || '',
        code: metadata.code || '',
        name: metadata.canonicalDiagnosisName || metadata.name || 'Unspecified',
        counts: emptyTallyCounts(),
        hasAggregate: false,
        aggregateSummaries: [],
      };
      rowsByIdentity.set(key, row);
      rows.push(row);
    }
    return rowsByIdentity.get(key);
  };

  Object.entries(report.diagnoses).forEach(([name, block]) => {
    const metadata = {
      diagnosisId: block.diagnosisId,
      code: block.diagnosisCode,
      name: block.canonicalDiagnosisName || name,
      canonicalDiagnosisName: block.canonicalDiagnosisName || name,
    };
    const row = rowFor(metadata);
    addEncounterCounts(row, block);
    if (!metadata.diagnosisId && !metadata.code) {
      const definition = ICT_TALLY_DIAGNOSES.find((item) => matchesIctDiagnosis(name, item));
      if (definition) rowsByLegacyAlias.set(`legacy:${normalizedDiagnosisName(name)}`, definition);
    }
  });

  const seenAggregateSummaries = new Set();
  (report.aggregate?.diagnoses || []).forEach((summary) => {
    const dedupeKey = [
      summary.facilityId || '',
      summary.reportingYear,
      summary.reportingMonth,
      summary.diagnosisId,
    ].join('|');
    if (seenAggregateSummaries.has(dedupeKey)) return;
    seenAggregateSummaries.add(dedupeKey);
    const aliasDefinition = !summary.diagnosisId && !summary.diagnosisCode
      ? ICT_TALLY_DIAGNOSES.find((item) => matchesIctDiagnosis(summary.diagnosisName, item))
      : null;
    const row = aliasDefinition
      ? rows.find((item) => item.code === aliasDefinition.code)
        || rowFor({
          code: aliasDefinition.code,
          name: aliasDefinition.name,
          canonicalDiagnosisName: aliasDefinition.name,
        })
      : rowFor({
        diagnosisId: summary.diagnosisId,
        code: summary.diagnosisCode,
        name: summary.diagnosisName,
        canonicalDiagnosisName: summary.diagnosisName,
      });
    addAggregateCounts(row, summary);
  });

  rows.forEach((row) => {
    if (!row.code) {
      const definition = ICT_TALLY_DIAGNOSES.find((item) => matchesIctDiagnosis(row.name, item));
      if (definition) {
        row.code = definition.code;
        if (row.name.toLocaleLowerCase() === 'uti') row.name = definition.name;
      }
    }
  });
  return rows
    .filter((row) => diagnosisRowTotal(row) > 0)
    .sort((left, right) =>
      diagnosisRowTotal(right) - diagnosisRowTotal(left)
      || left.name.localeCompare(right.name)
    );
}

export function buildMonthlyIctPdfRows(report) {
  return buildMonthlyIctTallyRows(report);
}

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

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function monthlyHtml(report, settings) {
  const rows = buildMonthlyIctTallyRows(report)
    .map(({ code, name, counts }) => {
      const diagnosis = code
        ? `<strong>${escapeHtml(code)}</strong><br />${escapeHtml(name)}`
        : escapeHtml(name);
      const maleCells = counts
        .map(({ male }) => `<td>${escapeHtml(tallyMarks(male))}</td><td>${male || ''}</td>`)
        .join('');
      const femaleCells = counts
        .map(({ female }) => `<td>${escapeHtml(tallyMarks(female))}</td><td>${female || ''}</td>`)
        .join('');
      return `<tr><td>${diagnosis}</td>${maleCells}${femaleCells}</tr>`;
    })
    .join('');
  const ageHeaders = [...ICT_TALLY_AGE_GROUPS, ...ICT_TALLY_AGE_GROUPS]
    .map(({ label }) => `<th colspan="2">${escapeHtml(label)}</th>`)
    .join('');
  const tallyHeaders = Array.from(
    { length: ICT_TALLY_AGE_GROUPS.length * 2 },
    () => '<th>Tally</th><th>Count</th>'
  ).join('');
  return `
    <html><head><meta charset="utf-8" /></head><body>
      <h1>OPD – ICT TALLY SHEET</h1>
      <p><strong>Health Center: ${escapeHtml(settings.healthCenterName || '')}</strong></p>
      <p>Year: ${report.year} &nbsp; Month: ${escapeHtml(String(report.month).toUpperCase())}</p>
      <p>Reporting period: ${escapeHtml(String(report.month).toUpperCase())} ${report.year}</p>
      ${facilityLines(settings).slice(1).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
      <table border="1" cellspacing="0" cellpadding="4">
        <thead>
          <tr><th rowspan="3">DIAGNOSIS<br />Code / Name</th><th colspan="${ICT_TALLY_AGE_GROUPS.length * 2}">MALE</th><th colspan="${ICT_TALLY_AGE_GROUPS.length * 2}">FEMALE</th></tr>
          <tr>${ageHeaders}</tr>
          <tr>${tallyHeaders}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${preparedBy(settings).map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
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
    rows.push(['OPD – ICT TALLY SHEET']);
    rows.push([`Year: ${report.year}`, `Month: ${String(report.month).toUpperCase()}`]);
    rows.push([`Reporting period: ${String(report.month).toUpperCase()} ${report.year}`]);
    if (settings.region) rows.push([`Region: ${settings.region}`]);
    if (settings.zone) rows.push([`Zone: ${settings.zone}`]);
    if (settings.woreda) rows.push([`Woreda: ${settings.woreda}`]);
    rows.push([]);
    rows.push([
      'DIAGNOSIS Code / Name',
      ...ICT_TALLY_AGE_GROUPS.flatMap(({ label }) => [`Male ${label} Tally`, `Male ${label} Count`]),
      ...ICT_TALLY_AGE_GROUPS.flatMap(({ label }) => [`Female ${label} Tally`, `Female ${label} Count`]),
    ]);
    buildMonthlyIctTallyRows(report).forEach(({ code, name, counts }) => {
      rows.push([
        code ? `${code} ${name}` : name,
        ...counts.flatMap(({ male }) => [tallyMarks(male), male || '']),
        ...counts.flatMap(({ female }) => [tallyMarks(female), female || '']),
      ]);
    });
    preparedBy(settings).forEach((line) => rows.push([line]));
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 36 },
      ...Array.from({ length: ICT_TALLY_AGE_GROUPS.length * 4 }, (_, index) => ({
        wch: index % 2 === 0 ? 16 : 10,
      })),
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'OPD ICT Tally');
    XLSX.writeFile(workbook, `OPD-Monthly-${report.month}-${report.year}.xlsx`);
  } catch {
    downloadBlob(
      `OPD-Monthly-${report.month}-${report.year}.xls`,
      'application/vnd.ms-excel',
      monthlyHtml(report, settings)
    );
  }
}

export async function exportMonthlyReportPdf(report, settings) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const rows = buildMonthlyIctPdfRows(report);
  const monthYear = `${String(report.month).toUpperCase()} ${report.year}`;

  let y = 28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('OPD – ICT TALLY SHEET', pageWidth / 2, y, { align: 'center' });
  y += 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Health Center: ${settings.healthCenterName || ''}`, margin, y);
  doc.text(
    `Year: ${report.year}     Month: ${String(report.month).toUpperCase()}`,
    pageWidth - margin,
    y,
    { align: 'right' }
  );
  y += 15;
  doc.text(`Month: ${monthYear}`, margin, y);
  doc.text(`Reporting period: ${monthYear}`, pageWidth - margin, y, { align: 'right' });

  const tallyHead = [
    [
      { content: 'DIAGNOSIS\nCode / Name', rowSpan: 3, styles: { valign: 'middle' } },
      { content: 'MALE', colSpan: ICT_TALLY_AGE_GROUPS.length * 2, styles: { halign: 'center' } },
      { content: 'FEMALE', colSpan: ICT_TALLY_AGE_GROUPS.length * 2, styles: { halign: 'center' } },
    ],
    [
      ...ICT_TALLY_AGE_GROUPS.map(({ label }) => ({ content: label, colSpan: 2, styles: { halign: 'center' } })),
      ...ICT_TALLY_AGE_GROUPS.map(({ label }) => ({ content: label, colSpan: 2, styles: { halign: 'center' } })),
    ],
    Array.from({ length: ICT_TALLY_AGE_GROUPS.length * 2 }, () => [
      { content: 'Tally', styles: { halign: 'center' } },
      { content: 'Count', styles: { halign: 'center' } },
    ]).flat(),
  ];

  const bodyRows = rows.map(({ code, name, counts }) => [
    code ? `${code}\n${name}` : name,
    ...counts.flatMap(({ male }) => ['', male || '']),
    ...counts.flatMap(({ female }) => ['', female || '']),
  ]);
  const subcolumnCount = ICT_TALLY_AGE_GROUPS.length * 4;
  const columnStyles = { 0: { cellWidth: 128, halign: 'left', fontSize: 7 } };
  for (let index = 1; index <= subcolumnCount; index += 1) {
    columnStyles[index] = {
      cellWidth: index % 2 === 1 ? 36 : 20,
      halign: 'center',
      fontSize: index % 2 === 1 ? 4 : 6,
    };
  }

  autoTable(doc, {
    startY: y + 8,
    head: tallyHead,
    body: bodyRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 5,
      cellPadding: 1.5,
      minCellHeight: 20,
      overflow: 'linebreak',
      valign: 'middle',
      lineColor: [45, 45, 45],
      lineWidth: 0.5,
      textColor: [0, 0, 0],
    },
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index < 1 || data.column.index % 2 !== 1) return;

      const rowCounts = rows[data.row.index].counts;
      const countIndex = Math.floor((data.column.index - 1) / 2);
      const count = countIndex < ICT_TALLY_AGE_GROUPS.length
        ? rowCounts[countIndex].male
        : rowCounts[countIndex - ICT_TALLY_AGE_GROUPS.length].female;
      const groupCount = getTallyGroupSizes(count).length;
      const availableWidth = data.cell.width - 4;
      const groupWidth = 10;
      const groupGap = 1.5;
      const groupsPerLine = Math.max(1, Math.floor((availableWidth + groupGap) / (groupWidth + groupGap)));
      const lineCount = Math.ceil(groupCount / groupsPerLine);
      data.cell.styles.minCellHeight = Math.max(
        data.cell.styles.minCellHeight || 0,
        4 + lineCount * 9
      );
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index < 1 || data.column.index % 2 !== 1) return;

      const rowCounts = rows[data.row.index].counts;
      const countIndex = Math.floor((data.column.index - 1) / 2);
      const count = countIndex < ICT_TALLY_AGE_GROUPS.length
        ? rowCounts[countIndex].male
        : rowCounts[countIndex - ICT_TALLY_AGE_GROUPS.length].female;
      const groups = getTallyGroupSizes(count);
      const groupWidth = 10;
      const groupHeight = 8;
      const groupGap = 1.5;
      const lineGap = 1.5;
      const columns = Math.max(1, Math.floor((data.cell.width - 4 + groupGap) / (groupWidth + groupGap)));
      const lines = Math.ceil(groups.length / columns);
      const totalWidth = Math.min(groups.length, columns) * groupWidth
        + Math.max(0, Math.min(groups.length, columns) - 1) * groupGap;
      const totalHeight = lines * groupHeight + Math.max(0, lines - 1) * lineGap;
      const startX = data.cell.x + (data.cell.width - totalWidth) / 2;
      const startY = data.cell.y + (data.cell.height - totalHeight) / 2;

      doc.setDrawColor(25, 25, 25);
      doc.setLineWidth(0.55);
      groups.forEach((size, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const x = startX + column * (groupWidth + groupGap);
        const y = startY + row * (groupHeight + lineGap);
        const verticalCount = size === 5 ? 4 : size;

        for (let mark = 0; mark < verticalCount; mark += 1) {
          const markX = x + 1.5 + mark * 1.75;
          doc.line(markX, y, markX, y + groupHeight);
        }

        if (size === 5) doc.line(x + 0.5, y + groupHeight, x + 8.5, y);
      });
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 5,
      halign: 'center',
      minCellHeight: 14,
    },
    columnStyles,
    margin: { left: margin, right: margin, bottom: 28 },
    rowPageBreak: 'avoid',
    didDrawPage: ({ pageNumber }) => {
      if (pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('OPD – ICT TALLY SHEET', pageWidth / 2, 20, { align: 'center' });
      }
    },
  });

  const signoff = preparedBy(settings);
  if (signoff.length) {
    const signoffText = signoff.join('    ');
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxTextWidth = pageWidth - margin * 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const textWidth = doc.getTextWidth(signoffText);
    if (textWidth > maxTextWidth) {
      doc.setFontSize(7 * maxTextWidth / textWidth);
    }
    doc.text(signoffText, pageWidth / 2, pageHeight - 12, { align: 'center' });
  }

  doc.save(`OPD-Monthly-${report.month}-${report.year}.pdf`);
}

export async function exportYearlyReportExcel(report, settings) {
  try {
    const XLSX = await import('xlsx');
    const rows = [
      [settings.healthCenterName || 'Health Center Name not set'],
      ['OPD YEARLY REPORT'],
      [`Reporting Year: ${report.year}`],
      [],
      ['Month', 'Male', 'Female', 'Total'],
      ...report.months.map((row) => [row.month, row.male, row.female, row.total]),
      ['YEAR TOTAL', report.yearTotal.male, report.yearTotal.female, report.yearTotal.total],
      [],
      ['Age group', 'Male', 'Female', 'Total'],
      ...Object.values(report.ageGroups).map((group) => [
        group.label,
        group.male,
        group.female,
        group.total,
      ]),
      [],
      ['Diagnosis', 'Male', 'Female', 'Total'],
      ...Object.entries(report.diagnoses).map(([name, counts]) => [name, counts.male, counts.female, counts.total]),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'OPD Yearly');
    XLSX.writeFile(workbook, `OPD-Yearly-${report.year}.xlsx`);
  } catch {
    const monthRows = report.months
      .map((row) => `<tr><td>${row.month}</td>${cell(row.male)}${cell(row.female)}${cell(row.total)}</tr>`)
      .join('');
    const ageRows = Object.values(report.ageGroups)
      .map((group) => `<tr><td>${escapeHtml(group.label)}</td>${cell(group.male)}${cell(group.female)}${cell(group.total)}</tr>`)
      .join('');
    const diagnosisRows = Object.entries(report.diagnoses)
      .map(([name, counts]) => `<tr><td>${escapeHtml(name)}</td>${cell(counts.male)}${cell(counts.female)}${cell(counts.total)}</tr>`)
      .join('');
    const html = `<html><body>
      <h1>OPD YEARLY REPORT</h1>
      <p>${settings.healthCenterName || 'Health Center Name not set'}</p>
      <p>Year: ${report.year}</p>
      <table border="1">${monthRows}<tr><th>YEAR TOTAL</th><th>${report.yearTotal.male}</th><th>${report.yearTotal.female}</th><th>${report.yearTotal.total}</th></tr></table>
      <h2>Combined cases by age group</h2>
      <table border="1"><thead><tr><th>Age group</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>${ageRows}</tbody></table>
      <h2>Combined yearly diagnosis statistics</h2>
      <table border="1"><thead><tr><th>Diagnosis</th><th>Male</th><th>Female</th><th>Total</th></tr></thead><tbody>${diagnosisRows}</tbody></table>
    </body></html>`;
    downloadBlob(`OPD-Yearly-${report.year}.xls`, 'application/vnd.ms-excel', html);
  }
}
