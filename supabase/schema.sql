-- Adult OPD one-time database migration.
--
-- Apply this complete file only once to a new, empty Supabase project after
-- review. It contains no patient data, users, memberships, or diagnosis seeds.
-- If any of these five tables or their related objects already exist, do not
-- rerun this file and do not drop or truncate anything. Inspect the existing
-- schema, take a backup, and write a separate, reviewed migration that
-- reconciles existing objects and data without loss.
--
-- Trusted-operator initial facility/owner onboarding:
-- 1. Disable public Auth sign-ups. Invite/create the intended owner in Supabase
--    Auth through a trusted administrative process and verify their auth.users
--    UUID. Never let an unauthenticated visitor choose a facility or role.
-- 2. After applying this reviewed schema, replace the UUID placeholder below
--    and run the block in the Supabase SQL Editor as the project owner. It
--    atomically creates one facility, its settings, and its first owner.
-- 3. Before patient entry is enabled or data-entry accounts are provisioned,
--    import the approved facility diagnosis catalog (including only the
--    approved ESV-1 and starter/custom catalog entries) through a trusted
--    operator process. Do not invent, infer, or seed diagnosis entries from
--    this migration. Validate the imported IDs, codes, names, and active
--    flags against the approved source.
-- 4. Provision or change memberships only through a trusted operator process
--    after verifying user identity. Authenticated clients have no membership
--    write grants and cannot grant access or elevate roles. Never expose a
--    service-role key in frontend code. Transfer ownership before removing
--    the current owner.
--
-- begin;
-- do $onboard$
-- declare
--   new_facility_id uuid;
--   verified_owner_user_id uuid := '<REPLACE_WITH_VERIFIED_AUTH_USER_UUID>'::uuid;
-- begin
--   if not exists (
--     select 1 from auth.users where id = verified_owner_user_id
--   ) then
--     raise exception 'The verified owner UUID is not present in auth.users';
--   end if;
--   insert into public.facilities default values
--     returning id into new_facility_id;
--   insert into public.facility_settings (facility_id, reporting_year)
--     values (new_facility_id, extract(year from current_date)::integer);
--   insert into public.facility_memberships (facility_id, user_id, role)
--     values (new_facility_id, verified_owner_user_id, 'owner');
-- end
-- $onboard$;
-- commit;
--
-- Reporting:
-- * age_group covers the six all-age groups, including under-five encounters.
--   All-age reports group all rows by reporting_year/month and age_group.
-- * included_in_adult_report, adult_report_age_group, and opd_category preserve
--   this app's existing rule: only age >= 5 years is included in Adult OPD
--   monthly/yearly totals, in the existing four bands (5–14, 15–29, 30–64,
--   >=65). Under-five rows remain stored and visible to all-age reporting.
--
-- Age verification cases (age_unit, age, expected age_group):
-- months, each integer 0..11 => Below 1 year
-- months, 12 and 59 => 12–59 months
-- Equivalent representations must classify identically:
-- years 0 = months 0 => Below 1 year
-- years 1 = months 12 and years 4 = months 48 => 12–59 months
-- years 5 = months 60 and years 14 = months 168 => 5–14 years
-- years 15 = months 180 and years 29 = months 348 => 15–29 years
-- years 30 = months 360 and years 64 = months 768 => 30–64 years
-- years 65 = months 780 => 65 years and above
-- Also test the supported maximum: years 120 = months 1440.
-- Expected adult inclusion: false below 60 months, true at/above 60 months.
-- Invalid ages years -1/121 and months -1/1441 must fail the age CHECK.
--
-- Diagnosis verification (disposable database/rolled-back transaction only):
-- * inserting mixed-case diagnosis text resolves to the active catalog ID;
-- * selecting an inactive diagnosis for a new/changed encounter is rejected;
-- * renaming the catalog row leaves the encounter's original diagnosis text
--   unchanged and the diagnosis_id still references that renamed catalog row;
-- * deleting the referenced diagnosis is rejected.
--
-- RLS/permission verification plan (run only in a disposable Supabase project
-- with separate test accounts and ordinary anon/authenticated API sessions):
-- Never use a service-role client for assertions; it bypasses RLS. Provision
-- all fixtures and role memberships using the disposable project's trusted
-- operator credentials. None of these tests have been run):
-- 1. Fixture: create two facilities and approved diagnosis/settings fixtures.
--    Create distinct accounts for anon, non-member, viewer on facility A,
--    data_entry on facility A, admin on facility A, and owner on facility A.
--    Optionally assign the non-member as a member of facility B only.
-- 2. Anonymous session: SELECT/INSERT/UPDATE/DELETE on each of the five
--    tables must be denied by SQL privileges.
-- 3. Non-member session: facility A settings, diagnoses, encounters and
--    facility membership rows must not be readable or writable. If the user
--    is a facility B member, A must remain isolated and B access must not
--    authorize A.
-- 4. Viewer session: can read own facility's data; INSERT/UPDATE/DELETE on
--    encounters, diagnoses, settings, facilities, and memberships must fail.
-- 5. Data-entry session: can INSERT/UPDATE encounters; cannot DELETE them.
--    Cannot INSERT/UPDATE/DELETE diagnoses or INSERT/UPDATE/DELETE settings.
-- 6. Admin and owner sessions: can read facility data, manage settings and
--    diagnoses, and INSERT/UPDATE/DELETE encounters within their own facility.
--    Both must fail to read or write facility B data unless separately
--    provisioned there. They cannot write facilities or memberships through
--    the client, nor change any role. They cannot delete diagnoses through
--    the client; referenced diagnosis deletion is additionally restricted by
--    the encounter foreign key.
-- 7. Each authenticated role, including admin/owner, attempts facility INSERT,
--    membership INSERT/UPDATE/DELETE, and self-role escalation. Each must be
--    denied by SQL grants and/or RLS; verify memberships remain unchanged.
-- Record both successful permitted operations and rejected operations. Do
-- not interpret a database-owner/service-role session as a successful RLS test.

begin;

create table public.facilities (
  id uuid primary key default gen_random_uuid()
);

create table public.facility_memberships (
  facility_id uuid not null references public.facilities (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('owner', 'admin', 'data_entry', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (facility_id, user_id)
);

create index facility_memberships_user_idx
  on public.facility_memberships (user_id, facility_id);

create table public.facility_settings (
  facility_id uuid primary key references public.facilities (id),
  health_center_name text not null default '',
  region text not null default '',
  zone text not null default '',
  woreda text not null default '',
  reporting_year integer not null check (reporting_year between 1 and 9999),
  responsible_person_name text not null default '',
  position text not null default '',
  demo_loaded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diagnoses (
  facility_id uuid not null references public.facilities (id),
  id text not null,
  code text,
  name text not null check (name <> '' and name = btrim(name)),
  active boolean not null default true,
  official boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (facility_id, id),
  check (not official or code is not null)
);

create unique index diagnoses_facility_code_idx
  on public.diagnoses (facility_id, code)
  where code is not null;

create unique index diagnoses_facility_name_ci_idx
  on public.diagnoses (facility_id, lower(name));

create table public.encounters (
  facility_id uuid not null references public.facilities (id),
  id text not null default gen_random_uuid()::text,
  encounter_date date not null,
  -- Existing records use integer years; age_unit defaults to years to preserve
  -- that representation. New entry may use months for exact infant ages and
  -- the 12–59-month band. Years are completed whole years.
  age smallint not null,
  age_unit text not null default 'years'
    check (age_unit in ('years', 'months')),
  sex text not null check (sex in ('Male', 'Female')),
  -- This is an encounter-time snapshot. Catalog renames must not rewrite it.
  diagnosis text not null check (diagnosis <> '' and diagnosis = btrim(diagnosis)),
  -- Nullable for compatibility with legacy rows; the insert trigger populates
  -- it for new rows. The composite FK scopes catalog references to a facility.
  diagnosis_id text,
  age_in_months integer generated always as (
    case when age_unit = 'years' then age * 12 else age end
  ) stored,
  age_group text generated always as (
    case
      when age_unit = 'months' and age between 0 and 11
        or age_unit = 'years' and age = 0 then 'Below 1 year'
      when age_unit = 'months' and age between 12 and 59
        or age_unit = 'years' and age between 1 and 4 then '12–59 months'
      when age_unit = 'months' and age between 60 and 179
        or age_unit = 'years' and age between 5 and 14 then '5–14 years'
      when age_unit = 'months' and age between 180 and 359
        or age_unit = 'years' and age between 15 and 29 then '15–29 years'
      when age_unit = 'months' and age between 360 and 779
        or age_unit = 'years' and age between 30 and 64 then '30–64 years'
      else '65 years and above'
    end
  ) stored,
  adult_report_age_group text generated always as (
    case
      when age_unit = 'months' and age between 60 and 179
        or age_unit = 'years' and age between 5 and 14 then '5–14'
      when age_unit = 'months' and age between 180 and 359
        or age_unit = 'years' and age between 15 and 29 then '15–29'
      when age_unit = 'months' and age between 360 and 779
        or age_unit = 'years' and age between 30 and 64 then '30–64'
      when age_unit = 'months' and age between 780 and 1440
        or age_unit = 'years' and age between 65 and 120 then '≥65'
      else null
    end
  ) stored,
  opd_category text generated always as (
    case
      when age_unit = 'months' and age >= 60
        or age_unit = 'years' and age >= 5 then 'Adult OPD'
      else 'Outside Adult OPD Categories'
    end
  ) stored,
  included_in_adult_report boolean generated always as (
    age_unit = 'months' and age >= 60
    or age_unit = 'years' and age >= 5
  ) stored,
  reporting_month smallint generated always as (
    extract(month from encounter_date)::smallint
  ) stored,
  reporting_year integer generated always as (
    extract(year from encounter_date)::integer
  ) stored,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (facility_id, id),
  check (
    (age_unit = 'years' and age between 0 and 120)
    or (age_unit = 'months' and age between 0 and 1440)
  ),
  foreign key (facility_id, diagnosis_id)
    references public.diagnoses (facility_id, id)
    on delete restrict
);

-- Resolve newly entered diagnosis text to the facility catalog without
-- changing the existing application's name-based entry payload. A catalog
-- rename updates only diagnoses.name: the encounter's diagnosis snapshot
-- remains untouched. Editing a different diagnosis resolves the new selection.
create function public.resolve_encounter_diagnosis()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
    and new.facility_id = old.facility_id
    and new.diagnosis is not distinct from old.diagnosis then
    new.diagnosis_id := old.diagnosis_id;
    return new;
  end if;

  select diagnosis_row.id
    into new.diagnosis_id
  from public.diagnoses as diagnosis_row
  where diagnosis_row.facility_id = new.facility_id
    and lower(diagnosis_row.name) = lower(new.diagnosis)
    and diagnosis_row.active;

  if not found then
    raise exception 'Diagnosis "%" is not in this facility catalog', new.diagnosis
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger encounters_resolve_diagnosis
before insert or update of facility_id, diagnosis
on public.encounters
for each row execute function public.resolve_encounter_diagnosis();

create index encounters_facility_period_idx
  on public.encounters (facility_id, reporting_year, reporting_month);

create index encounters_facility_date_idx
  on public.encounters (facility_id, encounter_date);

create index encounters_facility_adult_period_idx
  on public.encounters (facility_id, included_in_adult_report, reporting_year, reporting_month);

create index encounters_facility_all_age_period_group_idx
  on public.encounters (facility_id, reporting_year, reporting_month, age_group);

create index encounters_facility_diagnosis_period_idx
  on public.encounters (facility_id, diagnosis, reporting_year, reporting_month);

-- Internal role lookup; security-definer avoids recursive membership RLS.
create function public.has_facility_role(
  requested_facility_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.facility_memberships as membership
    where membership.facility_id = requested_facility_id
      and membership.user_id = auth.uid()
      and membership.role = any (allowed_roles)
  );
$$;

create function public.is_facility_member(requested_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.has_facility_role(
    requested_facility_id,
    array['owner', 'admin', 'data_entry', 'viewer']::text[]
  );
$$;

create function public.can_manage_facility(requested_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.has_facility_role(
    requested_facility_id,
    array['owner', 'admin']::text[]
  );
$$;

create function public.can_write_encounters(requested_facility_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.has_facility_role(
    requested_facility_id,
    array['owner', 'admin', 'data_entry']::text[]
  );
$$;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger facility_settings_set_updated_at
before update on public.facility_settings
for each row execute function public.set_updated_at();

create trigger diagnoses_set_updated_at
before update on public.diagnoses
for each row execute function public.set_updated_at();

create trigger encounters_set_updated_at
before update on public.encounters
for each row execute function public.set_updated_at();

alter table public.facilities enable row level security;
alter table public.facility_memberships enable row level security;
alter table public.facility_settings enable row level security;
alter table public.diagnoses enable row level security;
alter table public.encounters enable row level security;

create policy "Facility members can read their facility"
  on public.facilities for select to authenticated
  using (public.is_facility_member(id));

create policy "Members can read own membership and admins can read facility memberships"
  on public.facility_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_manage_facility(facility_id)
  );

create policy "Facility members can read facility settings"
  on public.facility_settings for select to authenticated
  using (public.is_facility_member(facility_id));

create policy "Facility admins can create settings"
  on public.facility_settings for insert to authenticated
  with check (public.can_manage_facility(facility_id));

create policy "Facility admins can update settings"
  on public.facility_settings for update to authenticated
  using (public.can_manage_facility(facility_id))
  with check (public.can_manage_facility(facility_id));

create policy "Facility members can read diagnoses"
  on public.diagnoses for select to authenticated
  using (public.is_facility_member(facility_id));

create policy "Facility admins can add diagnoses"
  on public.diagnoses for insert to authenticated
  with check (public.can_manage_facility(facility_id));

create policy "Facility admins can update diagnoses"
  on public.diagnoses for update to authenticated
  using (public.can_manage_facility(facility_id))
  with check (public.can_manage_facility(facility_id));

create policy "Facility members can read encounters"
  on public.encounters for select to authenticated
  using (public.is_facility_member(facility_id));

create policy "Authorized staff can add encounters"
  on public.encounters for insert to authenticated
  with check (public.can_write_encounters(facility_id));

create policy "Authorized staff can update encounters"
  on public.encounters for update to authenticated
  using (public.can_write_encounters(facility_id))
  with check (public.can_write_encounters(facility_id));

create policy "Facility admins can delete encounters"
  on public.encounters for delete to authenticated
  using (public.can_manage_facility(facility_id));

-- No client can create facilities or memberships, change roles, or delete
-- facilities/settings/diagnoses. Membership administration stays operator-only.
revoke all on public.facilities, public.facility_memberships,
  public.facility_settings, public.diagnoses, public.encounters
  from public, anon, authenticated;

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

grant insert (facility_id, id, code, name, active, official)
  on public.diagnoses to authenticated;
grant update (code, name, active, official)
  on public.diagnoses to authenticated;

grant insert (
  facility_id, id, encounter_date, age, age_unit, sex, diagnosis, is_demo
) on public.encounters to authenticated;
grant update (
  encounter_date, age, age_unit, sex, diagnosis, is_demo
) on public.encounters to authenticated;
grant delete on public.encounters to authenticated;

revoke all on function public.has_facility_role(uuid, text[]) from public, anon, authenticated;
revoke all on function public.is_facility_member(uuid) from public, anon;
revoke all on function public.can_manage_facility(uuid) from public, anon;
revoke all on function public.can_write_encounters(uuid) from public, anon;
revoke all on function public.resolve_encounter_diagnosis() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

grant execute on function public.is_facility_member(uuid) to authenticated;
grant execute on function public.can_manage_facility(uuid) to authenticated;
grant execute on function public.can_write_encounters(uuid) to authenticated;

commit;

-- Optional verification in a disposable project only. Uncomment/run as a
-- trusted database operator after applying the schema. The outer transaction
-- rolls back the fixture facility, diagnoses, settings, and encounters.
--
-- begin;
-- do $verify$
-- declare
--   test_facility_id uuid;
--   test_age_group text;
--   test_adult_included boolean;
--   test_adult_report_group text;
--   test_opd_category text;
--   test_case record;
--   invalid_case record;
--   diagnosis_snapshot text;
--   referenced_diagnosis_id text;
-- begin
--   insert into public.facilities default values
--     returning id into test_facility_id;
--   insert into public.facility_settings (facility_id, reporting_year)
--     values (test_facility_id, extract(year from current_date)::integer);
--   insert into public.diagnoses (facility_id, id, name)
--     values (test_facility_id, 'schema-test-dx', 'Schema Test Diagnosis');
--
--   for test_case in
--     select
--       'months'::text as age_unit,
--       month_value as age,
--       'Below 1 year'::text as expected_group,
--       false as expected_adult
--       from generate_series(0, 11) as months(month_value)
--     union all
--     select
--       'months'::text,
--       month_value,
--       '12–59 months'::text,
--       false
--       from generate_series(12, 59) as months(month_value)
--     union all
--     select
--       'months'::text,
--       month_value,
--       '5–14 years'::text,
--       true
--       from generate_series(60, 179) as months(month_value)
--     union all
--     select * from (values
--       ('years',  0,   'Below 1 year', false),
--       ('years',  1,   '12–59 months', false),
--       ('years',  4,   '12–59 months', false),
--       ('months', 48,  '12–59 months', false),
--       ('years',  5,   '5–14 years', true),
--       ('years',  14,  '5–14 years', true),
--       ('months', 168, '5–14 years', true),
--       ('months', 180, '15–29 years', true),
--       ('years',  15,  '15–29 years', true),
--       ('years',  29,  '15–29 years', true),
--       ('months', 348, '15–29 years', true),
--       ('months', 359, '15–29 years', true),
--       ('months', 360, '30–64 years', true),
--       ('years',  30,  '30–64 years', true),
--       ('years',  64,  '30–64 years', true),
--       ('months', 768, '30–64 years', true),
--       ('months', 779, '30–64 years', true),
--       ('months', 780, '65 years and above', true),
--       ('years',  65,  '65 years and above', true),
--       ('years',  120, '65 years and above', true),
--       ('months', 1440, '65 years and above', true)
--     ) as cases(age_unit, age, expected_group, expected_adult)
--   loop
--     insert into public.encounters (
--       facility_id, encounter_date, age, age_unit, sex, diagnosis
--     ) values (
--       test_facility_id, current_date, test_case.age, test_case.age_unit,
--       'Female', 'Schema Test Diagnosis'
--     )
--     returning age_group, included_in_adult_report,
--       adult_report_age_group, opd_category
--       into test_age_group, test_adult_included,
--         test_adult_report_group, test_opd_category;
--
--     if test_age_group is distinct from test_case.expected_group
--       or test_adult_included is distinct from test_case.expected_adult
--       or test_adult_report_group is distinct from (
--         case test_case.expected_group
--         when '5–14 years' then '5–14'
--         when '15–29 years' then '15–29'
--         when '30–64 years' then '30–64'
--         when '65 years and above' then '≥65'
--         else null
--         end
--       )
--       or test_opd_category is distinct from (
--         case
--         when test_case.expected_adult then 'Adult OPD'
--         else 'Outside Adult OPD Categories'
--         end
--       ) then
--       raise exception 'Age test failed for % %: got group %, included %, adult group %, category %',
--         test_case.age, test_case.age_unit, test_age_group, test_adult_included,
--         test_adult_report_group, test_opd_category;
--     end if;
--   end loop;
--
--   for invalid_case in
--     select * from (values
--       ('years'::text, -1::smallint),
--       ('years'::text, 121::smallint),
--       ('months'::text, -1::smallint),
--       ('months'::text, 1441::smallint)
--     ) as invalid_ages(age_unit, age)
--   loop
--     begin
--       insert into public.encounters (
--         facility_id, encounter_date, age, age_unit, sex, diagnosis
--       ) values (
--         test_facility_id, current_date, invalid_case.age, invalid_case.age_unit,
--         'Female', 'Schema Test Diagnosis'
--       );
--       raise exception 'Expected invalid age to fail: % %',
--         invalid_case.age, invalid_case.age_unit;
--     exception when check_violation then
--       null;
--     end;
--   end loop;
--
--   insert into public.encounters (
--     facility_id, encounter_date, age, age_unit, sex, diagnosis
--   ) values (
--     test_facility_id, current_date, 5, 'years', 'Male', 'Schema Test Diagnosis'
--   );
--   insert into public.encounters (
--     facility_id, encounter_date, age, age_unit, sex, diagnosis
--   ) values (
--     test_facility_id, current_date, 5, 'years', 'Female', 'sCHEMA tEST dIAGNOSIS'
--   );
--   update public.diagnoses
--     set name = 'Renamed Schema Test Diagnosis'
--     where facility_id = test_facility_id and id = 'schema-test-dx';
--   select diagnosis, diagnosis_id into diagnosis_snapshot, referenced_diagnosis_id
--     from public.encounters
--     where facility_id = test_facility_id and diagnosis = 'sCHEMA tEST dIAGNOSIS';
--   if diagnosis_snapshot is distinct from 'sCHEMA tEST dIAGNOSIS'
--     or referenced_diagnosis_id is distinct from 'schema-test-dx' then
--     raise exception 'Catalog rename changed encounter diagnosis snapshot or reference';
--   end if;
--
--   insert into public.diagnoses (facility_id, id, name, active)
--     values (test_facility_id, 'schema-test-inactive-dx', 'Inactive Schema Test Diagnosis', false);
--   begin
--     insert into public.encounters (
--       facility_id, encounter_date, age, age_unit, sex, diagnosis
--     ) values (
--       test_facility_id, current_date, 5, 'years', 'Male', 'inactive schema test diagnosis'
--     );
--     raise exception 'Expected inactive diagnosis selection to fail';
--   exception when foreign_key_violation then
--     null;
--   end;
--
--   begin
--     delete from public.diagnoses
--       where facility_id = test_facility_id and id = 'schema-test-dx';
--     raise exception 'Expected delete of referenced diagnosis to fail';
--   exception when foreign_key_violation then
--     null;
--   end;
-- end
-- $verify$;
-- rollback;
