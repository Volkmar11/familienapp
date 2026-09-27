-- =====================================================================
-- Wochen Champion – RLS-/create_family-Matrixtest
-- NUR im Supabase-TESTPROJEKT ausführen (z. B. SQL-Editor oder MCP execute_sql).
-- Legt zwei temporäre Auth-Benutzer (zufällige @example.com-Adressen) samt
-- Testfamilien an, prüft die Rechte aus Sicht von A, B, „ohne Benutzer“ und
-- anon, räumt anschließend alles wieder auf und gibt PASS/FAIL je Prüfung aus.
-- Voraussetzung: Migration 20260927120000_family_architecture.sql ist angewendet.
-- =====================================================================
set app.migration_target = 'test';   -- bewusste Freigabe, siehe Sperre unten

drop table if exists pg_temp.t_results;   -- nur die temporäre Ergebnistabelle dieser Sitzung
create temp table t_results(n serial, test text, pass boolean, detail text);
grant all on t_results to authenticated, anon;
grant usage on sequence t_results_n_seq to authenticated, anon;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid();
  fa uuid; fb uuid; fa2 uuid; pa uuid; pb uuid; ca uuid; cb uuid; ta uuid; tb uuid; ra uuid; rb uuid;
  n int; ok boolean; msg text;
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: nur im Testprojekt ausführen.';
  end if;

  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-rls-a-' || left(ua::text, 8) || '@example.com', now(), now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-rls-b-' || left(ub::text, 8) || '@example.com', now(), now());

  execute 'set local role authenticated';

  -- ===== User A =====
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  fa := public.create_family('RLS-Test A');
  insert into t_results(test,pass,detail) values ('A: create_family liefert UUID', fa is not null, '');
  select count(*) into n from public.family_members where family_id = fa and user_id = ua and role = 'owner';
  insert into t_results(test,pass,detail) values ('A: automatisch owner', n = 1, n::text);
  select count(*) into n from public.family_settings where family_id = fa and show_daily_crown = true;
  insert into t_results(test,pass,detail) values ('A: family_settings angelegt, show_daily_crown=true', n = 1, n::text);
  insert into public.profiles (family_id, name) values (fa, 'Kind A') returning id into pa;
  insert into public.categories (family_id, name) values (fa, 'Haushalt') returning id into ca;
  insert into public.tasks (family_id, category_id, title, points) values (fa, ca, 'Aufgabe A', 10) returning id into ta;
  insert into public.rewards (family_id, title, points_required) values (fa, 'Belohnung A', 50) returning id into ra;
  insert into public.completions (family_id, profile_id, task_id, task_title, points, completion_date) values (fa, pa, ta, 'Aufgabe A', 10, current_date);
  insert into public.redemptions (family_id, profile_id, reward_id, reward_title, points_spent) values (fa, pa, ra, 'Belohnung A', 50);
  insert into t_results(test,pass,detail) values ('A: Profil/Kategorie/Aufgabe/Belohnung/Completion/Einlösung anlegen', true, '');
  update public.tasks set points = 15 where id = ta; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A: eigene Aufgabe ändern', n = 1, n::text);
  update public.family_settings set show_daily_crown = false where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A: eigene show_daily_crown ändern', n = 1, n::text);

  -- ===== User B =====
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  fb := public.create_family('RLS-Test B');
  insert into t_results(test,pass,detail) values ('B: create_family, andere UUID als A', fb is not null and fb <> fa, '');
  select count(*) into n from public.family_members where family_id = fb and user_id = ub and role = 'owner';
  insert into t_results(test,pass,detail) values ('B: automatisch owner', n = 1, n::text);
  insert into public.profiles (family_id, name) values (fb, 'Kind B') returning id into pb;
  insert into public.categories (family_id, name) values (fb, 'Haushalt') returning id into cb;
  insert into public.tasks (family_id, category_id, title, points) values (fb, cb, 'Aufgabe B', 10) returning id into tb;
  insert into public.rewards (family_id, title, points_required) values (fb, 'Belohnung B', 50) returning id into rb;
  insert into public.completions (family_id, profile_id, task_id, task_title, points, completion_date) values (fb, pb, tb, 'Aufgabe B', 10, current_date);
  insert into t_results(test,pass,detail) values ('B: eigene Daten anlegen', true, '');
  select count(*) into n from public.families where id in (fa, fb); insert into t_results(test,pass,detail) values ('B: sieht nur eigene Familie', n = 1, n::text);
  select count(*) into n from public.profiles where family_id = fa; insert into t_results(test,pass,detail) values ('B→A: Profile nicht lesbar', n = 0, n::text);
  select count(*) into n from public.tasks where family_id = fa; insert into t_results(test,pass,detail) values ('B→A: Aufgaben nicht lesbar', n = 0, n::text);
  select count(*) into n from public.rewards where family_id = fa; insert into t_results(test,pass,detail) values ('B→A: Belohnungen nicht lesbar', n = 0, n::text);
  select count(*) into n from public.completions where family_id = fa; insert into t_results(test,pass,detail) values ('B→A: Completions nicht lesbar', n = 0, n::text);
  select count(*) into n from public.family_settings where family_id = fa; insert into t_results(test,pass,detail) values ('B→A: Settings nicht lesbar', n = 0, n::text);
  update public.tasks set points = 999 where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('B→A: Aufgaben ändern wirkungslos', n = 0, n::text);
  update public.family_settings set show_daily_crown = true where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('B→A: Settings ändern wirkungslos', n = 0, n::text);
  delete from public.completions where family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('B→A: Completions löschen wirkungslos', n = 0, n::text);
  begin insert into public.profiles (family_id, name) values (fa, 'Eindringling'); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B→A: Profil in fremde Familie schreiben blockiert', ok, msg);
  begin insert into public.family_members (family_id, user_id, role) values (fa, ub, 'owner'); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B→A: Selbst-Einschreiben blockiert', ok, msg);
  begin insert into public.task_assignments (family_id, task_id, profile_id) values (fb, ta, pb); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('B: Verknüpfung mit Aufgabe aus A blockiert (FK)', ok, msg);

  -- ===== User A gegen B =====
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  select count(*) into n from public.profiles where family_id = fb; insert into t_results(test,pass,detail) values ('A→B: Profile nicht lesbar', n = 0, n::text);
  select count(*) into n from public.tasks where family_id = fb; insert into t_results(test,pass,detail) values ('A→B: Aufgaben nicht lesbar', n = 0, n::text);
  select count(*) into n from public.rewards where family_id = fb; insert into t_results(test,pass,detail) values ('A→B: Belohnungen nicht lesbar', n = 0, n::text);
  select count(*) into n from public.families where id = fb; insert into t_results(test,pass,detail) values ('A→B: Familie nicht lesbar', n = 0, n::text);
  select count(*) into n from public.family_members where family_id = fb; insert into t_results(test,pass,detail) values ('A→B: Mitglieder nicht lesbar', n = 0, n::text);
  update public.rewards set points_required = 1 where family_id = fb; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A→B: Belohnungen ändern wirkungslos', n = 0, n::text);
  begin insert into public.family_members (family_id, user_id, role) values (fb, ua, 'parent'); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('A→B: Selbst-Einschreiben blockiert', ok, msg);
  select count(*) into n from public.tasks where family_id = fa and points = 15;
  insert into t_results(test,pass,detail) values ('A: eigene Daten durch B unverändert', n = 1, n::text);
  select count(*) into n from public.family_settings where family_id = fa and show_daily_crown = false;
  insert into t_results(test,pass,detail) values ('A: eigene Settings durch B unverändert', n = 1, n::text);
  delete from public.family_members where user_id = ua and family_id = fa; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A: owner kann nicht selbst austreten', n = 0, n::text);
  fa2 := public.create_family('RLS-Test A2');
  insert into t_results(test,pass,detail) values ('A: zweite Familie möglich (keine DB-Beschränkung)', fa2 is not null and fa2 <> fa, '');
  delete from public.families where id = fa2; get diagnostics n = row_count;
  insert into t_results(test,pass,detail) values ('A: owner darf eigene Familie löschen', n = 1, n::text);
  begin perform public.create_family('   '); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  select count(*) into n from public.families;
  insert into t_results(test,pass,detail) values ('A: ungültiger Name abgelehnt, nichts angelegt (atomar)', ok and n = 1, msg || ' / Familien=' || n);

  -- ===== nicht angemeldet (authenticated ohne sub) =====
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin perform public.create_family('X'); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('ohne Benutzer: create_family abgelehnt', ok, msg);

  -- ===== anon =====
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin select count(*) into n from public.profiles; ok := false; msg := n::text || ' Zeilen';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('anon: Profile lesen blockiert', ok, msg);
  begin select count(*) into n from public.family_settings; ok := false; msg := n::text || ' Zeilen';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('anon: Settings lesen blockiert', ok, msg);
  begin insert into public.families (name) values ('anon'); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('anon: Familie anlegen blockiert', ok, msg);
  begin perform public.create_family('anon'); ok := false; msg := 'kein Fehler';
  exception when others then ok := true; msg := sqlerrm; end;
  insert into t_results(test,pass,detail) values ('anon: create_family blockiert', ok, msg);

  -- ===== Aufräumen (als Datenbank-Admin) =====
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  delete from public.families where id in (fa, fb);
  delete from auth.users where id in (ua, ub);
end
$$;

select n, case when pass then 'PASS' else 'FAIL' end as result, test, detail from t_results order by n;
