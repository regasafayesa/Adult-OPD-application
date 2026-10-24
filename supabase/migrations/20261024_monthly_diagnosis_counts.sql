-- Additive aggregate-count storage. Review before applying to Supabase.
-- This migration does not modify or backfill individual encounters.

begin;

do $preflight$
begin
  if to_regclass('public.facilities') is null
    or to_regclass('public.facility_settings') is null
    or to_regclass('public.facility_memberships') is null
    or to_regclass('public.diagnoses') is null
    or to_regclass('public.official_diagnoses') is null
    or to_regprocedure('public.is_facility_member(uuid)') is null
    or to_regprocedure('public.can_write_encounters(uuid)') is null
    or to_regprocedure('public.can_manage_facility(uuid)') is null
    or to_regprocedure('public.set_updated_at()') is null then
    raise exception 'Required Adult OPD facility schema or authorization helpers are missing; inspect the deployed schema before applying this migration.';
  end if;
end
$preflight$;

create table public.monthly_diagnosis_counts (
  id text not null default gen_random_uuid()::text,
  facility_id uuid not null references public.facilities (id),
  reporting_year integer not null check (reporting_year between 1 and 9999),
  reporting_month smallint not null check (reporting_month between 1 and 12),
  diagnosis_id text not null,
  diagnosis_source text not null check (diagnosis_source in ('official', 'facility')),
  official_diagnosis_key text generated always as (
    case when diagnosis_source = 'official' then substring(diagnosis_id from 10) end
  ) stored,
  facility_diagnosis_key text generated always as (
    case when diagnosis_source = 'facility' then diagnosis_id end
  ) stored,
  below_1_female integer not null default 0 check (below_1_female >= 0),
  below_1_male integer not null default 0 check (below_1_male >= 0),
  months_12_59_female integer not null default 0 check (months_12_59_female >= 0),
  months_12_59_male integer not null default 0 check (months_12_59_male >= 0),
  years_5_14_female integer not null default 0 check (years_5_14_female >= 0),
  years_5_14_male integer not null default 0 check (years_5_14_male >= 0),
  years_15_29_female integer not null default 0 check (years_15_29_female >= 0),
  years_15_29_male integer not null default 0 check (years_15_29_male >= 0),
  years_30_64_female integer not null default 0 check (years_30_64_female >= 0),
  years_30_64_male integer not null default 0 check (years_30_64_male >= 0),
  years_65_plus_female integer not null default 0 check (years_65_plus_female >= 0),
  years_65_plus_male integer not null default 0 check (years_65_plus_male >= 0),
  registration_book_total bigint check (
    registration_book_total is null or registration_book_total >= 0
  ),
  notes text not null default '',
  discrepancy_confirmed boolean not null default false,
  discrepancy_confirmed_by uuid references auth.users (id),
  discrepancy_confirmed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  updated_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (facility_id, id),
  unique (facility_id, reporting_year, reporting_month, diagnosis_id),
  foreign key (facility_id, facility_diagnosis_key)
    references public.diagnoses (facility_id, id)
    on delete restrict,
  foreign key (official_diagnosis_key)
    references public.official_diagnoses (id)
    on delete restrict,
  check (
    (diagnosis_source = 'official' and diagnosis_id like 'official:%')
    or (diagnosis_source = 'facility' and diagnosis_id not like 'official:%')
  ),
  check (
    (discrepancy_confirmed_by is null and discrepancy_confirmed_at is null)
    or (discrepancy_confirmed_by is not null and discrepancy_confirmed_at is not null)
  )
);

create index monthly_diagnosis_counts_period_idx
  on public.monthly_diagnosis_counts (facility_id, reporting_year, reporting_month);

create function public.validate_monthly_diagnosis_count()
returns trigger
language plpgsql
set search_path = pg_catalog, public, auth
as $$
declare
  diagnosis_is_active boolean;
  calculated_total bigint;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.facility_id := old.facility_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  select diagnosis_row.active
    into diagnosis_is_active
  from public.diagnoses as diagnosis_row
  where new.diagnosis_source = 'facility'
    and diagnosis_row.facility_id = new.facility_id
    and diagnosis_row.id = new.diagnosis_id;

  if new.diagnosis_source = 'official' then
    select official.active
      into diagnosis_is_active
    from public.official_diagnoses as official
    where official.id = substring(new.diagnosis_id from 10);
  end if;

  if diagnosis_is_active is distinct from true then
    raise exception 'Monthly diagnosis counts require an active diagnosis in this facility catalog';
  end if;

  calculated_total :=
    new.below_1_female::bigint + new.below_1_male
    + new.months_12_59_female + new.months_12_59_male
    + new.years_5_14_female + new.years_5_14_male
    + new.years_15_29_female + new.years_15_29_male
    + new.years_30_64_female + new.years_30_64_male
    + new.years_65_plus_female + new.years_65_plus_male;

  if new.registration_book_total is null
    or new.registration_book_total = calculated_total then
    new.discrepancy_confirmed := false;
    new.discrepancy_confirmed_by := null;
    new.discrepancy_confirmed_at := null;
  elsif not new.discrepancy_confirmed then
    raise exception 'Confirm the registration-book total discrepancy before saving';
  else
    new.discrepancy_confirmed_by := auth.uid();
    new.discrepancy_confirmed_at := now();
  end if;

  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger monthly_diagnosis_counts_validate
before insert or update on public.monthly_diagnosis_counts
for each row execute function public.validate_monthly_diagnosis_count();

create trigger monthly_diagnosis_counts_set_updated_at
before update on public.monthly_diagnosis_counts
for each row execute function public.set_updated_at();

alter table public.monthly_diagnosis_counts enable row level security;

create policy "Facility members can read monthly diagnosis counts"
  on public.monthly_diagnosis_counts for select to authenticated
  using (public.is_facility_member(facility_id));

create policy "Authorized staff can add monthly diagnosis counts"
  on public.monthly_diagnosis_counts for insert to authenticated
  with check (public.can_write_encounters(facility_id));

create policy "Authorized staff can update monthly diagnosis counts"
  on public.monthly_diagnosis_counts for update to authenticated
  using (public.can_write_encounters(facility_id))
  with check (public.can_write_encounters(facility_id));

create policy "Facility owners and admins can delete monthly diagnosis counts"
  on public.monthly_diagnosis_counts for delete to authenticated
  using (public.can_manage_facility(facility_id));

create function public.save_monthly_diagnosis_counts(
  p_facility_id uuid,
  p_entries jsonb
)
returns setof public.monthly_diagnosis_counts
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  entry jsonb;
  input record;
  current_row public.monthly_diagnosis_counts%rowtype;
  saved_row public.monthly_diagnosis_counts%rowtype;
  batch_year integer;
  batch_month smallint;
  seen_diagnoses text[] := array[]::text[];
begin
  if auth.uid() is null or not public.can_write_encounters(p_facility_id) then
    raise exception 'You are not authorized to save aggregate summaries for this facility'
      using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Provide monthly diagnosis summaries as a JSON array';
  end if;
  if jsonb_array_length(p_entries) = 0 then
    raise exception 'Provide at least one monthly diagnosis summary';
  end if;

  for entry in select value from jsonb_array_elements(p_entries)
  loop
    select *
      into input
    from jsonb_to_record(entry) as fields(
      id text,
      reporting_year integer,
      reporting_month smallint,
      diagnosis_id text,
      diagnosis_source text,
      below_1_female integer,
      below_1_male integer,
      months_12_59_female integer,
      months_12_59_male integer,
      years_5_14_female integer,
      years_5_14_male integer,
      years_15_29_female integer,
      years_15_29_male integer,
      years_30_64_female integer,
      years_30_64_male integer,
      years_65_plus_female integer,
      years_65_plus_male integer,
      registration_book_total bigint,
      notes text,
      discrepancy_confirmed boolean,
      expected_updated_at timestamptz
    );

    if batch_year is null then
      batch_year := input.reporting_year;
      batch_month := input.reporting_month;
    elsif batch_year <> input.reporting_year or batch_month <> input.reporting_month then
      raise exception 'A batch can contain summaries for only one reporting month';
    end if;

    if input.diagnosis_id = any(seen_diagnoses) then
      raise exception 'A diagnosis may appear only once in a monthly batch';
    end if;
    seen_diagnoses := array_append(seen_diagnoses, input.diagnosis_id);

    select *
      into current_row
    from public.monthly_diagnosis_counts as existing
    where existing.facility_id = p_facility_id
      and existing.reporting_year = input.reporting_year
      and existing.reporting_month = input.reporting_month
      and existing.diagnosis_id = input.diagnosis_id
    for update;

    if found then
      if input.id is distinct from current_row.id
        or input.expected_updated_at is null
        or input.expected_updated_at is distinct from current_row.updated_at then
        raise exception 'A summary already exists or was updated by another user. Reload it and use Edit before saving.';
      end if;

      update public.monthly_diagnosis_counts
      set reporting_year = input.reporting_year,
          reporting_month = input.reporting_month,
          diagnosis_id = input.diagnosis_id,
          diagnosis_source = input.diagnosis_source,
          below_1_female = input.below_1_female,
          below_1_male = input.below_1_male,
          months_12_59_female = input.months_12_59_female,
          months_12_59_male = input.months_12_59_male,
          years_5_14_female = input.years_5_14_female,
          years_5_14_male = input.years_5_14_male,
          years_15_29_female = input.years_15_29_female,
          years_15_29_male = input.years_15_29_male,
          years_30_64_female = input.years_30_64_female,
          years_30_64_male = input.years_30_64_male,
          years_65_plus_female = input.years_65_plus_female,
          years_65_plus_male = input.years_65_plus_male,
          registration_book_total = input.registration_book_total,
          notes = input.notes,
          discrepancy_confirmed = input.discrepancy_confirmed
      where facility_id = p_facility_id
        and id = current_row.id
      returning * into saved_row;
    else
      if input.expected_updated_at is not null then
        raise exception 'This summary no longer exists. Reload the month before saving.';
      end if;

      insert into public.monthly_diagnosis_counts (
        id, facility_id, reporting_year, reporting_month, diagnosis_id, diagnosis_source,
        below_1_female, below_1_male, months_12_59_female, months_12_59_male,
        years_5_14_female, years_5_14_male, years_15_29_female, years_15_29_male,
        years_30_64_female, years_30_64_male, years_65_plus_female, years_65_plus_male,
        registration_book_total, notes, discrepancy_confirmed
      )
      values (
        input.id, p_facility_id, input.reporting_year, input.reporting_month,
        input.diagnosis_id, input.diagnosis_source,
        input.below_1_female, input.below_1_male,
        input.months_12_59_female, input.months_12_59_male,
        input.years_5_14_female, input.years_5_14_male,
        input.years_15_29_female, input.years_15_29_male,
        input.years_30_64_female, input.years_30_64_male,
        input.years_65_plus_female, input.years_65_plus_male,
        input.registration_book_total, input.notes, input.discrepancy_confirmed
      )
      returning * into saved_row;
    end if;

    return next saved_row;
  end loop;
end;
$$;

revoke all on public.monthly_diagnosis_counts from public, anon, authenticated;
grant select on public.monthly_diagnosis_counts to authenticated;
grant delete on public.monthly_diagnosis_counts to authenticated;

revoke all on function public.validate_monthly_diagnosis_count() from public, anon, authenticated;
revoke all on function public.save_monthly_diagnosis_counts(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_monthly_diagnosis_counts(uuid, jsonb) to authenticated;

commit;
