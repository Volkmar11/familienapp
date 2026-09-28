-- =====================================================================
-- Wochen Champion – Phase 5C: Test-Hilfsfunktion (AUSSCHLIESSLICH Testprojekt)
--
-- Eltern-Einladungen kommen erst in Phase 5D. Für die Tests der Account-Löschung mit mehreren
-- Eltern (Ownership-Übergabe, Austritt) muss ein zweites Elternkonto einer Familie beitreten.
-- Diese Funktion erlaubt das NUR
--   * dem owner der Familie,
--   * für Wegwerf-Konten mit E-Mail „wc-p5c-…@example.com“,
--   * im Testprojekt (keine reguläre Migration, darf nicht in die Produktion).
-- =====================================================================
begin;

do $$
begin
  if coalesce(current_setting('app.migration_target', true), '') <> 'test' then
    raise exception 'Abbruch: nur für ein Testprojekt. Vorher "set app.migration_target = ''test'';" ausführen.';
  end if;
end
$$;

create or replace function public.test_add_family_member(p_family_id uuid, p_email text, p_role text default 'parent')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_user uuid;
begin
  if auth.uid() is null or not private.has_family_role(p_family_id, array['owner']) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  if p_email !~ '^wc-p5c-[a-z0-9-]+@example\.com$' or p_role not in ('owner', 'parent') then
    raise exception 'Nur Wegwerf-Testkonten' using errcode = '22023';
  end if;
  select id into v_user from auth.users where email = p_email;
  if v_user is null then raise exception 'Unbekanntes Testkonto' using errcode = '22023'; end if;
  insert into public.family_members (family_id, user_id, role) values (p_family_id, v_user, p_role)
  on conflict (family_id, user_id) do update set role = excluded.role;
  return v_user;
end;
$$;

revoke all on function public.test_add_family_member(uuid, text, text) from public, anon;
grant execute on function public.test_add_family_member(uuid, text, text) to authenticated;

commit;
