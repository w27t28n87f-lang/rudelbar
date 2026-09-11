-- RUDELBAR v120 – Reparatur: Superuser + eigenes Konto löschen
-- Diese Datei ist absichtlich eigenständig. Nur diese eine Datei komplett ausführen.

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

-- Besitzer sicher als Superuser setzen
insert into public.app_roles(user_id, rolle, updated_at)
select id, 'superuser', now() from auth.users
where lower(email)=lower('martin_kuester1988@web.de')
on conflict(user_id) do update set rolle='superuser', updated_at=now();

insert into public.app_admins(user_id)
select id from auth.users where lower(email)=lower('martin_kuester1988@web.de')
on conflict(user_id) do nothing;

create or replace function public.get_rudelbar_role()
returns text
language sql stable security definer
set search_path = public, auth
as $$
 select case
   when exists(select 1 from auth.users u where u.id=auth.uid() and lower(coalesce(u.email,''))=lower('martin_kuester1988@web.de')) then 'superuser'
   else coalesce((select rolle from public.app_roles where user_id=auth.uid()),'mitarbeiter')
 end;
$$;
grant execute on function public.get_rudelbar_role() to authenticated;

create or replace function public.is_rudelbar_admin()
returns boolean
language sql stable security definer
set search_path = public, auth
as $$
 select public.get_rudelbar_role()='superuser';
$$;
grant execute on function public.is_rudelbar_admin() to authenticated;

-- Eigenes Konto löschen. Explizites auth.users delete, nur für auth.uid().
create or replace function public.delete_my_rudelbar_account()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  delete from auth.users where id=v_uid;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return true;
end;
$$;
revoke all on function public.delete_my_rudelbar_account() from public;
grant execute on function public.delete_my_rudelbar_account() to authenticated;

-- Kontrolle ohne auth.uid(): zeigt, ob Besitzerrolle und Funktion vorhanden sind.
select
  (select rolle from public.app_roles r join auth.users u on u.id=r.user_id where lower(u.email)=lower('martin_kuester1988@web.de')) as besitzer_rolle,
  exists(select 1 from information_schema.routines where routine_schema='public' and routine_name='delete_my_rudelbar_account') as loeschfunktion_vorhanden;
