-- =====================================================================
-- Wochen Champion – Phase 5B: Familienmedien in Supabase Storage
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
--   1. Privater Bucket `family-media` (nicht öffentlich, max. 2 MB je Objekt, nur JPEG/WebP).
--   2. Stabile Pfadspalten profiles.photo_path / tasks.image_path. Die DB speichert NUR
--      Storage-Pfade – keine URLs, keine signierten URLs, kein Base64. Die alten, nie genutzten
--      Spalten avatar_url / image_url werden per CHECK auf NULL festgeschrieben.
--   3. Pfadschema (streng, per Regex geprüft):
--        families/<family_id>/profiles/<profile_id>/<uuid>.jpg|webp
--        families/<family_id>/tasks/<task_id>/<uuid>.jpg|webp
--      Dateinamen sind Zufalls-UUIDs – keine Namen oder Aufgabentitel im Pfad.
--   4. RLS auf storage.objects für diesen Bucket: Lesen nur Familienmitglieder, Schreiben/
--      Ersetzen/Löschen nur owner/parent. family_id wird serverseitig aus dem Pfad gelesen
--      (storage.foldername), nie aus Client-Angaben. anon hat keinen Zugriff.
--   5. Trigger: photo_path/image_path dürfen nur auf ein existierendes Objekt der eigenen
--      Familie und des eigenen Datensatzes zeigen.
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
-- 1. Bucket
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-media', 'family-media', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. Pfad-Helfer (rein, ohne Tabellenzugriff)
-- ---------------------------------------------------------------------
-- Gültiger Medienpfad? Exakt 5 Segmente, UUIDs in Kleinbuchstaben, Endung jpg/webp.
create or replace function private.is_media_path(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_name ~ '^families/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(profiles|tasks)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$', false);
$$;

-- family_id aus dem Pfad (NULL bei ungültigem Pfad → alle Policies schlagen fehl)
create or replace function private.media_family_id(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when private.is_media_path(p_name) then ((storage.foldername(p_name))[2])::uuid end;
$$;

revoke all on function private.is_media_path(text) from public;
revoke all on function private.media_family_id(text) from public;
grant execute on function private.is_media_path(text) to authenticated;
grant execute on function private.media_family_id(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Spalten
-- ---------------------------------------------------------------------
alter table public.profiles add column photo_path text;
alter table public.tasks    add column image_path text;

-- Pfad muss zur eigenen Familie und zum eigenen Datensatz gehören
alter table public.profiles add constraint profiles_photo_path_check check (
  photo_path is null or (private.is_media_path(photo_path)
    and split_part(photo_path, '/', 2) = family_id::text
    and split_part(photo_path, '/', 3) = 'profiles'
    and split_part(photo_path, '/', 4) = id::text));
alter table public.tasks add constraint tasks_image_path_check check (
  image_path is null or (private.is_media_path(image_path)
    and split_part(image_path, '/', 2) = family_id::text
    and split_part(image_path, '/', 3) = 'tasks'
    and split_part(image_path, '/', 4) = id::text));

-- Alte URL-/Base64-Felder werden nicht verwendet und bleiben leer
alter table public.profiles add constraint profiles_avatar_url_unused check (avatar_url is null);
alter table public.tasks    add constraint tasks_image_url_unused    check (image_url is null);

-- ---------------------------------------------------------------------
-- 4. Referenz nur auf existierende Objekte (SECURITY INVOKER: Sichtbarkeit per Storage-RLS)
-- ---------------------------------------------------------------------
create or replace function private.check_media_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_path text := to_jsonb(new) ->> tg_argv[0];   -- Spaltenname als Trigger-Argument
  v_old  text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> tg_argv[0] end;
begin
  if v_path is not null and v_path is distinct from v_old
     and not exists (select 1 from storage.objects o where o.bucket_id = 'family-media' and o.name = v_path) then
    raise exception 'Medienobjekt nicht gefunden' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function private.check_media_reference() from public;

create trigger profiles_media_reference before insert or update of photo_path on public.profiles
  for each row execute function private.check_media_reference('photo_path');
create trigger tasks_media_reference before insert or update of image_path on public.tasks
  for each row execute function private.check_media_reference('image_path');

-- ---------------------------------------------------------------------
-- 5. Storage-RLS (nur Bucket family-media, nur authenticated)
-- ---------------------------------------------------------------------
create policy family_media_select on storage.objects for select to authenticated
  using (bucket_id = 'family-media' and private.is_family_member(private.media_family_id(objects.name)));

-- Hinweis: überall objects.name – in Unterabfragen würde „name“ sonst z. B. profiles.name treffen.
-- Hochladen nur für owner/parent, und nur für einen existierenden Datensatz dieser Familie
create policy family_media_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'family-media'
    and private.has_family_role(private.media_family_id(objects.name), array['owner', 'parent'])
    and case split_part(objects.name, '/', 3)
          when 'profiles' then exists (select 1 from public.profiles p
                                        where p.family_id = private.media_family_id(objects.name) and p.id::text = split_part(objects.name, '/', 4))
          when 'tasks'    then exists (select 1 from public.tasks t
                                        where t.family_id = private.media_family_id(objects.name) and t.id::text = split_part(objects.name, '/', 4))
          else false end);

create policy family_media_update on storage.objects for update to authenticated
  using (bucket_id = 'family-media' and private.has_family_role(private.media_family_id(objects.name), array['owner', 'parent']))
  with check (bucket_id = 'family-media' and private.has_family_role(private.media_family_id(objects.name), array['owner', 'parent']));

create policy family_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'family-media' and private.has_family_role(private.media_family_id(objects.name), array['owner', 'parent']));

commit;
