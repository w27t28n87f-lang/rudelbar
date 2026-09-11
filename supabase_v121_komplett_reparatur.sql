-- RUDELBAR v121 – komplette Reparatur für Rollen + Kontolöschung
-- Diese Datei EINMAL vollständig im Supabase SQL Editor ausführen.

create table if not exists public.app_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rolle text not null default 'mitarbeiter',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Eigentümer dauerhaft als Superuser setzen
insert into public.app_roles(user_id, rolle, updated_at)
select id, 'superuser', now()
from auth.users
where lower(email)=lower('martin_kuester1988@web.de')
on conflict(user_id) do update
set rolle='superuser', updated_at=now();

insert into public.app_admins(user_id)
select id
from auth.users
where lower(email)=lower('martin_kuester1988@web.de')
on conflict(user_id) do nothing;

-- Rollenabfrage
create or replace function public.get_rudelbar_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when exists(
      select 1 from auth.users u
      where u.id=auth.uid()
        and lower(coalesce(u.email,''))=lower('martin_kuester1988@web.de')
    ) then 'superuser'
    else coalesce(
      (select rolle from public.app_roles where user_id=auth.uid()),
      'mitarbeiter'
    )
  end;
$$;

revoke all on function public.get_rudelbar_role() from public;
grant execute on function public.get_rudelbar_role() to authenticated;

create or replace function public.is_rudelbar_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.get_rudelbar_role()='superuser';
$$;

revoke all on function public.is_rudelbar_admin() from public;
grant execute on function public.is_rudelbar_admin() to authenticated;

-- Wichtig: alte/abweichende Funktion ohne Parameter entfernen und exakt neu anlegen.
drop function if exists public.delete_my_rudelbar_account();

create function public.delete_my_rudelbar_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from auth.users
  where id = v_uid;

  if not found then
    raise exception 'USER_NOT_FOUND';
  end if;

  return true;
end;
$$;

revoke all on function public.delete_my_rudelbar_account() from public;
grant execute on function public.delete_my_rudelbar_account() to authenticated;

-- PostgREST/Supabase explizit zwingen, die neue RPC sofort in den Schema-Cache zu laden.
notify pgrst, 'reload schema';

-- Kontrolle. Erwartet: superuser | delete_my_rudelbar_account | leer bei parameter
select
  (select r.rolle
   from public.app_roles r
   join auth.users u on u.id=r.user_id
   where lower(u.email)=lower('martin_kuester1988@web.de')
   limit 1) as besitzer_rolle,
  p.proname as funktion,
  pg_get_function_identity_arguments(p.oid) as parameter
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname='delete_my_rudelbar_account';
