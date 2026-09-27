// Integrationstest gegen das Supabase-TESTPROJEKT (niemals Produktion): Auth, RLS über REST, Realtime.
// Voraussetzung: Migration und Testkonten wc-test-a@example.com / wc-test-b@example.com (siehe PHASE_03B_TEST_BACKEND.md).
// Ausführen:  NODE_USE_ENV_PROXY=1 node tests/supabase/auth-rls-realtime.test.mjs
// Hinweis: Legt bei jedem Lauf zusätzliche Testdatensätze (Präfix „RT“) in den Testfamilien an.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
const pa = process.env.SUPABASE_TEST_USER_A_PASSWORD, pb = process.env.SUPABASE_TEST_USER_B_PASSWORD;
if (!URL || !KEY || !pa || !pb || !/test/i.test(process.env.SUPABASE_TEST_PROJECT_NAME || '')) {
  console.error('Abbruch: SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY, SUPABASE_TEST_USER_A_PASSWORD, SUPABASE_TEST_USER_B_PASSWORD und SUPABASE_TEST_PROJECT_NAME (muss "test" enthalten) setzen.');
  process.exit(2);
}
const mk = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const res = []; const rec = (t, ok, d = '') => { res.push({ t, ok, d }); };
const A = mk(), B = mk(), anon = mk();
let r = await A.auth.signInWithPassword({ email: 'wc-test-a@example.com', password: pa });
rec('Auth: Login User A', !r.error, r.error?.message);
r = await B.auth.signInWithPassword({ email: 'wc-test-b@example.com', password: pb });
rec('Auth: Login User B', !r.error, r.error?.message);
r = await A.auth.signInWithPassword({ email: 'wc-test-a@example.com', password: 'falsch-' + Date.now() });
rec('Auth: falsches Passwort abgelehnt', !!r.error, r.error?.message);
// A erneut korrekt anmelden (falscher Versuch ändert Session nicht, zur Sicherheit)
await A.auth.signInWithPassword({ email: 'wc-test-a@example.com', password: pa });

const fa = (await A.from('families').select('id,name')).data; const fb = (await B.from('families').select('id,name')).data;
rec('REST: A sieht genau 1 Familie (A)', fa?.length === 1 && fa[0].name === 'Testfamilie A', JSON.stringify(fa?.map(f=>f.name)));
rec('REST: B sieht genau 1 Familie (B)', fb?.length === 1 && fb[0].name === 'Testfamilie B', JSON.stringify(fb?.map(f=>f.name)));
const FA = fa[0].id, FB = fb[0].id;
let q = await A.from('profiles').select('id').eq('family_id', FB); rec('REST: A liest Profile von B → 0', q.data?.length === 0, JSON.stringify(q.error||q.data?.length));
q = await A.from('family_settings').select('*').eq('family_id', FB); rec('REST: A liest Settings von B → 0', q.data?.length === 0, JSON.stringify(q.error||q.data?.length));
q = await A.from('family_settings').select('show_daily_crown').eq('family_id', FA); rec('REST: A liest eigene show_daily_crown', q.data?.length === 1, JSON.stringify(q.data));
q = await A.from('profiles').insert({ family_id: FB, name: 'Eindringling' }); rec('REST: A schreibt Profil in B → abgelehnt', !!q.error, q.error?.message);
q = await A.from('family_members').insert({ family_id: FB, user_id: (await A.auth.getUser()).data.user.id, role: 'parent' }); rec('REST: A schreibt sich in B ein → abgelehnt', !!q.error, q.error?.message);
q = await anon.from('profiles').select('id'); rec('REST: anon liest Profile → abgelehnt', !!q.error, q.error?.message);
q = await anon.rpc('create_family', { p_name: 'anon' }); rec('REST: anon create_family → abgelehnt', !!q.error, q.error?.message);
q = await A.rpc('create_family', { p_name: '' }); rec('REST: A create_family mit leerem Namen → abgelehnt', !!q.error, q.error?.message);

// Realtime: A abonniert 5 Tabellen
const events = [];
const ch = A.channel('rt-test');
for (const table of ['profiles', 'tasks', 'completions', 'rewards', 'family_settings'])
  ch.on('postgres_changes', { event: '*', schema: 'public', table }, (p) => events.push({ table, fam: (p.new?.family_id || p.old?.family_id) }));
const status = await new Promise((resolve) => { const t = setTimeout(() => resolve('TIMEOUT'), 20000); ch.subscribe((s, err) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); resolve(s + (err ? ' ' + err.message : '')); } }); });
rec('Realtime: A-Kanal abonniert', status === 'SUBSCRIBED', status);
await new Promise(r => setTimeout(r, 2000));
const stamp = Date.now() % 100000;
async function writes(C, F, tag) {
  const p = (await C.from('profiles').insert({ family_id: F, name: `RT ${tag} ${stamp}` }).select('id').single()).data;
  const t = (await C.from('tasks').insert({ family_id: F, title: `RT-Aufgabe ${tag} ${stamp}`, points: 5 }).select('id').single()).data;
  await C.from('rewards').insert({ family_id: F, title: `RT-Belohnung ${tag} ${stamp}`, points_required: 20 });
  await C.from('completions').insert({ family_id: F, profile_id: p.id, task_id: t.id, task_title: 'RT', points: 5, completion_date: new Date().toISOString().slice(0, 10) });
  await C.from('family_settings').update({ show_daily_crown: tag === 'A' }).eq('family_id', F);
}
await writes(B, FB, 'B');   // fremde Familie zuerst
await writes(A, FA, 'A');   // eigene Familie
await new Promise(r => setTimeout(r, 8000));
const own = events.filter(e => e.fam === FA), foreign = events.filter(e => e.fam === FB);
const ownTables = [...new Set(own.map(e => e.table))].sort();
rec('Realtime: A empfängt eigene Änderungen (5 Tabellen)', ownTables.length === 5, `${own.length} Ereignisse: ${ownTables.join(', ')}`);
rec('Realtime: A empfängt KEINE Änderungen von B', foreign.length === 0, `${foreign.length} Ereignisse`);
await A.removeAllChannels();
for (const x of res) console.log((x.ok ? 'PASS' : 'FAIL') + ' | ' + x.t + (x.d ? ' | ' + x.d : ''));
process.exit(0);
