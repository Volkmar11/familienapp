// Integrationstest Phase 4A gegen das Supabase-TESTPROJEKT (niemals Produktion).
// Nutzt dieselben Module wie die App (Auth-Service, Mitgliedschaftsabfrage).
// Legt Wegwerf-Konten „wc-p4a-…@example.com“ an; deren Familien löscht der Test
// selbst (owner-Recht), die Auth-Konten danach per SQL im Testprojekt entfernen:
//   delete from auth.users where email like 'wc-p4a-%@example.com';
// Ausführen:
//   SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=… SUPABASE_TEST_PUBLISHABLE_KEY=… \
//   NODE_USE_ENV_PROXY=1 node tests/supabase/family-auth.test.mjs
import { randomUUID } from "node:crypto";
import { createFamilyClient } from "../../src/lib/supabaseFamily.js";
import { createAuthService } from "../../src/lib/auth.js";
import { fetchMemberships, classifyMemberships } from "../../src/lib/familyMembership.js";
import { getFamilyConfig } from "../../src/config/backend.js";
import { deleteTestAccounts } from "./_cleanup.mjs";

const env = {
  VITE_FAMILY_SUPABASE_URL: process.env.SUPABASE_TEST_URL,
  VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_PUBLISHABLE_KEY,
};
if (!/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || "")) {
  console.error("Abbruch: SUPABASE_TEST_PROJECT_NAME muss das Testprojekt bezeichnen (enthält „test“).");
  process.exit(2);
}
let config;
try { config = getFamilyConfig(env); } catch (e) { console.error("Abbruch:", e.message); process.exit(2); }

// Gemeinsamer In-Memory-Speicher = „Browser-Speicher“; ein zweiter Client damit simuliert ein Neuladen.
const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
const newClient = () => createFamilyClient(config, { auth: { storage, detectSessionInUrl: false, autoRefreshToken: false } });

const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });

let client = newClient();
const auth = createAuthService(() => client);
const email = `wc-p4a-${Date.now()}@example.com`;
const password = randomUUID();

let r = await auth.signUp(email, password);
check("Registrierung erfolgreich", r.ok, r.error);
check("Sofortige Session (Confirm email AUS)", r.ok && r.session && !r.needsEmailConfirmation);
const userId = r.session?.user?.id;

let m = await fetchMemberships(client, userId);
check("family_members ohne Familie → none", m.ok && classifyMemberships(m.memberships) === "none", JSON.stringify(m.memberships));

r = await auth.signUp(email, password);
check("Doppelte Registrierung → deutsche Fehlermeldung", !r.ok && /bereits ein Konto/.test(r.error), r.error);
r = await auth.signUp(`wc-p4a-weak-${Date.now()}@example.com`, "123");
check("Zu kurzes Passwort → deutsche Fehlermeldung", !r.ok && /mindestens 6/.test(r.error), r.error);

r = await auth.signOut();
let s = await auth.getSession();
check("Logout entfernt Session", r.ok && s.session === null);

r = await auth.signIn(email, password + "x");
check("Falsches Passwort → abgelehnt", !r.ok && r.error === "E-Mail-Adresse oder Passwort ist falsch.", r.error);
r = await auth.signIn(email, password);
check("Login erfolgreich", r.ok && r.session?.user?.id === userId, r.error);

client = newClient(); // „Seite neu laden“
s = await auth.getSession();
check("Session-Wiederherstellung nach Neuladen", s.session?.user?.id === userId);

// Familie anlegen (nur hier im Test, simuliert Phase 4B), dann Mitgliedschaft prüfen
const { data: fam1, error: e1 } = await client.rpc("create_family", { p_name: "P4A Testfamilie 1" });
m = await fetchMemberships(client, userId);
check("family_members mit einer Familie → single", !e1 && m.ok && classifyMemberships(m.memberships) === "single"
  && m.memberships[0].familyId === fam1 && m.memberships[0].role === "owner" && m.memberships[0].familyName === "P4A Testfamilie 1", JSON.stringify(m.memberships));
const { data: fam2 } = await client.rpc("create_family", { p_name: "P4A Testfamilie 2" });
m = await fetchMemberships(client, userId);
check("Mehrere Familien → multiple", m.ok && classifyMemberships(m.memberships) === "multiple" && m.memberships.length === 2);

// Aufräumen (seit Phase 6A kein direktes DELETE auf families): Konto über delete-account löschen
const del = await deleteTestAccounts(config, [{ email, password }]);
check("Aufräumen: Konto + beide Testfamilien über delete-account gelöscht", del.ok && del.deletedFamilies === 2, JSON.stringify(del));
await auth.signOut();

for (const x of results) console.log(`${x.ok ? "PASS" : "FAIL"} | ${x.name}${x.ok || !x.detail ? "" : " | " + x.detail}`);
console.log(`\n${results.filter((x) => x.ok).length}/${results.length} bestanden · Testkonto-Präfix: wc-p4a-`);
process.exit(results.every((x) => x.ok) ? 0 : 1);
