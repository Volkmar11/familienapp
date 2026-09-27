-- =====================================================================
-- Wochen Champion – Phase 4C2B1: RLS-/Schutz-Prüfung der Elternverwaltung
-- NUR im Supabase-TESTPROJEKT ausführen (SQL-Editor oder MCP execute_sql).
-- Legt zwei temporäre Auth-Benutzer (@example.com) an, prüft fremde Familien,
-- Schutz-Trigger (Profil mit Verlauf, letztes aktives Kind), Kaskade beim
-- Familien-Löschen und anon; räumt anschließend auf. Ausgabe: PASS-Zählung.
-- Voraussetzung: alle Migrationen bis 20260928200000_family_admin_crud.sql.
-- =====================================================================
set app.migration_target = 'test';
drop table if exists pg_temp.t_results;
create temp table t_results(n serial, test text, pass boolean, detail text);
grant all on t_results to authenticated, anon;
grant usage on sequence t_results_n_seq to authenticated, anon;
do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; fa2 uuid; pa uuid; pb uuid; ca uuid; cb uuid; ta uuid; tb uuid; ra uuid;
  n int; ok boolean; msg text;
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: nur im Testprojekt ausführen.';
  end if;
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-rls-a-' || left(ua::text, 8) || '@example.com', now(), now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-rls-b-' || left(ub::text, 8) || '@example.com', now(), now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  fa := public.create_family('RLS-Test A');
  insert into public.profiles (family_id, name) values (fa, 'Kind A') returning id into pa;
  insert into public.categories (family_id, name) values (fa, 'Haushalt') returning id into ca;
  insert into public.tasks (family_id, category_id, title, points) values (fa, ca, 'Aufgabe A', 10) returning id into ta;
  insert into public.rewards (family_id, title, points_required) values (fa, 'Belohnung A', 50) returning id into ra;
  insert into public.completions (family_id, profile_id, task_id, task_title, points, completion_date) values (fa, pa, ta, 'Aufgabe A', 10, current_date);
  begin insert into public.redemptions (family_id, profile_id, reward_id, reward_title, points_spent) values (fa, pa, ra, 'Belohnung A', 50); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('A: direkte Einlösung per INSERT blockiert', ok, msg);

  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  fb := public.create_family('RLS-Test B');
  insert into public.profiles (family_id, name) values (fb, 'Kind B') returning id into pb;
  insert into public.categories (family_id, name) values (fb, 'Haushalt') returning id into cb;
  insert into public.tasks (family_id, category_id, title, points) values (fb, cb, 'Aufgabe B', 10) returning id into tb;
  update public.tasks set points = 999 where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('B→A: Aufgaben ändern wirkungslos', n = 0, n::text);
  update public.profiles set active = false where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('B→A: Profile deaktivieren wirkungslos', n = 0, n::text);
  delete from public.profiles where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('B→A: Profile löschen wirkungslos', n = 0, n::text);
  begin perform public.remove_profile(fa, pa); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B→A: remove_profile blockiert', ok, msg);
  begin perform public.set_task_assignments(fa, ta, array[pb]); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B→A: set_task_assignments blockiert', ok, msg);
  begin perform public.reorder_items(fa, 'tasks', array[ta]); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B→A: reorder_items blockiert', ok, msg);
  begin perform public.set_task_assignments(fb, tb, array[pa]); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B: fremdes Profil in eigener Zuordnung abgelehnt', ok, msg);

  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  begin delete from public.profiles where id = pa; ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('A: Profil mit Verlauf direkt löschen blockiert', ok, msg);
  begin update public.profiles set active = false where id = pa; ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('A: letztes aktives Profil deaktivieren blockiert', ok, msg);
  fa2 := public.create_family('RLS-Test A2');
  delete from public.families where id = fa2; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A: owner darf eigene Familie löschen', n = 1, n::text);
  delete from public.families where id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A: Familie mit Profilen/Verlauf löschen (Kaskade trotz Schutz-Trigger)', n = 1, n::text);

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin perform public.remove_task(fb, tb); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('anon: remove_task blockiert', ok, msg);

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  delete from public.families where id in (fa, fb);
  delete from auth.users where id in (ua, ub);
end
$$;
select n, case when pass then 'PASS' else 'FAIL' end as result, test, detail from t_results order by n;
