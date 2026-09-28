// Unit-Tests Phase 6A: rechtliche Links (Datenschutz, Impressum, Support) nur aus der Konfiguration.
// Ausführen:  node --test tests/legalLinks.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { getLegalLinks, missingLegalEnv, LEGAL_ENV_NAMES } from "../src/config/legal.js";

test("ohne Konfiguration: keine Links, alle drei fehlen", () => {
  assert.deepEqual(getLegalLinks({}), []);
  assert.deepEqual(missingLegalEnv({}), [...LEGAL_ENV_NAMES]);
});

test("nur https (Support zusätzlich mailto) wird akzeptiert", () => {
  const links = getLegalLinks({
    VITE_PRIVACY_URL: "https://example.org/datenschutz",
    VITE_IMPRINT_URL: "http://example.org/impressum",        // kein https → ignoriert
    VITE_SUPPORT_URL: "mailto:support@example.org",
  });
  assert.deepEqual(links.map((l) => [l.key, l.label]), [["privacy", "Datenschutz"], ["support", "Support"]]);
  assert.deepEqual(missingLegalEnv({ VITE_PRIVACY_URL: "https://example.org/datenschutz", VITE_SUPPORT_URL: "mailto:support@example.org" }), ["VITE_IMPRINT_URL"]);
  assert.deepEqual(getLegalLinks({ VITE_PRIVACY_URL: "javascript:alert(1)", VITE_SUPPORT_URL: "mailto:kaputt" }), []);
});

test("vollständig konfiguriert: drei Links in fester Reihenfolge", () => {
  const env = { VITE_PRIVACY_URL: "https://example.org/d", VITE_IMPRINT_URL: "https://example.org/i", VITE_SUPPORT_URL: "https://example.org/s" };
  assert.deepEqual(getLegalLinks(env).map((l) => l.label), ["Datenschutz", "Impressum", "Support"]);
  assert.deepEqual(missingLegalEnv(env), []);
});
