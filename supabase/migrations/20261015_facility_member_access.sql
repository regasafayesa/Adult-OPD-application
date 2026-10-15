-- Ensure every authenticated member can use all data within their facility.
-- Facility membership and role administration remain operator-only.
begin;

drop policy if exists "Facility members can read their facility"
  on public.facilities;
create policy "Facility members can read their facility"
  on public.facilities for select to authenticated
  using (public.is_facility_member(id));

drop policy if exists "Members can read own membership"
  on public.facility_memberships;
drop policy if exists "Members can read own membership and admins can read facility memberships"
  on public.facility_memberships;
create policy "Members can read own membership"
  on public.facility_memberships for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Facility members can read facility settings"
  on public.facility_settings;
drop policy if exists "Facility members can create settings"
  on public.facility_settings;
drop policy if exists "Facility members can update settings"
  on public.facility_settings;
create policy "Facility members can read facility settings"
  on public.facility_settings for select to authenticated
  using (public.is_facility_member(facility_id));
create policy "Facility members can create settings"
  on public.facility_settings for insert to authenticated
  with check (public.is_facility_member(facility_id));
create policy "Facility members can update settings"
  on public.facility_settings for update to authenticated
  using (public.is_facility_member(facility_id))
  with check (public.is_facility_member(facility_id));

drop policy if exists "Facility members can read diagnoses"
  on public.diagnoses;
drop policy if exists "Facility members can add diagnoses"
  on public.diagnoses;
drop policy if exists "Facility members can update diagnoses"
  on public.diagnoses;
create policy "Facility members can read diagnoses"
  on public.diagnoses for select to authenticated
  using (public.is_facility_member(facility_id));
create policy "Facility members can add diagnoses"
  on public.diagnoses for insert to authenticated
  with check (public.is_facility_member(facility_id) and not official);
create policy "Facility members can update diagnoses"
  on public.diagnoses for update to authenticated
  using (public.is_facility_member(facility_id) and not official)
  with check (public.is_facility_member(facility_id) and not official);

drop policy if exists "Facility members can read encounters"
  on public.encounters;
drop policy if exists "Facility members can add encounters"
  on public.encounters;
drop policy if exists "Facility members can update encounters"
  on public.encounters;
drop policy if exists "Facility members can delete encounters"
  on public.encounters;
create policy "Facility members can read encounters"
  on public.encounters for select to authenticated
  using (public.is_facility_member(facility_id));
create policy "Facility members can add encounters"
  on public.encounters for insert to authenticated
  with check (public.is_facility_member(facility_id));
create policy "Facility members can update encounters"
  on public.encounters for update to authenticated
  using (public.is_facility_member(facility_id))
  with check (public.is_facility_member(facility_id));
create policy "Facility members can delete encounters"
  on public.encounters for delete to authenticated
  using (public.is_facility_member(facility_id));

revoke all on public.diagnoses from public, anon, authenticated;

grant select on public.facilities, public.facility_memberships,
  public.facility_settings, public.diagnoses, public.encounters
  to authenticated;
grant insert (
  facility_id, health_center_name, region, zone, woreda, reporting_year,
  responsible_person_name, position, demo_loaded
) on public.facility_settings to authenticated;
grant update (
  health_center_name, region, zone, woreda, reporting_year,
  responsible_person_name, position, demo_loaded
) on public.facility_settings to authenticated;
grant insert (facility_id, id, name, active)
  on public.diagnoses to authenticated;
grant update (name, active)
  on public.diagnoses to authenticated;
grant insert (
  facility_id, id, encounter_date, age, age_unit, sex, diagnosis, is_demo
) on public.encounters to authenticated;
grant update (
  encounter_date, age, age_unit, sex, diagnosis, is_demo
) on public.encounters to authenticated;
grant delete on public.encounters to authenticated;

commit;