-- RUDELBAR v70 – Teamzugang + Einladungsregistrierung
-- Einmal komplett im Supabase SQL Editor ausführen.

-- =========================================
-- MODULDATEN (falls v60 noch nicht existiert)
-- =========================================
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

-- =========================================
-- ADMIN
-- =========================================
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on table public.app_admins from anon, authenticated;

-- Der älteste bestehende Auth-Benutzer wird beim ersten Einrichten Admin.
insert into public.app_admins (user_id)
select id
from auth.users
order by created_at asc
limit 1
on conflict (user_id) do nothing;

create or replace function public.is_rudelbar_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins where user_id = auth.uid()
  );
$$;

revoke all on function public.is_rudelbar_admin() from public, anon;
grant execute on function public.is_rudelbar_admin() to authenticated;

-- =========================================
-- EINLADUNGEN
-- =========================================
create table if not exists public.einladungen (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

create index if not exists einladungen_token_idx on public.einladungen(token);
create index if not exists einladungen_created_by_idx on public.einladungen(created_by);

alter table public.einladungen enable row level security;

drop policy if exists "admin_select_invites" on public.einladungen;
create policy "admin_select_invites"
on public.einladungen for select
to authenticated
using (public.is_rudelbar_admin());

drop policy if exists "admin_insert_invites" on public.einladungen;
create policy "admin_insert_invites"
on public.einladungen for insert
to authenticated
with check (
  public.is_rudelbar_admin()
  and created_by = auth.uid()
);

drop policy if exists "admin_delete_invites" on public.einladungen;
create policy "admin_delete_invites"
on public.einladungen for delete
to authenticated
using (public.is_rudelbar_admin());

-- Nur die Edge Function mit Service Role darf einen Token verbrauchen.
create or replace function public.claim_rudelbar_invite(p_token text, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.einladungen
  set used_at = now(), used_by = p_user_id
  where token = p_token
    and used_at is null
    and expires_at > now();

  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.claim_rudelbar_invite(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_rudelbar_invite(text, uuid) to service_role;

-- =========================================
-- GEMEINSAME TEAMDATEN
-- =========================================
-- Ab v70 sehen alle authentifizierten Rudelbar-Mitglieder dieselben Moduldaten.
-- Direkte öffentliche Registrierung muss in Supabase Authentication deaktiviert sein.

drop policy if exists "moduldaten_select_own" on public.moduldaten;
drop policy if exists "moduldaten_insert_own" on public.moduldaten;
drop policy if exists "moduldaten_update_own" on public.moduldaten;
drop policy if exists "moduldaten_delete_own" on public.moduldaten;
drop policy if exists "moduldaten_select_team" on public.moduldaten;
drop policy if exists "moduldaten_insert_team" on public.moduldaten;
drop policy if exists "moduldaten_update_team" on public.moduldaten;
drop policy if exists "moduldaten_delete_team" on public.moduldaten;

create policy "moduldaten_select_team"
on public.moduldaten for select
to authenticated
using (true);

create policy "moduldaten_insert_team"
on public.moduldaten for insert
to authenticated
with check (user_id = auth.uid());

create policy "moduldaten_update_team"
on public.moduldaten for update
to authenticated
using (true)
with check (true);

create policy "moduldaten_delete_team"
on public.moduldaten for delete
to authenticated
using (true);

-- Bestehende Kassen-Tabellen ebenfalls für das eingeladene Team freigeben,
-- sofern sie bereits vorhanden sind.
do $$
declare
  t text;
begin
  foreach t in array array['getraenke','verkaeufe','tagesabschluesse'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', 'rudelbar_team_select', t);
      execute format('drop policy if exists %I on public.%I', 'rudelbar_team_insert', t);
      execute format('drop policy if exists %I on public.%I', 'rudelbar_team_update', t);
      execute format('drop policy if exists %I on public.%I', 'rudelbar_team_delete', t);
      execute format('create policy %I on public.%I for select to authenticated using (true)', 'rudelbar_team_select', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (true)', 'rudelbar_team_insert', t);
      execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', 'rudelbar_team_update', t);
      execute format('create policy %I on public.%I for delete to authenticated using (true)', 'rudelbar_team_delete', t);
    end if;
  end loop;
end $$;

-- Realtime für moduldaten sicherstellen.
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
