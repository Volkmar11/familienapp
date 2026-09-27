-- =====================================================================
-- Wochen Champion – Admin-Prüfung PIN-Speicherung (Phase 4B)
-- NUR im Supabase-TESTPROJEKT ausführen (SQL-Editor oder MCP execute_sql), nur lesend.
-- Erwartung: jede Zeile ok = true.
-- =====================================================================
select 'PIN-Hashes sind bcrypt (Kosten 10)' as pruefung,
       coalesce(bool_and(parent_pin_hash ~ '^\$2[ab]\$10\$' and length(parent_pin_hash) = 60), true) as ok
from private.family_security
union all
select 'Kein PIN-Hash ist eine 4-stellige Klartext-PIN',
       coalesce(bool_and(parent_pin_hash !~ '^[0-9]{4}$'), true)
from private.family_security
union all
select 'Jede Familie aus dem Onboarding hat einen PIN-Hash',
       not exists (select 1 from private.onboarding_requests r
                   left join private.family_security s on s.family_id = r.family_id
                   where r.family_id is not null and s.family_id is null)
union all
select 'Keine PIN-Spalte in public-Tabellen',
       not exists (select 1 from information_schema.columns where table_schema = 'public' and column_name ilike '%pin%')
union all
select 'Client-Rollen haben keinen Zugriff auf private.family_security',
       not has_table_privilege('authenticated', 'private.family_security', 'select')
       and not has_table_privilege('anon', 'private.family_security', 'select')
union all
select 'Client-Rollen haben keinen Zugriff auf private.onboarding_requests',
       not has_table_privilege('authenticated', 'private.onboarding_requests', 'select')
       and not has_table_privilege('anon', 'private.onboarding_requests', 'select')
union all
select 'RPCs nicht für anon ausführbar',
       not has_function_privilege('anon', 'public.create_family_with_onboarding(uuid,text,text,jsonb,jsonb,jsonb,jsonb)', 'execute')
       and not has_function_privilege('anon', 'public.verify_parent_pin(uuid,text)', 'execute')
       and not has_function_privilege('anon', 'public.set_parent_pin(uuid,text,text)', 'execute')
union all
select 'SECURITY DEFINER-RPCs mit festem search_path',
       bool_and(p.proconfig @> array['search_path=""'])
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('create_family_with_onboarding', 'verify_parent_pin', 'set_parent_pin', 'create_family');
