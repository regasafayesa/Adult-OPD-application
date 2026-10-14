import React from 'react';
import DeveloperCredit from './DeveloperCredit';

const NAV_ITEMS = [
  { to: '/adult-opd', label: 'Dashboard', end: true },
  { to: '/adult-opd/entry', label: 'Patient Entry' },
  { to: '/adult-opd/records', label: 'Patient Records' },
  { to: '/adult-opd/monthly', label: 'Monthly Report' },
  { to: '/adult-opd/yearly', label: 'Yearly Report' },
  { to: '/adult-opd/diagnoses', label: 'Diagnoses' },
  { to: '/adult-opd/settings', label: 'Settings' },
];

export default function AdultOpdLayout({
  children,
  NavLink,
  hasDemoRecords,
  healthCenterName,
  role,
  userEmail,
  onSignOut,
  isLocalDemo = false,
  syncError = '',
}) {
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState('');

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await onSignOut();
    } catch (error) {
      setSignOutError(error.message || 'Could not sign out. Please retry.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="aopd-shell">
      <aside className={`aopd-sidebar ${open ? 'is-open' : ''}`}>
        <div className="aopd-brand">
          <strong>Adult OPD</strong>
          <span>Monthly Reporting System</span>
        </div>
        <nav>
          {NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)).map((item) => (
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
          <NavLink to="/" className="aopd-nav-link">← Dashboard</NavLink>
          <p>{healthCenterName || 'Set health center name in Settings'}</p>
        </div>
      </aside>
      <div className="aopd-main">
        <header className="aopd-topbar">
          <button
            type="button"
            className="aopd-menu"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          >
            Menu
          </button>
          <div className="aopd-topbar-heading">
            <span className="aopd-topbar-mark" aria-hidden="true">OPD</span>
            <h1>Adult OPD Monthly Reporting System</h1>
          </div>
          <div className="aopd-account">
            <span className="aopd-account-email" title={userEmail}>{userEmail}</span>
            <span className="aopd-account-role">{role}</span>
            {onSignOut && (
              <button type="button" onClick={handleSignOut} disabled={signingOut} className="aopd-signout">
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </div>
        </header>
        {signOutError && <p className="aopd-auth-error aopd-signout-error" role="alert">{signOutError}</p>}
        <div className="aopd-local-data-notice" role="status">
          {isLocalDemo
            ? 'LOCAL DEMO MODE — sign-in is bypassed. Changes are saved only in this browser and are not synced.'
            : 'Encounters, diagnoses, and facility settings are shared with authorized members through Supabase.'}
        </div>
        {syncError && <p className="aopd-auth-error" role="alert">Cloud sync failed: {syncError}</p>}
        {hasDemoRecords && (
          <div className="aopd-demo-banner" role="status">
            DEMO DATA — NOT REAL PATIENT DATA
          </div>
        )}
        <div className="aopd-content">{children}</div>
        <DeveloperCredit />
      </div>
    </div>
  );
}
