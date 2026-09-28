-- =====================================================================
-- Wochen Champion – Phase 5B: RLS-/Schutz-Prüfung für family-media (storage.objects)
-- NUR im Supabase-TESTPROJEKT (oder lokal gegen den Stub) ausführen.
-- Alle Testdaten entstehen in einer Subtransaktion, die am Ende bewusst zurückgerollt wird
-- (direktes Löschen aus storage.objects ist in Supabase gesperrt). Ergebnis: PASS-Zählung.
-- Voraussetzung: alle Migrationen bis 20260929100000_family_media_storage.sql.
-- =====================================================================
set app.migration_target = 'test';
drop table if exists pg_temp.t_media;
create temp table t_media(n serial, test text, pass boolean, detail text);
do $$
declare
  res   jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  fa uuid; fb uuid; pa uuid; pb uuid; ta uuid;
  pa_path text; ta_path text; n int; ok boolean; msg text;
  bad text;
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: nur im Testprojekt ausführen.';
  end if;
  begin
    -- Benutzer (Testprojekt verlangt vollständige auth.users-Zeilen; der lokale Stub nur id)
    begin
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
        (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-media-a-' || left(ua::text, 8) || '@example.com', now(), now()),
        (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-media-b-' || left(ub::text, 8) || '@example.com', now(), now()),
        (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-media-c-' || left(uc::text, 8) || '@example.com', now(), now());
    exception when undefined_column then
      insert into auth.users (id) values (ua), (ub), (uc);
    end;

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    fa := public.create_family('Media-Test A');
    insert into public.profiles (family_id, name) values (fa, 'Kind A') returning id into pa;
    insert into public.tasks (family_id, title, points) values (fa, 'Aufgabe A', 10) returning id into ta;
    pa_path := format('families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid());
    ta_path := format('families/%s/tasks/%s/%s.webp', fa, ta, gen_random_uuid());

    perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
    fb := public.create_family('Media-Test B');
    insert into public.profiles (family_id, name) values (fb, 'Kind B') returning id into pb;

    -- C wird (als postgres) Elternteil (parent) in Familie A
    execute 'reset role';
    insert into public.family_members (family_id, user_id, role) values (fa, uc, 'parent');
    execute 'set local role authenticated';

    -- ---- owner A ----
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    insert into storage.objects (bucket_id, name) values ('family-media', pa_path);
    res := res || jsonb_build_object('t', 'owner lädt Profilbild hoch', 'p', true);
    select count(*) into n from storage.objects where name = pa_path;
    res := res || jsonb_build_object('t', 'owner liest Profilbild', 'p', n = 1);
    insert into storage.objects (bucket_id, name) values ('family-media', ta_path);
    res := res || jsonb_build_object('t', 'owner lädt Aufgabenbild hoch', 'p', true);
    update public.profiles set photo_path = pa_path where id = pa;
    update public.tasks set image_path = ta_path where id = ta;
    res := res || jsonb_build_object('t', 'photo_path/image_path auf existierendes Objekt', 'p', true);

    -- manipulierte / ungültige Pfade (owner A)
    foreach bad in array array[
      format('families/%s/profiles/%s/../x.jpg', fa, pa),
      format('families/%s/profiles/%s/%s.png', fa, pa, gen_random_uuid()),
      format('families/%s/profiles/%s/%s/%s.jpg', fa, pa, gen_random_uuid(), gen_random_uuid()),
      format('families/%s/other/%s/%s.jpg', fa, pa, gen_random_uuid()),
      format('families/%s/profiles/%s/Max Mustermann.jpg', fa, pa),
      upper(format('families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid())),
      format('/families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid()),
      format('families/%s/profiles/%s/%s.jpg', fa, gen_random_uuid(), gen_random_uuid())   -- Profil existiert nicht
    ] loop
      begin insert into storage.objects (bucket_id, name) values ('family-media', bad); ok := false; msg := 'kein Fehler';
      exception when others then ok := true; msg := sqlstate; end;
      res := res || jsonb_build_object('t', 'ungültiger Pfad blockiert: ' || left(regexp_replace(bad, '[0-9a-f-]{36}', '<id>', 'g'), 60), 'p', ok, 'd', msg);
    end loop;
    begin insert into storage.objects (bucket_id, name) values ('other-bucket', pa_path || 'x'); ok := false; msg := 'kein Fehler';
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'anderer Bucket blockiert', 'p', ok, 'd', msg);

    -- DB-Felder: nur gültige, existierende, eigene Pfade; keine URLs/Base64
    foreach bad in array array[
      'https://otejitifgcrrwmudrnhs.supabase.co/storage/v1/object/sign/family-media/x.jpg?token=abc',
      'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
      format('families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid()),            -- Objekt existiert nicht
      format('families/%s/profiles/%s/%s.jpg', fb, pa, gen_random_uuid()),            -- fremde family_id
      format('families/%s/tasks/%s/%s.jpg', fa, pa, gen_random_uuid())                 -- falscher Typ
    ] loop
      begin update public.profiles set photo_path = bad where id = pa; ok := false; msg := 'kein Fehler';
      exception when others then ok := true; msg := sqlstate; end;
      res := res || jsonb_build_object('t', 'photo_path abgelehnt: ' || left(regexp_replace(bad, '[0-9a-f-]{36}', '<id>', 'g'), 50), 'p', ok, 'd', msg);
    end loop;
    begin update public.profiles set avatar_url = 'data:image/jpeg;base64,AAAA' where id = pa; ok := false; msg := 'kein Fehler';
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'avatar_url (Base64/URL) gesperrt', 'p', ok, 'd', msg);
    begin update public.tasks set image_url = 'https://example.com/x.jpg' where id = ta; ok := false; msg := 'kein Fehler';
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'image_url gesperrt', 'p', ok, 'd', msg);

    -- ---- parent C in Familie A ----
    perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
    begin insert into storage.objects (bucket_id, name) values ('family-media', format('families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid())); ok := true; msg := '';
    exception when others then ok := false; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'parent darf hochladen', 'p', ok, 'd', msg);
    select count(*) into n from storage.objects where name = pa_path;
    res := res || jsonb_build_object('t', 'parent darf lesen', 'p', n = 1);

    -- ---- fremde Familie B ----
    perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
    select count(*) into n from storage.objects where bucket_id = 'family-media' and name like 'families/' || fa || '/%';
    res := res || jsonb_build_object('t', 'fremde Familie kann nicht lesen', 'p', n = 0, 'd', n::text);
    begin insert into storage.objects (bucket_id, name) values ('family-media', format('families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid())); ok := false; msg := 'kein Fehler';
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'fremde Familie kann nicht schreiben', 'p', ok, 'd', msg);
    begin insert into storage.objects (bucket_id, name) values ('family-media', format('families/%s/profiles/%s/%s.jpg', fb, pa, gen_random_uuid())); ok := false; msg := 'kein Fehler';
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'eigene family_id + fremdes Profil blockiert', 'p', ok, 'd', msg);
    update storage.objects set name = format('families/%s/profiles/%s/%s.jpg', fb, pb, gen_random_uuid()) where name = pa_path;
    get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'fremde Familie kann nicht umbenennen/verschieben', 'p', n = 0, 'd', n::text);
    -- Supabase sperrt direkte DELETEs zusätzlich per Statement-Trigger (protect_delete)
    begin delete from storage.objects where name = pa_path; get diagnostics n = row_count; ok := n = 0; msg := n::text;
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'fremde Familie kann nicht löschen', 'p', ok, 'd', msg);
    update public.profiles set photo_path = null where id = pa; get diagnostics n = row_count;
    res := res || jsonb_build_object('t', 'fremde Familie kann photo_path nicht ändern', 'p', n = 0, 'd', n::text);

    -- ---- owner A verschiebt eigenes Objekt in fremde Familie ----
    perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
    begin update storage.objects set name = format('families/%s/profiles/%s/%s.jpg', fb, pb, gen_random_uuid()) where name = ta_path; get diagnostics n = row_count; ok := n = 0; msg := n::text;
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'owner kann Objekt nicht in fremde Familie verschieben', 'p', ok, 'd', msg);

    -- ---- anon ----
    execute 'set local role anon';
    perform set_config('request.jwt.claims', '', true);
    begin select count(*) into n from storage.objects where bucket_id = 'family-media'; ok := n = 0; msg := n::text;
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'anon liest nichts', 'p', ok, 'd', msg);
    begin insert into storage.objects (bucket_id, name) values ('family-media', format('families/%s/profiles/%s/%s.jpg', fa, pa, gen_random_uuid())); ok := false; msg := 'kein Fehler';
    exception when others then ok := true; msg := sqlstate; end;
    res := res || jsonb_build_object('t', 'anon kann nicht schreiben', 'p', ok, 'd', msg);

    execute 'reset role';
    select not public into ok from storage.buckets where id = 'family-media';
    res := res || jsonb_build_object('t', 'Bucket ist privat', 'p', ok);

    raise exception using message = 'WC_MEDIA_ROLLBACK';
  exception when others then
    if sqlerrm <> 'WC_MEDIA_ROLLBACK' then raise; end if;
  end;
  insert into t_media(test, pass, detail)
  select e->>'t', (e->>'p')::boolean, e->>'d' from jsonb_array_elements(res) e;
end
$$;
select count(*) filter (where pass) as pass, count(*) as total,
       coalesce(string_agg(case when not pass then test || ' [' || coalesce(detail, '') || ']' end, '; '), '') as failed
from t_media;
