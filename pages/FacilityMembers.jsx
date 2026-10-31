import React, { useCallback, useEffect, useState } from 'react';
import { useAdultOpd } from '../context/AdultOpdContext';
import {
  inviteFacilityMember,
  listFacilityInvitations,
  listFacilityMembers,
  removeFacilityMember,
  revokeFacilityInvitation,
} from '../services/facilityAccess';
import { formatDisplayDate } from '../utils/dates';

export default function FacilityMembers() {
  const { facilityId, role } = useAdultOpd();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('data_entry');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        listFacilityMembers(facilityId),
        listFacilityInvitations(facilityId),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (loadError) {
      setError(loadError.message || 'Could not load facility members.');
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleInvite(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await inviteFacilityMember(facilityId, email, inviteRole);
      setEmail('');
      setNotice(`Invitation recorded for ${email.trim()}. The staff member must create or sign in to a verified account with that email and accept the invitation.`);
      await refresh();
    } catch (inviteError) {
      setError(inviteError.message || 'Could not invite this staff member.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(member) {
    if (!window.confirm(`Remove ${member.email} from this facility? This does not remove their access to any other facility.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await removeFacilityMember(facilityId, member.user_id);
      setNotice(`${member.email} no longer has access to this facility.`);
      await refresh();
    } catch (removeError) {
      setError(removeError.message || 'Could not remove this facility member.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(invitation) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await revokeFacilityInvitation(invitation.id);
      setNotice(`The invitation to ${invitation.email} was revoked.`);
      await refresh();
    } catch (revokeError) {
      setError(revokeError.message || 'Could not revoke this invitation.');
    } finally {
      setBusy(false);
    }
  }

  const inviteRoles = role === 'owner'
    ? ['admin', 'data_entry', 'viewer']
    : ['data_entry', 'viewer'];

  return (
    <div className="aopd-page">
      <h2>Facility members</h2>
      <p className="aopd-lede">
        Invitations and membership changes apply only to the active facility. New staff must accept an invitation using a verified account with the invited email.
      </p>
      {error && <p className="aopd-error" role="alert">{error}</p>}
      {notice && <p className="aopd-success" role="status">{notice}</p>}

      <section className="aopd-panel">
        <h3>Invite staff</h3>
        <form className="aopd-inline-form" onSubmit={handleInvite}>
          <label>
            Staff email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={busy} />
          </label>
          <label>
            Facility role
            <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={busy}>
              {inviteRoles.map((availableRole) => <option key={availableRole} value={availableRole}>{availableRole}</option>)}
            </select>
          </label>
          <button type="submit" className="aopd-btn" disabled={busy}>
            {busy ? 'Saving…' : 'Create invitation'}
          </button>
        </form>
      </section>

      <section className="aopd-panel">
        <h3>Current members</h3>
        {loading && <p role="status">Loading facility members…</p>}
        {!loading && members.length === 0 && <p>No members were returned for this facility.</p>}
        {!loading && members.length > 0 && (
          <div className="aopd-table-wrap">
            <table>
              <thead><tr><th>Email</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.user_id}>
                    <td>{member.email || 'Email unavailable'}</td>
                    <td>{member.role}</td>
                    <td>{formatDisplayDate(member.created_at?.slice(0, 10))}</td>
                    <td>
                      {member.role !== 'owner' && (role === 'owner' || member.role !== 'admin') ? (
                        <button type="button" className="danger-text" onClick={() => handleRemove(member)} disabled={busy}>
                          Remove
                        </button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="aopd-panel">
        <h3>Pending invitations</h3>
        {!loading && invitations.length === 0 && <p>No pending invitations.</p>}
        {invitations.map((invitation) => (
          <div className="aopd-invitation-row" key={invitation.id}>
            <div><strong>{invitation.email}</strong><p>{invitation.role}</p></div>
            <button type="button" className="aopd-btn secondary" onClick={() => handleRevoke(invitation)} disabled={busy}>
              Revoke
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
