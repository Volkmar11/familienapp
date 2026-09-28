-- =====================================================================
-- Wochen Champion – Phase 5C: Konto-Lebenszyklus (Account löschen / Familie löschen)
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
-- Analyse der bestehenden Fremdschlüssel (kein Umbau nötig):
--   auth.users → family_members.user_id              ON DELETE CASCADE
--             → private.onboarding_requests.user_id  ON DELETE CASCADE
--             → families.created_by, profiles.linked_user_id,
--               completions.created_by/confirmed_by,
--               redemptions.created_by/acknowledged_by ON DELETE SET NULL (Audit-Felder)
--   families  → alle Familientabellen, family_sync, private.family_security,
--               private.onboarding_requests          ON DELETE CASCADE
--   Kein RESTRICT → die Auth-Löschung kann nicht an Fremdschlüsseln scheitern.
--   storage.objects hat keinen FK auf auth.users; Medien werden explizit entfernt.
--
-- Neu:
--   1. public.account_deletion_plan(p_user_id)   – Löschplan (nur service_role)
--   2. public.execute_account_deletion(p_user_id) – Memberships/Familien idempotent (nur service_role)
--   3. public.family_owner_check(p_user_id, p_family_id) – owner-Prüfung für delete-family (nur service_role)
--   4. public.delete_family_as_service(p_family_id) – Familie inkl. Kaskaden löschen (nur service_role)
--   5. Realtime-Signal auch bei Änderungen an family_members (Rollenwechsel, Austritt)
--   6. FEHLERBEHEBUNG: Die Stempel-Trigger completions_review_stamp und redemptions_ack_stamp
--      schrieben bei jedem UPDATE den alten confirmed_by/acknowledged_by-Wert zurück. Dadurch
--      scheiterte ON DELETE SET NULL beim Löschen eines Auth-Users (FK-Verletzung) – ein
--      Elternkonto, das je bestätigt/quittiert hatte, war nicht löschbar. Jetzt darf der Verweis
--      genau dann NULL werden, wenn der referenzierte Auth-User nicht mehr existiert.
-- Die Funktionen werden ausschließlich von den Edge Functions delete-account / delete-family
-- mit serverseitigem Schlüssel aufgerufen. Die Ziel-user_id stammt dort IMMER aus dem
-- verifizierten JWT, nie aus Client-Eingaben.
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
-- 1. Löschplan: je Mitgliedschaft des Nutzers eine Aktion
--    delete_family  – kein weiteres Elternkonto in der Familie
--    leave          – andere Eltern bleiben; es bleibt mindestens ein anderer owner
--    transfer_leave – der Nutzer ist letzter owner: ältester verbleibender parent
--                     (created_at, dann user_id) wird owner, danach Austritt
-- ---------------------------------------------------------------------
create or replace function public.account_deletion_plan(p_user_id uuid)
returns table (family_id uuid, action text, new_owner uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select fm.family_id,
         case
           when not exists (select 1 from public.family_members o where o.family_id = fm.family_id and o.user_id <> p_user_id)
             then 'delete_family'
           when fm.role = 'owner'
            and not exists (select 1 from public.family_members o where o.family_id = fm.family_id and o.user_id <> p_user_id and o.role = 'owner')
             then 'transfer_leave'
           else 'leave'
         end as action,
         case
           when fm.role = 'owner'
            and not exists (select 1 from public.family_members o where o.family_id = fm.family_id and o.user_id <> p_user_id and o.role = 'owner')
             then (select o.user_id from public.family_members o
                    where o.family_id = fm.family_id and o.user_id <> p_user_id
                    order by o.created_at asc, o.user_id asc limit 1)
         end as new_owner
    from public.family_members fm
   where fm.user_id = p_user_id
   order by fm.created_at, fm.family_id;
$$;

-- ---------------------------------------------------------------------
-- 2. Ausführung (idempotent; mehrfacher Aufruf ist harmlos)
--    Medien der zu löschenden Familien entfernt die Edge Function VORHER über die Storage-API.
-- ---------------------------------------------------------------------
create or replace function public.execute_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_deleted uuid[] := '{}';
  v_left uuid[] := '{}';
  v_transferred uuid[] := '{}';
begin
  if p_user_id is null then raise exception 'user_id fehlt' using errcode = '22023'; end if;
  for r in select * from public.account_deletion_plan(p_user_id) loop
    -- Familie sperren, damit parallele Löschungen zweier Eltern nicht beide „andere Eltern“ sehen
    perform 1 from public.families f where f.id = r.family_id for update;
    if r.action = 'delete_family' then
      delete from public.families where id = r.family_id;
      v_deleted := v_deleted || r.family_id;
    else
      if r.action = 'transfer_leave' and r.new_owner is not null then
        update public.family_members set role = 'owner'
         where family_id = r.family_id and user_id = r.new_owner;
        v_transferred := v_transferred || r.family_id;
      end if;
      delete from public.family_members where family_id = r.family_id and user_id = p_user_id;
      v_left := v_left || r.family_id;
    end if;
  end loop;
  -- Verbleibende Verweise (z. B. families.created_by) setzt die Auth-Löschung per ON DELETE SET NULL.
  return jsonb_build_object('deleted_families', to_jsonb(v_deleted), 'left_families', to_jsonb(v_left),
                            'ownership_transferred', to_jsonb(v_transferred));
end;
$$;

-- ---------------------------------------------------------------------
-- 3./4. Familie löschen (nur owner; Prüfung und Löschung serverseitig)
-- ---------------------------------------------------------------------
create or replace function public.family_owner_check(p_user_id uuid, p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.family_members fm
                  where fm.family_id = p_family_id and fm.user_id = p_user_id and fm.role = 'owner');
$$;

create or replace function public.delete_family_as_service(p_family_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_members int; v_profiles int;
begin
  select count(*) into v_members from public.family_members where family_id = p_family_id;
  select count(*) into v_profiles from public.profiles where family_id = p_family_id;
  delete from public.families where id = p_family_id;
  return jsonb_build_object('deleted', found, 'members', v_members, 'profiles', v_profiles);
end;
$$;

revoke all on function public.account_deletion_plan(uuid) from public, anon, authenticated;
revoke all on function public.execute_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.family_owner_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_family_as_service(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_plan(uuid) to service_role;
grant execute on function public.execute_account_deletion(uuid) to service_role;
grant execute on function public.family_owner_check(uuid, uuid) to service_role;
grant execute on function public.delete_family_as_service(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 6. Audit-Verweise dürfen beim Löschen des Auth-Users auf NULL gehen
-- ---------------------------------------------------------------------
create or replace function private.auth_user_exists(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from auth.users u where u.id = p_user_id); $$;
revoke all on function private.auth_user_exists(uuid) from public;
grant execute on function private.auth_user_exists(uuid) to authenticated, service_role;

create or replace function private.stamp_completion_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status in ('confirmed', 'rejected') then
      new.confirmed_at := now();
      new.confirmed_by := auth.uid();
    else
      new.confirmed_at := null;
      new.confirmed_by := null;
    end if;
  else
    new.confirmed_at := old.confirmed_at;
    -- ON DELETE SET NULL (Auth-User gelöscht) zulassen, sonst Wert unveränderlich
    if not (new.confirmed_by is null and old.confirmed_by is not null and not private.auth_user_exists(old.confirmed_by)) then
      new.confirmed_by := old.confirmed_by;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.stamp_redemption_ack()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.acknowledged_at is not null then
    new.acknowledged_at := old.acknowledged_at;
    if not (new.acknowledged_by is null and old.acknowledged_by is not null and not private.auth_user_exists(old.acknowledged_by)) then
      new.acknowledged_by := old.acknowledged_by;
    end if;
  elsif new.acknowledged_at is not null then
    new.acknowledged_at := now();
    new.acknowledged_by := auth.uid();
  else
    new.acknowledged_by := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Realtime-Signal bei Mitgliedschaftsänderungen (Rolle, Austritt)
-- ---------------------------------------------------------------------
create trigger family_members_bump_sync after insert or update or delete on public.family_members
  for each row execute function private.bump_family_sync();

commit;
