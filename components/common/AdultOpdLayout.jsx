import React from 'react';

const NAV_ITEMS = [
  { to: '/adult-opd', label: 'Dashboard', end: true },
  { to: '/adult-opd/entry', label: 'Patient Entry' },
  { to: '/adult-opd/records', label: 'Patient Records' },
  { to: '/adult-opd/monthly', label: 'Monthly Report' },
  { to: '/adult-opd/yearly', label: 'Yearly Report' },
  { to: '/adult-opd/diagnoses', label: 'Diagnoses' },
  { to: '/adult-opd/settings', label: 'Settings' },
];

export default function AdultOpdLayout({ children, NavLink, hasDemoRecords, healthCenterName }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="aopd-shell">
      <aside className={`aopd-sidebar ${open ? 'is-open' : ''}`}>
        <div className="aopd-brand">
          <strong>Adult OPD</strong>
          <span>Monthly Reporting System</span>
        </div>
        <nav>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `aopd-nav-link${isActive ? ' is-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="aopd-sidebar-foot">
          <NavLink to="/" className="aopd-nav-link">← MaternalCare</NavLink>
          <p>{healthCenterName || 'Set health center name in Settings'}</p>
        </div>
      </aside>
      <div className="aopd-main">
        <header className="aopd-topbar">
          <button type="button" className="aopd-menu" onClick={() => setOpen((value) => !value)}>
            Menu
          </button>
          <div>
            <h1>Adult OPD Monthly Reporting System</h1>
            <p>Diagnosis → Age Group → Sex → Total. Age groups: 5–14, 15–29, 30–64, and ≥65.</p>
          </div>
        </header>
        {hasDemoRecords && (
          <div className="aopd-demo-banner" role="status">
            DEMO DATA — NOT REAL PATIENT DATA
          </div>
        )}
        <div className="aopd-content">{children}</div>
      </div>
    </div>
  );
}
