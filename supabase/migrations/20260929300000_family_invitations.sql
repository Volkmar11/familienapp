-- =====================================================================
-- Wochen Champion – Phase 5D: Mehrere Eltern / Einladungen
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
-- Neu:
--   1. private.family_invitations   – Einladungen (nur SHA-256 des Tokens, TTL 7 Tage, einmalig)
--   2. private.invitation_attempts  – fehlgeschlagene inspect/accept-Versuche (Rate-Limit)
--   3. public.user_membership_sync  – benutzerspezifisches Realtime-Signal für Mitgliedschaften
--   4. RPCs (SECURITY DEFINER, search_path = '', nur authenticated):
--        create_family_invitation, inspect_family_invitation, accept_family_invitation,
--        revoke_family_invitation, list_family_invitations, list_family_adults,
--        promote_family_parent, remove_family_parent, leave_family
--   5. family_members: direkte DELETEs durch Clients entfernt (nur noch über RPCs,
--      damit Regeln wie „owner nicht entfernbar“ und Invite-Widerruf nicht umgangen werden).
--      Direkte INSERT/UPDATE waren und bleiben unmöglich (keine Policy).
--   6. execute_account_deletion: sperrt zuerst alle betroffenen Familien und berechnet den
--      Plan erst danach (rennsicher gegen parallele leave/remove/accept), widerruft offene
--      Einladungen des Nutzers.
--   7. Test-Hilfsfunktion public.test_add_family_member (Phase 5C, nur Testprojekt) entfernt.
--
-- Der Klartext-Token wird NIE gespeichert und NIE geloggt; er verlässt die Datenbank genau
-- einmal als Rückgabewert von create_family_invitation.
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
-- 1. Einladungen
-- ---------------------------------------------------------------------
create table private.family_invitations (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  role        text not null default 'parent' check (role = 'parent'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  revoked_at  timestamptz,
  check (expires_at > created_at)
);
create index family_invitations_family_idx on private.family_invitations (family_id);
create index family_invitations_creator_idx on private.family_invitations (created_by, created_at);
alter table private.family_invitations enable row level security;   -- keine Policy: nur über RPCs
revoke all on private.family_invitations from public, anon, authenticated;

create table private.invitation_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  attempted_at  timestamptz not null default now()
);
create index invitation_attempts_user_idx on private.invitation_attempts (user_id, attempted_at);
alter table private.invitation_attempts enable row level security;
revoke all on private.invitation_attempts from public, anon, authenticated;

-- Kanonische Form: Groß-/Kleinschreibung egal, Bindestriche/Leerzeichen ignoriert,
-- danach genau 32 Hex-Zeichen (128 Bit). Alles andere → NULL (ungültig).
create or replace function private.invite_token_hash(p_token text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text;
begin
  if p_token is null or char_length(p_token) > 200 then return null; end if;
  v := lower(regexp_replace(p_token, '[[:space:]-]', '', 'g'));
  if v !~ '^[0-9a-f]{32}$' then return null; end if;
  return encode(extensions.digest(v, 'sha256'), 'hex');
end;
$$;

-- Max. 20 ungültige Versuche je Nutzer in 10 Minuten
create or replace function private.invite_attempts_exceeded(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 20 from private.invitation_attempts a
   where a.user_id = p_user and a.attempted_at > now() - interval '10 minutes';
$$;

create or replace function private.record_invite_attempt(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  delete from private.invitation_attempts where user_id = p_user and attempted_at < now() - interval '1 day';
  insert into private.invitation_attempts (user_id) values (p_user);
$$;

revoke all on function private.invite_token_hash(text) from public;
revoke all on function private.invite_attempts_exceeded(uuid) from public;
revoke all on function private.record_invite_attempt(uuid) from public;

-- ---------------------------------------------------------------------
-- 3. Benutzerspezifisches Mitgliedschafts-Signal
--    family_sync erreicht einen entfernten Nutzer nicht mehr (RLS: nur Mitglieder).
--    Deshalb eine Zeile je Nutzer; Clients dürfen nur die eigene Zeile lesen, nie schreiben.
-- ---------------------------------------------------------------------
create table public.user_membership_sync (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  version     bigint not null default 0,
  changed_at  timestamptz not null default now()
);
alter table public.user_membership_sync enable row level security;
revoke all on public.user_membership_sync from anon, authenticated;
grant select on public.user_membership_sync to authenticated;
create policy user_membership_sync_select on public.user_membership_sync for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.bump_user_membership_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  v_user := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  -- Wird der Auth-User gerade gelöscht (Kaskade), gibt es nichts mehr zu signalisieren.
  insert into public.user_membership_sync as s (user_id, version, changed_at)
  select v_user, 1, now() where exists (select 1 from auth.users u where u.id = v_user)
  on conflict (user_id) do update set version = s.version + 1, changed_at = now();
  return null;
end;
$$;
revoke all on function private.bump_user_membership_sync() from public;

create trigger family_members_bump_user_sync after insert or update or delete on public.family_members
  for each row execute function private.bump_user_membership_sync();

insert into public.user_membership_sync (user_id)
select distinct user_id from public.family_members on conflict do nothing;

alter publication supabase_realtime add table public.user_membership_sync;

-- ---------------------------------------------------------------------
-- 5. family_members: keine direkten Client-DELETEs mehr
-- ---------------------------------------------------------------------
drop policy if exists family_members_delete on public.family_members;

-- ---------------------------------------------------------------------
-- 4. RPCs
-- ---------------------------------------------------------------------

-- Einladung erzeugen (owner oder parent der Familie). Rückgabe enthält den Klartext-Token
-- genau dieses eine Mal.
create or replace function public.create_family_invitation(p_family_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text;
  v_id uuid;
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  perform 1 from public.families f where f.id = p_family_id for update;
  if not found or not private.has_family_role(p_family_id, array['owner', 'parent']) then
    raise exception 'Keine Berechtigung für diese Familie.' using errcode = '42501';
  end if;
  -- Nutzerbezogenes Limit familienübergreifend serialisieren
  perform pg_advisory_xact_lock(hashtextextended('wc-invite:' || v_uid::text, 0));
  if (select count(*) from private.family_invitations i
       where i.family_id = p_family_id and i.used_at is null and i.revoked_at is null and i.expires_at > now()) >= 10 then
    raise exception 'Es gibt bereits 10 aktive Einladungen. Widerrufe zuerst eine bestehende Einladung.' using errcode = 'P0001';
  end if;
  if (select count(*) from private.family_invitations i
       where i.created_by = v_uid and i.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Zu viele neue Einladungen. Bitte versuche es später erneut.' using errcode = 'P0001';
  end if;
  v_token := encode(extensions.gen_random_bytes(16), 'hex');
  insert into private.family_invitations (family_id, token_hash, created_by, expires_at)
  values (p_family_id, private.invite_token_hash(v_token), v_uid, v_expires)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires, 'role', 'parent');
end;
$$;

-- Einladung prüfen (ohne Beitritt). Ungültig/abgelaufen/verwendet/widerrufen → gleiche Antwort.
create or replace function public.inspect_family_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  r record;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if private.invite_attempts_exceeded(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_hash := private.invite_token_hash(p_token);
  select i.family_id, i.expires_at, f.name as family_name into r
    from private.family_invitations i join public.families f on f.id = i.family_id
   where v_hash is not null and i.token_hash = v_hash
     and i.used_at is null and i.revoked_at is null and i.expires_at > now();
  if not found then
    perform private.record_invite_attempt(v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  return jsonb_build_object('ok', true, 'family_id', r.family_id, 'family_name', r.family_name,
    'expires_at', r.expires_at, 'role', 'parent',
    'already_member', exists (select 1 from public.family_members fm where fm.family_id = r.family_id and fm.user_id = v_uid));
end;
$$;

-- Einladung annehmen: atomar, einmalig. Bereits Mitglied → idempotent, Einladung bleibt offen.
create or replace function public.accept_family_invitation(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_family uuid;
  v_name text;
  inv private.family_invitations%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if private.invite_attempts_exceeded(v_uid) then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;
  v_hash := private.invite_token_hash(p_token);
  select i.family_id into v_family from private.family_invitations i where v_hash is not null and i.token_hash = v_hash;
  if v_family is not null then
    -- Sperrreihenfolge wie leave/remove/Account-Löschung: zuerst Familie, dann Einladung
    select f.name into v_name from public.families f where f.id = v_family for update;
  end if;
  if v_name is not null then
    select * into inv from private.family_invitations i where i.token_hash = v_hash for update;
  end if;
  if v_name is null or inv.id is null or inv.family_id <> v_family then
    perform private.record_invite_attempt(v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if exists (select 1 from public.family_members fm where fm.family_id = v_family and fm.user_id = v_uid) then
    return jsonb_build_object('ok', true, 'status', 'already_member', 'family_id', v_family, 'family_name', v_name);
  end if;
  if inv.used_at is not null or inv.revoked_at is not null or inv.expires_at <= now() then
    perform private.record_invite_attempt(v_uid);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  insert into public.family_members (family_id, user_id, role) values (v_family, v_uid, 'parent');
  update private.family_invitations set used_at = now(), used_by = v_uid where id = inv.id;
  return jsonb_build_object('ok', true, 'status', 'joined', 'family_id', v_family, 'family_name', v_name);
end;
$$;

-- Einladung widerrufen (owner oder parent derselben Familie; idempotent)
create or replace function public.revoke_family_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  inv private.family_invitations%rowtype;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  select * into inv from private.family_invitations i where i.id = p_invitation_id for update;
  if not found or not private.has_family_role(inv.family_id, array['owner', 'parent']) then
    raise exception 'Einladung nicht gefunden.' using errcode = 'P0002';
  end if;
  if inv.used_at is not null then
    raise exception 'Diese Einladung wurde bereits verwendet.' using errcode = 'P0001';
  end if;
  update private.family_invitations set revoked_at = coalesce(revoked_at, now()) where id = inv.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Aktive Einladungen einer Familie (ohne token_hash)
create or replace function public.list_family_invitations(p_family_id uuid)
returns table (id uuid, created_at timestamptz, expires_at timestamptz, created_by_email text, created_by_self boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_family_member(p_family_id) then
    raise exception 'Keine Berechtigung für diese Familie.' using errcode = '42501';
  end if;
  return query
    select i.id, i.created_at, i.expires_at, u.email::text, coalesce(i.created_by = auth.uid(), false)
      from private.family_invitations i left join auth.users u on u.id = i.created_by
     where i.family_id = p_family_id and i.used_at is null and i.revoked_at is null and i.expires_at > now()
     order by i.created_at desc;
end;
$$;

-- Erwachsene (Elternkonten) einer Familie
create or replace function public.list_family_adults(p_family_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz, is_self boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_family_member(p_family_id) then
    raise exception 'Keine Berechtigung für diese Familie.' using errcode = '42501';
  end if;
  return query
    select fm.user_id, u.email::text, fm.role, fm.created_at, fm.user_id = auth.uid()
      from public.family_members fm left join auth.users u on u.id = fm.user_id
     where fm.family_id = p_family_id
     order by fm.created_at, fm.user_id;
end;
$$;

-- parent → owner (nur owner). Kein Downgrade in v1; mehrere owner erlaubt.
create or replace function public.promote_family_parent(p_family_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_role text;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  perform 1 from public.families f where f.id = p_family_id for update;
  if not found or not private.has_family_role(p_family_id, array['owner']) then
    raise exception 'Nur Inhaber:innen können Rollen ändern.' using errcode = '42501';
  end if;
  select fm.role into v_role from public.family_members fm where fm.family_id = p_family_id and fm.user_id = p_user_id;
  if v_role is null then raise exception 'Dieses Elternkonto gehört nicht zur Familie.' using errcode = 'P0002'; end if;
  if v_role = 'parent' then
    update public.family_members set role = 'owner' where family_id = p_family_id and user_id = p_user_id;
  end if;
  return jsonb_build_object('ok', true, 'role', 'owner');
end;
$$;

-- parent entfernen (nur owner; keine owner, nicht sich selbst). Widerruft dessen offene Einladungen.
create or replace function public.remove_family_parent(p_family_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_role text; v_revoked int;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  perform 1 from public.families f where f.id = p_family_id for update;
  if not found or not private.has_family_role(p_family_id, array['owner']) then
    raise exception 'Nur Inhaber:innen können Elternkonten entfernen.' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'Du kannst dich nicht selbst entfernen. Nutze „Familie verlassen“.' using errcode = 'P0001';
  end if;
  select fm.role into v_role from public.family_members fm where fm.family_id = p_family_id and fm.user_id = p_user_id;
  if v_role is null then raise exception 'Dieses Elternkonto gehört nicht zur Familie.' using errcode = 'P0002'; end if;
  if v_role = 'owner' then
    raise exception 'Inhaber:innen können nicht entfernt werden.' using errcode = 'P0001';
  end if;
  delete from public.family_members where family_id = p_family_id and user_id = p_user_id;
  update private.family_invitations set revoked_at = now()
   where family_id = p_family_id and created_by = p_user_id and used_at is null and revoked_at is null;
  get diagnostics v_revoked = row_count;
  return jsonb_build_object('ok', true, 'revoked_invitations', v_revoked);
end;
$$;

-- Familie verlassen (rennsicher über Sperre der Familienzeile)
create or replace function public.leave_family(p_family_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_new_owner uuid;
begin
  if v_uid is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  perform 1 from public.families f where f.id = p_family_id for update;
  select fm.role into v_role from public.family_members fm where fm.family_id = p_family_id and fm.user_id = v_uid;
  if v_role is null then raise exception 'Du bist kein Mitglied dieser Familie.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.family_members o where o.family_id = p_family_id and o.user_id <> v_uid) then
    raise exception 'Du bist das letzte Elternkonto dieser Familie. Lösche die Familie stattdessen über die Gefahrenzone.' using errcode = 'P0001';
  end if;
  if v_role = 'owner' and not exists (select 1 from public.family_members o
       where o.family_id = p_family_id and o.user_id <> v_uid and o.role = 'owner') then
    select o.user_id into v_new_owner from public.family_members o
     where o.family_id = p_family_id and o.user_id <> v_uid
     order by o.created_at asc, o.user_id asc limit 1;
    update public.family_members set role = 'owner' where family_id = p_family_id and user_id = v_new_owner;
  end if;
  delete from public.family_members where family_id = p_family_id and user_id = v_uid;
  update private.family_invitations set revoked_at = now()
   where family_id = p_family_id and created_by = v_uid and used_at is null and revoked_at is null;
  return jsonb_build_object('ok', true, 'ownership_transferred', v_new_owner is not null);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.create_family_invitation(uuid)', 'public.inspect_family_invitation(text)',
    'public.accept_family_invitation(text)', 'public.revoke_family_invitation(uuid)',
    'public.list_family_invitations(uuid)', 'public.list_family_adults(uuid)',
    'public.promote_family_parent(uuid, uuid)', 'public.remove_family_parent(uuid, uuid)',
    'public.leave_family(uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- 6. Account-Löschung rennsicher: erst alle Familien sperren, dann planen
-- ---------------------------------------------------------------------
create or replace function public.execute_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_fid uuid;
  v_deleted uuid[] := '{}';
  v_left uuid[] := '{}';
  v_transferred uuid[] := '{}';
begin
  if p_user_id is null then raise exception 'user_id fehlt' using errcode = '22023'; end if;
  -- Feste Reihenfolge (family_id) verhindert Deadlocks zwischen parallelen Löschungen
  for v_fid in select fm.family_id from public.family_members fm where fm.user_id = p_user_id order by fm.family_id loop
    perform 1 from public.families f where f.id = v_fid for update;
  end loop;
  for r in select * from public.account_deletion_plan(p_user_id) loop
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
  update private.family_invitations set revoked_at = now()
   where created_by = p_user_id and used_at is null and revoked_at is null;
  return jsonb_build_object('deleted_families', to_jsonb(v_deleted), 'left_families', to_jsonb(v_left),
                            'ownership_transferred', to_jsonb(v_transferred));
end;
$$;
revoke all on function public.execute_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.execute_account_deletion(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 7. Test-Hintertür aus Phase 5C entfernen (existiert nur im Testprojekt)
-- ---------------------------------------------------------------------
drop function if exists public.test_add_family_member(uuid, text, text);

commit;
