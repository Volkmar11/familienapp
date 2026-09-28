-- =====================================================================
-- Wochen Champion – Phase 5C: Prüfung Löschplan / Ausführung / Rechte
-- NUR im Supabase-TESTPROJEKT (oder lokal gegen den Stub) ausführen.
-- Alle Testdaten entstehen in einer Subtransaktion, die am Ende zurückgerollt wird.
-- Voraussetzung: alle Migrationen bis 20260929200000_account_lifecycle.sql.
-- =====================================================================
set app.migration_target = 'test';
drop table if exists pg_temp.t_life;
create temp table t_life(n serial, test text, pass boolean, detail text);
do $$
declare
  res jsonb := '[]'::jsonb;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  f1 uuid; f2 uuid; f3 uuid; f4 uuid; p1 uuid; t1 uuid; x jsonb; n int; ok boolean; msg text; r record;
  proc text;
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then raise exception 'Abbruch: nur im Testprojekt.'; end if;
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-life-' || left(u::text, 8) || '@example.com', now(), now()
        from unnest(array[a, b, c, d]) u;
    exception when undefined_column then
      insert into auth.users (id) select unnest(array[a, b, c, d]);
    end;
    -- f1: nur A (owner) · f2: A owner, B parent, C parent (B älter) · f3: A parent, D owner · f4: A owner, D owner
    insert into public.families (name, created_by) values ('L1', a) returning id into f1;
    insert into public.families (name, created_by) values ('L2', a) returning id into f2;
    insert into public.families (name, created_by) values ('L3', d) returning id into f3;
    insert into public.families (name, created_by) values ('L4', a) returning id into f4;
    insert into public.family_members (family_id, user_id, role, created_at) values
      (f1, a, 'owner', now() - interval '3 day'),
      (f2, a, 'owner', now() - interval '3 day'), (f2, c, 'parent', now() - interval '1 day'), (f2, b, 'parent', now() - interval '2 day'),
      (f3, d, 'owner', now() - interval '3 day'), (f3, a, 'parent', now() - interval '2 day'),
      (f4, a, 'owner', now() - interval '3 day'), (f4, d, 'owner', now() - interval '2 day');
    insert into public.family_settings (family_id) values (f1), (f2), (f3), (f4);
    insert into public.profiles (family_id, name) values (f1, 'Kind 1') returning id into p1;
    insert into public.profiles (family_id, name) values (f2, 'Kind 2');
    insert into public.tasks (family_id, title, points) values (f2, 'Aufgabe', 5) returning id into t1;
    insert into public.completions (family_id, profile_id, task_id, task_title, points, completion_date, status, confirmed_at, confirmed_by, created_by)
      select f2, p.id, t1, 'Aufgabe', 5, current_date, 'confirmed', now(), a, a from public.profiles p where p.family_id = f2;
    insert into public.rewards (family_id, title, points_required) values (f2, 'Belohnung', 1);
    insert into public.redemptions (family_id, profile_id, reward_id, reward_title, points_spent, acknowledged_at, acknowledged_by, created_by)
      select f2, p.id, (select id from public.rewards where family_id = f2), 'Belohnung', 1, now(), a, a from public.profiles p where p.family_id = f2;

    -- Plan
    select jsonb_object_agg(pl.family_id::text, jsonb_build_object('a', pl.action, 'o', pl.new_owner)) into x from public.account_deletion_plan(a) pl;
    res := res || jsonb_build_object('t', 'Plan: alleiniger Erwachsener → delete_family', 'p', x->f1::text->>'a' = 'delete_family');
    res := res || jsonb_build_object('t', 'Plan: letzter owner → transfer an ältesten parent', 'p', x->f2::text->>'a' = 'transfer_leave' and x->f2::text->>'o' = b::text);
    res := res || jsonb_build_object('t', 'Plan: parent → leave', 'p', x->f3::text->>'a' = 'leave');
    res := res || jsonb_build_object('t', 'Plan: weiterer owner vorhanden → leave ohne Rollenänderung', 'p', x->f4::text->>'a' = 'leave' and x->f4::text->>'o' is null);

    -- Rechte: authenticated/anon dürfen die Service-Funktionen nicht ausführen
    foreach proc in array array['account_deletion_plan(uuid)', 'execute_account_deletion(uuid)', 'delete_family_as_service(uuid)'] loop
      res := res || jsonb_build_object('t', 'kein EXECUTE für authenticated/anon: ' || proc, 'p',
        not has_function_privilege('authenticated', 'public.' || proc, 'EXECUTE') and not has_function_privilege('anon', 'public.' || proc, 'EXECUTE'));
    end loop;
    res := res || jsonb_build_object('t', 'kein EXECUTE für authenticated: family_owner_check', 'p', not has_function_privilege('authenticated', 'public.family_owner_check(uuid,uuid)', 'EXECUTE'));

    -- Ausführen
    x := public.execute_account_deletion(a);
    res := res || jsonb_build_object('t', 'f1 gelöscht (inkl. Profile/Einstellungen)', 'p', not exists (select 1 from public.families where id = f1) and not exists (select 1 from public.profiles where family_id = f1) and not exists (select 1 from public.family_settings where family_id = f1));
    res := res || jsonb_build_object('t', 'f2 bleibt, B ist owner, C bleibt parent', 'p',
      exists (select 1 from public.families where id = f2)
      and (select role from public.family_members where family_id = f2 and user_id = b) = 'owner'
      and (select role from public.family_members where family_id = f2 and user_id = c) = 'parent'
      and not exists (select 1 from public.family_members where family_id = f2 and user_id = a));
    res := res || jsonb_build_object('t', 'f2: Kinder, Aufgaben, Erledigungen bleiben', 'p',
      (select count(*) from public.profiles where family_id = f2) = 1 and (select count(*) from public.tasks where family_id = f2) = 1 and (select count(*) from public.completions where family_id = f2) = 1);
    res := res || jsonb_build_object('t', 'f3: D bleibt owner, A ausgetreten', 'p',
      (select role from public.family_members where family_id = f3 and user_id = d) = 'owner' and not exists (select 1 from public.family_members where family_id = f3 and user_id = a));
    res := res || jsonb_build_object('t', 'f4: D bleibt owner, keine weitere Rollenänderung', 'p',
      (select count(*) from public.family_members where family_id = f4) = 1 and (select role from public.family_members where family_id = f4 and user_id = d) = 'owner');
    res := res || jsonb_build_object('t', 'Ergebnis nennt 1 gelöschte, 3 verlassene, 1 übertragene Familie', 'p',
      jsonb_array_length(x->'deleted_families') = 1 and jsonb_array_length(x->'left_families') = 3 and jsonb_array_length(x->'ownership_transferred') = 1);
    -- Idempotenz
    x := public.execute_account_deletion(a);
    res := res || jsonb_build_object('t', 'zweiter Aufruf ist wirkungslos', 'p', jsonb_array_length(x->'deleted_families') = 0 and jsonb_array_length(x->'left_families') = 0);
    -- Auth-Löschung: Audit-Felder → NULL, Historie bleibt
    delete from auth.users where id = a;
    res := res || jsonb_build_object('t', 'Auth-User gelöscht: Audit-Felder NULL, Erledigung bleibt (inkl. confirmed_at)', 'p',
      (select count(*) from public.completions where family_id = f2 and confirmed_by is null and created_by is null and confirmed_at is not null and status = 'confirmed') = 1);
    res := res || jsonb_build_object('t', 'Auth-User gelöscht: Einlösung bleibt quittiert, acknowledged_by NULL', 'p',
      (select count(*) from public.redemptions where family_id = f2 and acknowledged_by is null and acknowledged_at is not null and created_by is null) = 1);
    -- Stempel bleibt sonst unveränderlich: manuelles Nullen eines EXISTIERENDEN Nutzers wird zurückgesetzt
    insert into public.profiles (family_id, name) values (f3, 'Kind 3');
    insert into public.completions (family_id, profile_id, task_title, points, completion_date, status, confirmed_at, confirmed_by)
      select f3, p.id, 'Aufgabe', 5, current_date, 'confirmed', now(), d from public.profiles p where p.family_id = f3;
    update public.completions set confirmed_by = null where family_id = f3;
    res := res || jsonb_build_object('t', 'Trigger schützt weiterhin: confirmed_by eines existierenden Nutzers unveränderlich', 'p',
      (select confirmed_by from public.completions where family_id = f3) = d);
    res := res || jsonb_build_object('t', 'families.created_by → NULL', 'p', (select created_by from public.families where id = f2) is null);

    -- Familie löschen
    res := res || jsonb_build_object('t', 'owner-Check: B ist owner von f2, C nicht', 'p', public.family_owner_check(b, f2) and not public.family_owner_check(c, f2));
    x := public.delete_family_as_service(f2);
    res := res || jsonb_build_object('t', 'delete_family_as_service: Familie + Mitglieder + Daten weg, Konten bleiben', 'p',
      (x->>'deleted')::boolean and not exists (select 1 from public.family_members where family_id = f2) and not exists (select 1 from public.completions where family_id = f2)
      and exists (select 1 from auth.users where id = b) and exists (select 1 from auth.users where id = c));
    x := public.delete_family_as_service(f2);
    res := res || jsonb_build_object('t', 'erneutes Löschen idempotent', 'p', not (x->>'deleted')::boolean);

    raise exception using message = 'WC_LIFE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'WC_LIFE_ROLLBACK' then raise; end if;
  end;
  insert into t_life(test, pass, detail) select e->>'t', (e->>'p')::boolean, e->>'d' from jsonb_array_elements(res) e;
end
$$;
select count(*) filter (where pass) as pass, count(*) as total,
       coalesce(string_agg(case when not pass then test end, '; '), '') as failed
from t_life;
