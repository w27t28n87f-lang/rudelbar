-- RUDELBAR v111 – sichere Einladung ohne Edge Function
-- Einmal im Supabase SQL Editor ausführen.
-- Danach in Authentication > Providers > Email "Allow new users to sign up" aktivieren.
-- Optional für sofortigen Login: "Confirm email" deaktivieren.

create extension if not exists pgcrypto;

-- Vorhandene Einladungstabelle ergänzen, falls ältere Versionen genutzt wurden.
create table if not exists public.einladungen (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid
);

alter table public.einladungen add column if not exists used_by uuid;
create unique index if not exists einladungen_token_upper_idx on public.einladungen (upper(token));

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

  select id
    into v_invite_id
    from public.einladungen
   where upper(token) = v_token
     and used_at is null
     and expires_at > now()
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

drop trigger if exists rudelbar_invite_before_signup on auth.users;
create trigger rudelbar_invite_before_signup
before insert on auth.users
for each row
execute function public.rudelbar_validate_invite_on_signup();

-- Kontrolle: sollte genau eine Zeile mit dem Triggernamen liefern.
select trigger_name, event_manipulation
from information_schema.triggers
where event_object_schema = 'auth'
  and event_object_table = 'users'
  and trigger_name = 'rudelbar_invite_before_signup';
