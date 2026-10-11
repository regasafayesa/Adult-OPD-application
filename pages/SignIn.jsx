import React, { useState } from 'react';
import { supabase } from '../services/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch (signInError) {
      setError(signInError.message || 'Sign-in failed. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="aopd-auth-screen">
      <section className="aopd-auth-card aopd-auth-login-card" aria-label="Adult OPD secure sign-in">
        <div className="aopd-auth-welcome">
          <div className="aopd-auth-brand">
            <span className="aopd-auth-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path d="M20 8h8v12h12v8H28v12h-8V28H8v-8h12z" />
              </svg>
            </span>
            <span>
              <strong>Adult OPD</strong>
              <small>Health center reporting</small>
            </span>
          </div>
          <div className="aopd-auth-welcome-copy">
            <span className="aopd-auth-eyebrow">YOUR CARE, ORGANIZED</span>
            <h1>Clear records.<br />Better care.</h1>
            <p>Sign in to access your facility’s outpatient reporting workspace.</p>
          </div>
          <div className="aopd-auth-welcome-foot">
            <span className="aopd-auth-status-dot" />
            Secure access for authorized facility staff
          </div>
          <div className="aopd-auth-decoration" aria-hidden="true">
            <span className="aopd-auth-orbit aopd-auth-orbit-one" />
            <span className="aopd-auth-orbit aopd-auth-orbit-two" />
            <span className="aopd-auth-cross">+</span>
          </div>
        </div>

        <div className="aopd-auth-form-panel">
          <div className="aopd-auth-form-heading">
            <span className="aopd-auth-mobile-mark" aria-hidden="true">OPD</span>
            <span className="aopd-auth-eyebrow">WELCOME BACK</span>
            <h2 id="aopd-signin-heading">Sign in to your account</h2>
            <p>Enter the credentials provided by your facility administrator.</p>
          </div>
          <form className="aopd-auth-form" onSubmit={handleSubmit}>
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

            <div className="aopd-auth-password-label">
              <label htmlFor="aopd-password">Password</label>
            </div>
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

            {error && (
              <p className="aopd-auth-error" role="alert">
                <strong>Sign-in failed.</strong> {error}
              </p>
            )}
            <button className="aopd-auth-button" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="aopd-auth-spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                <>Sign in <span aria-hidden="true">→</span></>
              )}
            </button>
          </form>
          <div className="aopd-auth-security-note">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span>Private, secure access<br /><small>Your account is managed by your facility.</small></span>
          </div>
          <p className="aopd-auth-admin-note">
            Need an account? Contact your facility administrator. Public signup is disabled.
          </p>
        </div>
      </section>
    </main>
  );
}
