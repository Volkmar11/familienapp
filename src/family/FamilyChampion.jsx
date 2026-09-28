// FAMILY-Wrapper: Wochen-Champion-Oberfläche mit relationalen Daten
// (4C2A: Kernaktionen, 4C2B1: Elternverwaltung, 4C2B2: Realtime + Wochen-Champion).
// Lädt die aktive Familie über src/lib/familyData.js, führt Aktionen ausschließlich über
// src/lib/familyMutations.js aus. Neu laden läuft IMMER über den zentralen Reload-Scheduler
// (eigene Mutation, Realtime-Signal, Reconnect, Vordergrund → entprellt, höchstens ein Reload
// gleichzeitig). Keine optimistische UI.
// Elternbereich: Auth-Rolle owner/parent UND serverseitig geprüfte PIN (10 Minuten, nur im Speicher).
// Lebensdauer = eine Familie (key={familyId}): Unmount bei Familienwechsel/Logout beendet
// Realtime, Timer, Scheduler und verwirft das PIN-Gate sowie den Cache der signierten Bild-URLs.
// Bilder (5B): Modell enthält nur Storage-Pfade; signierte URLs (60 min) kommen aus einem
// Cache im Speicher dieser Familie und werden nach jedem Laden/Realtime-Reload aufgelöst.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { loadFamilyData } from "../lib/familyData.js";
import * as M from "../lib/familyMutations.js";
import * as Media from "../lib/familyMedia.js";
import { PARENT_UNLOCK_MS, hasAdminRole, canAccessAdmin, unlockUntil } from "../lib/parentGate.js";
import { toDateKey } from "../lib/dateUtils.js";
import { createReloadScheduler } from "../lib/reloadScheduler.js";
import { createFamilyRealtime } from "../lib/familyRealtime.js";
import { onAppForeground } from "../lib/appLifecycle.js";
import ChampionApp from "../shared/ChampionApp.jsx";
import { S, C, Shell, Header, Spinner, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in" : r === "parent" ? "Elternteil" : r);
const LOCKED_MSG = "Der Elternbereich ist gesperrt. Bitte die Eltern-PIN erneut eingeben.";
const ROLE_MSG = "Nur Eltern (Inhaber:in oder Elternteil) können den Elternbereich öffnen.";
const OFFLINE_MSG = "Verbindung unterbrochen – Daten werden nach dem Wiederverbinden aktualisiert.";
const OFFLINE_HINT_AFTER_MS = 6000; // kurze Unterbrechungen nicht anzeigen
const MEDIA_REFRESH_MS = 5 * 60 * 1000; // signierte URLs rechtzeitig vor Ablauf erneuern

export default function FamilyChampion({ familyId, role, email, canSwitchFamily, onSwitchFamily, onLogout }) {
  const [state, setState] = useState({ status: "loading", model: null, error: "" }); // loading | loaded | error
  const [notice, setNotice] = useState(null);
  // PIN-Gate: Ablaufzeitpunkt nur im React-Speicher. Reload/Neustart/Logout/Familienwechsel
  // (Unmount bzw. key={familyId}) setzen ihn automatisch zurück.
  const [unlockedUntil, setUnlockedUntil] = useState(null);
  const [, setTick] = useState(0);
  const [ceremony, setCeremony] = useState(null);       // neu erzeugter Wochen-Champion → Zeremonie
  const [offline, setOffline] = useState(false);        // Hinweis erst nach längerer Unterbrechung
  const unlockedRef = useRef(null);
  unlockedRef.current = unlockedUntil;
  const modelRef = useRef(null);
  modelRef.current = state.model;
  const disposedRef = useRef(false);                     // nach Unmount keine verspäteten Daten übernehmen
  const schedRef = useRef(null);
  const realtimeRef = useRef(null);
  const championBusyRef = useRef(false);
  const offlineRef = useRef(false);
  const [bootKey, setBootKey] = useState(0);             // „Erneut versuchen“ startet den Lebenszyklus neu

  const client = getFamilyClient();
  // Signierte Bild-URLs: nur im Speicher, nur für diese Familie (Unmount = verwerfen)
  const mediaRef = useRef(null);
  if (!mediaRef.current) mediaRef.current = Media.createSignedUrlCache({ client });
  const [urlMap, setUrlMap] = useState(() => new Map());

  // Erstes Laden und „Erneut versuchen“ zeigen den Ladezustand; refresh (Scheduler) behält
  // Oberfläche und Ansicht und tauscht nur die Daten aus.
  const load = useCallback(async ({ refresh = false } = {}) => {
    if (disposedRef.current) return false;
    if (!refresh) setState({ status: "loading", model: null, error: "" });
    const r = await loadFamilyData(getFamilyClient(), familyId);
    if (disposedRef.current) return false;
    if (r.ok) { setState({ status: "loaded", model: r.model, error: "" }); return true; }
    if (refresh) {
      // Aktion war erfolgreich, nur die Aktualisierung scheiterte: alte Daten behalten, Hinweis zeigen.
      setNotice({ id: Date.now(), text: "Die Anzeige konnte nicht aktualisiert werden. Bitte „Daten neu laden“." });
      return false;
    }
    setState({ status: "error", model: null, error: r.error });
    return false;
  }, [familyId]);

  const reload = (opts) => schedRef.current ? schedRef.current.request(opts) : Promise.resolve(false);

  // Wochen-Champion serverseitig synchronisieren (idempotent). Zeremonie nur, wenn DIESER
  // Aufruf den Champion der zuletzt abgeschlossenen Woche neu angelegt hat.
  const syncChampion = useCallback(async () => {
    if (championBusyRef.current || disposedRef.current || !hasAdminRole(role)) return;
    championBusyRef.current = true;
    try {
      const r = await M.syncWeeklyChampion(getFamilyClient(), { familyId });
      if (disposedRef.current || !r.ok) return;
      if (r.processedWeeks > 0) await reload({ immediate: true });
      if (r.newChampion && r.latest && !disposedRef.current) setCeremony({ id: `${familyId}:${r.latest.weekStart}`, weekStart: r.latest.weekStart, ranking: r.latest.ranking });
    } finally { championBusyRef.current = false; }
  }, [familyId, role]);

  // Lebenszyklus dieser Familie: Scheduler → erstes Laden → Realtime + Champion + Vordergrund.
  useEffect(() => {
    disposedRef.current = false;
    const sched = createReloadScheduler(() => load({ refresh: true }), { debounceMs: 200 });
    schedRef.current = sched;
    let rt = null;
    let offTimer = null;
    let stopForeground = () => {};
    (async () => {
      const ok = await load();
      if (!ok || disposedRef.current) return;
      rt = createFamilyRealtime({
        client: getFamilyClient(), familyId,
        onChange: () => sched.request(),
        onStatus: (s) => {
          if (s === "connected") {
            if (offTimer) { clearTimeout(offTimer); offTimer = null; }
            if (offlineRef.current) { offlineRef.current = false; syncChampion(); }
            setOffline(false);
          } else if (s === "disconnected") {
            offlineRef.current = true;
            if (!offTimer) offTimer = setTimeout(() => { offTimer = null; if (!disposedRef.current) setOffline(true); }, OFFLINE_HINT_AFTER_MS);
          }
        },
      });
      realtimeRef.current = rt;
      syncChampion();
      stopForeground = onAppForeground(() => {
        if (disposedRef.current) return;
        // 1. PIN-Timeout prüfen (abgelaufen → sperren), 2. neu laden, 3. Realtime prüfen, 4. Champion
        setUnlockedUntil((u) => (u && u <= Date.now() ? null : u));
        setTick((n) => n + 1);
        sched.request();
        rt?.reconnectNow();
        syncChampion();
      });
    })();
    return () => {
      disposedRef.current = true;
      sched.stop();
      rt?.stop();
      realtimeRef.current = null;
      if (offTimer) clearTimeout(offTimer);
      stopForeground();
    };
  }, [load, familyId, syncChampion, bootKey]);

  // Bildpfade des aktuellen Modells in signierte URLs auflösen (Cache; nur fehlende/ablaufende neu).
  // Läuft nach jedem Laden (auch Realtime-Reload) und alle 5 Minuten; alte URLs neuer Pfade entfallen.
  useEffect(() => {
    const data = state.model?.data;
    let cancelled = false;
    const run = async () => {
      const paths = Media.collectMediaPaths(data);
      const m = paths.length ? await mediaRef.current.resolve(paths) : new Map();
      if (!cancelled && !disposedRef.current) setUrlMap(m);
    };
    run();
    const t = setInterval(run, MEDIA_REFRESH_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [state.model]);
  useEffect(() => () => mediaRef.current?.clear(), []);
  const displayData = useMemo(() => (state.model ? Media.withDisplayUrls(state.model.data, urlMap) : null), [state.model, urlMap]);

  // Automatisch sperren, sobald der Entsperrzeitraum abläuft.
  useEffect(() => {
    if (!unlockedUntil) return undefined;
    const t = setTimeout(() => setUnlockedUntil((u) => (u && u <= Date.now() ? null : u)), Math.max(0, unlockedUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [unlockedUntil]);

  const adminAllowed = () => canAccessAdmin(role, unlockedRef.current, Date.now());
  // Elterninteraktion verlängert die Entsperrung auf erneut 10 Minuten.
  const touchAdmin = () => { if (adminAllowed()) setUnlockedUntil(unlockUntil(Date.now(), PARENT_UNLOCK_MS)); };
  const lockAdmin = () => setUnlockedUntil(null);

  // Mutation → bei Erfolg (oder erkanntem Konflikt) über den Scheduler neu laden.
  // Realtime meldet dieselbe Änderung zusätzlich; Debounce + Single Flight fassen das zusammen.
  const mutate = async (fn, { admin = false } = {}) => {
    if (admin) {
      if (!hasAdminRole(role)) return { ok: false, message: ROLE_MSG };
      if (!adminAllowed()) { lockAdmin(); return { ok: false, message: LOCKED_MSG }; }
      touchAdmin();
    }
    const r = await fn();
    if (r.ok || r.reason === "conflict") await reload({ immediate: true });
    return r;
  };

  // UI-Modell der gemeinsamen Oberfläche → Mutationsschicht (Namen wie in der bisherigen App)
  const catId = (name) => (state.model?.data.customCategories || []).find((c) => c.name === name)?.id || null;
  // Bild nach erfolgreichem Speichern des Datensatzes: ersetzen (Upload → Pfad → altes löschen)
  // oder entfernen. Scheitert nur das Bild, bleibt der Datensatz gespeichert (Hinweis statt Fehler).
  const withMedia = async (r, kind, item) => {
    if (!r.ok) return r;
    const entityId = r.id || item.id;
    const prev = (kind === "profile" ? item.photoPath : item.imagePath) || null;
    let m = null;
    if (item.photoFile) m = await Media.replaceEntityMedia(client, { familyId, kind, entityId, blob: item.photoFile, previousPath: prev });
    else if (item.photoRemoved && prev) m = await Media.clearEntityMedia(client, { familyId, kind, entityId, previousPath: prev });
    if (item.photoPreview) { try { URL.revokeObjectURL(item.photoPreview); } catch { /* ignore */ } }
    if (m && prev && m.ok) mediaRef.current.invalidate(prev);
    if (m && !m.ok) return { ...r, warning: `Gespeichert – aber: ${m.message}` };
    return r;
  };
  const findPath = (kind, id) => {
    const d = modelRef.current?.data;
    const list = kind === "profile" ? [...(d?.members || []), ...(d?.archived?.members || [])] : [...(d?.tasks || []), ...(d?.archived?.tasks || [])];
    const x = list.find((e) => e.id === id);
    return (kind === "profile" ? x?.photoPath : x?.imagePath) || null;
  };
  // Physisch gelöschte (unbenutzte) Einträge: zugehöriges Bild entfernen. Archivierte behalten ihr Bild.
  const removeWithMedia = async (kind, id, fn) => {
    const path = findPath(kind, id);
    const r = await fn();
    if (r.ok && r.mode === "deleted" && path) { await Media.removeMedia(client, [path]); mediaRef.current.invalidate(path); }
    return r;
  };
  const SAVE = {
    // expectedUpdatedAt = Stand beim Öffnen des Formulars → keine stille Überschreibung (Konflikt)
    task: async (t) => withMedia(await M.saveTask(client, { familyId, task: { id: t.id || null, title: t.name, points: Number(t.points), recurrence: t.recurring || "daily", icon: t.emoji, categoryId: catId(t.category), assignedTo: t.assignedTo || [], active: t.active !== false, expectedUpdatedAt: t.updatedAt || null } }), "task", t),
    reward: (r) => M.saveReward(client, { familyId, reward: { id: r.id || null, title: r.name, pointsRequired: Number(r.pointsCost), icon: r.emoji, assignedTo: r.assignedTo || [], active: r.active !== false, expectedUpdatedAt: r.updatedAt || null } }),
    category: (c) => M.saveCategory(client, { familyId, category: { id: c.id || null, name: c.name, icon: c.emoji, assignedTo: c.assignedTo || [], expectedUpdatedAt: c.updatedAt || null } }),
    member: async (m) => withMedia(await M.saveProfile(client, { familyId, profile: { id: m.id || null, name: m.name, avatarEmoji: m.emoji, color: m.color, active: m.active !== false, expectedUpdatedAt: m.updatedAt || null } }), "profile", m),
  };
  const REMOVE = {
    task: (id) => removeWithMedia("task", id, () => M.removeTask(client, { familyId, taskId: id })),
    reward: (id) => M.removeReward(client, { familyId, rewardId: id }),
    category: (id) => M.deleteCategory(client, { familyId, categoryId: id }),
    member: (id) => removeWithMedia("profile", id, () => M.removeProfile(client, { familyId, profileId: id })),
  };
  const RESTORE = {
    task: (id) => M.restoreTask(client, { familyId, taskId: id }),
    reward: (id) => M.restoreReward(client, { familyId, rewardId: id }),
    member: (id) => M.restoreProfile(client, { familyId, profileId: id }),
  };
  const KIND_TABLE = { task: "tasks", reward: "rewards", category: "categories", member: "profiles" };

  const actions = {
    completeTask: (task, member) => mutate(() => M.completeTask(client, { familyId, profileId: member.id, taskId: task.id })),
    undoCompletion: (c) => mutate(() => M.undoCompletion(client, { familyId, profileId: c.memberId, taskId: c.taskId, completionDate: c.day || toDateKey(c.date) })),
    confirmCompletion: (id) => mutate(() => M.confirmCompletion(client, { familyId, completionId: id }), { admin: true }),
    rejectCompletion: (id) => mutate(() => M.rejectCompletion(client, { familyId, completionId: id }), { admin: true }),
    redeemReward: (reward, member) => mutate(() => M.redeemReward(client, { familyId, profileId: member.id, rewardId: reward.id })),
    updateSettings: (patch) => mutate(() => M.updateFamilySettings(client, { familyId, ...patch, expectedUpdatedAt: modelRef.current?.settings.updatedAt || null }), { admin: true }),
    changePin: (form) => mutate(() => M.changeParentPin(client, { familyId, ...form }), { admin: true }),
    // Elternverwaltung (4C2B1): alle Aktionen sind Elternaktionen (Rolle + PIN, verlängern den Timeout).
    save: (kind, item) => mutate(() => SAVE[kind](item), { admin: true }),
    remove: (kind, id) => mutate(() => REMOVE[kind](id), { admin: true }),
    restore: (kind, id) => mutate(() => RESTORE[kind](id), { admin: true }),
    reorder: (kind, ids) => mutate(() => M.reorderItems(client, { familyId, kind: KIND_TABLE[kind], ids }), { admin: true }),
    correctCompletion: (id) => mutate(() => M.correctCompletion(client, { familyId, completionId: id }), { admin: true }),
    reconfirmCompletion: (id) => mutate(() => M.reconfirmCompletion(client, { familyId, completionId: id }), { admin: true }),
    acknowledgeRedemptions: (ids) => mutate(() => M.acknowledgeRedemptions(client, { familyId, redemptionIds: ids.filter(Boolean) }), { admin: true }),
    // Bild im Browser vorbereiten (verkleinern, JPEG, ohne Metadaten) – noch kein Upload
    prepareMedia: async (file, kind) => {
      const r = await Media.prepareImage(file, kind);
      return r.ok ? { ...r, previewUrl: URL.createObjectURL(r.blob) } : r;
    },
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
          <button style={S.btn()} onClick={() => setBootKey((k) => k + 1)}>Erneut versuchen</button>
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
      <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={() => reload({ immediate: true })}>Daten neu laden</button>
      {canSwitchFamily && <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={onSwitchFamily}>Familie wechseln</button>}
      <button style={S.btn()} onClick={onLogout}>Abmelden</button>
    </div>
  );

  return (<>
    {offline && <div role="status" data-testid="offline-hint" style={offlineStyle}>{OFFLINE_MSG}</div>}
    <ChampionApp
      data={displayData}
      showDailyCrown={model.settings.showDailyCrown}
      settings={model.settings}
      actions={actions}
      adminUnlocked={adminUnlocked}
      onLockAdmin={lockAdmin}
      adminInfo={adminInfo}
      notice={notice}
      rewardSuggestions={[]}
      ceremony={ceremony}
    />
  </>);
}

const offlineStyle = { pointerEvents: "none", position: "fixed", top: "calc(env(safe-area-inset-top,0px) + 8px)", left: "50%", transform: "translateX(-50%)", zIndex: 250, maxWidth: "calc(100% - 32px)", background: "rgba(30,27,75,0.95)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 12, padding: "8px 14px", fontSize: 13, fontFamily: "'Fredoka',sans-serif", textAlign: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" };

const infoCard = { background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 18, margin: "0 16px 16px", border: "1px solid rgba(255,255,255,0.1)", color: C.text };
const infoRow = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#c7d2fe", minWidth: 0 };
