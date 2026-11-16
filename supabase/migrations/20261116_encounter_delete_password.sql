-- Require a facility-specific delete password for every encounter deletion.
-- Password hashes are inaccessible to authenticated clients.

begin;

do $preflight$
begin
  if to_regclass('public.facilities') is null
    or to_regclass('public.encounters') is null
    or to_regprocedure('public.can_manage_facility(uuid)') is null then
    raise exception 'Required facility schema or authorization helper is missing; inspect the deployed schema before applying this migration.';
  end if;
end
$preflight$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.facility_delete_passwords (
  facility_id uuid primary key references public.facilities (id) on delete cascade,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.facility_delete_passwords enable row level security;
revoke all on public.facility_delete_passwords from public, anon, authenticated;

drop policy if exists "Facility members can delete encounters" on public.encounters;
drop policy if exists "Facility owners and admins can delete encounters" on public.encounters;
drop policy if exists "Facility admins can delete encounters" on public.encounters;
drop policy if exists "Authorized staff can delete encounters" on public.encounters;
revoke delete on public.encounters from public, anon, authenticated;

create or replace function public.set_facility_delete_password(
  p_facility_id uuid,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth, extensions
as $$
begin
  if auth.uid() is null or not public.can_manage_facility(p_facility_id) then
    raise exception 'Only facility owners and administrators can set the encounter delete password.';
  end if;
  if p_password is null
    or char_length(p_password) < 8
    or octet_length(p_password) > 72 then
    raise exception 'The delete password must be at least 8 characters and no more than 72 bytes.';
  end if;

  insert into public.facility_delete_passwords (facility_id, password_hash, updated_at)
  values (p_facility_id, extensions.crypt(p_password, extensions.gen_salt('bf', 12)), now())
  on conflict (facility_id) do update
    set password_hash = excluded.password_hash,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.delete_encounter_with_password(
  p_facility_id uuid,
  p_encounter_id text,
  p_password text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, auth, extensions
as $$
declare
  saved_password_hash text;
  deleted_id text;
begin
  if auth.uid() is null or not public.can_manage_facility(p_facility_id) then
    raise exception 'You are not authorized to delete encounters for this facility.';
  end if;
  select password_hash
    into saved_password_hash
    from public.facility_delete_passwords
    where facility_id = p_facility_id;
  if saved_password_hash is null then
    raise exception 'Set an encounter delete password in Settings before deleting encounters.';
  end if;
  if p_password is null
    or extensions.crypt(p_password, saved_password_hash) is distinct from saved_password_hash then
    raise exception 'The encounter delete password is incorrect.';
  end if;

  delete from public.encounters
    where facility_id = p_facility_id and id = p_encounter_id
    returning id into deleted_id;
  if deleted_id is null then
    raise exception 'The encounter was not found or has already been deleted.';
  end if;
  return deleted_id;
end;
$$;

create or replace function public.delete_facility_encounters_with_password(
  p_facility_id uuid,
  p_password text,
  p_demo_only boolean default false
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, auth, extensions
as $$
declare
  saved_password_hash text;
  deleted_count integer;
begin
  if auth.uid() is null or not public.can_manage_facility(p_facility_id) then
    raise exception 'You are not authorized to delete encounters for this facility.';
  end if;
  select password_hash
    into saved_password_hash
    from public.facility_delete_passwords
    where facility_id = p_facility_id;
  if saved_password_hash is null then
    raise exception 'Set an encounter delete password in Settings before deleting encounters.';
  end if;
  if p_password is null
    or extensions.crypt(p_password, saved_password_hash) is distinct from saved_password_hash then
    raise exception 'The encounter delete password is incorrect.';
  end if;

  delete from public.encounters
    where facility_id = p_facility_id
      and (not coalesce(p_demo_only, false) or is_demo);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.set_facility_delete_password(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_encounter_with_password(uuid, text, text) from public, anon, authenticated;
revoke all on function public.delete_facility_encounters_with_password(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_facility_delete_password(uuid, text) to authenticated;
grant execute on function public.delete_encounter_with_password(uuid, text, text) to authenticated;
grant execute on function public.delete_facility_encounters_with_password(uuid, text, boolean) to authenticated;

commit;
