-- RUDELBAR v119 – Besitzer dauerhaft als Superuser verankern
-- Einmal komplett im Supabase SQL Editor ausführen.

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

-- Besitzerkonto explizit als Superuser setzen.
insert into public.app_roles (user_id, rolle, updated_at)
select id, 'superuser', now()
from auth.users
where lower(email) = lower('martin_kuester1988@web.de')
on conflict (user_id) do update
set rolle = 'superuser', updated_at = now();

insert into public.app_admins (user_id)
select id
from auth.users
where lower(email) = lower('martin_kuester1988@web.de')
on conflict (user_id) do nothing;

-- Serverseitige Adminprüfung: Besitzer-E-Mail ODER gespeicherte Superuser-Rolle.
create or replace function public.is_rudelbar_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(coalesce(u.email,'')) = lower('martin_kuester1988@web.de')
  )
  or exists (
    select 1
    from public.app_roles r
    where r.user_id = auth.uid() and r.rolle = 'superuser'
  );
$$;

grant execute on function public.is_rudelbar_admin() to authenticated;

-- Rollenabruf: Besitzer kann niemals versehentlich als Mitarbeiter zurückkommen.
create or replace function public.get_rudelbar_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select case
    when exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and lower(coalesce(u.email,'')) = lower('martin_kuester1988@web.de')
    ) then 'superuser'
    else coalesce(
      (select r.rolle from public.app_roles r where r.user_id = auth.uid()),
      'mitarbeiter'
    )
  end;
$$;

grant execute on function public.get_rudelbar_role() to authenticated;

-- Kontrolle: diese beiden Werte müssen superuser / true liefern.
select
  u.email,
  public.get_rudelbar_role() as aktuelle_rolle,
  public.is_rudelbar_admin() as ist_admin
from auth.users u
where u.id = auth.uid();
