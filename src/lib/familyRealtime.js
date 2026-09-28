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

export function createFamilyRealtime({ client, familyId, onChange, onStatus, retryMs = RETRY_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
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
    const mine = client.channel(`family-sync:${familyId}:${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "family_sync", filter: `family_id=eq.${familyId}` }, (payload) => {
        if (stopped || channel !== mine) return;
        const fid = payload?.new?.family_id ?? payload?.old?.family_id;
        if (fid && fid !== familyId) return;   // Absicherung zusätzlich zu Filter + RLS
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
