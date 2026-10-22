-- Additive multi-facility onboarding and least-privilege authorization.
-- This migration does not insert, update, or delete existing facility,
-- membership, setting, diagnosis, or encounter rows.
-- In particular, it does not recreate or alter the Buta Bedaso facility UUID.

begin;

alter table public.facilities
  add column if not exists facility_name text not null default '',
  add column if not exists facility_code text,
  add column if not exists facility_type text not null default 'Health Center',
  add column if not exists contact_email text not null default '',
  add column if not exists contact_phone text not null default '',
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists facilities_code_ci_idx
  on public.facilities (lower(btrim(facility_code)))
  where facility_code is not null and btrim(facility_code) <> '';

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.facility_registration_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users (id) on delete cascade,
  facility_name text not null check (facility_name <> '' and facility_name = btrim(facility_name)),
  facility_code text,
  region text not null check (region <> '' and region = btrim(region)),
  zone text not null check (zone <> '' and zone = btrim(zone)),
  woreda text not null check (woreda <> '' and woreda = btrim(woreda)),
  facility_type text not null check (facility_type <> '' and facility_type = btrim(facility_type)),
  contact_email text not null check (contact_email <> '' and contact_email = btrim(contact_email)),
  contact_phone text not null default '',
  reporting_year integer not null check (reporting_year between 1 and 9999),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users (id),
  facility_id uuid references public.facilities (id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create unique index if not exists facility_registration_pending_requester_idx
  on public.facility_registration_requests (requested_by)
  where status = 'pending';

create unique index if not exists facility_registration_pending_code_ci_idx
  on public.facility_registration_requests (lower(btrim(facility_code)))
  where status = 'pending' and facility_code is not null and btrim(facility_code) <> '';

create table if not exists public.facility_invitations (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  email text not null check (email <> '' and email = btrim(email)),
  role text not null check (role in ('admin', 'data_entry', 'viewer')),
  invited_by uuid not null references auth.users (id),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists facility_invitations_pending_email_idx
  on public.facility_invitations (facility_id, lower(email))
  where status = 'pending';

create table if not exists public.official_diagnoses (
  id text primary key,
  code text not null unique,
  name text not null check (name <> '' and name = btrim(name)),
  active boolean not null default true,
  source text not null default 'ESV-1',
  created_at timestamptz not null default now()
);

do $validate_onboarding_schema$
declare
  expected_column record;
  actual_primary_key text[];
  expected_primary_key record;
  expected_foreign_key record;
  actual_foreign_key boolean;
  expected_check record;
  expected_index record;
  actual_index_definition text;
  actual_index_predicate text;
begin
  for expected_column in
    select * from (values
      ('facilities', 'id', 'uuid', true, true),
      ('facilities', 'facility_name', 'text', true, true),
      ('facilities', 'facility_code', 'text', false, false),
      ('facilities', 'facility_type', 'text', true, true),
      ('facilities', 'contact_email', 'text', true, true),
      ('facilities', 'contact_phone', 'text', true, true),
      ('facilities', 'created_at', 'timestamp with time zone', true, true),
      ('platform_admins', 'user_id', 'uuid', true, false),
      ('platform_admins', 'created_at', 'timestamp with time zone', true, true),
      ('facility_registration_requests', 'id', 'uuid', true, true),
      ('facility_registration_requests', 'requested_by', 'uuid', true, false),
      ('facility_registration_requests', 'facility_name', 'text', true, false),
      ('facility_registration_requests', 'facility_code', 'text', false, false),
      ('facility_registration_requests', 'region', 'text', true, false),
      ('facility_registration_requests', 'zone', 'text', true, false),
      ('facility_registration_requests', 'woreda', 'text', true, false),
      ('facility_registration_requests', 'facility_type', 'text', true, false),
      ('facility_registration_requests', 'contact_email', 'text', true, false),
      ('facility_registration_requests', 'contact_phone', 'text', true, true),
      ('facility_registration_requests', 'reporting_year', 'integer', true, false),
      ('facility_registration_requests', 'status', 'text', true, true),
      ('facility_registration_requests', 'rejection_reason', 'text', false, false),
      ('facility_registration_requests', 'reviewed_by', 'uuid', false, false),
      ('facility_registration_requests', 'facility_id', 'uuid', false, false),
      ('facility_registration_requests', 'created_at', 'timestamp with time zone', true, true),
      ('facility_registration_requests', 'reviewed_at', 'timestamp with time zone', false, false),
      ('facility_invitations', 'id', 'uuid', true, true),
      ('facility_invitations', 'facility_id', 'uuid', true, false),
      ('facility_invitations', 'email', 'text', true, false),
      ('facility_invitations', 'role', 'text', true, false),
      ('facility_invitations', 'invited_by', 'uuid', true, false),
      ('facility_invitations', 'status', 'text', true, true),
      ('facility_invitations', 'created_at', 'timestamp with time zone', true, true),
      ('facility_invitations', 'accepted_at', 'timestamp with time zone', false, false),
      ('official_diagnoses', 'id', 'text', true, false),
      ('official_diagnoses', 'code', 'text', true, false),
      ('official_diagnoses', 'name', 'text', true, false),
      ('official_diagnoses', 'active', 'boolean', true, true),
      ('official_diagnoses', 'source', 'text', true, true),
      ('official_diagnoses', 'created_at', 'timestamp with time zone', true, true)
    ) as expected(table_name, column_name, data_type, is_nullable, requires_default)
  loop
    if not exists (
      select 1
      from information_schema.columns as column_row
      where column_row.table_schema = 'public'
        and column_row.table_name = expected_column.table_name
        and column_row.column_name = expected_column.column_name
        and column_row.data_type = expected_column.data_type
        and (column_row.is_nullable = 'NO') = expected_column.is_nullable
        and (column_row.column_default is not null) = expected_column.requires_default
    ) then
      raise exception 'Incompatible existing schema: public.%.% must be % (not null: %, default required: %)',
        expected_column.table_name, expected_column.column_name,
        expected_column.data_type, expected_column.is_nullable,
        expected_column.requires_default;
    end if;
  end loop;

  for expected_primary_key in
    select * from (values
      ('facilities', array['id']::text[]),
      ('platform_admins', array['user_id']::text[]),
      ('facility_registration_requests', array['id']::text[]),
      ('facility_invitations', array['id']::text[]),
      ('official_diagnoses', array['id']::text[])
    ) as primary_keys(table_name, expected_columns)
  loop
    select array_agg(attribute.attname order by key_column.ordinality)
    into actual_primary_key
    from pg_constraint as constraint_row
    cross join lateral unnest(constraint_row.conkey) with ordinality
      as key_column(attnum, ordinality)
    join pg_attribute as attribute
      on attribute.attrelid = constraint_row.conrelid
      and attribute.attnum = key_column.attnum
    where constraint_row.conrelid = to_regclass(format('public.%I', expected_primary_key.table_name))
      and constraint_row.contype = 'p';

    if actual_primary_key is distinct from expected_primary_key.expected_columns then
      raise exception 'Incompatible existing schema: public.% must have primary key (%)',
        expected_primary_key.table_name,
        array_to_string(expected_primary_key.expected_columns, ', ');
    end if;
  end loop;

  for expected_foreign_key in
    select * from (values
      ('platform_admins', 'user_id', 'auth', 'users', 'id', 'c'),
      ('facility_registration_requests', 'requested_by', 'auth', 'users', 'id', 'c'),
      ('facility_registration_requests', 'reviewed_by', 'auth', 'users', 'id', 'a'),
      ('facility_registration_requests', 'facility_id', 'public', 'facilities', 'id', 'a'),
      ('facility_invitations', 'facility_id', 'public', 'facilities', 'id', 'c'),
      ('facility_invitations', 'invited_by', 'auth', 'users', 'id', 'a')
    ) as foreign_keys(source_table, source_column, target_schema, target_table, target_column, delete_action)
  loop
    select exists (
      select 1
      from pg_constraint as constraint_row
      where constraint_row.conrelid = to_regclass(format('public.%I', expected_foreign_key.source_table))
        and constraint_row.confrelid = to_regclass(
          format('%I.%I', expected_foreign_key.target_schema, expected_foreign_key.target_table)
        )
        and constraint_row.contype = 'f'
        and constraint_row.confdeltype::text = expected_foreign_key.delete_action
        and array_length(constraint_row.conkey, 1) = 1
        and array_length(constraint_row.confkey, 1) = 1
        and exists (
          select 1 from pg_attribute as source_attribute
          where source_attribute.attrelid = constraint_row.conrelid
            and source_attribute.attnum = constraint_row.conkey[1]
            and source_attribute.attname = expected_foreign_key.source_column
        )
        and exists (
          select 1 from pg_attribute as target_attribute
          where target_attribute.attrelid = constraint_row.confrelid
            and target_attribute.attnum = constraint_row.confkey[1]
            and target_attribute.attname = expected_foreign_key.target_column
        )
    ) into actual_foreign_key;

    if not actual_foreign_key then
      raise exception 'Incompatible existing schema: public.%.% must reference %.%.% with delete action %',
        expected_foreign_key.source_table, expected_foreign_key.source_column,
        expected_foreign_key.target_schema, expected_foreign_key.target_table,
        expected_foreign_key.target_column, expected_foreign_key.delete_action;
    end if;
  end loop;

  for expected_check in
    select * from (values
      ('facility_registration_requests', array['pending', 'approved', 'rejected']::text[]),
      ('facility_invitations', array['pending', 'accepted', 'revoked']::text[]),
      ('facility_invitations', array['admin', 'data_entry', 'viewer']::text[])
    ) as checks(table_name, required_values)
  loop
    if not exists (
      select 1
      from pg_constraint as constraint_row
      where constraint_row.conrelid = to_regclass(format('public.%I', expected_check.table_name))
        and constraint_row.contype = 'c'
        and (
          select bool_and(position(value in pg_get_constraintdef(constraint_row.oid)) > 0)
          from unnest(expected_check.required_values) as required(value)
        )
    ) then
      raise exception 'Incompatible existing schema: public.% is missing a required value constraint (%)',
        expected_check.table_name,
        array_to_string(expected_check.required_values, ', ');
    end if;
  end loop;

  for expected_index in
    select * from (values
      ('facilities_code_ci_idx', 'facilities', 'lower(btrim(facility_code))', 'facility_code is not null', 'btrim(facility_code) <>'),
      ('facility_registration_pending_requester_idx', 'facility_registration_requests', 'requested_by', 'status = ''pending''', null),
      ('facility_registration_pending_code_ci_idx', 'facility_registration_requests', 'lower(btrim(facility_code))', 'status = ''pending''', 'facility_code is not null'),
      ('facility_invitations_pending_email_idx', 'facility_invitations', 'facility_id, lower(email)', 'status = ''pending''', null)
    ) as indexes(index_name, table_name, key_fragment, predicate_fragment, second_predicate_fragment)
  loop
    select lower(pg_get_indexdef(index_row.indexrelid)),
      lower(coalesce(pg_get_expr(index_row.indpred, index_row.indrelid), ''))
    into actual_index_definition, actual_index_predicate
    from pg_index as index_row
    join pg_class as index_class on index_class.oid = index_row.indexrelid
    where index_class.relnamespace = 'public'::regnamespace
      and index_class.relname = expected_index.index_name
      and index_row.indrelid = to_regclass(format('public.%I', expected_index.table_name))
      and index_row.indisunique
      and index_row.indisvalid;

    if actual_index_definition is null
      or position(expected_index.key_fragment in actual_index_definition) = 0
      or position(expected_index.predicate_fragment in actual_index_predicate) = 0
      or (
        expected_index.second_predicate_fragment is not null
        and position(expected_index.second_predicate_fragment in actual_index_predicate) = 0
      ) then
      raise exception 'Incompatible existing index public.%; expected the unique key/predicate for public.%',
        expected_index.index_name, expected_index.table_name;
    end if;
  end loop;
end;
$validate_onboarding_schema$;

alter table public.platform_admins enable row level security;
alter table public.facility_registration_requests enable row level security;
alter table public.facility_invitations enable row level security;
alter table public.official_diagnoses enable row level security;
alter table public.facilities enable row level security;
alter table public.facility_memberships enable row level security;
alter table public.facility_settings enable row level security;
alter table public.diagnoses enable row level security;
alter table public.encounters enable row level security;

do $validate_existing_policies$
declare
  unexpected_policies text;
begin
  select string_agg(format('%I.%I (%s)', policy_row.tablename, policy_row.policyname, policy_row.cmd), ', ')
    into unexpected_policies
  from pg_policies as policy_row
  where policy_row.schemaname = 'public'
    and policy_row.tablename = any (array[
      'facilities', 'facility_memberships', 'facility_settings', 'diagnoses',
      'encounters', 'platform_admins', 'facility_registration_requests',
      'facility_invitations', 'official_diagnoses'
    ])
    and policy_row.policyname <> all (array[
      'Facility members can read their facility',
      'Members can read own membership',
      'Members can read own membership and admins can read facility memberships',
      'Members and facility managers can read memberships',
      'Facility members can read facility settings',
      'Facility members can create settings',
      'Facility members can update settings',
      'Facility owners and admins can create settings',
      'Facility owners and admins can update settings',
      'Facility members can read diagnoses',
      'Facility members can add diagnoses',
      'Facility members can update diagnoses',
      'Facility owners and admins can add diagnoses',
      'Facility owners and admins can update diagnoses',
      'Facility members can read encounters',
      'Facility members can add encounters',
      'Facility members can update encounters',
      'Facility members can delete encounters',
      'Authorized staff can add encounters',
      'Authorized staff can update encounters',
      'Facility owners and admins can delete encounters',
      'Platform administrators can read own role',
      'Requesters and platform administrators can read requests',
      'Authorized users can read official diagnoses',
      'Members and invitees can read scoped invitations'
    ])
    and not (
      policy_row.permissive = 'PERMISSIVE'
      and policy_row.roles = array['authenticated']::name[]
      and (
        (
          policy_row.tablename = 'diagnoses'
          and policy_row.policyname = 'Facility admins can add diagnoses'
          and policy_row.cmd = 'INSERT'
          and policy_row.qual is null
          and lower(regexp_replace(coalesce(policy_row.with_check, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
        )
        or (
          policy_row.tablename = 'diagnoses'
          and policy_row.policyname = 'Facility admins can update diagnoses'
          and policy_row.cmd = 'UPDATE'
          and lower(regexp_replace(coalesce(policy_row.qual, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
          and lower(regexp_replace(coalesce(policy_row.with_check, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
        )
        or (
          policy_row.tablename = 'encounters'
          and policy_row.policyname = 'Facility admins can delete encounters'
          and policy_row.cmd = 'DELETE'
          and policy_row.with_check is null
          and lower(regexp_replace(coalesce(policy_row.qual, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
        )
        or (
          policy_row.tablename = 'facility_settings'
          and policy_row.policyname = 'Facility admins can create settings'
          and policy_row.cmd = 'INSERT'
          and policy_row.qual is null
          and lower(regexp_replace(coalesce(policy_row.with_check, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
        )
        or (
          policy_row.tablename = 'facility_settings'
          and policy_row.policyname = 'Facility admins can update settings'
          and policy_row.cmd = 'UPDATE'
          and lower(regexp_replace(coalesce(policy_row.qual, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
          and lower(regexp_replace(coalesce(policy_row.with_check, ''), '[[:space:]\"]', '', 'g'))
            in ('can_manage_facility(facility_id)', 'public.can_manage_facility(facility_id)',
                '(can_manage_facility(facility_id))', '(public.can_manage_facility(facility_id))')
        )
      )
    );

  if unexpected_policies is not null then
    raise exception 'Unrecognized policies need manual review before migration: %', unexpected_policies;
  end if;
end;
$validate_existing_policies$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.platform_admins as administrator
    where administrator.user_id = auth.uid()
  );
$$;

create or replace function public.can_read_official_diagnoses()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.facility_memberships as membership
      where membership.user_id = auth.uid()
    );
$$;

create or replace function public.can_manage_facility(requested_facility_id uuid)
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

create or replace function public.can_write_encounters(requested_facility_id uuid)
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

create or replace function public.submit_facility_registration(
  p_facility_name text,
  p_facility_code text,
  p_region text,
  p_zone text,
  p_woreda text,
  p_facility_type text,
  p_contact_email text,
  p_contact_phone text,
  p_reporting_year integer
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  requester uuid := auth.uid();
  normalized_code text := nullif(upper(btrim(coalesce(p_facility_code, ''))), '');
  request_id uuid;
begin
  if requester is null then
    raise exception 'Authentication is required to register a facility'
      using errcode = '42501';
  end if;

  if p_facility_name is null or btrim(p_facility_name) = ''
    or p_region is null or btrim(p_region) = ''
    or p_zone is null or btrim(p_zone) = ''
    or p_woreda is null or btrim(p_woreda) = ''
    or p_facility_type is null or btrim(p_facility_type) = ''
    or p_contact_email is null
    or p_contact_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    or p_reporting_year is null or p_reporting_year not between 1 and 9999
    or length(coalesce(p_contact_phone, '')) > 40 then
    raise exception 'Facility registration fields are invalid'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.facilities as facility
    where normalized_code is not null
      and lower(btrim(facility.facility_code)) = lower(normalized_code)
  ) then
    raise exception 'That facility code is already registered'
      using errcode = '23505';
  end if;

  insert into public.facility_registration_requests (
    requested_by, facility_name, facility_code, region, zone, woreda,
    facility_type, contact_email, contact_phone, reporting_year
  ) values (
    requester, btrim(p_facility_name), normalized_code, btrim(p_region),
    btrim(p_zone), btrim(p_woreda), btrim(p_facility_type),
    lower(btrim(p_contact_email)), btrim(coalesce(p_contact_phone, '')),
    p_reporting_year
  )
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.approve_facility_registration(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  request_row public.facility_registration_requests%rowtype;
  new_facility_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access is required'
      using errcode = '42501';
  end if;

  select * into request_row
  from public.facility_registration_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'The pending facility request was not found'
      using errcode = 'P0002';
  end if;

  insert into public.facilities (
    facility_name, facility_code, facility_type, contact_email, contact_phone
  ) values (
    request_row.facility_name, request_row.facility_code,
    request_row.facility_type, request_row.contact_email, request_row.contact_phone
  )
  returning id into new_facility_id;

  insert into public.facility_settings (
    facility_id, health_center_name, region, zone, woreda, reporting_year
  ) values (
    new_facility_id, request_row.facility_name, request_row.region,
    request_row.zone, request_row.woreda, request_row.reporting_year
  );

  insert into public.facility_memberships (facility_id, user_id, role)
  values (new_facility_id, request_row.requested_by, 'owner');

  update public.facility_registration_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      facility_id = new_facility_id,
      reviewed_at = now()
  where id = request_row.id;

  return new_facility_id;
end;
$$;

create or replace function public.reject_facility_registration(
  p_request_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Platform administrator access is required'
      using errcode = '42501';
  end if;

  update public.facility_registration_requests
  set status = 'rejected',
      rejection_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'The pending facility request was not found'
      using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.list_facility_members(p_facility_id uuid)
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not public.can_manage_facility(p_facility_id) then
    raise exception 'Facility owner or admin access is required'
      using errcode = '42501';
  end if;

  return query
  select membership.user_id, account.email::text, membership.role, membership.created_at
  from public.facility_memberships as membership
  join auth.users as account on account.id = membership.user_id
  where membership.facility_id = p_facility_id
  order by membership.created_at, account.email;
end;
$$;

create or replace function public.invite_facility_member(
  p_facility_id uuid,
  p_email text,
  p_role text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_role text;
  invitation_id uuid;
  normalized_email text := lower(btrim(coalesce(p_email, '')));
begin
  select membership.role into actor_role
  from public.facility_memberships as membership
  where membership.facility_id = p_facility_id
    and membership.user_id = auth.uid();

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Facility owner or admin access is required'
      using errcode = '42501';
  end if;
  if p_role not in ('admin', 'data_entry', 'viewer')
    or (p_role = 'admin' and actor_role <> 'owner') then
    raise exception 'You are not authorized to assign that facility role'
      using errcode = '42501';
  end if;
  if normalized_email = ''
    or normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'A valid invitation email is required'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from auth.users as account
    join public.facility_memberships as membership
      on membership.user_id = account.id
    where membership.facility_id = p_facility_id
      and lower(account.email) = normalized_email
  ) then
    raise exception 'That user is already a member of this facility'
      using errcode = '23505';
  end if;

  insert into public.facility_invitations (facility_id, email, role, invited_by)
  values (p_facility_id, normalized_email, p_role, auth.uid())
  returning id into invitation_id;

  return invitation_id;
end;
$$;

create or replace function public.accept_facility_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.facility_invitations%rowtype;
begin
  if actor_id is null then
    raise exception 'A signed-in account with a verified email is required'
      using errcode = '42501';
  end if;

  select lower(btrim(account.email))
    into actor_email
  from auth.users as account
  where account.id = actor_id and account.email_confirmed_at is not null;

  if actor_email is null or actor_email = '' then
    raise exception 'A signed-in account with a verified email is required'
      using errcode = '42501';
  end if;

  select * into invitation
  from public.facility_invitations
  where id = p_invitation_id and status = 'pending'
  for update;

  if not found or lower(invitation.email) <> actor_email then
    raise exception 'No pending invitation was found for this signed-in email'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.facility_memberships
    where facility_id = invitation.facility_id and user_id = actor_id
  ) then
    raise exception 'This account is already a member of the facility'
      using errcode = '23505';
  end if;

  insert into public.facility_memberships (facility_id, user_id, role)
  values (invitation.facility_id, actor_id, invitation.role);

  update public.facility_invitations
  set status = 'accepted', accepted_at = now()
  where id = invitation.id;

  return invitation.facility_id;
end;
$$;

create or replace function public.list_my_facility_invitations()
returns table (
  invitation_id uuid,
  facility_id uuid,
  facility_name text,
  email text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select invitation.id,
    invitation.facility_id,
    coalesce(nullif(facility.facility_name, ''), settings.health_center_name, 'Health facility'),
    invitation.email,
    invitation.role,
    invitation.created_at
  from public.facility_invitations as invitation
  join auth.users as account
    on account.id = auth.uid()
   and lower(account.email) = lower(invitation.email)
   and account.email_confirmed_at is not null
  join public.facilities as facility on facility.id = invitation.facility_id
  left join public.facility_settings as settings on settings.facility_id = facility.id
  where invitation.status = 'pending';
$$;

create or replace function public.revoke_facility_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  invitation public.facility_invitations%rowtype;
begin
  select * into invitation
  from public.facility_invitations
  where id = p_invitation_id and status = 'pending'
  for update;

  if not found or not public.can_manage_facility(invitation.facility_id) then
    raise exception 'Facility owner or admin access is required'
      using errcode = '42501';
  end if;

  update public.facility_invitations
  set status = 'revoked'
  where id = invitation.id;
end;
$$;

create or replace function public.remove_facility_member(
  p_facility_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  actor_role text;
  target_role text;
begin
  select membership.role into actor_role
  from public.facility_memberships as membership
  where membership.facility_id = p_facility_id
    and membership.user_id = auth.uid();

  select membership.role into target_role
  from public.facility_memberships as membership
  where membership.facility_id = p_facility_id
    and membership.user_id = p_user_id;

  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Facility owner or admin access is required'
      using errcode = '42501';
  end if;
  if target_role is null or target_role = 'owner'
    or (actor_role = 'admin' and target_role <> 'data_entry' and target_role <> 'viewer') then
    raise exception 'You are not authorized to remove this facility member'
      using errcode = '42501';
  end if;

  delete from public.facility_memberships
  where facility_id = p_facility_id and user_id = p_user_id;
end;
$$;

drop policy if exists "Facility members can read their facility"
  on public.facilities;
create policy "Facility members can read their facility"
  on public.facilities for select to authenticated
  using (public.is_facility_member(id));

drop policy if exists "Platform administrators can read own role"
  on public.platform_admins;
create policy "Platform administrators can read own role"
  on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Requesters and platform administrators can read requests"
  on public.facility_registration_requests;
create policy "Requesters and platform administrators can read requests"
  on public.facility_registration_requests for select to authenticated
  using (requested_by = (select auth.uid()) or public.is_platform_admin());

drop policy if exists "Authorized users can read official diagnoses"
  on public.official_diagnoses;
create policy "Authorized users can read official diagnoses"
  on public.official_diagnoses for select to authenticated
  using (public.can_read_official_diagnoses());

drop policy if exists "Members and invitees can read scoped invitations"
  on public.facility_invitations;
create policy "Members and invitees can read scoped invitations"
  on public.facility_invitations for select to authenticated
  using (
    public.can_manage_facility(facility_id)
    or (
      status = 'pending'
      and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "Members and facility managers can read memberships"
  on public.facility_memberships;
drop policy if exists "Members can read own membership"
  on public.facility_memberships;
drop policy if exists "Members can read own membership and admins can read facility memberships"
  on public.facility_memberships;
create policy "Members and facility managers can read memberships"
  on public.facility_memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_manage_facility(facility_id)
  );

drop policy if exists "Facility owners and admins can create settings"
  on public.facility_settings;
drop policy if exists "Facility owners and admins can update settings"
  on public.facility_settings;
drop policy if exists "Facility admins can create settings"
  on public.facility_settings;
drop policy if exists "Facility admins can update settings"
  on public.facility_settings;
drop policy if exists "Facility members can create settings"
  on public.facility_settings;
drop policy if exists "Facility members can update settings"
  on public.facility_settings;
drop policy if exists "Facility members can read facility settings"
  on public.facility_settings;
create policy "Facility members can read facility settings"
  on public.facility_settings for select to authenticated
  using (public.is_facility_member(facility_id));
create policy "Facility owners and admins can create settings"
  on public.facility_settings for insert to authenticated
  with check (public.can_manage_facility(facility_id));
create policy "Facility owners and admins can update settings"
  on public.facility_settings for update to authenticated
  using (public.can_manage_facility(facility_id))
  with check (public.can_manage_facility(facility_id));

drop policy if exists "Facility owners and admins can add diagnoses"
  on public.diagnoses;
drop policy if exists "Facility owners and admins can update diagnoses"
  on public.diagnoses;
drop policy if exists "Facility admins can add diagnoses"
  on public.diagnoses;
drop policy if exists "Facility admins can update diagnoses"
  on public.diagnoses;
drop policy if exists "Facility members can add diagnoses"
  on public.diagnoses;
drop policy if exists "Facility members can update diagnoses"
  on public.diagnoses;
drop policy if exists "Facility members can read diagnoses"
  on public.diagnoses;
create policy "Facility members can read diagnoses"
  on public.diagnoses for select to authenticated
  using (public.is_facility_member(facility_id));
create policy "Facility owners and admins can add diagnoses"
  on public.diagnoses for insert to authenticated
  with check (public.can_manage_facility(facility_id) and not official);
create policy "Facility owners and admins can update diagnoses"
  on public.diagnoses for update to authenticated
  using (public.can_manage_facility(facility_id) and not official)
  with check (public.can_manage_facility(facility_id) and not official);

drop policy if exists "Authorized staff can add encounters"
  on public.encounters;
drop policy if exists "Authorized staff can update encounters"
  on public.encounters;
drop policy if exists "Facility owners and admins can delete encounters"
  on public.encounters;
drop policy if exists "Facility admins can delete encounters"
  on public.encounters;
drop policy if exists "Facility members can add encounters"
  on public.encounters;
drop policy if exists "Facility members can update encounters"
  on public.encounters;
drop policy if exists "Facility members can delete encounters"
  on public.encounters;
drop policy if exists "Facility members can read encounters"
  on public.encounters;
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
create policy "Facility owners and admins can delete encounters"
  on public.encounters for delete to authenticated
  using (public.can_manage_facility(facility_id));

create or replace function public.resolve_encounter_diagnosis()
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

  if found then
    return new;
  end if;

  if exists (
    select 1
    from public.official_diagnoses as official
    where lower(official.name) = lower(new.diagnosis)
      and official.active
  ) then
    new.diagnosis_id := null;
    return new;
  end if;

  raise exception 'Diagnosis "%" is not in the active facility or official catalog', new.diagnosis
    using errcode = 'foreign_key_violation';
end;
$$;

revoke all on public.facilities, public.facility_memberships,
  public.facility_settings, public.diagnoses, public.encounters
  from public, anon, authenticated;
revoke all on public.platform_admins, public.facility_registration_requests,
  public.facility_invitations, public.official_diagnoses
  from public, anon, authenticated;

do $revoke_column_privileges$
declare
  target_table record;
  column_list text;
begin
  for target_table in
    select table_name
    from unnest(array[
      'facilities', 'facility_memberships', 'facility_settings', 'diagnoses',
      'encounters', 'platform_admins', 'facility_registration_requests',
      'facility_invitations', 'official_diagnoses'
    ]) as tables(table_name)
  loop
    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
    into column_list
    from pg_attribute as attribute
    where attribute.attrelid = to_regclass(format('public.%I', target_table.table_name))
      and attribute.attnum > 0
      and not attribute.attisdropped;

    if column_list is null then
      raise exception 'Cannot safely reset column privileges for public.%', target_table.table_name;
    end if;

    execute format(
      'revoke select (%1$s), insert (%1$s), update (%1$s), references (%1$s) on table public.%2$I from public, anon, authenticated',
      column_list, target_table.table_name
    );
  end loop;
end;
$revoke_column_privileges$;

grant select on public.platform_admins, public.facility_registration_requests,
  public.facility_invitations, public.official_diagnoses to authenticated;
grant select on public.facilities, public.facility_memberships,
  public.facility_settings, public.diagnoses, public.encounters
  to authenticated;
grant insert (
  health_center_name, region, zone, woreda, reporting_year,
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

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.can_read_official_diagnoses() from public, anon;
revoke all on function public.submit_facility_registration(text, text, text, text, text, text, text, text, integer)
  from public, anon;
revoke all on function public.approve_facility_registration(uuid) from public, anon;
revoke all on function public.reject_facility_registration(uuid, text) from public, anon;
revoke all on function public.list_facility_members(uuid) from public, anon;
revoke all on function public.invite_facility_member(uuid, text, text) from public, anon;
revoke all on function public.accept_facility_invitation(uuid) from public, anon;
revoke all on function public.list_my_facility_invitations() from public, anon;
revoke all on function public.revoke_facility_invitation(uuid) from public, anon;
revoke all on function public.remove_facility_member(uuid, uuid) from public, anon;
revoke all on function public.resolve_encounter_diagnosis() from public, anon, authenticated;
revoke all on function public.is_platform_admin() from authenticated;
revoke all on function public.can_read_official_diagnoses() from authenticated;
revoke all on function public.can_manage_facility(uuid) from public, anon, authenticated;
revoke all on function public.can_write_encounters(uuid) from public, anon, authenticated;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.can_read_official_diagnoses() to authenticated;
grant execute on function public.submit_facility_registration(text, text, text, text, text, text, text, text, integer)
  to authenticated;
grant execute on function public.approve_facility_registration(uuid) to authenticated;
grant execute on function public.reject_facility_registration(uuid, text) to authenticated;
grant execute on function public.list_facility_members(uuid) to authenticated;
grant execute on function public.invite_facility_member(uuid, text, text) to authenticated;
grant execute on function public.accept_facility_invitation(uuid) to authenticated;
grant execute on function public.list_my_facility_invitations() to authenticated;
grant execute on function public.revoke_facility_invitation(uuid) to authenticated;
grant execute on function public.remove_facility_member(uuid, uuid) to authenticated;
grant execute on function public.can_manage_facility(uuid) to authenticated;
grant execute on function public.can_write_encounters(uuid) to authenticated;

commit;
