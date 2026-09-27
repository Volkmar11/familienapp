// Unit-Tests für die FAMILY-Mutationsschicht (Phase 4C2A) und das PIN-Gate.
// Ausführen:  node --test tests/familyMutations.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as M from "../src/lib/familyMutations.js";
import { PARENT_UNLOCK_MS, hasAdminRole, isUnlocked, canAccessAdmin, unlockUntil } from "../src/lib/parentGate.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Minimaler PostgREST-Builder-Stub: zeichnet Aufrufe auf; Antworten per (tabelle, operation).
function stub(responses) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const q = { table, op: "select", filters: [], payload: null };
      calls.push(q);
      const b = {
        select() { return b; },
        insert(p) { q.op = "insert"; q.payload = p; return b; },
        update(p) { q.op = "update"; q.payload = p; return b; },
        delete() { q.op = "delete"; return b; },
        eq(c, v) { q.filters.push(["eq", c, v]); return b; },
        neq(c, v) { q.filters.push(["neq", c, v]); return b; },
        maybeSingle() { return Promise.resolve(responses(q)); },
        single() { return Promise.resolve(responses(q)); },
        then(res, rej) { return Promise.resolve(responses(q)).then(res, rej); },
      };
      return b;
    },
    rpc(name, args) { const q = { table: "rpc:" + name, op: "rpc", payload: args }; calls.push(q); return Promise.resolve(responses(q)); },
  };
  return client;
}
const quiet = (fn) => async () => { const e = console.error; console.error = () => {}; try { await fn(); } finally { console.error = e; } };

function completeStub({ requireConfirmation = true, isParent = false, insertError = null, taskActive = true } = {}) {
  return stub((q) => {
    if (q.table === "family_settings") return { data: { require_confirmation: requireConfirmation }, error: null };
    if (q.table === "tasks") return { data: { id: "t", title: "Tisch decken", points: 7, active: taskActive, categories: { name: "Küche" } }, error: null };
    if (q.table === "profiles") return { data: { id: "p", active: true, is_parent: isParent }, error: null };
    if (q.table === "completions" && q.op === "insert") return insertError ? { data: null, error: insertError } : { data: { id: "c", status: q.payload.status, points: q.payload.points, completion_date: q.payload.completion_date }, error: null };
    return { data: null, error: null };
  });
}

test("completeTask: require_confirmation=true → pending, Snapshot aus DB, lokales Datum", async () => {
  const c = completeStub();
  // 23:30 Berlin am 30.09. = 21:30 UTC → Kalendertag 2026-09-30 (kein UTC-Fehler)
  const r = await M.completeTask(c, { familyId: "f", profileId: "p", taskId: "t", now: new Date("2026-09-30T21:30:00Z") });
  assert.equal(r.ok, true);
  assert.equal(r.status, "pending");
  const ins = c.calls.find((q) => q.op === "insert").payload;
  assert.deepEqual({ ...ins, completed_at: undefined }, { family_id: "f", profile_id: "p", task_id: "t", task_title: "Tisch decken", category_name: "Küche", points: 7, completed_at: undefined, completion_date: "2026-09-30", status: "pending" });
});

test("completeTask: require_confirmation=false → confirmed; Eltern-Spielerprofil → confirmed", async () => {
  assert.equal((await M.completeTask(completeStub({ requireConfirmation: false }), { familyId: "f", profileId: "p", taskId: "t" })).status, "confirmed");
  assert.equal((await M.completeTask(completeStub({ isParent: true }), { familyId: "f", profileId: "p", taskId: "t" })).status, "confirmed");
});

test("completeTask: Duplikat (23505) → verständliche Meldung, kein technischer Fehler", quiet(async () => {
  const r = await M.completeTask(completeStub({ insertError: { code: "23505", message: "duplicate key value violates unique constraint" } }), { familyId: "f", profileId: "p", taskId: "t" });
  assert.deepEqual(r, { ok: false, reason: "duplicate", message: "Diese Aufgabe wurde heute bereits erledigt." });
}));

test("completeTask: inaktive Aufgabe / fremde Familie → abgelehnt ohne Insert", async () => {
  const c1 = completeStub({ taskActive: false });
  assert.equal((await M.completeTask(c1, { familyId: "f", profileId: "p", taskId: "t" })).reason, "task");
  assert.ok(!c1.calls.some((q) => q.op === "insert"));
  const c2 = stub(() => ({ data: null, error: null }));
  assert.equal((await M.completeTask(c2, { familyId: "fremd", profileId: "p", taskId: "t" })).reason, "forbidden");
  assert.ok(!c2.calls.some((q) => q.op === "insert"));
});

test("undoCompletion: löscht nur pending mit allen Schlüsseln; confirmed → Hinweis", async () => {
  const c = stub((q) => (q.op === "delete" ? { data: [{ id: "c" }], error: null } : { data: [], error: null }));
  assert.deepEqual(await M.undoCompletion(c, { familyId: "f", profileId: "p", taskId: "t", completionDate: "2026-09-30" }), { ok: true, deletedId: "c" });
  const f = c.calls[0].filters.map((x) => x.slice(1).join("="));
  assert.deepEqual(f, ["family_id=f", "profile_id=p", "task_id=t", "completion_date=2026-09-30", "status=pending"]);
  const c2 = stub((q) => (q.op === "delete" ? { data: [], error: null } : { data: [{ id: "c", status: "confirmed" }], error: null }));
  assert.equal((await M.undoCompletion(c2, { familyId: "f", profileId: "p", taskId: "t", completionDate: "2026-09-30" })).reason, "confirmed");
});

test("confirm/reject: nur offene Einträge, Status gesetzt, sonst Hinweis", async () => {
  const c = stub((q) => ({ data: [{ id: "c", status: q.payload.status, confirmed_at: "x", confirmed_by: "u" }], error: null }));
  assert.equal((await M.confirmCompletion(c, { familyId: "f", completionId: "c" })).completion.status, "confirmed");
  assert.deepEqual(c.calls[0].payload, { status: "confirmed" }, "confirmed_by/at setzt der Server");
  assert.ok(c.calls[0].filters.some((x) => x[1] === "status" && x[2] === "pending"));
  assert.equal((await M.rejectCompletion(c, { familyId: "f", completionId: "c" })).completion.status, "rejected");
  const none = stub(() => ({ data: [], error: null }));
  assert.equal((await M.confirmCompletion(none, { familyId: "f", completionId: "c" })).reason, "not_pending");
});

test("redeemReward: nur RPC; Gründe → deutsche Meldungen", async () => {
  const ok = stub(() => ({ data: { ok: true, redemption_id: "r", points_spent: 50, available: 10 }, error: null }));
  assert.deepEqual(await M.redeemReward(ok, { familyId: "f", profileId: "p", rewardId: "w" }), { ok: true, redemptionId: "r", pointsSpent: 50, available: 10 });
  assert.deepEqual(ok.calls[0], { table: "rpc:redeem_reward", op: "rpc", payload: { p_family_id: "f", p_profile_id: "p", p_reward_id: "w" } });
  const ins = await M.redeemReward(stub(() => ({ data: { ok: false, reason: "insufficient_points", available: 20, required: 50 }, error: null })), {});
  assert.equal(ins.message, "Dafür fehlen noch 30 Punkte.");
  assert.equal(M.missingPointsMessage(1), "Dafür fehlen noch 1 Punkt.");
  for (const [reason, msg] of [["not_assigned", /nicht vorgesehen/], ["reward_inactive", /nicht mehr verfügbar/], ["reward_not_found", /nicht mehr verfügbar/], ["profile_not_found", /Profil/]]) {
    assert.match((await M.redeemReward(stub(() => ({ data: { ok: false, reason }, error: null })), {})).message, msg);
  }
});

test("Fehlerabbildung: keine rohen Codes, Berechtigung/Netz/allgemein", quiet(async () => {
  assert.equal(M.toMutationError({ code: "42501", message: "permission denied" }, "x").message, M.MESSAGES.forbidden);
  assert.equal(M.toMutationError({ message: "TypeError: Failed to fetch" }, "x").message, M.MESSAGES.network);
  const g = M.toMutationError({ code: "XX000", message: "internal" }, "x");
  assert.equal(g.message, M.MESSAGES.generic);
  assert.doesNotMatch(g.message, /XX000|internal/);
}));

test("updateFamilySettings: nur erlaubte Felder, keine Zeile → keine Berechtigung", async () => {
  const c = stub((q) => ({ data: [{ show_daily_crown: false, require_confirmation: true }], error: null }));
  assert.equal((await M.updateFamilySettings(c, { familyId: "f", showDailyCrown: false })).ok, true);
  assert.deepEqual(c.calls[0].payload, { show_daily_crown: false });
  assert.equal((await M.updateFamilySettings(stub(() => ({ data: [], error: null })), { familyId: "f", requireConfirmation: false })).reason, "forbidden");
  assert.equal((await M.updateFamilySettings(c, { familyId: "f" })).ok, false);
});

test("PIN prüfen: Format, richtig, falsch, gesperrt (ohne interne Details)", async () => {
  const c = (valid, lock) => stub((q) => (q.table === "rpc:verify_parent_pin" ? { data: valid, error: null } : { data: lock, error: null }));
  assert.equal((await M.verifyParentPin(c(true, 0), { familyId: "f", pin: "12a4" })).reason, "format");
  assert.deepEqual(await M.verifyParentPin(c(true, 0), { familyId: "f", pin: "1234" }), { ok: true });
  assert.deepEqual(await M.verifyParentPin(c(false, 0), { familyId: "f", pin: "1234" }), { ok: false, reason: "wrong", message: "Falsche PIN." });
  const l = await M.verifyParentPin(c(false, 42), { familyId: "f", pin: "1234" });
  assert.equal(l.message, "Zu viele Fehlversuche. Bitte versucht es in einer Minute erneut.");
});

test("PIN ändern: Validierung, falsche aktuelle PIN, Erfolg", async () => {
  assert.equal(M.validateNewPin("1234", "5678", "5679"), M.MESSAGES.pinMismatch);
  assert.equal(M.validateNewPin("1234", "567", "567"), M.MESSAGES.pinFormat);
  assert.equal(M.validateNewPin("1234", "5678", "5678"), "");
  const c = (res) => stub((q) => (q.table === "rpc:set_parent_pin" ? { data: res, error: null } : { data: 0, error: null }));
  const ok = c(true);
  assert.deepEqual(await M.changeParentPin(ok, { familyId: "f", currentPin: "1234", newPin: "5678", newPin2: "5678" }), { ok: true });
  assert.deepEqual(ok.calls[0].payload, { p_family_id: "f", p_current_pin: "1234", p_new_pin: "5678" });
  assert.equal((await M.changeParentPin(c(false), { familyId: "f", currentPin: "0000", newPin: "5678", newPin2: "5678" })).message, "Die aktuelle PIN ist falsch.");
});

test("PIN-Gate: Rolle UND PIN, 10 Minuten, Verlängerung", () => {
  assert.equal(PARENT_UNLOCK_MS, 600000);
  const t0 = 1_000_000;
  const until = unlockUntil(t0);
  assert.ok(canAccessAdmin("owner", until, t0 + 599_999));
  assert.ok(!canAccessAdmin("owner", until, t0 + 600_000), "nach 10 Minuten gesperrt");
  assert.ok(canAccessAdmin("parent", until, t0));
  assert.ok(!canAccessAdmin("member", until, t0), "ohne Eltern-Rolle kein Zugriff");
  assert.ok(!canAccessAdmin("owner", null, t0), "ohne PIN kein Zugriff");
  assert.ok(!isUnlocked(undefined) && hasAdminRole("owner") && !hasAdminRole(undefined));
  assert.ok(canAccessAdmin("owner", unlockUntil(t0 + 300_000), t0 + 800_000), "Interaktion verlängert");
});

test("Statisch: PIN nie in Storage/Log; Einlösen nie per Client-Insert; Admin nicht über Profile", () => {
  const files = ["src/lib/familyMutations.js", "src/lib/parentGate.js", "src/family/FamilyChampion.jsx", "src/shared/ChampionApp.jsx"];
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  for (const f of files) {
    const src = strip(fs.readFileSync(path.join(ROOT, f), "utf8"));
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/, f);
    assert.doesNotMatch(src, /console\.\w+\([^;]*\b(pin|currentPin|newPin|password|token)\b/i, f);
    assert.doesNotMatch(src, /from\(["']redemptions["']\)\s*\.\s*insert/, f);
  }
  const gate = strip(fs.readFileSync(path.join(ROOT, "src/family/FamilyChampion.jsx"), "utf8"));
  assert.doesNotMatch(gate, /isParentPlayer|isAdmin/, "Adminzugang darf nicht an Spielerprofilen hängen");
});
