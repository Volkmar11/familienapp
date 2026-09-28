-- =====================================================================
-- Wochen Champion – Schema-Fingerabdruck (Phase 6A, nur lesend)
-- Liefert je Objekt einen Schlüssel und einen md5-Fingerabdruck für die Schemata
-- public und private sowie die Storage-Policies/Buckets der App. Enthält KEINE Nutzdaten.
-- Zweck: Drift-Vergleich zwischen Testprojekt, frisch aus den Migrationen aufgebauter DB
-- und später Produktion. Ausführen: psql -f … bzw. MCP execute_sql (read-only).
-- Aufruf mit Kategorie-Summen: am Ende „select kind, count(*), md5(string_agg(…))“.
-- =====================================================================
with items as (
  -- Tabellen + Spalten
  select 'column' as kind, c.table_schema || '.' || c.table_name || '.' || c.column_name as key,
         md5(concat_ws('|', c.data_type, c.udt_name, c.is_nullable, coalesce(c.column_default, ''), c.ordinal_position::text)) as fp
    from information_schema.columns c
   where c.table_schema in ('public', 'private')
  union all
  -- Constraints
  select 'constraint', n.nspname || '.' || t.relname || '.' || con.conname, md5(pg_get_constraintdef(con.oid))
    from pg_constraint con join pg_class t on t.oid = con.conrelid join pg_namespace n on n.oid = t.relnamespace
   where n.nspname in ('public', 'private')
  union all
  -- Indizes
  select 'index', n.nspname || '.' || i.relname, md5(pg_get_indexdef(i.oid))
    from pg_index x join pg_class i on i.oid = x.indexrelid join pg_namespace n on n.oid = i.relnamespace
   where n.nspname in ('public', 'private')
  union all
  -- RLS an/aus
  select 'rls', n.nspname || '.' || c.relname, md5(c.relrowsecurity::text || c.relforcerowsecurity::text)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'private') and c.relkind = 'r'
  union all
  -- Policies (inkl. Storage)
  select 'policy', p.schemaname || '.' || p.tablename || '.' || p.policyname,
         md5(concat_ws('|', p.cmd, p.permissive, array_to_string(p.roles, ','), coalesce(p.qual, ''), coalesce(p.with_check, '')))
    from pg_policies p
   where p.schemaname in ('public', 'private') or (p.schemaname = 'storage' and p.policyname like 'family_media%')
  union all
  -- Funktionen (Definition, Sicherheitsmodus, search_path)
  select 'function', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(concat_ws('|', p.prosrc, p.prosecdef::text, coalesce(array_to_string(p.proconfig, ','), ''), p.provolatile, pg_get_function_result(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
  union all
  -- Trigger
  select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, md5(pg_get_triggerdef(t.oid))
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal and (n.nspname in ('public', 'private') or (n.nspname = 'storage' and t.tgname like '%family%'))
  union all
  -- Tabellenrechte für anon/authenticated
  select 'table_grant', g.table_schema || '.' || g.table_name || '.' || g.grantee,
         md5(string_agg(g.privilege_type, ',' order by g.privilege_type))
    from information_schema.role_table_grants g
   where g.table_schema in ('public', 'private') and g.grantee in ('anon', 'authenticated')
   group by g.table_schema, g.table_name, g.grantee
  union all
  -- Funktionsrechte (EXECUTE) für anon/authenticated/service_role
  select 'function_grant', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         md5(concat_ws('|', has_function_privilege('anon', p.oid, 'EXECUTE')::text, has_function_privilege('authenticated', p.oid, 'EXECUTE')::text,
                       has_function_privilege('service_role', p.oid, 'EXECUTE')::text))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
  union all
  -- Realtime-Publikation
  select 'publication', pt.schemaname || '.' || pt.tablename, md5('supabase_realtime')
    from pg_publication_tables pt where pt.pubname = 'supabase_realtime'
  union all
  -- Buckets der App (nur Konfiguration)
  select 'bucket', b.id, md5(concat_ws('|', b.public::text, coalesce(b.file_size_limit::text, ''), coalesce(array_to_string(b.allowed_mime_types, ','), '')))
    from storage.buckets b where b.id = 'family-media'
)
select kind, key, fp from items order by kind, key;
