-- RUDELBAR v60 – zentrale Datensynchronisation für Mode, Service und Security
-- Diesen kompletten Block einmal im Supabase SQL Editor ausführen.

create table if not exists public.moduldaten (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bereich text not null,
  modul text not null,
  daten jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists moduldaten_user_bereich_modul_idx
  on public.moduldaten (user_id, bereich, modul);

alter table public.moduldaten enable row level security;

drop policy if exists "moduldaten_select_own" on public.moduldaten;
create policy "moduldaten_select_own"
on public.moduldaten for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "moduldaten_insert_own" on public.moduldaten;
create policy "moduldaten_insert_own"
on public.moduldaten for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "moduldaten_update_own" on public.moduldaten;
create policy "moduldaten_update_own"
on public.moduldaten for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "moduldaten_delete_own" on public.moduldaten;
create policy "moduldaten_delete_own"
on public.moduldaten for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_moduldaten_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_moduldaten_updated_at on public.moduldaten;
create trigger set_moduldaten_updated_at
before update on public.moduldaten
for each row execute function public.set_moduldaten_updated_at();

-- Realtime nur hinzufügen, wenn die Tabelle noch nicht Teil der Publication ist.
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
