export const ADULT_AGE_GROUPS = ['5–14', '15–29', '30–64', '≥65'];

export const OPD_CATEGORY = {
  ADULT: 'Adult OPD',
  OUTSIDE: 'Outside Adult OPD Categories',
};

export const SEX = {
  MALE: 'Male',
  FEMALE: 'Female',
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const STORAGE_KEYS = {
  RECORDS: 'adult-opd-records',
  DIAGNOSES: 'adult-opd-diagnoses',
  SETTINGS: 'adult-opd-settings',
  DEMO_LOADED: 'adult-opd-demo-loaded',
};

export const DEFAULT_SETTINGS = {
  healthCenterName: '',
  region: '',
  zone: '',
  woreda: '',
  reportingYear: new Date().getFullYear(),
  responsiblePersonName: '',
  position: '',
};

export const STARTER_DIAGNOSES = [
  { id: 'dx-uti', name: 'UTI', active: true },
  { id: 'dx-pneumonia', name: 'Pneumonia', active: true },
  { id: 'dx-hypertension', name: 'Hypertension', active: true },
  { id: 'dx-diabetes', name: 'Diabetes Mellitus', active: true },
  { id: 'dx-gastritis', name: 'Gastritis', active: true },
  { id: 'dx-malaria', name: 'Malaria', active: true },
  { id: 'dx-urti', name: 'Upper Respiratory Tract Infection', active: true },
  { id: 'dx-diarrhea', name: 'Diarrhea', active: true },
  { id: 'dx-skin', name: 'Skin Infection', active: true },
  { id: 'dx-anemia', name: 'Anemia', active: true },
];
