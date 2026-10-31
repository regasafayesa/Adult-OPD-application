-- Allow authorized facility writers to remove failed as well as imported
-- document history. Deleting history never deletes imported records.

begin;

do $preflight$
begin
  if to_regclass('public.document_imports') is null
    or to_regprocedure('public.can_write_encounters(uuid)') is null then
    raise exception 'Document imports or the facility authorization helper are missing; apply the document imports migration first.';
  end if;
end
$preflight$;

drop policy if exists "Authorized staff can delete imported document history"
  on public.document_imports;

create policy "Authorized staff can delete imported or failed document history"
  on public.document_imports for delete to authenticated
  using (
    public.can_write_encounters(facility_id)
    and status in ('imported', 'failed')
  );

grant delete on public.document_imports to authenticated;

commit;
