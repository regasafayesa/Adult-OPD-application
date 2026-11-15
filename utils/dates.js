import {
  ethiopianMonthName,
  ethiopianReportingPeriod,
  formatEthiopianDate,
  todayGregorianISO,
} from './ethiopianCalendar.js';

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return todayGregorianISO();
}

export function parseISODate(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function reportingPeriodFromDate(iso) {
  return ethiopianReportingPeriod(iso);
}

export function monthName(monthNumber) {
  return ethiopianMonthName(monthNumber);
}

export function formatDisplayDate(iso) {
  return formatEthiopianDate(iso);
}
