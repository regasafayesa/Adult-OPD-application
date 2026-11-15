-- Allow Ethiopian aggregate months, including Pagume, without rewriting existing rows.
-- Review and apply this in the Supabase SQL Editor before saving new aggregate counts.
-- Existing monthly_diagnosis_counts rows keep their reporting_year and reporting_month.
-- The new reporting_calendar column defaults to 'gregorian', which matches the five
-- rows saved in November 2026 as months 10 and 11 (Gregorian October and November).
-- New application saves send reporting_calendar = 'ethiopian' and an Ethiopian year/month.
-- Encounter dates are not modified. Encounter reporting_month and reporting_year stay
-- Gregorian generated columns; the application derives Ethiopian periods itself.

begin;

do $preflight$
begin
  if to_regclass('public.monthly_diagnosis_counts') is null
    or to_regprocedure('public.save_monthly_diagnosis_counts(uuid, jsonb)') is null
    or to_regclass('public.document_imports') is null then
    raise exception 'Required aggregate or document-import schema is missing; inspect the deployed schema before applying this migration.';
  end if;
end
$preflight$;

alter table public.monthly_diagnosis_counts
  add column if not exists reporting_calendar text not null default 'gregorian';

alter table public.monthly_diagnosis_counts
  drop constraint if exists monthly_diagnosis_counts_reporting_calendar_check;

alter table public.monthly_diagnosis_counts
  add constraint monthly_diagnosis_counts_reporting_calendar_check
  check (reporting_calendar in ('gregorian', 'ethiopian'));

do $replace_month_check$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint as con
  join pg_attribute as att
    on att.attrelid = con.conrelid
   and att.attnum = any (con.conkey)
  where con.conrelid = 'public.monthly_diagnosis_counts'::regclass
    and con.contype = 'c'
    and att.attname = 'reporting_month'
    and pg_get_constraintdef(con.oid) not like '%reporting_calendar%';
  if constraint_name is not null then
    execute format('alter table public.monthly_diagnosis_counts drop constraint %I', constraint_name);
  end if;
end
$replace_month_check$;

alter table public.monthly_diagnosis_counts
  drop constraint if exists monthly_diagnosis_counts_reporting_period_check;

alter table public.monthly_diagnosis_counts
  add constraint monthly_diagnosis_counts_reporting_period_check
  check (
    (reporting_calendar = 'gregorian' and reporting_month between 1 and 12)
    or (reporting_calendar = 'ethiopian' and reporting_month between 1 and 13)
  );

do $replace_unique$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint as con
  where con.conrelid = 'public.monthly_diagnosis_counts'::regclass
    and con.contype = 'u'
    and pg_get_constraintdef(con.oid) like '%reporting_year%'
    and pg_get_constraintdef(con.oid) not like '%reporting_calendar%';
  if constraint_name is not null then
    execute format('alter table public.monthly_diagnosis_counts drop constraint %I', constraint_name);
  end if;
end
$replace_unique$;

alter table public.monthly_diagnosis_counts
  drop constraint if exists monthly_diagnosis_counts_period_diagnosis_key;

alter table public.monthly_diagnosis_counts
  add constraint monthly_diagnosis_counts_period_diagnosis_key
  unique (facility_id, reporting_calendar, reporting_year, reporting_month, diagnosis_id);

do $replace_document_month_check$
declare
  constraint_name text;
begin
  select con.conname
    into constraint_name
  from pg_constraint as con
  join pg_attribute as att
    on att.attrelid = con.conrelid
   and att.attnum = any (con.conkey)
  where con.conrelid = 'public.document_imports'::regclass
    and con.contype = 'c'
    and att.attname = 'reporting_month'
    and pg_get_constraintdef(con.oid) like '%12%';
  if constraint_name is not null then
    execute format('alter table public.document_imports drop constraint %I', constraint_name);
  end if;
end
$replace_document_month_check$;

alter table public.document_imports
  drop constraint if exists document_imports_reporting_month_check;

alter table public.document_imports
  add constraint document_imports_reporting_month_check
  check (reporting_month is null or reporting_month between 1 and 13);

create or replace function public.save_monthly_diagnosis_counts(
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
  batch_calendar text;
  calendar_value text;
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
      reporting_calendar text,
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

    calendar_value := coalesce(nullif(btrim(input.reporting_calendar), ''), 'gregorian');
    if calendar_value not in ('gregorian', 'ethiopian') then
      raise exception 'Reporting calendar must be gregorian or ethiopian';
    end if;
    if calendar_value = 'ethiopian'
      and (input.reporting_month < 1 or input.reporting_month > 13) then
      raise exception 'Ethiopian reporting month must be between 1 and 13';
    end if;
    if calendar_value = 'gregorian'
      and (input.reporting_month < 1 or input.reporting_month > 12) then
      raise exception 'Gregorian reporting month must be between 1 and 12';
    end if;

    if batch_year is null then
      batch_year := input.reporting_year;
      batch_month := input.reporting_month;
      batch_calendar := calendar_value;
    elsif batch_year <> input.reporting_year
      or batch_month <> input.reporting_month
      or batch_calendar <> calendar_value then
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
      and existing.reporting_calendar = calendar_value
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
          reporting_calendar = calendar_value,
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
        id, facility_id, reporting_calendar, reporting_year, reporting_month, diagnosis_id, diagnosis_source,
        below_1_female, below_1_male, months_12_59_female, months_12_59_male,
        years_5_14_female, years_5_14_male, years_15_29_female, years_15_29_male,
        years_30_64_female, years_30_64_male, years_65_plus_female, years_65_plus_male,
        registration_book_total, notes, discrepancy_confirmed
      )
      values (
        input.id, p_facility_id, calendar_value, input.reporting_year, input.reporting_month,
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

commit;
