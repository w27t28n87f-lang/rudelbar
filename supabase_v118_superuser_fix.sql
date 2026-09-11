-- RUDELBAR v118 – Besitzer wieder als Superuser setzen
-- Einmal komplett im Supabase SQL Editor ausführen.
-- Diese Migration betrifft nur das unten angegebene Besitzerkonto.

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

-- Kontrolle: muss für das Besitzerkonto "superuser" anzeigen.
select u.email, r.rolle
from auth.users u
left join public.app_roles r on r.user_id = u.id
where lower(u.email) = lower('martin_kuester1988@web.de');
