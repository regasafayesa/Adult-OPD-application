import { toEC, toGC } from 'kenat';

export const ETHIOPIAN_MONTH_NAMES = [
  'Meskerem',
  'Tikimt',
  'Hidar',
  'Tahsas',
  'Tir',
  'Yekatit',
  'Megabit',
  'Miyazya',
  'Ginbot',
  'Sene',
  'Hamle',
  'Nehase',
  'Pagume',
];

const ETHIOPIAN_TIME_ZONE = 'Africa/Addis_Ababa';
const ETHIOPIAN_INTL_FORMATTER = new Intl.DateTimeFormat('en-u-ca-ethiopic-nu-latn', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: ETHIOPIAN_TIME_ZONE,
});
const ADDIS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA-u-nu-latn', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: ETHIOPIAN_TIME_ZONE,
});

function isValidGregorianDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function utcDateParts(date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function getGregorianDateParts(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) {
      const [, year, month, day] = dateOnly.map(Number);
      return isValidGregorianDate(year, month, day) ? { year, month, day } : null;
    }
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = ADDIS_DATE_FORMATTER.formatToParts(date);
  const fields = Object.fromEntries(parts
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value: partValue }) => [type, Number(partValue)]));
  if (!isValidGregorianDate(fields.year, fields.month, fields.day)) return null;
  return fields;
}

function getIntlEthiopianParts(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = ETHIOPIAN_INTL_FORMATTER.formatToParts(date);
  const fields = Object.fromEntries(parts
    .filter(({ type }) => type !== 'literal')
    .map(({ type, value: partValue }) => [type, Number(partValue)]));
  if (![fields.year, fields.month, fields.day].every(Number.isInteger)) return null;
  return fields;
}

export function getEthiopianDateParts(value) {
  const gregorian = getGregorianDateParts(value);
  if (!gregorian) return null;

  if (gregorian.year >= 1900 && gregorian.year <= 2100) {
    return toEC(gregorian.year, gregorian.month, gregorian.day);
  }
  return getIntlEthiopianParts(value);
}

export function formatEthiopianDate(value) {
  const date = getEthiopianDateParts(value);
  if (!date) return value || '—';
  return `${String(date.day).padStart(2, '0')} ${ETHIOPIAN_MONTH_NAMES[date.month - 1]} ${date.year}`;
}

export function ethiopianMonthName(monthNumber) {
  return ETHIOPIAN_MONTH_NAMES[Number(monthNumber) - 1] || '';
}

export function gregorianISOFromParts(parts) {
  if (!parts?.year || !parts?.month || !parts?.day) return '';
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function todayGregorianISO(value = new Date()) {
  return gregorianISOFromParts(getGregorianDateParts(value));
}

export function currentEthiopianDate(value = new Date()) {
  return getEthiopianDateParts(value);
}

export function currentEthiopianPeriod(value = new Date()) {
  const date = currentEthiopianDate(value);
  return {
    year: date?.year || '',
    month: date?.month || '',
  };
}

export function ethiopianReportingPeriod(value) {
  const date = getEthiopianDateParts(value);
  if (!date) {
    return { reportingMonth: null, reportingYear: null, monthName: null };
  }
  return {
    reportingMonth: date.month,
    reportingYear: date.year,
    monthName: ethiopianMonthName(date.month),
  };
}

export function isEthiopianLeapYear(year) {
  return Number.isInteger(Number(year)) && Number(year) % 4 === 3;
}

export function daysInEthiopianMonth(year, month) {
  const numericMonth = Number(month);
  if (!Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 13) return 0;
  if (numericMonth < 13) return 30;
  return isEthiopianLeapYear(year) ? 6 : 5;
}

export function ethiopianDateToGregorianISO(value) {
  const year = Number(value?.year);
  const month = Number(value?.month);
  const day = Number(value?.day);
  if (!Number.isInteger(year) || year < 1 || year > 9999
      || !Number.isInteger(month) || month < 1 || month > 13
      || !Number.isInteger(day) || day < 1 || day > daysInEthiopianMonth(year, month)) {
    return null;
  }

  const gregorian = toGC(year, month, day);
  return `${String(gregorian.year).padStart(4, '0')}-${String(gregorian.month).padStart(2, '0')}-${String(gregorian.day).padStart(2, '0')}`;
}

function nextGregorianDay(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const next = new Date(0);
  next.setUTCFullYear(year, month - 1, day + 1);
  next.setUTCHours(0, 0, 0, 0);
  const parts = utcDateParts(next);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function maxISODate(dates) {
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function minISODate(dates) {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

export function getEthiopianEncounterDateBounds(filters) {
  const lowerBounds = [];
  const upperBounds = [];
  const year = Number(filters.year);
  const month = Number(filters.month);

  if (filters.year && Number.isInteger(year) && year > 0) {
    lowerBounds.push(ethiopianDateToGregorianISO({ year, month: 1, day: 1 }));
    upperBounds.push(ethiopianDateToGregorianISO({ year: year + 1, month: 1, day: 1 }));
  }

  if (filters.month && Number.isInteger(month) && month >= 1 && month <= 13 && filters.year
      && Number.isInteger(year) && year > 0) {
    lowerBounds.push(ethiopianDateToGregorianISO({ year, month, day: 1 }));
    upperBounds.push(month === 13
      ? ethiopianDateToGregorianISO({ year: year + 1, month: 1, day: 1 })
      : ethiopianDateToGregorianISO({ year, month: month + 1, day: 1 }));
  }

  const exactDate = ethiopianDateToGregorianISO(filters.date);
  if (exactDate) {
    lowerBounds.push(exactDate);
    upperBounds.push(nextGregorianDay(exactDate));
  }

  const startDate = ethiopianDateToGregorianISO(filters.startDate);
  if (startDate) lowerBounds.push(startDate);

  const endDate = ethiopianDateToGregorianISO(filters.endDate);
  if (endDate) upperBounds.push(nextGregorianDay(endDate));

  const validLowerBounds = lowerBounds.filter(Boolean);
  const validUpperBounds = upperBounds.filter(Boolean);
  return {
    from: validLowerBounds.length ? maxISODate(validLowerBounds) : '',
    before: validUpperBounds.length ? minISODate(validUpperBounds) : '',
  };
}

function sameEthiopianDate(actual, selected) {
  if (!selected?.year || !selected?.month || !selected?.day) return null;
  const selectedGregorian = ethiopianDateToGregorianISO(selected);
  if (!selectedGregorian) return false;
  return ethiopianDateToGregorianISO(actual) === selectedGregorian;
}

export function matchesEthiopianEncounterDate(recordDate, filters) {
  const actual = getEthiopianDateParts(recordDate);
  const hasDateFilter = Boolean(filters.year || filters.month
    || ethiopianDateToGregorianISO(filters.date)
    || ethiopianDateToGregorianISO(filters.startDate)
    || ethiopianDateToGregorianISO(filters.endDate));
  if (!actual) return !hasDateFilter;

  if (filters.year && actual.year !== Number(filters.year)) return false;
  if (filters.month && actual.month !== Number(filters.month)) return false;

  const exactMatch = sameEthiopianDate(actual, filters.date);
  if (exactMatch === false) return false;

  const actualGregorian = getGregorianDateParts(recordDate);
  const startDate = ethiopianDateToGregorianISO(filters.startDate);
  const endDate = ethiopianDateToGregorianISO(filters.endDate);
  const actualISO = actualGregorian
    ? `${String(actualGregorian.year).padStart(4, '0')}-${String(actualGregorian.month).padStart(2, '0')}-${String(actualGregorian.day).padStart(2, '0')}`
    : '';
  if (startDate && actualISO < startDate) return false;
  if (endDate && actualISO > endDate) return false;
  return true;
}
