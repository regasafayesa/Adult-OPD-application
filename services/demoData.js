import { enrichEncounter } from './storage';
import { getEthiopianReportingPeriodBounds } from '../utils/ethiopianCalendar.js';

/**
 * Small labelled demo dataset spanning all OPD age groups.
 * Not official MOH statistics. Not real patient data.
 */
export function buildDemoRecords(year, month) {
  const period = getEthiopianReportingPeriodBounds({ year, month });
  if (!period) return [];
  const samples = [
    { day: 2, age: 6, sex: 'Female', diagnosis: 'UTI' },
    { day: 3, age: 8, sex: 'Male', diagnosis: 'Pneumonia' },
    { day: 4, age: 7, sex: 'Female', diagnosis: 'Diarrhea' },
    { day: 5, age: 9, sex: 'Male', diagnosis: 'Malaria' },
    { day: 6, age: 12, sex: 'Male', diagnosis: 'UTI' },
    { day: 7, age: 16, sex: 'Female', diagnosis: 'Gastritis' },
    { day: 8, age: 19, sex: 'Male', diagnosis: 'Upper Respiratory Tract Infection' },
    { day: 9, age: 22, sex: 'Female', diagnosis: 'Anemia' },
    { day: 10, age: 24, sex: 'Male', diagnosis: 'Hypertension' },
    { day: 11, age: 25, sex: 'Female', diagnosis: 'Hypertension' },
    { day: 12, age: 27, sex: 'Male', diagnosis: 'Diabetes Mellitus' },
    { day: 13, age: 29, sex: 'Female', diagnosis: 'UTI' },
    { day: 14, age: 34, sex: 'Male', diagnosis: 'Hypertension' },
    { day: 15, age: 42, sex: 'Female', diagnosis: 'Diabetes Mellitus' },
    { day: 16, age: 51, sex: 'Male', diagnosis: 'Gastritis' },
    { day: 17, age: 58, sex: 'Female', diagnosis: 'Hypertension' },
    { day: 18, age: 63, sex: 'Male', diagnosis: 'Pneumonia' },
    { day: 19, age: 65, sex: 'Female', diagnosis: 'Hypertension' },
    { day: 20, age: 72, sex: 'Male', diagnosis: 'Diabetes Mellitus' },
    { day: 21, age: 80, sex: 'Female', diagnosis: 'Pneumonia' },
    { day: 22, age: 68, sex: 'Male', diagnosis: 'UTI' },
  ];

  return samples.map((sample) => {
    const visitDate = new Date(`${period.from}T00:00:00.000Z`);
    visitDate.setUTCDate(visitDate.getUTCDate() + sample.day - 2);
    return enrichEncounter({
      date: visitDate.toISOString().slice(0, 10),
      age: sample.age,
      sex: sample.sex,
      diagnosis: sample.diagnosis,
      isDemo: true,
    });
  });
}
