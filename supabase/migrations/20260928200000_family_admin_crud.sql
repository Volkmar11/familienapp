-- =====================================================================
-- Wochen Champion – Phase 4C2B1: Elternverwaltung (CRUD, Assignments, Sortierung, Quittierung)
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
-- Alle neuen RPCs laufen als SECURITY INVOKER: RLS (owner/parent) bleibt die
-- Sicherheitsgrenze; die Funktionen bündeln lediglich mehrere Schritte atomar
-- (eine RPC = eine Transaktion) und prüfen zusätzlich Rolle und Familienzugehörigkeit.
--
--   1. set_task_assignments / set_category_assignments / set_reward_assignments
--      – Zuordnungen atomar ersetzen (leeres Array = für alle Kinder)
--   2. reorder_items – sort_order einer vollständigen Liste atomar setzen
--   3. remove_task / remove_reward – benutzt → archivieren (active=false), sonst löschen
--   4. remove_profile – mit Historie oder Zuordnungen → archivieren, sonst löschen; letztes aktives Kind geschützt
--   5. delete_category – nur ohne aktive Aufgaben
--   6. Schutz-Trigger: Profile (Historie, Zuordnungen, letztes aktives Kind), Kategorien (aktive Aufgaben),
--      Einlösungs-Quittierung (acknowledged_at/_by serverseitig, unveränderlich)
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
-- Hilfsfunktionen
-- ---------------------------------------------------------------------
create or replace function private.require_family_admin(p_family_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or p_family_id is null or not private.has_family_role(p_family_id, array['owner', 'parent']) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
end;
$$;

-- Profil-IDs prüfen: alle aus dieser Familie, keine Duplikate. Liefert die bereinigte Liste.
-- Archivierte Profile sind erlaubt, damit bestehende Zuordnungen beim Bearbeiten erhalten bleiben
-- (die Oberfläche bietet nur aktive Kinder zur Auswahl an).
create or replace function private.valid_profile_ids(p_family_id uuid, p_profile_ids uuid[])
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_profile_ids, '{}')) x where x is not null), '{}');
begin
  if cardinality(v_ids) <> (select count(*) from public.profiles p
                             where p.family_id = p_family_id and p.id = any (v_ids)) then
    raise exception 'Ungültige Profilzuordnung' using errcode = '22023';
  end if;
  return v_ids;
end;
$$;

revoke all on function private.require_family_admin(uuid) from public;
revoke all on function private.valid_profile_ids(uuid, uuid[]) from public;
grant execute on function private.require_family_admin(uuid) to authenticated;
grant execute on function private.valid_profile_ids(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 1. Assignments atomar ersetzen. Ein Fehler (z. B. fremdes Profil) bricht die
--    gesamte Transaktion ab → die alte Zuordnung bleibt vollständig erhalten.
-- ---------------------------------------------------------------------
create or replace function public.set_task_assignments(p_family_id uuid, p_task_id uuid, p_profile_ids uuid[])
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare v_ids uuid[];
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.tasks where family_id = p_family_id and id = p_task_id for update;
  if not found then raise exception 'Aufgabe nicht gefunden' using errcode = 'P0002'; end if;
  v_ids := private.valid_profile_ids(p_family_id, p_profile_ids);
  delete from public.task_assignments where family_id = p_family_id and task_id = p_task_id;
  insert into public.task_assignments (family_id, task_id, profile_id)
    select p_family_id, p_task_id, x from unnest(v_ids) x;
  return v_ids;
end;
$$;

create or replace function public.set_category_assignments(p_family_id uuid, p_category_id uuid, p_profile_ids uuid[])
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare v_ids uuid[];
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.categories where family_id = p_family_id and id = p_category_id for update;
  if not found then raise exception 'Kategorie nicht gefunden' using errcode = 'P0002'; end if;
  v_ids := private.valid_profile_ids(p_family_id, p_profile_ids);
  delete from public.category_assignments where family_id = p_family_id and category_id = p_category_id;
  insert into public.category_assignments (family_id, category_id, profile_id)
    select p_family_id, p_category_id, x from unnest(v_ids) x;
  return v_ids;
end;
$$;

create or replace function public.set_reward_assignments(p_family_id uuid, p_reward_id uuid, p_profile_ids uuid[])
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare v_ids uuid[];
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.rewards where family_id = p_family_id and id = p_reward_id for update;
  if not found then raise exception 'Belohnung nicht gefunden' using errcode = 'P0002'; end if;
  v_ids := private.valid_profile_ids(p_family_id, p_profile_ids);
  delete from public.reward_assignments where family_id = p_family_id and reward_id = p_reward_id;
  insert into public.reward_assignments (family_id, reward_id, profile_id)
    select p_family_id, p_reward_id, x from unnest(v_ids) x;
  return v_ids;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Reihenfolge: p_ids = gewünschte Reihenfolge (Teilmenge der Familie, z. B. nur
--    aktive Einträge). sort_order = Position (0, 1, 2 …). Alle IDs müssen zur Familie gehören.
-- ---------------------------------------------------------------------
create or replace function public.reorder_items(p_family_id uuid, p_kind text, p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_n integer;
  v_found integer;
begin
  perform private.require_family_admin(p_family_id);
  if p_kind not in ('profiles', 'tasks', 'rewards', 'categories') then
    raise exception 'Ungültiger Bereich' using errcode = '22023';
  end if;
  v_n := coalesce(cardinality(p_ids), 0);
  if v_n = 0 or v_n <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Ungültige Reihenfolge' using errcode = '22023';
  end if;
  execute format('select count(*) from public.%I where family_id = $1 and id = any ($2)', p_kind)
    into v_found using p_family_id, p_ids;
  if v_found <> v_n then
    raise exception 'Ungültige Reihenfolge' using errcode = '22023';
  end if;
  execute format(
    'update public.%I t set sort_order = o.pos - 1
       from unnest($2) with ordinality as o(id, pos)
      where t.family_id = $1 and t.id = o.id and t.sort_order is distinct from o.pos - 1', p_kind)
    using p_family_id, p_ids;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Aufgabe / Belohnung entfernen: Historie bleibt immer erhalten.
--    Ergebnis: { ok: true, mode: 'archived' | 'deleted' }
-- ---------------------------------------------------------------------
create or replace function public.remove_task(p_family_id uuid, p_task_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.tasks where family_id = p_family_id and id = p_task_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from public.completions c where c.family_id = p_family_id and c.task_id = p_task_id) then
    update public.tasks set active = false where family_id = p_family_id and id = p_task_id;
    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;
  delete from public.tasks where family_id = p_family_id and id = p_task_id;
  return jsonb_build_object('ok', true, 'mode', 'deleted');
end;
$$;

create or replace function public.remove_reward(p_family_id uuid, p_reward_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.rewards where family_id = p_family_id and id = p_reward_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from public.redemptions r where r.family_id = p_family_id and r.reward_id = p_reward_id) then
    update public.rewards set active = false where family_id = p_family_id and id = p_reward_id;
    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;
  delete from public.rewards where family_id = p_family_id and id = p_reward_id;
  return jsonb_build_object('ok', true, 'mode', 'deleted');
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Profil entfernen: mit Historie (completions, redemptions, champion_history) oder mit
--    Zuordnungen → archivieren; sonst löschen. Grund für Letzteres: Beim Löschen würden die
--    Zuordnungszeilen kaskadiert entfernt, und eine nur diesem Kind zugeordnete Aufgabe wäre
--    danach plötzlich „für alle“ sichtbar. Das letzte aktive Profil bleibt geschützt.
-- ---------------------------------------------------------------------
create or replace function private.profile_has_history(p_family_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer   -- auch Zeilen berücksichtigen, die der Aufrufer evtl. nicht sieht
set search_path = ''
as $$
  select exists (select 1 from public.completions where family_id = p_family_id and profile_id = p_profile_id)
      or exists (select 1 from public.redemptions where family_id = p_family_id and profile_id = p_profile_id)
      or exists (select 1 from public.champion_history where family_id = p_family_id and profile_id = p_profile_id);
$$;
revoke all on function private.profile_has_history(uuid, uuid) from public;
grant execute on function private.profile_has_history(uuid, uuid) to authenticated;

create or replace function public.remove_profile(p_family_id uuid, p_profile_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_active boolean;
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.families where id = p_family_id for update;   -- serialisiert Profiländerungen pro Familie
  select active into v_active from public.profiles where family_id = p_family_id and id = p_profile_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_active and not exists (select 1 from public.profiles
                               where family_id = p_family_id and active and id <> p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'last_active');
  end if;
  if private.profile_has_history(p_family_id, p_profile_id)
     or exists (select 1 from public.task_assignments where family_id = p_family_id and profile_id = p_profile_id)
     or exists (select 1 from public.category_assignments where family_id = p_family_id and profile_id = p_profile_id)
     or exists (select 1 from public.reward_assignments where family_id = p_family_id and profile_id = p_profile_id) then
    update public.profiles set active = false where family_id = p_family_id and id = p_profile_id;
    return jsonb_build_object('ok', true, 'mode', 'archived');
  end if;
  delete from public.profiles where family_id = p_family_id and id = p_profile_id;
  return jsonb_build_object('ok', true, 'mode', 'deleted');
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Kategorie löschen: nur ohne aktive Aufgaben (keine stille Datenvernichtung).
--    Archivierte Aufgaben verlieren nur die Kategoriezuordnung (FK: set null);
--    ihre Erledigungen behalten den Kategorienamen als Momentaufnahme.
-- ---------------------------------------------------------------------
create or replace function public.delete_category(p_family_id uuid, p_category_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_count integer;
begin
  perform private.require_family_admin(p_family_id);
  perform 1 from public.categories where family_id = p_family_id and id = p_category_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select count(*) into v_count from public.tasks
   where family_id = p_family_id and category_id = p_category_id and active;
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'has_tasks', 'count', v_count);
  end if;
  delete from public.categories where family_id = p_family_id and id = p_category_id;
  return jsonb_build_object('ok', true, 'mode', 'deleted');
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Schutz-Trigger (gelten auch für direkte API-Aufrufe unter RLS).
--    pg_trigger_depth() > 1: Löschung kaskadiert von einer gelöschten Familie → erlaubt.
-- ---------------------------------------------------------------------
create or replace function private.guard_profile_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_family uuid := coalesce(old.family_id, new.family_id);
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Sperre auf die Familie: parallele Deaktivierungen laufen nacheinander.
  perform 1 from public.families where id = v_family for update;
  if (tg_op = 'DELETE' and old.active) or (tg_op = 'UPDATE' and old.active and not new.active) then
    if not exists (select 1 from public.profiles where family_id = v_family and active and id <> old.id) then
      raise exception 'Mindestens ein Kinderprofil muss aktiv bleiben.' using errcode = 'P0001', hint = 'last_active_profile';
    end if;
  end if;
  if tg_op = 'DELETE' and private.profile_has_history(old.family_id, old.id) then
    raise exception 'Profil mit Verlauf kann nicht gelöscht werden.' using errcode = 'P0001', hint = 'profile_has_history';
  end if;
  if tg_op = 'DELETE' and (exists (select 1 from public.task_assignments where family_id = old.family_id and profile_id = old.id)
                        or exists (select 1 from public.category_assignments where family_id = old.family_id and profile_id = old.id)
                        or exists (select 1 from public.reward_assignments where family_id = old.family_id and profile_id = old.id)) then
    raise exception 'Profil mit Zuordnungen kann nicht gelöscht werden.' using errcode = 'P0001', hint = 'profile_has_assignments';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function private.guard_profile_change() from public;

create trigger profiles_guard_update before update of active on public.profiles
  for each row execute function private.guard_profile_change();
create trigger profiles_guard_delete before delete on public.profiles
  for each row execute function private.guard_profile_change();

create or replace function private.guard_category_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and exists (select 1 from public.tasks
                                         where family_id = old.family_id and category_id = old.id and active) then
    raise exception 'Kategorie enthält noch aktive Aufgaben.' using errcode = 'P0001', hint = 'category_has_tasks';
  end if;
  return old;
end;
$$;
revoke all on function private.guard_category_delete() from public;

create trigger categories_guard_delete before delete on public.categories
  for each row execute function private.guard_category_delete();

-- Quittierung: Zeitpunkt und Person serverseitig; einmal quittiert bleibt quittiert.
create or replace function private.stamp_redemption_ack()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.acknowledged_at is not null then
    new.acknowledged_at := old.acknowledged_at;
    new.acknowledged_by := old.acknowledged_by;
  elsif new.acknowledged_at is not null then
    new.acknowledged_at := now();
    new.acknowledged_by := auth.uid();
  else
    new.acknowledged_by := null;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_redemption_ack() from public;

create trigger redemptions_ack_stamp before update on public.redemptions
  for each row execute function private.stamp_redemption_ack();

-- ---------------------------------------------------------------------
-- Rechte: nur angemeldete Nutzer
-- ---------------------------------------------------------------------
revoke all on function public.set_task_assignments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.set_category_assignments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.set_reward_assignments(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.reorder_items(uuid, text, uuid[]) from public, anon;
revoke all on function public.remove_task(uuid, uuid) from public, anon;
revoke all on function public.remove_reward(uuid, uuid) from public, anon;
revoke all on function public.remove_profile(uuid, uuid) from public, anon;
revoke all on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.set_task_assignments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.set_category_assignments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.set_reward_assignments(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.reorder_items(uuid, text, uuid[]) to authenticated;
grant execute on function public.remove_task(uuid, uuid) to authenticated;
grant execute on function public.remove_reward(uuid, uuid) to authenticated;
grant execute on function public.remove_profile(uuid, uuid) to authenticated;
grant execute on function public.delete_category(uuid, uuid) to authenticated;

commit;
