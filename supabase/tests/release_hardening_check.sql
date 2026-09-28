-- =====================================================================
-- Wochen Champion – Phase 6A: Prüfung Release-Härtung (nur lesend)
-- NUR im Supabase-TESTPROJEKT (oder lokal gegen den Stub) ausführen.
-- Voraussetzung: alle Migrationen bis 20260930200000_create_family_hardening.sql.
-- =====================================================================
select t.test, t.pass from (values
  ('families: keine DELETE-Policy', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and cmd in ('DELETE', 'ALL'))),
  ('families: kein DELETE-Recht für authenticated', not has_table_privilege('authenticated', 'public.families', 'DELETE')),
  ('families: kein DELETE-Recht für anon', not has_table_privilege('anon', 'public.families', 'DELETE')),
  ('families: kein INSERT-Policy (nur RPC)', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and cmd = 'INSERT')),
  ('family_members: keine INSERT/UPDATE/DELETE-Policy', not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_members' and cmd <> 'SELECT')),
  ('Service-Pfad delete_family_as_service nur service_role', has_function_privilege('service_role', 'public.delete_family_as_service(uuid)', 'EXECUTE') and not has_function_privilege('authenticated', 'public.delete_family_as_service(uuid)', 'EXECUTE')),
  ('create_family nicht für authenticated/anon ausführbar (nur Onboarding-RPC)', not has_function_privilege('authenticated', 'public.create_family(text)', 'EXECUTE') and not has_function_privilege('anon', 'public.create_family(text)', 'EXECUTE')),
  ('create_family_with_onboarding für authenticated ausführbar', has_function_privilege('authenticated', 'public.create_family_with_onboarding(uuid,text,text,jsonb,jsonb,jsonb,jsonb)', 'EXECUTE')),
  ('keine temporäre Importfunktion (legacy_import_redemptions*)', not exists (select 1 from pg_proc where proname like 'legacy_import_redemptions%')),
  ('keine Test-Hintertür test_add_family_member', not exists (select 1 from pg_proc where proname = 'test_add_family_member')),
  ('alle SECURITY-DEFINER-Funktionen (public/private) mit festem search_path', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private') and p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%')),
  ('keine public-Funktion für anon ausführbar', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE'))),
  ('RLS auf allen Tabellen in public/private aktiv', not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'private') and c.relkind = 'r' and not c.relrowsecurity and c.relname <> 'app_state'))
) as t(test, pass);
