-- =====================================================================
-- Wochen Champion – Phase 6A: Release-Härtung
--
-- NUR im Supabase-TESTPROJEKT anwenden. Voraussetzung: alle vorherigen Migrationen.
--
-- 1. Familie löschen ausschließlich über den sicheren Lifecycle-Pfad
--    (Edge Function delete-family: owner + Eltern-PIN + frische Anmeldung + Medienbereinigung
--    über die Storage-API, danach public.delete_family_as_service mit service_role).
--    Bisher erlaubte die Policy families_delete owners ein direktes DELETE per REST. Dabei
--    blieben die Bilder im Bucket family-media als verwaiste Objekte zurück (kein FK von
--    storage.objects auf families) und PIN/Passwort wurden nicht geprüft.
--    → Policy entfernen und DELETE-Recht für Client-Rollen entziehen (doppelte Absicherung).
--    Kaskaden (families → Kind-Tabellen) und SECURITY-DEFINER-Funktionen sind nicht betroffen.
-- =====================================================================

begin;

do $$
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: Entwurf nur für ein Testprojekt. Vorher "set app.migration_target = ''test'';" ausführen.';
  end if;
end
$$;

drop policy if exists families_delete on public.families;
revoke delete on public.families from anon, authenticated;

commit;
