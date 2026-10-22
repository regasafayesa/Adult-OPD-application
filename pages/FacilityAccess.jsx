import React, { useCallback, useEffect, useState } from 'react';
import {
  acceptFacilityInvitation,
  approveFacilityRegistration,
  listMyFacilityInvitations,
  listMyFacilityRegistrations,
  listPendingFacilityRegistrations,
  rejectFacilityRegistration,
  submitFacilityRegistration,
} from '../services/facilityAccess';

const facilityTypes = [
  'Health Center',
  'Health Post',
  'Primary Hospital',
  'General Hospital',
  'Specialized Hospital',
  'Other',
];

function RegistrationReviewPanel() {
  const [requests, setRequests] = useState([]);
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRequests(await listPendingFacilityRegistrations());
    } catch (loadError) {
      setError(loadError.message || 'Could not load facility registration requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleApprove(request) {
    setBusyId(request.id);
    setError('');
    setNotice('');
    try {
      await approveFacilityRegistration(request.id);
      setNotice(`${request.facility_name} was approved and its owner membership was created.`);
      await refresh();
    } catch (approvalError) {
      setError(approvalError.message || 'Could not approve this facility request.');
    } finally {
      setBusyId('');
    }
  }

  async function handleReject(request) {
    const reason = String(reasons[request.id] || '').trim();
    if (!reason) {
      setError('Enter a reason before rejecting a facility request.');
      return;
    }
    setBusyId(request.id);
    setError('');
    setNotice('');
    try {
      await rejectFacilityRegistration(request.id, reason);
      setNotice(`${request.facility_name} was rejected. The requester can see the reason.`);
      await refresh();
    } catch (rejectError) {
      setError(rejectError.message || 'Could not reject this facility request.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="aopd-panel">
      <h2>Facility registration approvals</h2>
      <p>Approvals create a new facility and its first owner membership in one database transaction.</p>
      {error && <p className="aopd-error" role="alert">{error}</p>}
      {notice && <p className="aopd-success" role="status">{notice}</p>}
      {loading && <p role="status">Loading facility requests…</p>}
      {!loading && requests.length === 0 && <p>No facility requests are awaiting review.</p>}
      {requests.map((request) => (
        <article className="aopd-panel" key={request.id}>
          <h3>{request.facility_name}</h3>
          <p>
            {request.facility_type}
            {request.facility_code ? ` · Code ${request.facility_code}` : ''}
          </p>
          <p>{request.region} · {request.zone} · {request.woreda}</p>
          <p>Contact: {request.contact_email}{request.contact_phone ? ` · ${request.contact_phone}` : ''}</p>
          <p>Reporting year: {request.reporting_year}</p>
          <p>Requester: {request.requested_by}</p>
          <label>
            Rejection reason
            <input
              value={reasons[request.id] || ''}
              onChange={(event) => setReasons((previous) => ({
                ...previous,
                [request.id]: event.target.value,
              }))}
              maxLength={500}
              disabled={busyId === request.id}
            />
          </label>
          <div className="aopd-actions">
            <button
              type="button"
              className="aopd-btn"
              onClick={() => handleApprove(request)}
              disabled={Boolean(busyId)}
            >
              {busyId === request.id ? 'Processing…' : 'Approve facility'}
            </button>
            <button
              type="button"
              className="aopd-btn danger"
              onClick={() => handleReject(request)}
              disabled={Boolean(busyId)}
            >
              Reject request
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

export function PlatformAdminRequests() {
  return (
    <div className="aopd-page">
      <h2>Platform administration</h2>
      <p className="aopd-lede">Review new facility registration requests. Facility records and memberships remain isolated.</p>
      <RegistrationReviewPanel />
    </div>
  );
}

export default function FacilityAccess({
  userId,
  isPlatformAdmin,
  onAccessChanged,
  onSignOut,
}) {
  const [requests, setRequests] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState({
    facilityName: '',
    facilityCode: '',
    region: '',
    zone: '',
    woreda: '',
    facilityType: 'Health Center',
    contactEmail: '',
    contactPhone: '',
    reportingYear: String(new Date().getFullYear()),
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextRequests, nextInvitations] = await Promise.all([
        listMyFacilityRegistrations(userId),
        listMyFacilityInvitations(),
      ]);
      setRequests(nextRequests);
      setInvitations(nextInvitations);
    } catch (loadError) {
      setError(loadError.message || 'Could not load your facility access requests.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await submitFacilityRegistration(form);
      setNotice('Facility request submitted. Access will be available after an authorized platform administrator approves it.');
      await refresh();
    } catch (submitError) {
      setError(submitError.message || 'Could not submit the facility registration request.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(invitation) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await acceptFacilityInvitation(invitation.invitation_id);
      setNotice(`You joined ${invitation.facility_name}. Loading your authorized workspace…`);
      await onAccessChanged();
    } catch (acceptError) {
      setError(acceptError.message || 'Could not accept this facility invitation.');
      setBusy(false);
    }
  }

  const pendingRequest = requests.find((request) => request.status === 'pending');

  return (
    <main className="aopd-auth-screen">
      <section className="aopd-auth-card aopd-access-card">
        <h1>Facility access</h1>
        <p className="aopd-auth-description">
          Your account does not yet have a facility membership. Register a facility for review or accept an invitation sent to your confirmed email address.
        </p>
        {error && <p className="aopd-auth-error" role="alert">{error}</p>}
        {notice && <p className="aopd-auth-notice" role="status">{notice}</p>}
        {loading && <p role="status">Checking your registration and invitations…</p>}

        {!loading && requests.map((request) => (
          <section className="aopd-panel" key={request.id}>
            <h2>{request.facility_name}</h2>
            <p>
              Request status:{' '}
              <strong>
                {request.status === 'pending'
                  ? 'Awaiting approval'
                  : request.status === 'approved'
                    ? 'Approved'
                    : 'Rejected'}
              </strong>
            </p>
            {request.status === 'rejected' && request.rejection_reason && (
              <p>Reason: {request.rejection_reason}</p>
            )}
          </section>
        ))}

        {!loading && invitations.length > 0 && (
          <section className="aopd-panel">
            <h2>Facility invitations</h2>
            {invitations.map((invitation) => (
              <div className="aopd-invitation-row" key={invitation.invitation_id}>
                <div>
                  <strong>{invitation.facility_name}</strong>
                  <p>Role: {invitation.role}</p>
                </div>
                <button
                  type="button"
                  className="aopd-btn"
                  onClick={() => handleAccept(invitation)}
                  disabled={busy}
                >
                  Accept invitation
                </button>
              </div>
            ))}
          </section>
        )}

        {!loading && !pendingRequest && (
          <section className="aopd-panel">
            <h2>Register a health facility</h2>
            <form className="aopd-settings" onSubmit={handleSubmit}>
              <label>
                Official health facility name
                <input
                  required
                  maxLength={200}
                  value={form.facilityName}
                  onChange={(event) => setForm({ ...form, facilityName: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Unique facility code (if available)
                <input
                  maxLength={80}
                  value={form.facilityCode}
                  onChange={(event) => setForm({ ...form, facilityCode: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Region
                <input required maxLength={120} value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} disabled={busy} />
              </label>
              <label>
                Zone
                <input required maxLength={120} value={form.zone} onChange={(event) => setForm({ ...form, zone: event.target.value })} disabled={busy} />
              </label>
              <label>
                Woreda
                <input required maxLength={120} value={form.woreda} onChange={(event) => setForm({ ...form, woreda: event.target.value })} disabled={busy} />
              </label>
              <label>
                Facility type
                <select value={form.facilityType} onChange={(event) => setForm({ ...form, facilityType: event.target.value })} disabled={busy}>
                  {facilityTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label>
                Contact email
                <input required type="email" maxLength={254} value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} disabled={busy} />
              </label>
              <label>
                Contact phone (optional)
                <input type="tel" maxLength={40} value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} disabled={busy} />
              </label>
              <label>
                Reporting year
                <input required type="number" min="1" max="9999" step="1" value={form.reportingYear} onChange={(event) => setForm({ ...form, reportingYear: event.target.value })} disabled={busy} />
              </label>
              <button type="submit" className="aopd-btn" disabled={busy}>
                {busy ? 'Submitting…' : 'Submit for approval'}
              </button>
            </form>
          </section>
        )}

        {isPlatformAdmin && !loading && <RegistrationReviewPanel />}

        <button type="button" className="aopd-auth-secondary" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </main>
  );
}
