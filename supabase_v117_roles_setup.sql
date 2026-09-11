-- RUDELBAR v117 – Rollen, Einladungen und eigenes Konto löschen
-- Einmal komplett im Supabase SQL Editor ausführen.

create extension if not exists pgcrypto;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rolle text not null default 'mitarbeiter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_roles_rolle_check'
      and conrelid = 'public.app_roles'::regclass
  ) then
    alter table public.app_roles
      add constraint app_roles_rolle_check check (rolle in ('superuser','mitarbeiter'));
  end if;
end $$;

create table if not exists public.einladungen (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  rolle text not null default 'mitarbeiter',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

alter table public.einladungen add column if not exists rolle text not null default 'mitarbeiter';
alter table public.einladungen add column if not exists used_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'einladungen_rolle_check'
      and conrelid = 'public.einladungen'::regclass
  ) then
    alter table public.einladungen
      add constraint einladungen_rolle_check check (rolle in ('superuser','mitarbeiter'));
  end if;
end $$;

create unique index if not exists einladungen_token_upper_idx on public.einladungen (upper(token));

-- Ältester bestehender Auth-Benutzer bleibt/ist der erste Superuser.
insert into public.app_admins (user_id)
select id
from auth.users
where not exists (select 1 from public.app_admins)
order by created_at asc
limit 1
on conflict (user_id) do nothing;

-- Bestehende Admins als Superuser übernehmen.
insert into public.app_roles (user_id, rolle)
select user_id, 'superuser'
from public.app_admins
on conflict (user_id) do update set rolle='superuser', updated_at=now();

-- Alle übrigen bestehenden Benutzer werden Mitarbeiter.
insert into public.app_roles (user_id, rolle)
select u.id, 'mitarbeiter'
from auth.users u
where not exists (select 1 from public.app_roles r where r.user_id=u.id)
on conflict (user_id) do nothing;

create or replace function public.is_rudelbar_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_roles r
    where r.user_id = auth.uid() and r.rolle = 'superuser'
  );
$$;

grant execute on function public.is_rudelbar_admin() to authenticated;

create or replace function public.get_rudelbar_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.rolle from public.app_roles r where r.user_id = auth.uid()),
    'mitarbeiter'
  );
$$;

grant execute on function public.get_rudelbar_role() to authenticated;

alter table public.app_admins enable row level security;
alter table public.app_roles enable row level security;
alter table public.einladungen enable row level security;

drop policy if exists rudelbar_admins_read_self on public.app_admins;
create policy rudelbar_admins_read_self
on public.app_admins for select
to authenticated
using (user_id = auth.uid());

drop policy if exists rudelbar_roles_read_self on public.app_roles;
create policy rudelbar_roles_read_self
on public.app_roles for select
to authenticated
using (user_id = auth.uid() or public.is_rudelbar_admin());

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

-- Invite prüfen und die Rolle sicher aus der Einladung übernehmen.
create or replace function public.rudelbar_validate_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_token text;
  v_invite_id uuid;
  v_role text;
begin
  v_token := upper(trim(coalesce(new.raw_user_meta_data ->> 'rudelbar_invite_token', '')));

  if v_token = '' then
    raise exception 'RUDELBAR_INVITE_MISSING';
  end if;

  select e.id, coalesce(e.rolle, 'mitarbeiter')
    into v_invite_id, v_role
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
    || jsonb_build_object(
      'rudelbar_invited', true,
      'rudelbar_role', v_role
    );

  return new;
end;
$$;

drop trigger if exists rudelbar_invite_before_signup on auth.users;
create trigger rudelbar_invite_before_signup
before insert on auth.users
for each row
execute function public.rudelbar_validate_invite_on_signup();

-- Nach Erstellung des Auth-Benutzers die serverseitige Rolle speichern.
create or replace function public.rudelbar_role_after_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  v_role := case
    when coalesce(new.raw_user_meta_data ->> 'rudelbar_role','') = 'superuser'
      then 'superuser'
    else 'mitarbeiter'
  end;

  insert into public.app_roles(user_id, rolle, updated_at)
  values(new.id, v_role, now())
  on conflict (user_id) do update
    set rolle = excluded.rolle,
        updated_at = now();

  if v_role = 'superuser' then
    insert into public.app_admins(user_id)
    values(new.id)
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists rudelbar_role_after_signup on auth.users;
create trigger rudelbar_role_after_signup
after insert on auth.users
for each row
execute function public.rudelbar_role_after_signup();

-- Jeder angemeldete Nutzer darf ausschließlich sein EIGENES Auth-Konto löschen.
create or replace function public.delete_my_rudelbar_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_my_rudelbar_account() to authenticated;

-- Diagnose
select 'role_rows' as check_name, count(*)::text as value from public.app_roles
union all
select 'superusers', count(*)::text from public.app_roles where rolle='superuser'
union all
select 'invite_role_column', count(*)::text
from information_schema.columns
where table_schema='public' and table_name='einladungen' and column_name='rolle'
union all
select 'get_role_function', count(*)::text
from information_schema.routines
where routine_schema='public' and routine_name='get_rudelbar_role'
union all
select 'delete_account_function', count(*)::text
from information_schema.routines
where routine_schema='public' and routine_name='delete_my_rudelbar_account';
