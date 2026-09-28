-- =====================================================================
-- Wochen Champion – Phase 5A: Hilfsfunktion für den LEGACY-Migrationstest
--
-- AUSSCHLIESSLICH im Supabase-TESTPROJEKT. KEINE reguläre Migration (liegt bewusst nicht in
-- supabase/migrations/) und darf so NICHT in die Produktion.
--
-- Warum? Einlösungen dürfen Clients seit Phase 4C2A nur über redeem_reward anlegen (Punkteprüfung,
-- redeemed_at = now(), Titel/Kosten aus der aktuellen Belohnung). Für die Migration müssen aber
-- Datum, Titel- und Punkte-Momentaufnahme der alten Einlösungen erhalten bleiben.
-- Diese Funktion erlaubt das nur
--   * dem owner der Familie,
--   * für die eindeutig markierte Familie „Migration Test“, die dieser owner angelegt hat,
--   * einmalig (Familie hat noch keine Einlösungen).
-- Profil- und Belohnungsbezug werden durch die zusammengesetzten Fremdschlüssel (family_id, id)
-- auf dieselbe Familie begrenzt. Quittierung: acknowledged_at = Importzeitpunkt.
-- Für die Produktion siehe docs/appstore/PRODUCTION_MIGRATION_PLAN.md (temporär, danach entfernen).
-- =====================================================================
begin;

do $$
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: nur für ein Testprojekt. Vorher "set app.migration_target = ''test'';" ausführen.';
  end if;
end
$$;

create or replace function public.legacy_import_redemptions(p_family_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_n   integer := 0;
  v_ack boolean;
begin
  if auth.uid() is null or not private.has_family_role(p_family_id, array['owner']) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  if not exists (select 1 from public.families f
                  where f.id = p_family_id and f.name = 'Migration Test' and f.created_by = auth.uid()) then
    raise exception 'Nur für die Familie „Migration Test“ des eigenen owners' using errcode = '42501';
  end if;
  if exists (select 1 from public.redemptions r where r.family_id = p_family_id) then
    raise exception 'Einlösungen wurden bereits importiert' using errcode = '23505';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10000 then
    raise exception 'Ungültige Importliste' using errcode = '22023';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_ack := coalesce((v_row->>'acknowledged')::boolean, false);
    insert into public.redemptions (id, family_id, profile_id, reward_id, reward_title, points_spent,
                                    redeemed_at, acknowledged_at, acknowledged_by, created_by)
    values ((v_row->>'id')::uuid, p_family_id, (v_row->>'profile_id')::uuid, nullif(v_row->>'reward_id', '')::uuid,
            btrim(v_row->>'reward_title'), (v_row->>'points_spent')::integer, (v_row->>'redeemed_at')::timestamptz,
            case when v_ack then now() end, case when v_ack then auth.uid() end, auth.uid());
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.legacy_import_redemptions(uuid, jsonb) from public, anon;
grant execute on function public.legacy_import_redemptions(uuid, jsonb) to authenticated;

commit;
