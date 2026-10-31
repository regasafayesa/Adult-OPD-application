import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AdultOpdLayout from './components/common/AdultOpdLayout';
import { AdultOpdProvider, useAdultOpd } from './context/AdultOpdContext';
import Diagnoses from './pages/Diagnoses';
import Dashboard from './pages/Dashboard';
import MonthlyReport from './pages/MonthlyReport';
import AggregateEntry from './pages/AggregateEntry';
import DocumentScanner from './pages/DocumentScanner';
import PatientEntry from './pages/PatientEntry';
import PatientRecords from './pages/PatientRecords';
import SignIn from './pages/SignIn';
import Settings from './pages/Settings';
import YearlyReport from './pages/YearlyReport';
import FacilityAccess, { PlatformAdminRequests } from './pages/FacilityAccess';
import FacilityMembers from './pages/FacilityMembers';
import Help from './pages/Help';
import { isPlatformAdmin } from './services/facilityAccess';
import { supabase, supabaseConfigError } from './services/supabase';
import './AdultOpd.css';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'data_entry', 'viewer']);

function sessionRecoveryMessage(error) {
  if (/expired|invalid.*(refresh )?token|refresh token/i.test(String(error?.message || ''))) {
    return 'Your saved sign-in session has expired or is no longer valid. Retry to restore it, or sign out and sign in again.';
  }
  return 'We could not restore your sign-in session. Check your connection and retry, or sign out and sign in again.';
}

function LoadingScreen({ message }) {
  return (
    <main className="aopd-auth-screen" aria-live="polite">
      <div className="aopd-auth-card">
        <span className="aopd-auth-mark" aria-hidden="true">OPD</span>
        <h1>OPD</h1>
        <p>{message}</p>
        <div className="aopd-auth-loading" role="status">Loading…</div>
      </div>
    </main>
  );
}

function ConfigurationIssue() {
  return (
    <main className="aopd-auth-screen">
      <section className="aopd-auth-card" aria-labelledby="aopd-config-heading">
        <span className="aopd-auth-mark" aria-hidden="true">OPD</span>
        <h1 id="aopd-config-heading">App configuration required</h1>
        <p className="aopd-auth-description">
          {supabaseConfigError || 'The cloud connection is not configured.'}
        </p>
        <p className="aopd-auth-description">
          In your Vercel project, add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> under Environment Variables,
          then redeploy the latest deployment.
        </p>
        <p className="aopd-auth-description">
          For local development, set both values in your <code>.env</code> file
          and restart the development server.
        </p>
      </section>
    </main>
  );
}

function AccessIssue({ title, message, onRetry, onSignOut, loading }) {
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await onSignOut();
    } catch {
      setSignOutError('Could not sign out. Check your connection and try again.');
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className="aopd-auth-screen" aria-live="polite">
      <div className="aopd-auth-card">
        <span className="aopd-auth-mark" aria-hidden="true">OPD</span>
        <h1>{title}</h1>
        <p className="aopd-auth-description">{message}</p>
        {signOutError && <p className="aopd-auth-error" role="alert">{signOutError}</p>}
        <div className="aopd-auth-actions">
          {onRetry && (
            <button type="button" className="aopd-auth-button" onClick={onRetry} disabled={loading}>
              {loading ? 'Retrying…' : 'Retry'}
            </button>
          )}
          {onSignOut && (
            <button type="button" className="aopd-auth-secondary" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

function AuthGate() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [passwordResetNotice, setPasswordResetNotice] = useState('');
  const [access, setAccess] = useState({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const authEventReceived = useRef(false);
  const sessionUserId = session?.user?.id;

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived.current = true;
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setSession(nextSession);
      setAuthError('');
      setAuthLoading(false);
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted || authEventReceived.current) return;
        if (error) {
          setAuthError(error.message || 'Unable to restore your sign-in session.');
        } else {
          setSession(data.session);
        }
        setAuthLoading(false);
      })
      .catch((error) => {
        if (!mounted || authEventReceived.current) return;
        setAuthError(error.message || 'Unable to restore your sign-in session. Check your connection.');
        setAuthLoading(false);
      });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || !sessionUserId) {
      setAccess({ status: 'signed_out' });
      return () => {
        cancelled = true;
      };
    }

    setAccess({ status: 'loading' });

    async function loadFacilityAccess() {
      const { data: authData, error: authUserError } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (authUserError) {
        throw new Error('We could not verify your sign-in session. Sign out and sign in again.');
      }
      if (!userId) {
        throw new Error('No authenticated user was returned. Please sign in again.');
      }

      const [membershipResponse, platformAdmin] = await Promise.all([
        supabase
          .from('facility_memberships')
          .select('user_id, facility_id, role')
          .eq('user_id', userId),
        isPlatformAdmin(),
      ]);
      const { data: memberships, error: membershipError } = membershipResponse;
      if (membershipError) {
        throw new Error('We could not verify facility access. Check your connection and retry, or contact your facility administrator.');
      }
      if (!memberships?.length) {
        if (!cancelled) setAccess({ status: 'no_facility', isPlatformAdmin: platformAdmin });
        return;
      }

      if (memberships.some((membership) => !ALLOWED_ROLES.has(membership.role))) {
        throw new Error('Your facility membership has an unsupported role. Contact the facility administrator.');
      }

      const facilityIds = memberships.map(({ facility_id: facilityId }) => facilityId);
      const { data: settingsRows, error: settingsError } = await supabase
        .from('facility_settings')
        .select('facility_id, health_center_name, region, zone, woreda, reporting_year, responsible_person_name, position')
        .in('facility_id', facilityIds);

      if (settingsError) {
        throw new Error('We could not load the facility configuration. Retry or contact your facility administrator.');
      }
      const settingsByFacility = new Map((settingsRows || []).map((item) => [item.facility_id, item]));
      const facilities = memberships.map((membership) => {
        const facilitySettings = settingsByFacility.get(membership.facility_id);
        if (!facilitySettings) {
          throw new Error('Facility settings are missing. Contact the facility administrator.');
        }
        return {
          facilityId: membership.facility_id,
          role: membership.role,
          healthCenterName: facilitySettings.health_center_name,
          settings: {
            healthCenterName: facilitySettings.health_center_name,
            region: facilitySettings.region,
            zone: facilitySettings.zone,
            woreda: facilitySettings.woreda,
            reportingYear: facilitySettings.reporting_year,
            responsiblePersonName: facilitySettings.responsible_person_name,
            position: facilitySettings.position,
          },
        };
      });

      if (facilities.length > 1) {
        const requestedId = selectedFacilityId
          || window.sessionStorage.getItem('adult-opd-active-facility');
        const selectedFacility = facilities.find((item) => item.facilityId === requestedId);
        if (!selectedFacility) {
          if (requestedId) window.sessionStorage.removeItem('adult-opd-active-facility');
          if (!cancelled) {
            setAccess({ status: 'select_facility', facilities, isPlatformAdmin: platformAdmin });
          }
          return;
        }
        if (!cancelled) {
          setAccess({
            status: 'authorized',
            ...selectedFacility,
            facilities,
            isPlatformAdmin: platformAdmin,
          });
        }
        return;
      }

      if (!cancelled) {
        setAccess({
          status: 'authorized',
          ...facilities[0],
          facilities,
          isPlatformAdmin: platformAdmin,
        });
      }
    }

    loadFacilityAccess().catch((error) => {
      if (!cancelled) {
        setAccess({ status: 'error', message: error.message || 'Unable to verify facility access.' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId, retryCount, selectedFacilityId]);

  if (import.meta.env.DEV && (!supabase || import.meta.env.VITE_LOCAL_DEMO_MODE === 'true')) {
    return (
      <AdultOpdProvider>
        <AdultOpdRoutes role="local demo" userEmail="Local demo" isLocalDemo />
      </AdultOpdProvider>
    );
  }

  if (!supabase) {
    return <ConfigurationIssue />;
  }

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  if (authLoading) {
    return <LoadingScreen message="Restoring your secure sign-in session." />;
  }

  if (authError && !session) {
    return (
      <AccessIssue
        title="Session unavailable"
        message={sessionRecoveryMessage(authError)}
        onRetry={() => {
          setAuthError('');
          setAuthLoading(true);
          supabase.auth.getSession()
            .then(({ data, error }) => {
              if (error) setAuthError(error.message);
              else setSession(data.session);
              setAuthLoading(false);
            })
            .catch((error) => {
              setAuthError(error.message || 'Unable to restore your session.');
              setAuthLoading(false);
            });
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (passwordRecovery && session) {
    return (
      <SignIn
        recoveryMode
        onRecoveryComplete={async () => {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          setPasswordRecovery(false);
          setPasswordResetNotice('Your password has been updated. Sign in with your new password.');
        }}
      />
    );
  }

  if (!session) {
    return (
      <SignIn
        resetNotice={passwordResetNotice}
        onLoginSuccess={() => setPasswordResetNotice('')}
      />
    );
  }

  if (access.status === 'loading') {
    return <LoadingScreen message="Verifying your facility membership." />;
  }

  if (access.status === 'error') {
    return (
      <AccessIssue
        title="Facility access unavailable"
        message={access.message}
        onRetry={() => setRetryCount((count) => count + 1)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (access.status === 'no_facility') {
    return (
      <FacilityAccess
        userId={session.user.id}
        isPlatformAdmin={access.isPlatformAdmin}
        onAccessChanged={() => setRetryCount((count) => count + 1)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (access.status === 'select_facility') {
    return (
      <FacilitySelection
        facilities={access.facilities}
        onSelect={(facilityId) => {
          window.sessionStorage.setItem('adult-opd-active-facility', facilityId);
          setSelectedFacilityId(facilityId);
        }}
        onSignOut={handleSignOut}
      />
    );
  }

  if (access.status !== 'authorized') {
    return <LoadingScreen message="Preparing your workspace." />;
  }

  return (
    <AdultOpdProvider
      key={access.facilityId}
      initialSettings={access.settings}
      facilityId={access.facilityId}
      role={access.role}
    >
      <AdultOpdRoutes
        facilityId={access.facilityId}
        role={access.role}
        userEmail={session.user.email}
        onSignOut={handleSignOut}
        isPlatformAdmin={access.isPlatformAdmin}
        facilities={access.facilities}
        onFacilityChange={(facilityId) => {
          window.sessionStorage.setItem('adult-opd-active-facility', facilityId);
          setSelectedFacilityId(facilityId);
        }}
      />
    </AdultOpdProvider>
  );
}

function FacilitySelection({ facilities, onSelect, onSignOut }) {
  return (
    <main className="aopd-auth-screen">
      <section className="aopd-auth-card">
        <h1>Select a facility</h1>
        <p className="aopd-auth-description">Choose an authorized facility workspace. Your access is checked by the database for every request.</p>
        <div className="aopd-facility-choice-list">
          {facilities.map((facility) => (
            <button
              type="button"
              className="aopd-facility-choice"
              key={facility.facilityId}
              onClick={() => onSelect(facility.facilityId)}
            >
              <strong>{facility.healthCenterName || 'Health facility'}</strong>
              <span>{facility.settings.region} · {facility.role}</span>
            </button>
          ))}
        </div>
        <button type="button" className="aopd-auth-secondary" onClick={onSignOut}>Sign out</button>
      </section>
    </main>
  );
}

function AdultOpdRoutes({
  facilityId,
  role,
  userEmail,
  onSignOut,
  isPlatformAdmin = false,
  facilities = [],
  onFacilityChange,
  isLocalDemo = false,
}) {
  const { hasDemoRecords, settings, syncStatus, syncError } = useAdultOpd();

  if (syncStatus === 'loading') {
    return <LoadingScreen message="Loading records shared by your facility." />;
  }

  return (
    <AdultOpdLayout
      NavLink={NavLink}
      hasDemoRecords={hasDemoRecords}
      healthCenterName={settings.healthCenterName}
      facilityId={facilityId}
      facilities={facilities}
      onFacilityChange={onFacilityChange}
      role={role}
      isPlatformAdmin={isPlatformAdmin}
      userEmail={userEmail}
      onSignOut={onSignOut}
      isLocalDemo={isLocalDemo}
      syncError={syncError}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/adult-opd" replace />} />
        <Route path="/adult-opd" element={<Dashboard />} />
        <Route path="/adult-opd/entry" element={role === 'viewer' ? <Navigate to="/adult-opd" replace /> : <PatientEntry />} />
        <Route path="/adult-opd/aggregate-entry" element={role === 'viewer' ? <Navigate to="/adult-opd" replace /> : <AggregateEntry />} />
        <Route path="/adult-opd/document-scanner" element={['owner', 'admin', 'data_entry'].includes(role) ? <DocumentScanner /> : <Navigate to="/adult-opd" replace />} />
        <Route path="/adult-opd/records" element={<PatientRecords />} />
        <Route path="/adult-opd/monthly" element={<MonthlyReport />} />
        <Route path="/adult-opd/yearly" element={<YearlyReport />} />
        <Route path="/adult-opd/diagnoses" element={<Diagnoses />} />
        <Route path="/adult-opd/settings" element={<Settings />} />
        <Route path="/adult-opd/help" element={<Help />} />
        <Route path="/adult-opd/members" element={role === 'owner' || role === 'admin' ? <FacilityMembers /> : <Navigate to="/adult-opd" replace />} />
        <Route path="/adult-opd/platform-admin" element={isPlatformAdmin ? <PlatformAdminRequests /> : <Navigate to="/adult-opd" replace />} />
        <Route path="*" element={<Navigate to="/adult-opd" replace />} />
      </Routes>
    </AdultOpdLayout>
  );
}

export default function AdultOpdApp() {
  return <AuthGate />;
}
