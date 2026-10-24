import { MONTH_NAMES } from '../constants.js';

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toISODate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
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
  const date = parseISODate(iso);
  if (!date) {
    return { reportingMonth: null, reportingYear: null, monthName: null };
  }
  return {
    reportingMonth: date.getMonth() + 1,
    reportingYear: date.getFullYear(),
    monthName: MONTH_NAMES[date.getMonth()],
  };
}

export function monthName(monthNumber) {
  return MONTH_NAMES[monthNumber - 1] || '';
}

export function formatDisplayDate(iso) {
  const date = parseISODate(iso);
  if (!date) return iso || '—';
  return `${pad2(date.getDate())} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}
