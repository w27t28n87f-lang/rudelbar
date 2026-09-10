-- RUDELBAR v80: atomare fortlaufende Rechnungs-/Bestellnummern
-- Einmal im Supabase SQL Editor ausführen.

create table if not exists public.nummernkreise (
  bereich text not null,
  jahr integer not null,
  letzter_wert integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bereich, jahr)
);

alter table public.nummernkreise enable row level security;
revoke all on table public.nummernkreise from anon, authenticated;

create or replace function public.naechste_rudelbar_nummer(p_bereich text, p_jahr integer default extract(year from now())::integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nummer integer;
  v_prefix text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet';
  end if;

  v_prefix := case p_bereich
    when 'mode' then 'RBM'
    when 'service' then 'RBF'
    when 'security' then 'RBS'
    else null
  end;

  if v_prefix is null then
    raise exception 'Unbekannter Rechnungsbereich';
  end if;

  insert into public.nummernkreise (bereich, jahr, letzter_wert)
  values (p_bereich, p_jahr, 1)
  on conflict (bereich, jahr)
  do update set letzter_wert = public.nummernkreise.letzter_wert + 1,
                updated_at = now()
  returning letzter_wert into v_nummer;

  return v_prefix || '-' || p_jahr::text || '-' || lpad(v_nummer::text, 4, '0');
end;
$$;

revoke all on function public.naechste_rudelbar_nummer(text, integer) from public, anon;
grant execute on function public.naechste_rudelbar_nummer(text, integer) to authenticated;
