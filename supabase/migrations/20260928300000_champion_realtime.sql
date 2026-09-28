-- =====================================================================
-- Wochen Champion – Phase 4C2B2: Wochen-Champion (serverseitig) + Realtime-Signal
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
--   1. sync_weekly_champion(p_family_id): wertet alle vollständig abgeschlossenen, noch
--      nicht verarbeiteten Wochen (lokaler Montag, family_settings.timezone) aus, schreibt
--      champion_history idempotent und setzt last_champion_week. Punkte ausschließlich
--      serverseitig aus bestätigten Erledigungen (Punkte-Momentaufnahme).
--   2. family_sync: eine Zeile pro Familie mit Versionszähler. Jede Änderung an einer
--      Familientabelle erhöht den Zähler (Trigger). Clients abonnieren per Realtime NUR
--      diese Tabelle, gefiltert auf family_id, unter RLS.
--      Warum nicht die Einzeltabellen? DELETE-Ereignisse lassen sich in Supabase Realtime
--      weder filtern noch per RLS prüfen (sie würden als ID-Ereignisse fremder Familien
--      ankommen), und die Assignment-Tabellen waren nicht publiziert. Ein gefiltertes,
--      RLS-geschütztes Signal pro Familie deckt INSERT/UPDATE/DELETE aller Tabellen ab.
-- =====================================================================

begin;

do $$
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: Entwurf nur für ein Testprojekt. Vorher "set app.migration_target = ''test'';" ausführen.';
  end if;
end
$$;

-- ---------------------------------------------------------------------
-- 1. Wochen-Champion
-- ---------------------------------------------------------------------
-- Lokaler Montag der Woche, in der p_ts in der Zeitzone p_tz liegt.
create or replace function private.local_week_start(p_ts timestamptz, p_tz text)
returns date
language sql
immutable
set search_path = ''
as $$
  select ((p_ts at time zone p_tz)::date - (extract(isodow from (p_ts at time zone p_tz))::int - 1));
$$;

-- Kern mit explizitem „jetzt“ (für Tests der Wochen-/Zeitzonenlogik). Nicht über die API
-- erreichbar (Schema private). Regeln (wie LEGACY, wo eindeutig):
--   • Punkte: Summe completions.points mit status='confirmed' und completion_date in der Woche
--   • Sieger: meiste Punkte; Gleichstand → kleinere profiles.sort_order (LEGACY: stabile
--     Sortierung in Mitgliederreihenfolge), danach profiles.id (stabil)
--   • 0 Punkte in der Woche → kein Champion, Woche gilt trotzdem als verarbeitet
--   • Catch-up: alle abgeschlossenen Wochen nach last_champion_week (max. 104 Wochen zurück;
--     ohne Marker ab der Woche der Familiengründung bzw. der ersten Erledigung)
create or replace function private.sync_weekly_champion_at(p_family_id uuid, p_now timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings   public.family_settings%rowtype;
  v_cur_week   date;
  v_last_done  date;          -- letzte vollständig abgeschlossene Woche
  v_from       date;
  v_week       date;
  v_winner     record;
  v_created    jsonb := '[]'::jsonb;
  v_processed  integer := 0;
  v_new_latest boolean := false;
  v_id         uuid;
  v_first      date;
begin
  perform private.require_family_admin(p_family_id);

  -- Sperre: parallele Aufrufe derselben Familie laufen nacheinander (zusätzlich unique(family_id, week_start)).
  select * into v_settings from public.family_settings where family_id = p_family_id for update;
  if not found then raise exception 'Einstellungen fehlen' using errcode = 'P0002'; end if;

  v_cur_week  := private.local_week_start(p_now, coalesce(v_settings.timezone, 'Europe/Berlin'));
  v_last_done := v_cur_week - 7;

  if v_settings.last_champion_week is not null then
    v_from := v_settings.last_champion_week + 7;
  else
    select least(
             private.local_week_start(f.created_at, coalesce(v_settings.timezone, 'Europe/Berlin')),
             coalesce((select min(c.completion_date) - (extract(isodow from min(c.completion_date))::int - 1)
                         from public.completions c where c.family_id = p_family_id), 'infinity'::date))
      into v_first from public.families f where f.id = p_family_id;
    v_from := v_first;
  end if;
  v_from := greatest(v_from, v_last_done - 7 * 103);

  v_week := v_from;
  while v_week <= v_last_done loop
    v_processed := v_processed + 1;
    select p.id, p.name, p.avatar_emoji, sum(c.points)::integer as pts
      into v_winner
      from public.completions c
      join public.profiles p on p.family_id = c.family_id and p.id = c.profile_id
     where c.family_id = p_family_id and c.status = 'confirmed'
       and c.completion_date between v_week and v_week + 6
     group by p.id, p.name, p.avatar_emoji, p.sort_order
    having sum(c.points) > 0
     order by sum(c.points) desc, p.sort_order asc, p.id asc
     limit 1;
    if found then
      insert into public.champion_history (family_id, profile_id, profile_name, profile_avatar, week_start, points)
      values (p_family_id, v_winner.id, v_winner.name, v_winner.avatar_emoji, v_week, v_winner.pts)
      on conflict (family_id, week_start) do nothing
      returning id into v_id;
      if v_id is not null then
        v_created := v_created || jsonb_build_object('week_start', v_week, 'profile_id', v_winner.id, 'points', v_winner.pts);
        if v_week = v_last_done then v_new_latest := true; end if;
      end if;
      v_id := null;
    end if;
    v_week := v_week + 7;
  end loop;

  if v_processed > 0 then
    update public.family_settings set last_champion_week = v_last_done where family_id = p_family_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'processed_weeks', v_processed,
    'created', v_created,
    'last_champion_week', case when v_processed > 0 then v_last_done else v_settings.last_champion_week end,
    'new_champion', v_new_latest,
    -- Rangliste der zuletzt abgeschlossenen Woche (nur für die Zeremonie, nur wenn neu erzeugt)
    'latest', case when v_new_latest then (
       select jsonb_build_object('week_start', v_last_done, 'ranking', coalesce(jsonb_agg(jsonb_build_object('profile_id', r.profile_id, 'points', r.pts) order by r.pts desc, r.sort_order, r.profile_id), '[]'::jsonb))
         from (select c.profile_id, p.sort_order, sum(c.points)::integer pts
                 from public.completions c join public.profiles p on p.family_id = c.family_id and p.id = c.profile_id
                where c.family_id = p_family_id and c.status = 'confirmed' and c.completion_date between v_last_done and v_last_done + 6
                group by c.profile_id, p.sort_order having sum(c.points) > 0) r)
     else null end
  );
end;
$$;

create or replace function public.sync_weekly_champion(p_family_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.sync_weekly_champion_at(p_family_id, now());
$$;

revoke all on function private.local_week_start(timestamptz, text) from public;
revoke all on function private.sync_weekly_champion_at(uuid, timestamptz) from public;
grant execute on function private.local_week_start(timestamptz, text) to authenticated;
grant execute on function private.sync_weekly_champion_at(uuid, timestamptz) to authenticated;
revoke all on function public.sync_weekly_champion(uuid) from public, anon;
grant execute on function public.sync_weekly_champion(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Realtime-Signal pro Familie
-- ---------------------------------------------------------------------
create table public.family_sync (
  family_id   uuid primary key references public.families (id) on delete cascade,
  version     bigint not null default 0,
  changed_at  timestamptz not null default now()
);
alter table public.family_sync enable row level security;
revoke all on public.family_sync from anon, authenticated;
grant select on public.family_sync to authenticated;
create policy family_sync_select on public.family_sync for select to authenticated
  using (private.is_family_member(family_id));

-- Bestehende Familien einmalig anlegen
insert into public.family_sync (family_id) select id from public.families on conflict do nothing;

create or replace function private.bump_family_sync()
returns trigger
language plpgsql
security definer   -- family_sync ist für Clients nur lesbar
set search_path = ''
as $$
declare v_family uuid;
begin
  if tg_table_name = 'families' then
    if tg_op = 'DELETE' then return null; end if;
    v_family := new.id;
  elsif tg_op = 'DELETE' then
    v_family := old.family_id;
  else
    v_family := new.family_id;
  end if;
  -- Beim Löschen einer ganzen Familie existiert sie nicht mehr → nichts signalisieren.
  insert into public.family_sync as s (family_id, version, changed_at)
  select v_family, 1, now() where exists (select 1 from public.families where id = v_family)
  on conflict (family_id) do update set version = s.version + 1, changed_at = now();
  return null;
end;
$$;
revoke all on function private.bump_family_sync() from public;

do $$
declare t text;
begin
  foreach t in array array[
    'families', 'family_settings', 'profiles', 'categories', 'category_assignments', 'tasks',
    'task_assignments', 'rewards', 'reward_assignments', 'completions', 'redemptions', 'champion_history'
  ]
  loop
    execute format('create trigger %1$s_bump_sync after insert or update or delete on public.%1$I
                    for each row execute function private.bump_family_sync();', t);
  end loop;
end
$$;

alter publication supabase_realtime add table public.family_sync;

commit;
