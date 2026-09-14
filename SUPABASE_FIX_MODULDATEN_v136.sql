-- Rudelbar v136 – moduldaten vollständig für angemeldete Nutzer freigeben
begin;

alter table public.moduldaten enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.moduldaten to authenticated;

drop policy if exists "moduldaten_select_authenticated" on public.moduldaten;
drop policy if exists "moduldaten_insert_authenticated" on public.moduldaten;
drop policy if exists "moduldaten_update_authenticated" on public.moduldaten;
drop policy if exists "moduldaten_delete_authenticated" on public.moduldaten;
drop policy if exists "moduldaten_authenticated_select" on public.moduldaten;
drop policy if exists "moduldaten_authenticated_insert" on public.moduldaten;
drop policy if exists "moduldaten_authenticated_update" on public.moduldaten;
drop policy if exists "moduldaten_authenticated_delete" on public.moduldaten;

create policy "moduldaten_authenticated_select"
on public.moduldaten for select
to authenticated
using (true);

create policy "moduldaten_authenticated_insert"
on public.moduldaten for insert
to authenticated
with check (true);

create policy "moduldaten_authenticated_update"
on public.moduldaten for update
to authenticated
using (true)
with check (true);

create policy "moduldaten_authenticated_delete"
on public.moduldaten for delete
to authenticated
using (true);

-- Realtime hinzufügen, falls noch nicht enthalten.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moduldaten'
  ) then
    alter publication supabase_realtime add table public.moduldaten;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
