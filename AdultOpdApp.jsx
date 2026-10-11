import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import AdultOpdLayout from './components/common/AdultOpdLayout';
import { AdultOpdProvider, useAdultOpd } from './context/AdultOpdContext';
import Diagnoses from './pages/Diagnoses';
import Dashboard from './pages/Dashboard';
import MonthlyReport from './pages/MonthlyReport';
import PatientEntry from './pages/PatientEntry';
import PatientRecords from './pages/PatientRecords';
import SignIn from './pages/SignIn';
import Settings from './pages/Settings';
import YearlyReport from './pages/YearlyReport';
import { supabase, supabaseConfigError } from './services/supabase';
import './AdultOpd.css';

const ALLOWED_ROLES = new Set(['owner', 'admin', 'data_entry', 'viewer']);

function LoadingScreen({ message }) {
  return (
    <main className="aopd-auth-screen" aria-live="polite">
      <div className="aopd-auth-card">
        <span className="aopd-auth-mark" aria-hidden="true">OPD</span>
        <h1>Adult OPD</h1>
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
          {supabaseConfigError || 'The Supabase connection is not configured.'}
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
    } catch (error) {
      setSignOutError(error.message || 'Could not sign out. Please retry.');
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
  const [access, setAccess] = useState({ status: 'loading' });
  const [retryCount, setRetryCount] = useState(0);
  const authEventReceived = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived.current = true;
      if (!mounted) return;
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
    if (!supabase || !session?.user?.id) {
      setAccess({ status: 'signed_out' });
      return () => {
        cancelled = true;
      };
    }

    setAccess({ status: 'loading' });

    async function loadFacilityAccess() {
      const { data: authData, error: authUserError } = await supabase.auth.getUser();
      const userId = authData?.user?.id;
      if (import.meta.env.DEV) {
        console.info('[Adult OPD] Authenticated user UUID from supabase.auth.getUser():', userId ?? null);
      }
      if (authUserError) {
        if (import.meta.env.DEV) {
          console.error('[Adult OPD] Authenticated user lookup failed:', {
            code: authUserError.code,
            message: authUserError.message,
          });
        }
        throw new Error(`Could not verify the signed-in user: ${authUserError.message}`);
      }
      if (!userId) {
        throw new Error('No authenticated user was returned. Please sign in again.');
      }

      const membershipQuery = {
        table: 'facility_memberships',
        select: 'user_id, facility_id, role',
        filters: { user_id: userId },
      };
      if (import.meta.env.DEV) {
        console.info('[Adult OPD] Facility membership query:', membershipQuery);
      }

      const membershipResponse = await supabase
        .from('facility_memberships')
        .select(membershipQuery.select)
        .eq('user_id', userId);
      const { data: memberships, error: membershipError, status: membershipStatus } = membershipResponse;

      if (import.meta.env.DEV) {
        console.info('[Adult OPD] Facility membership query result:', {
          data: memberships,
          error: membershipError
            ? {
                message: membershipError.message,
                code: membershipError.code,
              }
            : null,
          status: membershipStatus,
        });
      }
      if (membershipError) {
        throw new Error(`Could not verify facility membership: ${membershipError.message}`);
      }
      if (memberships.length === 0) {
        throw new Error('No facility membership is visible to this account. Contact the facility administrator.');
      }
      if (import.meta.env.DEV) {
        console.info(
          '[Adult OPD] Facility membership UUID comparison:',
          memberships.map(({ user_id: membershipUserId }) => ({
            membershipUserId,
            matchesAuthenticatedUser: membershipUserId === userId,
          }))
        );
      }
      if (memberships.length !== 1) {
        throw new Error('Your account has more than one facility membership. Ask an administrator to resolve access before continuing.');
      }

      const membership = memberships[0];
      if (!ALLOWED_ROLES.has(membership.role)) {
        throw new Error('Your facility membership has an unsupported role. Contact the facility administrator.');
      }

      const { data: facilitySettings, error: settingsError } = await supabase
        .from('facility_settings')
        .select('health_center_name, region, zone, woreda, reporting_year, responsible_person_name, position')
        .eq('facility_id', membership.facility_id)
        .maybeSingle();

      if (settingsError) {
        if (import.meta.env.DEV) {
          console.error('[Adult OPD] Facility settings lookup failed:', {
            userId,
            facilityId: membership.facility_id,
            code: settingsError.code,
            message: settingsError.message,
            details: settingsError.details,
            hint: settingsError.hint,
          });
        }
        throw new Error(`Could not load facility settings: ${settingsError.message}`);
      }
      if (!facilitySettings) {
        throw new Error('Facility settings are missing. Contact the facility administrator.');
      }

      if (!cancelled) {
        setAccess({
          status: 'authorized',
          facilityId: membership.facility_id,
          role: membership.role,
          settings: {
            healthCenterName: facilitySettings.health_center_name,
            region: facilitySettings.region,
            zone: facilitySettings.zone,
            woreda: facilitySettings.woreda,
            reportingYear: facilitySettings.reporting_year,
            responsiblePersonName: facilitySettings.responsible_person_name,
            position: facilitySettings.position,
          },
        });
      }
    }

    loadFacilityAccess().catch((error) => {
      if (!cancelled) {
        if (import.meta.env.DEV) {
          console.error('[Adult OPD] Facility access verification failed:', error);
        }
        setAccess({ status: 'error', message: error.message || 'Unable to verify facility access.' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [session, retryCount]);

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
        message={`${authError} Check your network connection and retry.`}
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
      />
    );
  }

  if (!session) {
    return <SignIn />;
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

  if (access.status !== 'authorized') {
    return <LoadingScreen message="Preparing your workspace." />;
  }

  return (
    <AdultOpdProvider initialSettings={access.settings} facilityId={access.facilityId}>
      <AdultOpdRoutes
        facilityId={access.facilityId}
        role={access.role}
        userEmail={session.user.email}
        onSignOut={handleSignOut}
      />
    </AdultOpdProvider>
  );
}

function AdultOpdRoutes({ facilityId, role, userEmail, onSignOut, isLocalDemo = false }) {
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
      role={role}
      userEmail={userEmail}
      onSignOut={onSignOut}
      isLocalDemo={isLocalDemo}
      syncError={syncError}
    >
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
  return <AuthGate />;
}
