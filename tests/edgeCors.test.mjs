// Edge-Function-CORS (Phase 6B1): Testmodus vs. Produktionssimulation
import { test } from "node:test";
import assert from "node:assert/strict";
import { corsConfig, corsHeaders, isAllowedOrigin, TEST_PROJECT_REF } from "../supabase/functions/_shared/cors.js";

const TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const PROD_URL = "https://prodprojectref0000000.supabase.co";
const PREVIEW = "https://familienapp-git-feature-x-volkmar11s-projects.vercel.app";
const APP = "https://app.example.org";

test("Testprojekt: localhost und Previews ohne weitere Konfiguration erlaubt", () => {
  const c = corsConfig({ SUPABASE_URL: TEST_URL });
  assert.equal(c.allowDev, true);
  for (const o of ["http://localhost:5173", "http://127.0.0.1:4173", "http://localhost", PREVIEW]) assert.equal(isAllowedOrigin(o, c), true, o);
});

test("Testprojekt: WC_ALLOW_DEV_ORIGINS=false schaltet Dev-Origins ab", () => {
  const c = corsConfig({ SUPABASE_URL: TEST_URL, WC_ALLOW_DEV_ORIGINS: "false" });
  assert.equal(isAllowedOrigin("http://localhost:5173", c), false);
});

test("Produktionssimulation: Standard ohne Dev-Origins, nur WC_APP_ORIGIN/WC_ALLOWED_ORIGINS", () => {
  const c = corsConfig({ SUPABASE_URL: PROD_URL, WC_APP_ORIGIN: APP, WC_ALLOWED_ORIGINS: "capacitor://localhost, https://www.example.org/" });
  assert.equal(c.allowDev, false);
  for (const o of ["http://localhost:5173", "http://127.0.0.1:5173", PREVIEW]) assert.equal(isAllowedOrigin(o, c), false, o);
  for (const o of [APP, "capacitor://localhost", "https://www.example.org"]) assert.equal(isAllowedOrigin(o, c), true, o);
});

test("Produktionssimulation: WC_ALLOW_DEV_ORIGINS=true nur explizit", () => {
  assert.equal(isAllowedOrigin("http://localhost:5173", corsConfig({ SUPABASE_URL: PROD_URL, WC_ALLOW_DEV_ORIGINS: "true" })), true);
  assert.equal(isAllowedOrigin("http://localhost:5173", corsConfig({ SUPABASE_URL: PROD_URL, WC_ALLOW_DEV_ORIGINS: "irgendwas" })), false);
});

test("Kein Präfix-/Teilstring-Match, keine null-Origin", () => {
  const c = corsConfig({ SUPABASE_URL: PROD_URL, WC_APP_ORIGIN: APP });
  for (const o of [`${APP}.evil.com`, `${APP}:8443`, "http://app.example.org", "https://evil.com/?https://app.example.org", "null", "", null, undefined]) {
    assert.equal(isAllowedOrigin(o, c), false, String(o));
  }
  const dev = corsConfig({ SUPABASE_URL: TEST_URL });
  for (const o of ["http://localhost.evil.com", "https://localhost:5173", "https://familienapp-x-volkmar11s-projects.vercel.app.evil.com", "https://familienapp-x-other-projects.vercel.app"]) {
    assert.equal(isAllowedOrigin(o, dev), false, o);
  }
});

test("Header: Allow-Origin nur für erlaubte Origins, Vary immer", () => {
  const c = corsConfig({ SUPABASE_URL: PROD_URL, WC_APP_ORIGIN: APP });
  assert.equal(corsHeaders(APP, c)["Access-Control-Allow-Origin"], APP);
  assert.equal(corsHeaders("https://evil.com", c)["Access-Control-Allow-Origin"], undefined);
  assert.equal(corsHeaders("https://evil.com", c).Vary, "Origin");
  assert.equal(corsHeaders(APP, c)["Access-Control-Allow-Origin"] === "*", false);
});

test("Phase 7A: native Test-App (capacitor://localhost) im Testprojekt erlaubt, in Produktion nur explizit", () => {
  assert.equal(isAllowedOrigin("capacitor://localhost", corsConfig({ SUPABASE_URL: TEST_URL })), true);
  assert.equal(isAllowedOrigin("capacitor://localhost", corsConfig({ SUPABASE_URL: PROD_URL, WC_APP_ORIGIN: APP })), false, "Produktion ohne WC_ALLOWED_ORIGINS");
  assert.equal(isAllowedOrigin("capacitor://localhost", corsConfig({ SUPABASE_URL: TEST_URL, WC_ALLOW_DEV_ORIGINS: "false" })), false);
  for (const o of ["capacitor://localhost:8080", "capacitor://evil", "capacitor://localhost.evil.com", "ionic://localhost"]) {
    assert.equal(isAllowedOrigin(o, corsConfig({ SUPABASE_URL: TEST_URL })), false, o);
  }
});
