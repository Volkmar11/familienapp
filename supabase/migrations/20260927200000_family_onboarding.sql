-- =====================================================================
-- Wochen Champion – Familien-Onboarding (Phase 4B)
-- =====================================================================
--
-- NUR im Supabase-TESTPROJEKT anwenden. NIEMALS im Produktionsprojekt.
-- Setzt voraus: 20260927120000_family_architecture.sql
--
-- Inhalt:
--   * private.family_security  – bcrypt-Hash der Eltern-PIN (kein Client-Zugriff)
--   * private.onboarding_requests – Idempotenz der Familienanlage
--   * family_settings.parent_pin_hash wird entfernt (war per RLS für Mitglieder lesbar)
--   * RPCs: create_family_with_onboarding, verify_parent_pin, set_parent_pin
--
-- Die 4-stellige Eltern-PIN ist nur eine UI-Schranke auf einem bereits
-- angemeldeten Familiengerät – KEIN Ersatz für die Supabase-Anmeldung.
--
-- Schutzsperre wie bisher: vorher in derselben Sitzung
--     set app.migration_target = 'test';
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
-- 1. PIN-Hash aus family_settings entfernen (Spalte war nie befüllt).
--    family_settings ist für alle Familienmitglieder lesbar → ungeeignet.
-- ---------------------------------------------------------------------
alter table public.family_settings drop column if exists parent_pin_hash;

-- ---------------------------------------------------------------------
-- 2. Eltern-PIN – liegt im nicht per API erreichbaren Schema "private".
-- ---------------------------------------------------------------------
create table private.family_security (
  family_id         uuid primary key references public.families (id) on delete cascade,
  parent_pin_hash   text not null check (parent_pin_hash like '$2%'),   -- bcrypt
  failed_attempts   integer not null default 0 check (failed_attempts >= 0),
  last_failed_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table private.family_security enable row level security;       -- keine Policies → kein Zugriff
revoke all on private.family_security from public, anon, authenticated;

create trigger family_security_updated_at before update on private.family_security
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Idempotenz: eine Client-Request-ID erzeugt höchstens eine Familie.
-- ---------------------------------------------------------------------
create table private.onboarding_requests (
  request_id  uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  family_id   uuid references public.families (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index onboarding_requests_user_idx on private.onboarding_requests (user_id);
alter table private.onboarding_requests enable row level security;
revoke all on private.onboarding_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Atomare Familienanlage aus dem Onboarding
--    p_children: [{name, avatar_emoji, color}]           (Reihenfolge = sort_order)
--    p_tasks:    [{title, points, icon, recurrence, category, category_icon}]
--    p_rewards:  [{title, points_required, icon}]
--    p_settings: {show_daily_crown, require_confirmation}
--    Rückgabe:   {family_id, replayed}
-- Grenzen sind technische Integritätsgrenzen, KEINE FREE-/PREMIUM-Limits.
-- ---------------------------------------------------------------------
create or replace function public.create_family_with_onboarding(
  p_request_id  uuid,
  p_family_name text,
  p_pin         text,
  p_children    jsonb,
  p_tasks       jsonb default '[]'::jsonb,
  p_rewards     jsonb default '[]'::jsonb,
  p_settings    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_family_id  uuid;
  v_existing   record;
  v_name       text := btrim(coalesce(p_family_name, ''));
  v_child      jsonb;
  v_task       jsonb;
  v_reward     jsonb;
  v_i          integer;
  v_title      text;
  v_cat        text;
  v_cat_id     uuid;
  v_points     integer;
  v_crown      boolean := true;
  v_confirm    boolean := true;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id fehlt' using errcode = '22023';
  end if;

  -- ---- Validierung (vor jeder Schreiboperation) ----
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Ungültiger Familienname' using errcode = '22023';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'Die Eltern-PIN muss aus genau 4 Ziffern bestehen' using errcode = '22023';
  end if;
  if p_children is null or jsonb_typeof(p_children) <> 'array'
     or jsonb_array_length(p_children) not between 1 and 20 then
    raise exception 'Es wird mindestens 1 und höchstens 20 Kinderprofile benötigt' using errcode = '22023';
  end if;
  for v_child in select value from jsonb_array_elements(p_children) loop
    if jsonb_typeof(v_child) <> 'object'
       or char_length(btrim(coalesce(v_child->>'name', ''))) not between 1 and 40
       or char_length(coalesce(v_child->>'avatar_emoji', '')) > 16
       or (v_child ? 'color' and v_child->>'color' is not null and v_child->>'color' !~ '^#[0-9A-Fa-f]{6}$') then
      raise exception 'Ungültiges Kinderprofil' using errcode = '22023';
    end if;
  end loop;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) > 200 then
    raise exception 'Ungültige Aufgabenliste' using errcode = '22023';
  end if;
  for v_task in select value from jsonb_array_elements(p_tasks) loop
    if jsonb_typeof(v_task) <> 'object'
       or char_length(btrim(coalesce(v_task->>'title', ''))) not between 1 and 80
       or char_length(btrim(coalesce(v_task->>'category', ''))) not between 1 and 40
       or jsonb_typeof(v_task->'points') is distinct from 'number'
       or (v_task->>'points') !~ '^[0-9]+$'
       or (v_task->>'points')::numeric > 10000
       or coalesce(v_task->>'recurrence', 'daily') not in ('daily', 'weekly', 'once') then
      raise exception 'Ungültige Aufgabe' using errcode = '22023';
    end if;
  end loop;
  if p_rewards is null or jsonb_typeof(p_rewards) <> 'array' or jsonb_array_length(p_rewards) > 200 then
    raise exception 'Ungültige Belohnungsliste' using errcode = '22023';
  end if;
  for v_reward in select value from jsonb_array_elements(p_rewards) loop
    if jsonb_typeof(v_reward) <> 'object'
       or char_length(btrim(coalesce(v_reward->>'title', ''))) not between 1 and 80
       or jsonb_typeof(v_reward->'points_required') is distinct from 'number'
       or (v_reward->>'points_required') !~ '^[0-9]+$'
       or (v_reward->>'points_required')::numeric > 100000 then
      raise exception 'Ungültige Belohnung' using errcode = '22023';
    end if;
  end loop;
  if p_settings is not null and jsonb_typeof(p_settings) = 'object' then
    if p_settings ? 'show_daily_crown' then
      if jsonb_typeof(p_settings->'show_daily_crown') <> 'boolean' then raise exception 'Ungültige Einstellung' using errcode = '22023'; end if;
      v_crown := (p_settings->>'show_daily_crown')::boolean;
    end if;
    if p_settings ? 'require_confirmation' then
      if jsonb_typeof(p_settings->'require_confirmation') <> 'boolean' then raise exception 'Ungültige Einstellung' using errcode = '22023'; end if;
      v_confirm := (p_settings->>'require_confirmation')::boolean;
    end if;
  end if;

  -- ---- Idempotenz ----
  -- Gleichzeitige Aufrufe mit derselben ID warten hier auf den ersten.
  insert into private.onboarding_requests (request_id, user_id)
  values (p_request_id, v_uid)
  on conflict (request_id) do nothing;
  if not found then
    select r.user_id, r.family_id into v_existing
    from private.onboarding_requests r where r.request_id = p_request_id;
    if v_existing.user_id is distinct from v_uid or v_existing.family_id is null then
      -- fremde oder unbrauchbare ID: keine Auskunft, keine Rechte
      raise exception 'Diese Anfrage-ID kann nicht verwendet werden' using errcode = '42501';
    end if;
    return jsonb_build_object('family_id', v_existing.family_id, 'replayed', true);
  end if;

  -- ---- Anlage (eine Transaktion) ----
  insert into public.families (name, created_by) values (v_name, v_uid) returning id into v_family_id;
  insert into public.family_members (family_id, user_id, role) values (v_family_id, v_uid, 'owner');
  insert into public.family_settings (family_id, show_daily_crown, require_confirmation)
  values (v_family_id, v_crown, v_confirm);
  insert into private.family_security (family_id, parent_pin_hash)
  values (v_family_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)));

  v_i := 0;
  for v_child in select value from jsonb_array_elements(p_children) loop
    insert into public.profiles (family_id, name, avatar_emoji, color, sort_order, is_parent)
    values (v_family_id, btrim(v_child->>'name'), nullif(v_child->>'avatar_emoji', ''),
            nullif(v_child->>'color', ''), v_i, false);
    v_i := v_i + 1;
  end loop;

  -- Kategorien nur für tatsächlich gewählte Aufgaben (Reihenfolge des ersten Auftretens)
  v_i := 0;
  for v_cat in
    select c.name from (
      select btrim(t.value->>'category') as name, min(t.ordinality) as first_pos
      from jsonb_array_elements(p_tasks) with ordinality t
      group by lower(btrim(t.value->>'category')), btrim(t.value->>'category')
    ) c order by c.first_pos
  loop
    insert into public.categories (family_id, name, icon, sort_order)
    select v_family_id, v_cat,
           nullif((select t.value->>'category_icon' from jsonb_array_elements(p_tasks) t
                   where btrim(t.value->>'category') = v_cat limit 1), ''),
           v_i
    on conflict do nothing;
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_task in select value from jsonb_array_elements(p_tasks) loop
    select id into v_cat_id from public.categories
    where family_id = v_family_id and lower(btrim(name)) = lower(btrim(v_task->>'category'));
    insert into public.tasks (family_id, category_id, title, icon, points, recurrence, sort_order)
    values (v_family_id, v_cat_id, btrim(v_task->>'title'), nullif(v_task->>'icon', ''),
            (v_task->>'points')::integer, coalesce(v_task->>'recurrence', 'daily'), v_i);
    v_i := v_i + 1;
  end loop;

  v_i := 0;
  for v_reward in select value from jsonb_array_elements(p_rewards) loop
    insert into public.rewards (family_id, title, icon, points_required, sort_order)
    values (v_family_id, btrim(v_reward->>'title'), nullif(v_reward->>'icon', ''),
            (v_reward->>'points_required')::integer, v_i);
    v_i := v_i + 1;
  end loop;

  update private.onboarding_requests set family_id = v_family_id where request_id = p_request_id;

  return jsonb_build_object('family_id', v_family_id, 'replayed', false);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. PIN prüfen (jedes Familienmitglied). Einfacher Fehlversuchsschutz:
--    nach 5 Fehlversuchen 60 Sekunden Sperre (liefert dann false).
-- ---------------------------------------------------------------------
create or replace function public.verify_parent_pin(p_family_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sec private.family_security%rowtype;
  v_ok  boolean;
begin
  if auth.uid() is null or not private.is_family_member(p_family_id) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  select * into v_sec from private.family_security where family_id = p_family_id for update;
  if not found then return false; end if;
  if v_sec.failed_attempts >= 5 and v_sec.last_failed_at > now() - interval '60 seconds' then
    return false;
  end if;
  v_ok := p_pin ~ '^[0-9]{4}$' and extensions.crypt(p_pin, v_sec.parent_pin_hash) = v_sec.parent_pin_hash;
  if v_ok then
    update private.family_security set failed_attempts = 0, last_failed_at = null where family_id = p_family_id;
  else
    update private.family_security
       set failed_attempts = case when last_failed_at > now() - interval '60 seconds' then failed_attempts + 1 else 1 end,
           last_failed_at = now()
     where family_id = p_family_id;
  end if;
  return v_ok;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. PIN ändern (owner/parent; bestehende PIN muss bestätigt werden).
-- ---------------------------------------------------------------------
create or replace function public.set_parent_pin(p_family_id uuid, p_current_pin text, p_new_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_family_role(p_family_id, array['owner', 'parent']) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4}$' then
    raise exception 'Die Eltern-PIN muss aus genau 4 Ziffern bestehen' using errcode = '22023';
  end if;
  if exists (select 1 from private.family_security where family_id = p_family_id)
     and not public.verify_parent_pin(p_family_id, p_current_pin) then
    return false;
  end if;
  insert into private.family_security (family_id, parent_pin_hash)
  values (p_family_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)))
  on conflict (family_id) do update
    set parent_pin_hash = excluded.parent_pin_hash, failed_attempts = 0, last_failed_at = null;
  return true;
end;
$$;

revoke all on function public.create_family_with_onboarding(uuid, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.verify_parent_pin(uuid, text) from public, anon;
revoke all on function public.set_parent_pin(uuid, text, text) from public, anon;
grant execute on function public.create_family_with_onboarding(uuid, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.verify_parent_pin(uuid, text) to authenticated;
grant execute on function public.set_parent_pin(uuid, text, text) to authenticated;

commit;
