import React from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AdultOpdLayout from './components/common/AdultOpdLayout';
import { AdultOpdProvider, useAdultOpd } from './context/AdultOpdContext';
import Diagnoses from './pages/Diagnoses';
import Dashboard from './pages/Dashboard';
import MonthlyReport from './pages/MonthlyReport';
import PatientEntry from './pages/PatientEntry';
import PatientRecords from './pages/PatientRecords';
import Settings from './pages/Settings';
import YearlyReport from './pages/YearlyReport';
import './AdultOpd.css';

function AdultOpdRoutes() {
  const { hasDemoRecords, settings } = useAdultOpd();

  return (
    <AdultOpdLayout NavLink={NavLink} hasDemoRecords={hasDemoRecords} healthCenterName={settings.healthCenterName}>
      <Routes>
        <Route path="/" element={<Navigate to="/adult-opd" replace />} />
        <Route path="/adult-opd" element={<Dashboard />} />
        <Route path="/adult-opd/entry" element={<PatientEntry />} />
        <Route path="/adult-opd/records" element={<PatientRecords />} />
        <Route path="/adult-opd/monthly" element={<MonthlyReport />} />
        <Route path="/adult-opd/yearly" element={<YearlyReport />} />
        <Route path="/adult-opd/diagnoses" element={<Diagnoses />} />
        <Route path="/adult-opd/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/adult-opd" replace />} />
      </Routes>
    </AdultOpdLayout>
  );
}

export default function AdultOpdApp() {
  return (
    <AdultOpdProvider>
      <AdultOpdRoutes />
    </AdultOpdProvider>
  );
}
