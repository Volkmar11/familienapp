#!/usr/bin/env node
// Temporärer Einlösungs-Import (Phase 6B1) – erzeugt Anlege- und Drop-SQL für EINE fest gebundene Familie.
//
// Hintergrund: Clients dürfen Einlösungen nur über redeem_reward anlegen (Punkteprüfung, redeemed_at = now()).
// Für die einmalige Übernahme der LEGACY-Historie müssen Datum, Titel-/Punkte-Momentaufnahme und Quittierung
// erhalten bleiben. Dafür existiert NUR im Wartungsfenster eine Funktion, die
//   * genau EINE vorher festgelegte family_id intern bindet (kein Parameter – keine andere Familie möglich),
//   * nur vom festgelegten owner-Konto aufgerufen werden kann (auth.uid() + owner-Rolle),
//   * nach einer festen Ablaufzeit nicht mehr arbeitet,
//   * nur einmal importiert (Familie darf noch keine Einlösungen haben),
// und direkt nach dem Import per DROP entfernt wird (Nachweis über schema_fingerprint / release_hardening_check).
//
//   node scripts/generate-redemption-import.mjs --family-id <uuid> --owner-id <uuid> [--expires-in-minutes 60] [--out <dir>]
// Ausgabe (local-release/, ignoriert): redemption-import-create.sql, redemption-import-drop.sql, redemption-import.meta.json
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const IMPORT_FUNCTION = "public.legacy_import_redemptions_once(jsonb)";
export const MAX_EXPIRY_MINUTES = 180;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export class ImportSqlError extends Error {}

export function buildImportSql({ familyId, ownerId, expiresAt }) {
  if (!UUID.test(String(familyId))) throw new ImportSqlError("--family-id muss eine UUID sein.");
  if (!UUID.test(String(ownerId))) throw new ImportSqlError("--owner-id muss eine UUID sein.");
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) throw new ImportSqlError("Ablaufzeit ungültig.");
  const iso = exp.toISOString();
  const create = `-- TEMPORÄRER Einlösungs-Import – nur im Wartungsfenster; nach dem Import SOFORT redemption-import-drop.sql ausführen.
-- Gebunden an family_id ${familyId}, owner ${ownerId}, gültig bis ${iso}.
create function public.legacy_import_redemptions_once(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  c_family  constant uuid        := '${familyId}';
  c_owner   constant uuid        := '${ownerId}';
  c_expires constant timestamptz := '${iso}';
  v_row jsonb;
  v_n   integer := 0;
  v_ack boolean;
begin
  if now() > c_expires then raise exception 'Importfenster abgelaufen' using errcode = '42501'; end if;
  if auth.uid() is distinct from c_owner or not private.has_family_role(c_family, array['owner']) then
    raise exception 'Kein Zugriff' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10000 then
    raise exception 'Ungültige Importliste' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) = 0 then return 0; end if; -- Prüfaufruf ohne Wirkung
  if exists (select 1 from public.redemptions r where r.family_id = c_family) then
    raise exception 'Einlösungen wurden bereits importiert' using errcode = '23505';
  end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_ack := coalesce((v_row->>'acknowledged')::boolean, false);
    insert into public.redemptions (id, family_id, profile_id, reward_id, reward_title, points_spent,
                                    redeemed_at, acknowledged_at, acknowledged_by, created_by)
    values ((v_row->>'id')::uuid, c_family, (v_row->>'profile_id')::uuid, nullif(v_row->>'reward_id', '')::uuid,
            btrim(v_row->>'reward_title'), (v_row->>'points_spent')::integer, (v_row->>'redeemed_at')::timestamptz,
            case when v_ack then coalesce(nullif(v_row->>'acknowledged_at', '')::timestamptz, now()) end,
            case when v_ack then c_owner end, c_owner);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$fn$;
revoke all on function public.legacy_import_redemptions_once(jsonb) from public, anon;
grant execute on function public.legacy_import_redemptions_once(jsonb) to authenticated;
comment on function public.legacy_import_redemptions_once(jsonb) is 'TEMPORÄR (Legacy-Migration) – nach dem Import sofort DROP';
notify pgrst, 'reload schema';
`;
  const drop = `-- Temporären Einlösungs-Import entfernen und Entfernung prüfen
drop function if exists public.legacy_import_redemptions_once(jsonb);
notify pgrst, 'reload schema';
do $$
begin
  if exists (select 1 from pg_proc where proname = 'legacy_import_redemptions_once') then
    raise exception 'Importfunktion existiert noch – Abbruch.';
  end if;
end
$$;
`;
  return { create, drop, expiresAt: iso };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const a = process.argv.slice(2);
    const val = (n) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
    const minutes = Number(val("--expires-in-minutes") ?? 60);
    if (!(minutes > 0 && minutes <= MAX_EXPIRY_MINUTES)) throw new ImportSqlError(`--expires-in-minutes muss zwischen 1 und ${MAX_EXPIRY_MINUTES} liegen.`);
    const r = buildImportSql({ familyId: val("--family-id"), ownerId: val("--owner-id"), expiresAt: new Date(Date.now() + minutes * 60000) });
    const out = path.resolve(val("--out") ?? path.join(ROOT, "local-release"));
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, "redemption-import-create.sql"), r.create, { mode: 0o600 });
    fs.writeFileSync(path.join(out, "redemption-import-drop.sql"), r.drop, { mode: 0o600 });
    const sha = (s) => createHash("sha256").update(s).digest("hex");
    fs.writeFileSync(path.join(out, "redemption-import.meta.json"), JSON.stringify({ expiresAt: r.expiresAt, sha256: { create: sha(r.create), drop: sha(r.drop) } }, null, 2) + "\n", { mode: 0o600 });
    console.log(`Import-SQL erzeugt (gültig bis ${r.expiresAt}): ${path.relative(ROOT, out)}/redemption-import-create.sql und …-drop.sql`);
  } catch (e) { console.error("Abbruch:", e.message); process.exit(2); }
}
