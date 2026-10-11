-- Grant all authenticated facility members full access to their own facility's
-- encounters, diagnoses, and settings. Facility membership and role writes
-- remain operator-only; members can still read only their own membership row.
begin;

create or replace function public.can_manage_facility(requested_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_facility_member(requested_facility_id);
$$;

create or replace function public.can_write_encounters(requested_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_facility_member(requested_facility_id);
$$;

drop policy if exists "Members can read own membership and admins can read facility memberships"
  on public.facility_memberships;
create policy "Members can read own membership"
  on public.facility_memberships for select to authenticated
  using (user_id = (select auth.uid()));

commit;
