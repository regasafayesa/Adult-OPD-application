import React, { useRef, useState } from 'react';
import { supabase } from '../services/supabase';

function friendlyAuthError(authError) {
  const message = String(authError?.message || '');
  const status = Number(authError?.status);
  if (/invalid login credentials/i.test(message)) {
    return 'The email address or password is incorrect. Check your details and try again.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'This account’s email address has not been confirmed. Contact your facility administrator.';
  }
  if (/too many requests|rate limit/i.test(message) || status === 429) {
    return 'There have been too many requests. Wait a moment and try again.';
  }
  if (/failed to fetch|network|fetch|timeout/i.test(message)) {
    return 'We could not reach the sign-in service. Check your internet connection and try again.';
  }
  if (/expired|invalid.*(token|session)|token.*(expired|invalid)/i.test(message)) {
    return 'This recovery link or session is no longer valid. Request a new password reset link.';
  }
  if (status >= 500) {
    return 'The sign-in service is temporarily unavailable. Please try again shortly.';
  }
  return 'We could not complete your request. Please try again or contact your facility administrator.';
}

function HealthcareMark() {
  return (
    <span className="aopd-login-health-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40">
        <rect x="2" y="2" width="36" height="36" rx="11" />
        <path d="M20 11v18M11 20h18" />
      </svg>
    </span>
  );
}

export default function SignIn({
  recoveryMode = false,
  onRecoveryComplete,
  onLoginSuccess,
  resetNotice = '',
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formMode, setFormMode] = useState('signIn');
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const submittingRef = useRef(false);

  function validateEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return 'Enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      return 'Enter a valid email address, such as name@facility.org.';
    }
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;

    setError('');
    setNotice('');
    const emailError = validateEmail();
    if (emailError && !recoveryMode) {
      setError(emailError);
      return;
    }
    if (!supabase) {
      setError('The sign-in service is unavailable. Contact your system administrator.');
      return;
    }
    if (recoveryMode && passwordUpdated) {
      submittingRef.current = true;
      setSubmitting(true);
      try {
        await onRecoveryComplete();
      } catch {
        setError('Your password was updated, but this recovery session could not be closed. Please try again.');
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
      return;
    }

    if (recoveryMode) {
      if (password.length < 8) {
        setError('Choose a password with at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The passwords do not match. Check both fields and try again.');
        return;
      }
    } else if (formMode === 'signIn' && !password) {
      setError('Enter your password.');
      return;
    } else if (formMode === 'createAccount' && password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    } else if (formMode === 'createAccount' && password !== confirmPassword) {
      setError('The passwords do not match. Check both fields and try again.');
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (recoveryMode) {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPasswordUpdated(true);
        setNotice('Your password has been updated. Continue to return to sign in.');
        return;
      }

      if (formMode === 'reset') {
        const redirectTo = `${window.location.origin}${window.location.pathname}`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (resetError) throw resetError;
        setNotice('If an account exists for that email address, password reset instructions have been sent.');
        return;
      }

      if (formMode === 'createAccount') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          onLoginSuccess?.();
        } else {
          setNotice('Your account was created. Confirm your email, then sign in to register a health facility or accept an invitation.');
        }
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      onLoginSuccess?.();
    } catch (authError) {
      setError(friendlyAuthError(authError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const isResetRequest = formMode === 'reset' && !recoveryMode;
  const isCreateAccount = formMode === 'createAccount' && !recoveryMode;

  return (
    <main className="aopd-auth-screen">
      <section className="aopd-login-card" aria-labelledby="aopd-signin-heading">
        <header className="aopd-login-header">
          <HealthcareMark />
          <p className="aopd-login-overline">HEALTH FACILITY REPORTING</p>
          <h1 id="aopd-signin-heading">OPD Monthly Reporting System</h1>
          <p className="aopd-login-subtitle">Health Facility Reporting and Data Management.</p>
        </header>

        <div className="aopd-login-divider" aria-hidden="true" />

        <div className="aopd-auth-form-panel">
          <div className="aopd-auth-form-heading">
            <h2>
              {recoveryMode
                ? 'Set a new password'
                : isResetRequest
                  ? 'Reset your password'
                  : isCreateAccount
                    ? 'Create your account'
                  : 'Sign in to your account'}
            </h2>
            <p>
              {recoveryMode
                ? 'Choose a new password for your account.'
                : isResetRequest
                  ? 'Enter your account email address to receive password reset instructions.'
                  : isCreateAccount
                    ? 'Create an account to request a new facility or accept a facility invitation.'
                  : 'Use the credentials provided by your facility administrator.'}
            </p>
          </div>

          {resetNotice && !recoveryMode && (
            <p className="aopd-auth-notice" role="status">{resetNotice}</p>
          )}

          <form
            className="aopd-auth-form"
            onSubmit={handleSubmit}
            aria-describedby={error ? 'aopd-login-error' : undefined}
            noValidate
          >
            {!recoveryMode && (
              <>
                <label htmlFor="aopd-email">Email address</label>
                <div className="aopd-auth-input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="m4 7 8 6 8-6" />
                  </svg>
                  <input
                    id="aopd-email"
                    type="email"
                    autoComplete="username"
                    placeholder="name@facility.org"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
              </>
            )}

            {recoveryMode && (
              <>
                <label htmlFor="aopd-password">New password</label>
                <div className="aopd-auth-input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="10" width="16" height="11" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
                  </svg>
                  <input
                    id="aopd-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={submitting || passwordUpdated}
                  />
                </div>
                <label htmlFor="aopd-confirm-password">Confirm new password</label>
                <div className="aopd-auth-input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="10" width="16" height="11" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
                  </svg>
                  <input
                    id="aopd-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Enter your new password again"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    disabled={submitting || passwordUpdated}
                  />
                  <button
                    type="button"
                    className="aopd-auth-show-password"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={submitting || passwordUpdated}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </>
            )}

            {!recoveryMode && !isResetRequest && (
              <>
                <label htmlFor="aopd-password">Password</label>
                <div className="aopd-auth-input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="10" width="16" height="11" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
                  </svg>
                  <input
                    id="aopd-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="aopd-auth-show-password"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    disabled={submitting}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </>
            )}
            {isCreateAccount && (
              <>
                <label htmlFor="aopd-confirm-password">Confirm password</label>
                <div className="aopd-auth-input-wrap">
                  <input
                    id="aopd-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Enter your password again"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
              </>
            )}

            {error && (
              <p className="aopd-auth-error" id="aopd-login-error" role="alert">
                {error}
              </p>
            )}
            {notice && !recoveryMode && !resetNotice && (
              <p className="aopd-auth-notice" role="status">{notice}</p>
            )}
            {recoveryMode && notice && (
              <p className="aopd-auth-notice" role="status">{notice}</p>
            )}
            <button className="aopd-auth-button" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="aopd-auth-spinner" aria-hidden="true" />
                  {recoveryMode ? 'Updating password…' : isResetRequest ? 'Sending instructions…' : isCreateAccount ? 'Creating account…' : 'Signing in…'}
                </>
              ) : recoveryMode ? (
                passwordUpdated ? 'Continue to sign in' : 'Update password'
              ) : isResetRequest ? (
                'Send reset instructions'
              ) : isCreateAccount ? (
                'Create account'
              ) : (
                <>Sign in <span aria-hidden="true">→</span></>
              )}
            </button>
          </form>

          {!recoveryMode && (
            <div className="aopd-auth-form-links">
              {isResetRequest || isCreateAccount ? (
                <button
                  type="button"
                  className="aopd-auth-text-link"
                  onClick={() => {
                    setFormMode('signIn');
                    setError('');
                    setNotice('');
                  }}
                  disabled={submitting}
                >
                  Return to sign in
                </button>
              ) : (
                <button
                  type="button"
                  className="aopd-auth-text-link"
                  onClick={() => {
                    setFormMode('reset');
                    setError('');
                    setNotice('');
                  }}
                  disabled={submitting}
                >
                  Forgot Password?
                </button>
              )}
              {!isResetRequest && !isCreateAccount && (
                <button
                  type="button"
                  className="aopd-auth-text-link"
                  onClick={() => {
                    setFormMode('createAccount');
                    setError('');
                    setNotice('');
                  }}
                  disabled={submitting}
                >
                  Create an account
                </button>
              )}
            </div>
          )}

          <div className="aopd-login-trust-note">
            <span className="aopd-login-lock" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
          </div>
          {!recoveryMode && (
            <p className="aopd-auth-admin-note">
              Creating an account does not grant access to any facility. You must receive an approved facility membership.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
