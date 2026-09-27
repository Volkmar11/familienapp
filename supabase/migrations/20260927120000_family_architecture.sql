-- =====================================================================
-- Wochen Champion – Familienarchitektur (ENTWURF, Phase 2)
-- =====================================================================
--
-- NICHT AUF DAS PRODUKTIVE SUPABASE-PROJEKT ANWENDEN.
-- Nur für ein separates Supabase-Testprojekt gedacht.
--
-- Diese Datei:
--   * legt ausschließlich NEUE Tabellen, Funktionen und Policies an,
--   * verändert, leert oder löscht public.app_state NICHT,
--   * enthält keine Daten (kein INSERT/UPDATE/DELETE auf Bestandsdaten).
--
-- Schutzsperre: Die Ausführung bricht ab, solange nicht vorher in derselben
-- Sitzung bewusst gesetzt wurde:
--     set app.migration_target = 'test';
-- Vor einer späteren echten Übernahme muss diese Sperre bewusst entfernt werden.
--
-- Voraussetzungen: Supabase (Schema auth, Rollen anon/authenticated),
-- PostgreSQL >= 15 (ON DELETE SET NULL (spalte)).
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
-- Privates Schema für Hilfsfunktionen (nicht über die API erreichbar)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- updated_at automatisch setzen
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- 1. families
-- =====================================================================
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- =====================================================================
-- 2. family_members  (Eltern-Konten ↔ Familie; Kinder sind KEINE auth.users)
-- =====================================================================
create table public.family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'parent' check (role in ('owner', 'parent')),
  created_at  timestamptz not null default now(),
  unique (family_id, user_id)
);
create index family_members_user_id_idx on public.family_members (user_id);

-- ---------------------------------------------------------------------
-- Hilfsfunktionen für RLS
-- SECURITY DEFINER umgeht RLS auf family_members und verhindert so
-- rekursive Policies. search_path ist leer, alle Namen voll qualifiziert.
-- ---------------------------------------------------------------------
create or replace function private.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_family_role(target_family_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = (select auth.uid())
      and fm.role = any (allowed_roles)
  );
$$;

revoke all on function private.is_family_member(uuid) from public;
revoke all on function private.has_family_role(uuid, text[]) from public;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.has_family_role(uuid, text[]) to authenticated;

-- =====================================================================
-- 3. family_settings  (eine Zeile pro Familie)
-- =====================================================================
create table public.family_settings (
  family_id             uuid primary key references public.families (id) on delete cascade,
  show_daily_crown      boolean not null default true,   -- Tageskrone 👑 anzeigen
  require_confirmation  boolean not null default true,   -- bisher data.needsConfirmation
  last_champion_week    date check (last_champion_week is null or extract(isodow from last_champion_week) = 1), -- bisher data.lastChampionWeek (Montag)
  parent_pin_hash       text,                            -- nur Hash, niemals Klartext; Umsetzung in späterer Phase
  timezone              text not null default 'Europe/Berlin',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
  -- KEIN premium-Boolean: Monetarisierung erhält eine eigene Entitlement-Architektur.
);

-- =====================================================================
-- 4. profiles  (Spielerprofile: Kinder und – wie bisher – Eltern)
-- =====================================================================
create table public.profiles (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references public.families (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 40),
  is_parent       boolean not null default false,  -- bisher member.isAdmin (Erledigungen ohne Bestätigung)
  linked_user_id  uuid references auth.users (id) on delete set null, -- optional: Profil eines Elternkontos
  avatar_emoji    text check (avatar_emoji is null or char_length(avatar_emoji) <= 16),
  avatar_url      text,                            -- später Supabase Storage statt Base64
  color           text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order      integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (family_id, id)
);
create index profiles_family_id_idx on public.profiles (family_id, sort_order);

-- =====================================================================
-- 5. categories
-- =====================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  icon        text check (icon is null or char_length(icon) <= 16),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (family_id, id)
);
-- Kategorienamen sind in der bisherigen App der Schlüssel (Badges, Filter) → pro Familie eindeutig
create unique index categories_family_name_uidx on public.categories (family_id, lower(btrim(name)));

-- Sichtbarkeit einer Kategorie für bestimmte Profile (bisher category.assignedTo; leer = alle)
create table public.category_assignments (
  family_id    uuid not null,
  category_id  uuid not null,
  profile_id   uuid not null,
  primary key (category_id, profile_id),
  foreign key (family_id, category_id) references public.categories (family_id, id) on delete cascade,
  foreign key (family_id, profile_id)  references public.profiles (family_id, id)   on delete cascade
);
create index category_assignments_profile_idx on public.category_assignments (profile_id);

-- =====================================================================
-- 6. tasks
-- =====================================================================
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null references public.families (id) on delete cascade,
  category_id  uuid,
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  icon         text check (icon is null or char_length(icon) <= 16),
  image_url    text,                               -- bisher task.photo (Base64)
  points       integer not null check (points between 0 and 10000),
  recurrence   text not null default 'daily' check (recurrence in ('daily', 'weekly', 'once')),
  active       boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (family_id, id),
  foreign key (family_id, category_id) references public.categories (family_id, id) on delete set null (category_id)
);
create index tasks_family_idx on public.tasks (family_id, sort_order);
create index tasks_category_idx on public.tasks (category_id);

-- bisher task.assignedTo (leer = für alle sichtbar)
create table public.task_assignments (
  family_id   uuid not null,
  task_id     uuid not null,
  profile_id  uuid not null,
  primary key (task_id, profile_id),
  foreign key (family_id, task_id)    references public.tasks (family_id, id)    on delete cascade,
  foreign key (family_id, profile_id) references public.profiles (family_id, id) on delete cascade
);
create index task_assignments_profile_idx on public.task_assignments (profile_id);

-- =====================================================================
-- 7. rewards
-- =====================================================================
create table public.rewards (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  title            text not null check (char_length(btrim(title)) between 1 and 80),
  icon             text check (icon is null or char_length(icon) <= 16),
  points_required  integer not null check (points_required between 0 and 100000), -- bisher reward.pointsCost
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (family_id, id)
);
create index rewards_family_idx on public.rewards (family_id, sort_order);

-- bisher reward.assignedTo (leer = für alle sichtbar)
create table public.reward_assignments (
  family_id   uuid not null,
  reward_id   uuid not null,
  profile_id  uuid not null,
  primary key (reward_id, profile_id),
  foreign key (family_id, reward_id)  references public.rewards (family_id, id)  on delete cascade,
  foreign key (family_id, profile_id) references public.profiles (family_id, id) on delete cascade
);
create index reward_assignments_profile_idx on public.reward_assignments (profile_id);

-- =====================================================================
-- 8. completions  (bisher data.completions[])
-- =====================================================================
create table public.completions (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  profile_id       uuid not null,
  task_id          uuid,                            -- null, wenn Aufgabe später gelöscht wurde
  task_title       text not null,                   -- Momentaufnahme (bisher taskName)
  category_name    text,                            -- Momentaufnahme (bisher category; für Badges)
  points           integer not null check (points between 0 and 10000),
  completed_at     timestamptz not null default now(),
  completion_date  date not null,                   -- lokaler Kalendertag der Familie (Doppelklick-Sperre)
  status           text not null default 'confirmed' check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_at     timestamptz,
  confirmed_by     uuid references auth.users (id) on delete set null,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (family_id, profile_id) references public.profiles (family_id, id) on delete cascade,
  foreign key (family_id, task_id)    references public.tasks (family_id, id)    on delete set null (task_id)
);
-- Bisherige Regel: pro Profil, Aufgabe und Tag höchstens eine (nicht abgelehnte) Erledigung
create unique index completions_once_per_day_uidx
  on public.completions (profile_id, task_id, completion_date)
  where status <> 'rejected' and task_id is not null;
create index completions_family_time_idx on public.completions (family_id, completed_at desc);
create index completions_profile_time_idx on public.completions (profile_id, completed_at desc);
create index completions_pending_idx on public.completions (family_id) where status = 'pending';

-- =====================================================================
-- 9. redemptions  (bisher data.redeemedRewards[] + Eltern-Benachrichtigung)
-- =====================================================================
create table public.redemptions (
  id               uuid primary key default gen_random_uuid(),
  family_id        uuid not null references public.families (id) on delete cascade,
  profile_id       uuid not null,
  reward_id        uuid,                            -- null, wenn Belohnung später gelöscht wurde
  reward_title     text not null,                   -- Momentaufnahme (bisher rewardName)
  points_spent     integer not null check (points_spent between 0 and 100000),
  redeemed_at      timestamptz not null default now(),
  acknowledged_at  timestamptz,                     -- ersetzt notifications[].read
  acknowledged_by  uuid references auth.users (id) on delete set null,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  foreign key (family_id, profile_id) references public.profiles (family_id, id) on delete cascade,
  foreign key (family_id, reward_id)  references public.rewards (family_id, id)  on delete set null (reward_id)
);
create index redemptions_family_time_idx on public.redemptions (family_id, redeemed_at desc);
create index redemptions_profile_idx on public.redemptions (profile_id);
create index redemptions_unacknowledged_idx on public.redemptions (family_id) where acknowledged_at is null;

-- =====================================================================
-- 10. champion_history  (bisher data.championHistory[])
-- =====================================================================
create table public.champion_history (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.families (id) on delete cascade,
  profile_id     uuid,                              -- null, wenn Profil gelöscht wurde
  profile_name   text not null,                     -- Momentaufnahme (bisher name)
  profile_avatar text,                              -- Momentaufnahme (bisher emoji)
  week_start     date not null check (extract(isodow from week_start) = 1), -- Montag der Woche (bisher week)
  points         integer not null check (points >= 0),
  created_at     timestamptz not null default now(),
  unique (family_id, week_start),
  foreign key (family_id, profile_id) references public.profiles (family_id, id) on delete set null (profile_id)
);

-- =====================================================================
-- updated_at-Trigger
-- =====================================================================
create trigger families_updated_at        before update on public.families        for each row execute function private.set_updated_at();
create trigger family_settings_updated_at before update on public.family_settings for each row execute function private.set_updated_at();
create trigger profiles_updated_at        before update on public.profiles        for each row execute function private.set_updated_at();
create trigger categories_updated_at      before update on public.categories      for each row execute function private.set_updated_at();
create trigger tasks_updated_at           before update on public.tasks           for each row execute function private.set_updated_at();
create trigger rewards_updated_at         before update on public.rewards         for each row execute function private.set_updated_at();

-- =====================================================================
-- Row Level Security
-- Grundprinzip: auth.uid() → family_members → family_id.
-- anon erhält keinerlei Zugriff auf die neuen Tabellen.
-- =====================================================================
alter table public.families             enable row level security;
alter table public.family_members       enable row level security;
alter table public.family_settings      enable row level security;
alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.category_assignments enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_assignments     enable row level security;
alter table public.rewards              enable row level security;
alter table public.reward_assignments   enable row level security;
alter table public.completions          enable row level security;
alter table public.redemptions          enable row level security;
alter table public.champion_history     enable row level security;

revoke all on
  public.families, public.family_members, public.family_settings, public.profiles,
  public.categories, public.category_assignments, public.tasks, public.task_assignments,
  public.rewards, public.reward_assignments, public.completions, public.redemptions,
  public.champion_history
from anon;

-- families: lesen alle Mitglieder; ändern owner/parent; löschen nur owner.
-- INSERT nur über public.create_family() (keine INSERT-Policy).
create policy families_select on public.families for select to authenticated
  using (private.is_family_member(id));
create policy families_update on public.families for update to authenticated
  using (private.has_family_role(id, array['owner', 'parent']))
  with check (private.has_family_role(id, array['owner', 'parent']));
create policy families_delete on public.families for delete to authenticated
  using (private.has_family_role(id, array['owner']));

-- family_members: Mitglieder sehen ihre Familie. Kein direktes INSERT/UPDATE
-- (nur über RPCs wie create_family bzw. später Einladungen).
-- DELETE: owner entfernt andere; jedes Nicht-owner-Mitglied darf selbst austreten.
create policy family_members_select on public.family_members for select to authenticated
  using (private.is_family_member(family_id));
create policy family_members_delete on public.family_members for delete to authenticated
  using (
    (private.has_family_role(family_id, array['owner']) and user_id <> (select auth.uid()))
    or (user_id = (select auth.uid()) and role <> 'owner')
  );

-- family_settings: lesen/ändern alle Mitglieder; INSERT nur über create_family().
create policy family_settings_select on public.family_settings for select to authenticated
  using (private.is_family_member(family_id));
create policy family_settings_update on public.family_settings for update to authenticated
  using (private.has_family_role(family_id, array['owner', 'parent']))
  with check (private.has_family_role(family_id, array['owner', 'parent']));

-- Inhaltstabellen: alle Mitglieder (owner/parent) dürfen lesen und verwalten.
-- Kinder haben keine eigenen Konten; sie nutzen ein angemeldetes Familiengerät.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'categories', 'category_assignments', 'tasks', 'task_assignments',
    'rewards', 'reward_assignments', 'completions', 'redemptions', 'champion_history'
  ]
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated using (private.is_family_member(family_id));', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated with check (private.has_family_role(family_id, array[''owner'',''parent'']));', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated using (private.has_family_role(family_id, array[''owner'',''parent''])) with check (private.has_family_role(family_id, array[''owner'',''parent'']));', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated using (private.has_family_role(family_id, array[''owner'',''parent'']));', t);
  end loop;
end
$$;

-- =====================================================================
-- RPC: create_family  (löst das Bootstrapping-Problem beim Onboarding)
-- Legt atomar Familie, owner-Mitgliedschaft und Standard-Einstellungen an.
-- =====================================================================
create or replace function public.create_family(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_family_id uuid;
begin
  if v_uid is null then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Ungültiger Familienname' using errcode = '22023';
  end if;

  insert into public.families (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_family_id;

  insert into public.family_members (family_id, user_id, role)
  values (v_family_id, v_uid, 'owner');

  insert into public.family_settings (family_id)
  values (v_family_id);

  return v_family_id;
end;
$$;

revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;

-- =====================================================================
-- Realtime (Mehrgeräte-Sync); RLS gilt auch für Realtime-Ereignisse.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.profiles, public.categories, public.tasks, public.rewards,
      public.completions, public.redemptions, public.champion_history, public.family_settings;
  end if;
end
$$;

commit;
