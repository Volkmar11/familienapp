-- =====================================================================
-- Wochen Champion – Phase 4C2A: Kernaktionen (Einlösen, Bestätigen, PIN-Sperrstatus)
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: 20260927120000_family_architecture.sql
-- und 20260927200000_family_onboarding.sql sind angewendet.
--
-- Inhalt:
--   1. redeem_reward(): atomare, serverseitig geprüfte Einlösung (Punkte werden NICHT vom
--      Client übernommen; Zeilensperre auf dem Profil verhindert Doppelausgaben).
--   2. redemptions: direkte Client-INSERTs entzogen (nur noch über redeem_reward);
--      UPDATE nur noch für die Quittierung (acknowledged_at/_by).
--   3. Trigger auf completions: confirmed_at/confirmed_by werden bei Statuswechsel
--      serverseitig gesetzt (confirmed_by = auth.uid(), nicht vom Client wählbar).
--   4. parent_pin_lock_seconds(): verbleibende Sperrzeit nach 5 Fehlversuchen (nur lesend),
--      damit die App „zu viele Fehlversuche“ von „falscher PIN“ unterscheiden kann.
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
-- 1. Belohnung einlösen
--    Ergebnis (jsonb):
--      { ok: true,  redemption_id, points_spent, available }
--      { ok: false, reason: 'profile_not_found' | 'reward_not_found' | 'reward_inactive'
--                         | 'not_assigned' | 'insufficient_points', available?, required? }
--    Zugriffsfehler (nicht angemeldet / keine Eltern-Rolle) → Exception 42501.
-- ---------------------------------------------------------------------
create or replace function public.redeem_reward(p_family_id uuid, p_profile_id uuid, p_reward_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile   public.profiles%rowtype;
  v_reward    public.rewards%rowtype;
  v_earned    bigint;
  v_spent     bigint;
  v_available bigint;
  v_id        uuid;
begin
  if auth.uid() is null or not private.has_family_role(p_family_id, array['owner', 'parent']) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;

  -- Sperre pro Profil: parallele Einlösungen desselben Profils laufen nacheinander;
  -- die folgenden Summen sehen dann bereits die zuvor festgeschriebene Einlösung.
  select * into v_profile from public.profiles
   where family_id = p_family_id and id = p_profile_id
   for update;
  if not found or not v_profile.active then
    return jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  end if;

  select * into v_reward from public.rewards where family_id = p_family_id and id = p_reward_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'reward_not_found');
  end if;
  if not v_reward.active then
    return jsonb_build_object('ok', false, 'reason', 'reward_inactive');
  end if;
  -- Sichtbarkeit: keine Zuordnungen = für alle Profile; sonst nur für zugeordnete.
  if exists (select 1 from public.reward_assignments ra where ra.family_id = p_family_id and ra.reward_id = p_reward_id)
     and not exists (select 1 from public.reward_assignments ra
                      where ra.family_id = p_family_id and ra.reward_id = p_reward_id and ra.profile_id = p_profile_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_assigned');
  end if;

  -- Punkte ausschließlich serverseitig: bestätigte Erledigungen (Punkte-Momentaufnahme)
  -- minus alle bisherigen Einlösungen dieses Profils.
  select coalesce(sum(c.points), 0) into v_earned from public.completions c
   where c.family_id = p_family_id and c.profile_id = p_profile_id and c.status = 'confirmed';
  select coalesce(sum(r.points_spent), 0) into v_spent from public.redemptions r
   where r.family_id = p_family_id and r.profile_id = p_profile_id;
  v_available := v_earned - v_spent;

  if v_available < v_reward.points_required then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_points',
                              'available', v_available, 'required', v_reward.points_required);
  end if;

  insert into public.redemptions (family_id, profile_id, reward_id, reward_title, points_spent, created_by)
  values (p_family_id, p_profile_id, p_reward_id, v_reward.title, v_reward.points_required, auth.uid())
  returning id into v_id;

  return jsonb_build_object('ok', true, 'redemption_id', v_id, 'points_spent', v_reward.points_required,
                            'available', v_available - v_reward.points_required);
end;
$$;

revoke all on function public.redeem_reward(uuid, uuid, uuid) from public, anon;
grant execute on function public.redeem_reward(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. redemptions: Einlösen nur noch über redeem_reward()
-- ---------------------------------------------------------------------
drop policy if exists redemptions_insert on public.redemptions;
revoke insert, update on public.redemptions from authenticated;
grant update (acknowledged_at, acknowledged_by) on public.redemptions to authenticated;

-- ---------------------------------------------------------------------
-- 3. Bestätigen/Ablehnen: Zeitpunkt und bestätigende Person serverseitig setzen
-- ---------------------------------------------------------------------
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
    new.confirmed_by := old.confirmed_by;
  end if;
  return new;
end;
$$;
revoke all on function private.stamp_completion_review() from public;

create trigger completions_review_stamp before update on public.completions
  for each row execute function private.stamp_completion_review();

-- ---------------------------------------------------------------------
-- 4. PIN-Sperrstatus (verbleibende Sekunden, 0 = nicht gesperrt). Nur lesend,
--    verrät weder Hash noch Anzahl der Fehlversuche.
-- ---------------------------------------------------------------------
create or replace function public.parent_pin_lock_seconds(p_family_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sec private.family_security%rowtype;
begin
  if auth.uid() is null or not private.is_family_member(p_family_id) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  select * into v_sec from private.family_security where family_id = p_family_id;
  if not found or v_sec.failed_attempts < 5 or v_sec.last_failed_at is null
     or v_sec.last_failed_at <= now() - interval '60 seconds' then
    return 0;
  end if;
  return greatest(1, ceil(extract(epoch from (v_sec.last_failed_at + interval '60 seconds' - now())))::integer);
end;
$$;

revoke all on function public.parent_pin_lock_seconds(uuid) from public, anon;
grant execute on function public.parent_pin_lock_seconds(uuid) to authenticated;

commit;
