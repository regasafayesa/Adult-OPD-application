import {
  ethiopianDateToGregorianISO,
  formatEthiopianDate,
  getEthiopianDateParts,
} from '../utils/ethiopianCalendar.js';

export function todayEncounterDateISO(now = new Date()) {
  const ethiopianToday = getEthiopianDateParts(now);
  return ethiopianToday ? ethiopianDateToGregorianISO(ethiopianToday) : null;
}

export function reviewedEncounterDate(value, now = new Date()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) && getEthiopianDateParts(value.trim())) {
    return value.trim();
  }
  return todayEncounterDateISO(now);
}

function withoutDateIssues(issues) {
  return (issues || []).filter((issue) => !/encounter date/i.test(issue));
}

export function assignTodayToExtractedEncounters(encounters, now = new Date()) {
  const today = todayEncounterDateISO(now);
  return encounters.map((row) => ({
    ...row,
    date: today,
    issues: withoutDateIssues(row.issues),
  }));
}

export function updateExtractedEncounter(encounters, index, field, value) {
  return encounters.map((row, rowIndex) => {
    if (rowIndex < index) return row;
    if (field === 'date') return { ...row, date: value };
    return rowIndex === index ? { ...row, [field]: value } : row;
  });
}

export function appendExtractedEncounter(encounters, encounter, now = new Date()) {
  const lastEncounter = encounters[encounters.length - 1];
  return [
    ...encounters,
    {
      ...encounter,
      date: lastEncounter?.date || todayEncounterDateISO(now),
    },
  ];
}

export function removeExtractedEncounter(encounters, index) {
  return encounters.filter((_, rowIndex) => rowIndex !== index);
}

export function ethiopianDateLabel(value) {
  return formatEthiopianDate(value);
}
