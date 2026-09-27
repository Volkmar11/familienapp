// FAMILY-Wrapper: Wochen-Champion-Oberfläche mit relationalen Daten (Phase 4C2A: Kernaktionen).
// Lädt die aktive Familie über src/lib/familyData.js, führt Aktionen ausschließlich über
// src/lib/familyMutations.js aus und lädt danach neu (keine optimistische UI, kein Realtime).
// Elternbereich: Auth-Rolle owner/parent UND serverseitig geprüfte PIN (10 Minuten, nur im Speicher).
import { useCallback, useEffect, useRef, useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { loadFamilyData } from "../lib/familyData.js";
import * as M from "../lib/familyMutations.js";
import { PARENT_UNLOCK_MS, hasAdminRole, canAccessAdmin, unlockUntil } from "../lib/parentGate.js";
import { toDateKey } from "../lib/dateUtils.js";
import ChampionApp from "../shared/ChampionApp.jsx";
import { S, C, Shell, Header, Spinner, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in" : r === "parent" ? "Elternteil" : r);
const LOCKED_MSG = "Der Elternbereich ist gesperrt. Bitte die Eltern-PIN erneut eingeben.";
const ROLE_MSG = "Nur Eltern (Inhaber:in oder Elternteil) können den Elternbereich öffnen.";

export default function FamilyChampion({ familyId, role, email, canSwitchFamily, onSwitchFamily, onLogout }) {
  const [state, setState] = useState({ status: "loading", model: null, error: "" }); // loading | loaded | error
  const [notice, setNotice] = useState(null);
  // PIN-Gate: Ablaufzeitpunkt nur im React-Speicher. Reload/Neustart/Logout/Familienwechsel
  // (Unmount bzw. key={familyId}) setzen ihn automatisch zurück.
  const [unlockedUntil, setUnlockedUntil] = useState(null);
  const [, setTick] = useState(0);
  const unlockedRef = useRef(null);
  unlockedRef.current = unlockedUntil;

  const client = getFamilyClient();

  // Erstes Laden und „Erneut versuchen“ zeigen den Ladezustand; refresh (nach Aktionen,
  // „Daten neu laden“) behält Oberfläche und Ansicht und tauscht nur die Daten aus.
  const load = useCallback(async ({ refresh = false } = {}) => {
    if (!refresh) setState({ status: "loading", model: null, error: "" });
    const r = await loadFamilyData(getFamilyClient(), familyId);
    if (r.ok) { setState({ status: "loaded", model: r.model, error: "" }); return true; }
    if (refresh) {
      // Aktion war erfolgreich, nur die Aktualisierung scheiterte: alte Daten behalten, Hinweis zeigen.
      setNotice({ id: Date.now(), text: "Die Anzeige konnte nicht aktualisiert werden. Bitte „Daten neu laden“." });
      return false;
    }
    setState({ status: "error", model: null, error: r.error });
    return false;
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  // Automatisch sperren, sobald der Entsperrzeitraum abläuft.
  useEffect(() => {
    if (!unlockedUntil) return undefined;
    const t = setTimeout(() => setUnlockedUntil((u) => (u && u <= Date.now() ? null : u)), Math.max(0, unlockedUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [unlockedUntil]);
  // Hintergrund-Tabs drosseln Timer: beim Zurückkehren sofort neu bewerten.
  useEffect(() => {
    const onVis = () => setTick((n) => n + 1);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const adminAllowed = () => canAccessAdmin(role, unlockedRef.current, Date.now());
  // Elterninteraktion verlängert die Entsperrung auf erneut 10 Minuten.
  const touchAdmin = () => { if (adminAllowed()) setUnlockedUntil(unlockUntil(Date.now(), PARENT_UNLOCK_MS)); };
  const lockAdmin = () => setUnlockedUntil(null);

  // Mutation → bei Erfolg neu laden (keine optimistische UI).
  const mutate = async (fn, { admin = false } = {}) => {
    if (admin) {
      if (!hasAdminRole(role)) return { ok: false, message: ROLE_MSG };
      if (!adminAllowed()) { lockAdmin(); return { ok: false, message: LOCKED_MSG }; }
      touchAdmin();
    }
    const r = await fn();
    if (r.ok) await load({ refresh: true });
    return r;
  };

  const actions = {
    completeTask: (task, member) => mutate(() => M.completeTask(client, { familyId, profileId: member.id, taskId: task.id })),
    undoCompletion: (c) => mutate(() => M.undoCompletion(client, { familyId, profileId: c.memberId, taskId: c.taskId, completionDate: c.day || toDateKey(c.date) })),
    confirmCompletion: (id) => mutate(() => M.confirmCompletion(client, { familyId, completionId: id }), { admin: true }),
    rejectCompletion: (id) => mutate(() => M.rejectCompletion(client, { familyId, completionId: id }), { admin: true }),
    redeemReward: (reward, member) => mutate(() => M.redeemReward(client, { familyId, profileId: member.id, rewardId: reward.id })),
    updateSettings: (patch) => mutate(() => M.updateFamilySettings(client, { familyId, ...patch }), { admin: true }),
    changePin: (form) => mutate(() => M.changeParentPin(client, { familyId, ...form }), { admin: true }),
    verifyPin: async (pin) => {
      if (!hasAdminRole(role)) return { ok: false, message: ROLE_MSG };
      const r = await M.verifyParentPin(client, { familyId, pin });
      if (r.ok) setUnlockedUntil(unlockUntil(Date.now(), PARENT_UNLOCK_MS));
      return r;
    },
  };

  if (state.status === "loading") return <Shell><Spinner label="Familie wird geladen …" /></Shell>;
  if (state.status === "error") {
    return (
      <Shell>
        <Header subtitle={email ? `Angemeldet als ${email}` : undefined} />
        <div style={S.card} data-testid="family-data-error">
          <div style={{ fontSize: 22, fontWeight: 800 }}><span aria-hidden="true">⚠️ </span>Daten konnten nicht geladen werden</div>
          <Message kind="error">{state.error}</Message>
          <button style={S.btn()} onClick={() => load()}>Erneut versuchen</button>
        </div>
        {canSwitchFamily && <button style={S.link} onClick={onSwitchFamily}>Andere Familie wählen</button>}
        <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={onLogout}>Abmelden</button>
      </Shell>
    );
  }

  const { model } = state;
  const adminUnlocked = canAccessAdmin(role, unlockedUntil, Date.now());
  const adminInfo = (
    <div style={infoCard} data-testid="family-info">
      <div style={infoRow}><span>Familie</span><b>{model.family.name}</b></div>
      <div style={infoRow}><span>Deine Rolle</span><b>{roleLabel(role)}</b></div>
      <div style={infoRow}><span>Angemeldet als</span><b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{email}</b></div>
      {adminUnlocked && <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Der Elternbereich sperrt sich nach 10 Minuten ohne Eltern-Aktion automatisch.</div>}
      <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={() => load({ refresh: true })}>Daten neu laden</button>
      {canSwitchFamily && <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={onSwitchFamily}>Familie wechseln</button>}
      <button style={S.btn()} onClick={onLogout}>Abmelden</button>
    </div>
  );

  return (
    <ChampionApp
      data={model.data}
      showDailyCrown={model.settings.showDailyCrown}
      settings={model.settings}
      actions={actions}
      adminUnlocked={adminUnlocked}
      onLockAdmin={lockAdmin}
      adminInfo={adminInfo}
      notice={notice}
      rewardSuggestions={[]}
    />
  );
}

const infoCard = { background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 18, margin: "0 16px 16px", border: "1px solid rgba(255,255,255,0.1)", color: C.text };
const infoRow = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#c7d2fe", minWidth: 0 };
