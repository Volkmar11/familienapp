-- =====================================================================
-- Wochen Champion – Phase 5D: Prüfung Einladungen / TTL / Rate-Limit-Fenster / Membership-Sync / Rechte
-- NUR im Supabase-TESTPROJEKT (oder lokal gegen den Stub) ausführen.
-- Alle Testdaten entstehen in einer Subtransaktion, die am Ende zurückgerollt wird.
-- Zeitabhängiges (Ablauf nach 7 Tagen, Fenster 1 h / 10 min) wird durch Zurückdatieren geprüft.
-- Voraussetzung: alle Migrationen bis 20260929300000_family_invitations.sql.
-- =====================================================================
set app.migration_target = 'test';
drop table if exists pg_temp.t_inv;
create temp table t_inv(n serial, test text, pass boolean, detail text);
do $$
declare
  res jsonb := '[]'::jsonb;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  f1 uuid; x jsonb; tok text; v1 bigint; v2 bigint; proc text; ok boolean;
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then raise exception 'Abbruch: nur im Testprojekt.'; end if;
  begin
    begin
      insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
      select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wc-inv-' || left(u::text, 8) || '@example.com', now(), now()
        from unnest(array[a, b, c]) u;
    exception when undefined_column then
      insert into auth.users (id) select unnest(array[a, b, c]);
    end;
    insert into public.families (name, created_by) values ('I1', a) returning id into f1;
    insert into public.family_members (family_id, user_id, role) values (f1, a, 'owner');
    insert into public.family_settings (family_id) values (f1);

    -- Kanonisierung / Hash
    res := res || jsonb_build_object('t', 'Hash: Groß/klein, Bindestriche, Leerzeichen egal', 'p',
      private.invite_token_hash('0123456789abcdef0123456789abcdef') = private.invite_token_hash(' 0123-4567-89AB-CDEF 0123-4567-89AB-CDEF '));
    res := res || jsonb_build_object('t', 'Hash: falsche Länge/Zeichen → NULL', 'p',
      private.invite_token_hash('0123') is null and private.invite_token_hash('z123456789abcdef0123456789abcdef') is null and private.invite_token_hash(null) is null);
    res := res || jsonb_build_object('t', 'Tabelle hat keine Klartext-Token-Spalte', 'p',
      not exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'family_invitations' and column_name = 'token'));

    -- Erzeugen als owner A
    perform set_config('request.jwt.claim.sub', a::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    x := public.create_family_invitation(f1);
    tok := x->>'token';
    res := res || jsonb_build_object('t', 'create: 32 Hex, nur Hash gespeichert, TTL 7 Tage', 'p',
      tok ~ '^[0-9a-f]{32}$'
      and exists (select 1 from private.family_invitations i where i.token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')
                    and i.expires_at between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days' + interval '1 minute')
      and not exists (select 1 from private.family_invitations i where i.token_hash = tok));

    -- TTL: zurückdatiert → ungültig
    update private.family_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where family_id = f1;
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    x := public.inspect_family_invitation(tok);
    res := res || jsonb_build_object('t', 'abgelaufene Einladung: inspect ungültig', 'p', x->>'error' = 'invalid');
    x := public.accept_family_invitation(tok);
    res := res || jsonb_build_object('t', 'abgelaufene Einladung: accept ungültig, kein Beitritt', 'p',
      x->>'error' = 'invalid' and not exists (select 1 from public.family_members where family_id = f1 and user_id = b));

    -- Rate-Limit ungültige Versuche: Fenster 10 Minuten
    delete from private.invitation_attempts where user_id = b;
    insert into private.invitation_attempts (user_id, attempted_at) select b, now() - interval '1 minute' from generate_series(1, 20);
    x := public.inspect_family_invitation('0123456789abcdef0123456789abcdef');
    res := res || jsonb_build_object('t', '20 Fehlversuche in 10 min → rate_limited', 'p', x->>'error' = 'rate_limited');
    update private.invitation_attempts set attempted_at = now() - interval '11 minutes' where user_id = b;
    x := public.inspect_family_invitation('0123456789abcdef0123456789abcdef');
    res := res || jsonb_build_object('t', 'nach Ablauf des Fensters wieder erlaubt (ungültig statt gesperrt)', 'p', x->>'error' = 'invalid');

    -- Stundenlimit Erzeugen: Fenster 1 Stunde
    perform set_config('request.jwt.claim.sub', a::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    delete from private.family_invitations where family_id = f1;
    insert into private.family_invitations (family_id, token_hash, created_by, created_at, expires_at, revoked_at)
    select f1, encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), a, now() - interval '30 minutes', now() + interval '1 day', now()
      from generate_series(1, 20);
    begin
      perform public.create_family_invitation(f1); ok := false;
    exception when others then ok := sqlerrm like 'Zu viele neue Einladungen%';
    end;
    res := res || jsonb_build_object('t', '20 Einladungen in der letzten Stunde → weitere abgelehnt', 'p', ok);
    update private.family_invitations set created_at = now() - interval '61 minutes' where family_id = f1;
    x := public.create_family_invitation(f1);
    tok := x->>'token';
    res := res || jsonb_build_object('t', 'nach Ablauf der Stunde wieder möglich', 'p', tok is not null);

    -- Beitritt + Membership-Sync
    perform set_config('request.jwt.claim.sub', b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    delete from private.invitation_attempts where user_id = b;
    select version into v1 from public.user_membership_sync where user_id = b;
    x := public.accept_family_invitation(upper(tok));
    select version into v2 from public.user_membership_sync where user_id = b;
    res := res || jsonb_build_object('t', 'accept: beigetreten als parent, Einladung verbraucht', 'p',
      x->>'status' = 'joined' and (select role from public.family_members where family_id = f1 and user_id = b) = 'parent'
      and exists (select 1 from private.family_invitations where family_id = f1 and used_by = b and used_at is not null));
    res := res || jsonb_build_object('t', 'user_membership_sync: Beitritt erhöht Version', 'p', v2 is not null and v2 > coalesce(v1, 0));
    -- B erzeugt Einladung; A (owner) befördert B → Signal
    x := public.create_family_invitation(f1);
    perform set_config('request.jwt.claim.sub', a::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
    v1 := v2;
    perform public.promote_family_parent(f1, b);
    select version into v2 from public.user_membership_sync where user_id = b;
    res := res || jsonb_build_object('t', 'Rollenwechsel erhöht Version des Betroffenen', 'p', v2 > v1);

    -- Account-Löschung: offene Einladungen widerrufen, Kaskade ohne FK-Fehler
    x := public.execute_account_deletion(b);
    res := res || jsonb_build_object('t', 'execute_account_deletion: B verlässt f1, B-Einladungen widerrufen', 'p',
      not exists (select 1 from public.family_members where family_id = f1 and user_id = b)
      and not exists (select 1 from private.family_invitations where created_by = b and used_at is null and revoked_at is null));
    delete from auth.users where id = b;
    res := res || jsonb_build_object('t', 'Auth-Löschung: user_membership_sync-Zeile per Kaskade weg', 'p',
      not exists (select 1 from public.user_membership_sync where user_id = b));
    -- Kaskade über family_members (Auth-User mit Mitgliedschaft löschen) darf nicht an user_membership_sync scheitern
    insert into public.family_members (family_id, user_id, role) values (f1, c, 'parent');
    delete from auth.users where id = c;
    res := res || jsonb_build_object('t', 'Auth-Löschung mit Mitgliedschaft: kein FK-Fehler durch Sync-Trigger', 'p',
      not exists (select 1 from public.family_members where user_id = c) and not exists (select 1 from public.user_membership_sync where user_id = c));

    -- Rechte / Struktur
    foreach proc in array array['create_family_invitation(uuid)', 'inspect_family_invitation(text)', 'accept_family_invitation(text)',
      'revoke_family_invitation(uuid)', 'list_family_invitations(uuid)', 'list_family_adults(uuid)',
      'promote_family_parent(uuid,uuid)', 'remove_family_parent(uuid,uuid)', 'leave_family(uuid)'] loop
      res := res || jsonb_build_object('t', 'EXECUTE nur authenticated: ' || proc, 'p',
        has_function_privilege('authenticated', 'public.' || proc, 'EXECUTE') and not has_function_privilege('anon', 'public.' || proc, 'EXECUTE'));
    end loop;
    res := res || jsonb_build_object('t', 'RPCs: SECURITY DEFINER mit leerem search_path', 'p',
      (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""']) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('create_family_invitation', 'inspect_family_invitation', 'accept_family_invitation',
          'revoke_family_invitation', 'list_family_invitations', 'list_family_adults', 'promote_family_parent', 'remove_family_parent', 'leave_family')));
    res := res || jsonb_build_object('t', 'private.family_invitations: kein Zugriff für authenticated/anon', 'p',
      not has_table_privilege('authenticated', 'private.family_invitations', 'SELECT') and not has_table_privilege('anon', 'private.family_invitations', 'SELECT'));
    res := res || jsonb_build_object('t', 'user_membership_sync: authenticated nur SELECT', 'p',
      has_table_privilege('authenticated', 'public.user_membership_sync', 'SELECT')
      and not has_table_privilege('authenticated', 'public.user_membership_sync', 'INSERT')
      and not has_table_privilege('authenticated', 'public.user_membership_sync', 'UPDATE')
      and not has_table_privilege('anon', 'public.user_membership_sync', 'SELECT'));
    res := res || jsonb_build_object('t', 'user_membership_sync in Publikation supabase_realtime', 'p',
      exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_membership_sync'));
    res := res || jsonb_build_object('t', 'family_members: keine INSERT/UPDATE/DELETE-Policy', 'p',
      not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_members' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')));
    res := res || jsonb_build_object('t', 'Test-Hintertür test_add_family_member entfernt', 'p',
      not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'test_add_family_member'));

    raise exception using message = 'WC_INV_ROLLBACK';
  exception when others then
    if sqlerrm <> 'WC_INV_ROLLBACK' then raise; end if;
  end;
  insert into t_inv(test, pass, detail) select e->>'t', (e->>'p')::boolean, e->>'d' from jsonb_array_elements(res) e;
end
$$;
select count(*) filter (where pass) as pass, count(*) as total,
       coalesce(string_agg(case when not pass then test end, '; '), '') as failed
from t_inv;
