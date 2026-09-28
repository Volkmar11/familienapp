-- =====================================================================
-- Wochen Champion – Phase 6B1: create_family nicht mehr für Clients
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
-- public.create_family(p_name) ist die Bootstrap-RPC aus Phase 2. Sie legt eine Familie OHNE
-- Eltern-PIN, ohne Profile und ohne Onboarding-Idempotenz an. Die App nutzt ausschließlich
-- public.create_family_with_onboarding. Direkter Client-Zugriff wird deshalb entzogen
-- (anon, authenticated, public). Die Funktion bleibt für Datenbank-Admin/Tests bestehen.
-- =====================================================================

begin;

do $$
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: Entwurf nur für ein Testprojekt. Vorher "set app.migration_target = ''test'';" ausführen.';
  end if;
end
$$;

revoke all on function public.create_family(text) from public, anon, authenticated;

commit;
