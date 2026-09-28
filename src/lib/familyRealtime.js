// Realtime-Service (FAMILY, Phase 4C2B2).
// Abonniert AUSSCHLIESSLICH das Signal public.family_sync der aktiven Familie
// (Filter family_id=eq.<id>, zusätzlich RLS). Jede Änderung an einer Familientabelle
// erhöht dort per DB-Trigger einen Zähler → hier kommt ein UPDATE-Ereignis an → der
// Aufrufer lädt entprellt die gesamte Familie neu (keine inkrementellen Patches).
//
// Status: connecting | connected | disconnected
// Bei CHANNEL_ERROR / TIMED_OUT / CLOSED: Status „disconnected“, Channel verwerfen und mit
// wachsender Wartezeit neu aufbauen. Jedes (erneute) SUBSCRIBED meldet onChange("subscribed"),
// damit Änderungen aus der Zeit ohne Verbindung durch einen vollständigen Reload ankommen.

export const RETRY_MS = [1000, 2000, 5000, 10000, 30000];

export function createFamilyRealtime({ client, familyId, ...rest }) {
  return createRowSyncRealtime({ client, table: "family_sync", column: "family_id", value: familyId, ...rest });
}

// Phase 5D: eigenes Mitgliedschafts-Signal (public.user_membership_sync, RLS: nur eigene Zeile).
// Erreicht den Nutzer auch dann noch, wenn er gerade aus einer Familie entfernt wurde und
// deshalb family_sync dieser Familie nicht mehr lesen darf.
export function createMembershipRealtime({ client, userId, ...rest }) {
  return createRowSyncRealtime({ client, table: "user_membership_sync", column: "user_id", value: userId, ...rest });
}

// Gemeinsamer Mechanismus: genau eine Zeile (Filter column=eq.value) einer Sync-Tabelle abonnieren.
export function createRowSyncRealtime({ client, table, column, value, onChange, onStatus, retryMs = RETRY_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let channel = null;
  let stopped = false;
  let attempt = 0;
  let retryTimer = null;
  let status = "connecting";

  const setStatus = (s) => {
    if (status === s) return;
    status = s;
    if (!stopped) onStatus?.(s);
  };

  const teardown = () => {
    if (!channel) return;
    const old = channel;
    channel = null;
    try { client.removeChannel(old); } catch { /* bereits geschlossen */ }
  };

  const scheduleRetry = () => {
    if (stopped || retryTimer) return;
    const ms = retryMs[Math.min(attempt, retryMs.length - 1)];
    attempt += 1;
    retryTimer = setTimer(() => { retryTimer = null; teardown(); subscribe(); }, ms);
  };

  function subscribe() {
    if (stopped) return;
    setStatus(status === "disconnected" ? "disconnected" : "connecting");
    const mine = client.channel(`${table.replace(/_/g, "-")}:${value}:${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter: `${column}=eq.${value}` }, (payload) => {
        if (stopped || channel !== mine) return;
        const v = payload?.new?.[column] ?? payload?.old?.[column];
        if (v && v !== value) return;          // Absicherung zusätzlich zu Filter + RLS
        onChange?.("change");
      });
    channel = mine;
    mine.subscribe((s) => {
      if (stopped || channel !== mine) return;   // Rückmeldungen alter Channels ignorieren
      if (s === "SUBSCRIBED") {
        attempt = 0;
        setStatus("connected");
        onChange?.("subscribed");
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setStatus("disconnected");
        scheduleRetry();
      }
    });
  }

  subscribe();

  return {
    get status() { return status; },
    // z. B. bei Rückkehr in den Vordergrund / „online“: sofort neu verbinden statt auf den Timer zu warten
    reconnectNow() {
      if (stopped || status === "connected") return;
      if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
      teardown();
      subscribe();
    },
    stop() {
      stopped = true;
      if (retryTimer) { clearTimer(retryTimer); retryTimer = null; }
      teardown();
    },
  };
}
