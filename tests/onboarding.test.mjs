// Unit-Tests für die Onboarding-Logik und statische Datenschutzprüfung des FAMILY-Codes.
// Ausführen:  node --test tests/onboarding.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initialOnboardingState, validateFamilyName, validateChildren, validatePin, validatePoints, buildOnboardingPayload, newChild,
} from "../src/lib/onboarding.js";
import { LIMITS } from "../src/family/onboarding/options.js";
import { STARTER_TASKS, STARTER_REWARDS, STARTER_CATEGORIES } from "../src/config/starterContent.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Anfangszustand: neutral, ein leeres Kinderprofil, alle Vorschläge gewählt, Defaults an", () => {
  const s = initialOnboardingState();
  assert.equal(s.familyName, "");
  assert.equal(s.children.length, 1);
  assert.equal(s.children[0].name, "");
  assert.equal(s.pin, "");
  assert.ok(Object.values(s.tasks).every((t) => t.selected));
  assert.ok(Object.values(s.rewards).every((r) => r.selected));
  assert.deepEqual(s.settings, { showDailyCrown: true, requireConfirmation: true });
});

test("Familienname: Pflicht, getrimmt, Maximallänge", () => {
  assert.match(validateFamilyName("   "), /Familiennamen/);
  assert.equal(validateFamilyName("  Familie Beispiel  "), "");
  assert.match(validateFamilyName("x".repeat(LIMITS.FAMILY_NAME_MAX + 1)), /höchstens/);
});

test("Kinder: mindestens 1, Namen Pflicht, technisches Maximum 20", () => {
  assert.match(validateChildren([]), /mindestens ein/);
  assert.match(validateChildren([{ ...newChild(0), name: " " }]), /Namen/);
  assert.equal(validateChildren([{ ...newChild(0), name: "Kind" }]), "");
  const many = Array.from({ length: 21 }, (_, i) => ({ ...newChild(i), name: `K${i}` }));
  assert.match(validateChildren(many), /höchstens 20/);
  assert.equal(LIMITS.CHILDREN_MAX, 20);
});

test("PIN: genau 4 Ziffern, beide gleich", () => {
  assert.match(validatePin("123", "123"), /4 Ziffern/);
  assert.match(validatePin("12a4", "12a4"), /4 Ziffern/);
  assert.match(validatePin("1234", "1243"), /stimmen nicht/);
  assert.equal(validatePin("0007", "0007"), "");
});

test("Punkte: ganze Zahlen im Bereich, abgewählte werden ignoriert", () => {
  assert.equal(validatePoints({ a: { selected: true, points: "10" } }, 100, "Aufgaben"), "");
  assert.match(validatePoints({ a: { selected: true, points: "" } }, 100, "Aufgaben"), /ganze Punkte/);
  assert.match(validatePoints({ a: { selected: true, points: "101" } }, 100, "Aufgaben"), /ganze Punkte/);
  assert.equal(validatePoints({ a: { selected: false, points: "abc" } }, 100, "Aufgaben"), "");
});

test("Payload: nur gewählte Aufgaben/Belohnungen, Kategorie-Name/-Icon, Reihenfolge der Kinder, Settings", () => {
  const s = initialOnboardingState();
  s.familyName = "  Familie Beispiel ";
  s.children = [{ ...newChild(0), name: "Anna " }, { ...newChild(1), name: "Ben" }];
  s.pin = s.pin2 = "4321";
  const [t0, t1] = STARTER_TASKS;
  for (const k of Object.keys(s.tasks)) s.tasks[k].selected = false;
  s.tasks[t0.key] = { selected: true, points: "42" };
  for (const k of Object.keys(s.rewards)) s.rewards[k].selected = false;
  s.settings = { showDailyCrown: false, requireConfirmation: true };
  const p = buildOnboardingPayload(s);
  assert.equal(p.p_family_name, "Familie Beispiel");
  assert.deepEqual(p.p_children.map((c) => c.name), ["Anna", "Ben"]);
  assert.equal(p.p_tasks.length, 1);
  assert.equal(p.p_tasks[0].points, 42);
  const cat = STARTER_CATEGORIES.find((c) => c.key === t0.category);
  assert.equal(p.p_tasks[0].category, cat.name);
  assert.equal(p.p_tasks[0].category_icon, cat.icon);
  assert.ok(!p.p_tasks.some((t) => t.title === t1.title));
  assert.deepEqual(p.p_rewards, []);
  assert.deepEqual(p.p_settings, { show_daily_crown: false, require_confirmation: true });
  assert.equal(STARTER_REWARDS.length > 0, true);
});

// ---- Statische Prüfung: FAMILY-Code importiert keine Legacy-App/Standarddaten ----
// Kommentare werden ignoriert (sie dürfen Begriffe wie „localStorage“ erklären).
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
function importGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:import|export)\s[^'"]*?from\s+["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const rel = m[1] || m[2];
      walk(path.resolve(path.dirname(file), rel));
    }
  };
  walk(entry);
  return [...seen];
}

test("FAMILY-Code: kein Import von App.jsx, keine DEFAULT_MEMBERS, keine Entwicklernamen", () => {
  const files = importGraph(path.join(ROOT, "src/family/FamilyApp.jsx"));
  assert.ok(files.length > 10, "Import-Graph unvollständig");
  assert.ok(!files.some((f) => f.endsWith(path.join("src", "App.jsx"))), "FAMILY-Code importiert App.jsx");
  const forbidden = /DEFAULT_MEMBERS|DEFAULT_DATA|DEFAULT_TASKS|\b(Marlon|Clara|Jonah|Papa|Mama)\b|family-main|app_state/;
  for (const f of files) assert.doesNotMatch(stripComments(fs.readFileSync(f, "utf8")), forbidden, `verbotener Inhalt in ${path.relative(ROOT, f)}`);
});

test("FAMILY-Code: PIN wird nicht in Storage geschrieben oder geloggt", () => {
  const files = importGraph(path.join(ROOT, "src/family/FamilyApp.jsx"));
  for (const f of files) {
    const src = stripComments(fs.readFileSync(f, "utf8"));
    // Einzige Ausnahme (Phase 5D): offener Einladungs-Token in sessionStorage – nie PIN, nie localStorage
    const storageRe = f.endsWith(path.join("lib", "familyInvitations.js")) ? /localStorage|indexedDB/ : /localStorage|sessionStorage|indexedDB/;
    assert.doesNotMatch(src, storageRe, `Storage-Zugriff in ${path.relative(ROOT, f)}`);
    if (storageRe.source.startsWith("localStorage|indexedDB")) assert.doesNotMatch(src, /setItem\([^)]*pin/i, "PIN in sessionStorage");
    assert.doesNotMatch(src, /console\.(log|info|debug|warn|error)\([^)]*pin/i, `PIN-Logging in ${path.relative(ROOT, f)}`);
  }
});
