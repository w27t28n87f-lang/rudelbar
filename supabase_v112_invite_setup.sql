-- RUDELBAR v112 – vollständiges Invite-/Registrierungs-Setup
-- Einmal komplett im Supabase SQL Editor ausführen.
-- Danach: Authentication -> Providers -> Email -> "Allow new users to sign up" = EIN.
-- Der Trigger unten blockiert trotzdem jede Registrierung ohne gültige Rudelbar-Einladung.

create extension if not exists pgcrypto;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Falls noch kein Admin existiert, wird der älteste vorhandene Auth-Benutzer Admin.
insert into public.app_admins (user_id)
select id
from auth.users
where not exists (select 1 from public.app_admins)
order by created_at asc
limit 1
on conflict (user_id) do nothing;

create table if not exists public.einladungen (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

alter table public.einladungen add column if not exists used_by uuid references auth.users(id) on delete set null;
create unique index if not exists einladungen_token_upper_idx on public.einladungen (upper(token));

create or replace function public.is_rudelbar_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins a where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_rudelbar_admin() to authenticated;

alter table public.app_admins enable row level security;
alter table public.einladungen enable row level security;

-- Alte Policies mit unseren Namen sauber ersetzen.
drop policy if exists rudelbar_admins_read_self on public.app_admins;
create policy rudelbar_admins_read_self
on public.app_admins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists rudelbar_invites_admin_select on public.einladungen;
create policy rudelbar_invites_admin_select
on public.einladungen for select
to authenticated
using (public.is_rudelbar_admin());

drop policy if exists rudelbar_invites_admin_insert on public.einladungen;
create policy rudelbar_invites_admin_insert
on public.einladungen for insert
to authenticated
with check (public.is_rudelbar_admin() and created_by = auth.uid());

drop policy if exists rudelbar_invites_admin_delete on public.einladungen;
create policy rudelbar_invites_admin_delete
on public.einladungen for delete
to authenticated
using (public.is_rudelbar_admin());

-- Prüft den Invite DIREKT in der Auth-Transaktion. Keine Edge Function nötig.
create or replace function public.rudelbar_validate_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_token text;
  v_invite_id uuid;
begin
  v_token := upper(trim(coalesce(new.raw_user_meta_data ->> 'rudelbar_invite_token', '')));

  if v_token = '' then
    raise exception 'RUDELBAR_INVITE_MISSING';
  end if;

  select e.id
    into v_invite_id
    from public.einladungen e
   where upper(e.token) = v_token
     and e.used_at is null
     and e.expires_at > now()
   for update;

  if v_invite_id is null then
    raise exception 'RUDELBAR_INVITE_INVALID_OR_EXPIRED';
  end if;

  update public.einladungen
     set used_at = now(),
         used_by = new.id
   where id = v_invite_id;

  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('rudelbar_invited', true);

  return new;
end;
$$;

-- Nur EIN Invite-Trigger auf auth.users.
drop trigger if exists rudelbar_invite_before_signup on auth.users;
create trigger rudelbar_invite_before_signup
before insert on auth.users
for each row
execute function public.rudelbar_validate_invite_on_signup();

-- Diagnose am Ende: diese Abfragen müssen Ergebnisse liefern.
select 'admin_count' as check_name, count(*)::text as value from public.app_admins
union all
select 'invite_trigger', count(*)::text
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
  and trigger_name = 'rudelbar_invite_before_signup'
union all
select 'is_admin_function', count(*)::text
from information_schema.routines
where routine_schema='public' and routine_name='is_rudelbar_admin';
