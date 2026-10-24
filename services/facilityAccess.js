import { supabase } from './supabase';

function assertSupabase() {
  if (!supabase) throw new Error('The cloud connection is not configured.');
}

function unwrap(response) {
  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function isPlatformAdmin() {
  assertSupabase();
  return Boolean(unwrap(await supabase.rpc('is_platform_admin')));
}

export async function listMyFacilityRegistrations(userId) {
  assertSupabase();
  return unwrap(await supabase
    .from('facility_registration_requests')
    .select('id, facility_name, facility_code, status, rejection_reason, created_at, reviewed_at')
    .eq('requested_by', userId)
    .order('created_at', { ascending: false }));
}

export async function submitFacilityRegistration(form) {
  assertSupabase();
  return unwrap(await supabase.rpc('submit_facility_registration', {
    p_facility_name: form.facilityName.trim(),
    p_facility_code: form.facilityCode.trim() || null,
    p_region: form.region.trim(),
    p_zone: form.zone.trim(),
    p_woreda: form.woreda.trim(),
    p_facility_type: form.facilityType.trim(),
    p_contact_email: form.contactEmail.trim(),
    p_contact_phone: form.contactPhone.trim(),
    p_reporting_year: Number(form.reportingYear),
  }));
}

export async function listPendingFacilityRegistrations() {
  assertSupabase();
  return unwrap(await supabase
    .from('facility_registration_requests')
    .select('id, requested_by, facility_name, facility_code, region, zone, woreda, facility_type, contact_email, contact_phone, reporting_year, created_at')
    .eq('status', 'pending')
    .order('created_at'));
}

export async function approveFacilityRegistration(requestId) {
  assertSupabase();
  return unwrap(await supabase.rpc('approve_facility_registration', {
    p_request_id: requestId,
  }));
}

export async function rejectFacilityRegistration(requestId, reason) {
  assertSupabase();
  return unwrap(await supabase.rpc('reject_facility_registration', {
    p_request_id: requestId,
    p_reason: reason.trim(),
  }));
}

export async function listMyFacilityInvitations() {
  assertSupabase();
  return unwrap(await supabase.rpc('list_my_facility_invitations'));
}

export async function acceptFacilityInvitation(invitationId) {
  assertSupabase();
  return unwrap(await supabase.rpc('accept_facility_invitation', {
    p_invitation_id: invitationId,
  }));
}

export async function listFacilityMembers(facilityId) {
  assertSupabase();
  return unwrap(await supabase.rpc('list_facility_members', {
    p_facility_id: facilityId,
  }));
}

export async function listFacilityInvitations(facilityId) {
  assertSupabase();
  return unwrap(await supabase
    .from('facility_invitations')
    .select('id, email, role, status, created_at')
    .eq('facility_id', facilityId)
    .eq('status', 'pending')
    .order('created_at'));
}

export async function inviteFacilityMember(facilityId, email, role) {
  assertSupabase();
  return unwrap(await supabase.rpc('invite_facility_member', {
    p_facility_id: facilityId,
    p_email: email.trim(),
    p_role: role,
  }));
}

export async function revokeFacilityInvitation(invitationId) {
  assertSupabase();
  return unwrap(await supabase.rpc('revoke_facility_invitation', {
    p_invitation_id: invitationId,
  }));
}

export async function removeFacilityMember(facilityId, userId) {
  assertSupabase();
  return unwrap(await supabase.rpc('remove_facility_member', {
    p_facility_id: facilityId,
    p_user_id: userId,
  }));
}
