-- Add facility-scoped document import history and resumable extraction drafts.
-- Original uploaded documents are never stored by this migration or function.

begin;

do $preflight$
begin
  if to_regclass('public.facilities') is null
    or to_regclass('public.facility_memberships') is null
    or to_regprocedure('public.is_facility_member(uuid)') is null
    or to_regprocedure('public.can_write_encounters(uuid)') is null then
    raise exception 'Required Adult OPD facility schema or authorization helpers are missing; inspect the deployed schema before applying this migration.';
  end if;
end
$preflight$;

create table public.document_imports (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  uploaded_by uuid not null default auth.uid() references auth.users (id),
  file_name text not null check (length(file_name) between 1 and 255),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10485760),
  file_sha256 text not null check (file_sha256 ~ '^[0-9a-f]{64}$'),
  document_type text not null check (document_type in ('individual', 'monthly_tally')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'awaiting_review', 'draft', 'imported', 'failed', 'cancelled')),
  reporting_year integer check (reporting_year between 1 and 9999),
  reporting_month smallint check (reporting_month between 1 and 12),
  recognized_entries integer not null default 0 check (recognized_entries >= 0),
  imported_entries integer not null default 0 check (imported_entries >= 0),
  extraction_result jsonb check (
    extraction_result is null or jsonb_typeof(extraction_result) = 'object'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  imported_at timestamptz,
  unique (facility_id, file_sha256),
  check ((reporting_month is null) = (reporting_year is null)),
  check (
    (status = 'imported' and imported_at is not null)
    or (status <> 'imported' and imported_at is null)
  )
);

create index document_imports_facility_created_idx
  on public.document_imports (facility_id, created_at desc);

create function public.set_document_import_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger document_imports_set_updated_at
before update on public.document_imports
for each row execute function public.set_document_import_updated_at();

alter table public.document_imports enable row level security;

create policy "Facility members can read document import history"
  on public.document_imports for select to authenticated
  using (public.is_facility_member(facility_id));

create policy "Authorized staff can create document import history"
  on public.document_imports for insert to authenticated
  with check (
    public.can_write_encounters(facility_id)
    and uploaded_by = auth.uid()
  );

create policy "Authorized staff can update document import history"
  on public.document_imports for update to authenticated
  using (public.can_write_encounters(facility_id))
  with check (
    public.can_write_encounters(facility_id)
    and uploaded_by = auth.uid()
  );

revoke all on public.document_imports from public, anon;
grant select, insert, update on public.document_imports to authenticated;

commit;
