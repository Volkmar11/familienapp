// Zentraler Reload-Scheduler (FAMILY, Phase 4C2B2).
// Alle Anlässe zum Neuladen (eigene Mutation, Realtime-Signal, Reconnect, Vordergrund)
// laufen hier zusammen:
//   • Debounce: mehrere Anlässe kurz hintereinander → ein Reload
//   • Single Flight: höchstens ein Reload gleichzeitig
//   • Trailing: Anlässe während eines laufenden Reloads → danach genau EIN weiterer Reload
//     (keine verlorenen Änderungen)
// request() liefert ein Promise, das sich erst auflöst, wenn ein Reload abgeschlossen ist,
// der NACH dem Anlass gestartet wurde (Ergebnis von run()).

export function createReloadScheduler(run, { debounceMs = 200, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null;
  let inFlight = false;
  let trailing = false;
  let stopped = false;
  let waiting = [];   // warten auf den nächsten Start
  let runs = 0;

  const schedule = (ms) => {
    if (timer) clearTimer(timer);
    timer = setTimer(start, ms);
  };

  async function start() {
    timer = null;
    if (stopped) return;
    if (inFlight) { trailing = true; return; }
    const batch = waiting;
    waiting = [];
    inFlight = true;
    runs += 1;
    let result = false;
    try { result = await run(); } catch { result = false; }
    inFlight = false;
    for (const resolve of batch) resolve(result);
    if (stopped) return;
    if (trailing || waiting.length) { trailing = false; schedule(debounceMs); }
  }

  return {
    request({ immediate = false } = {}) {
      if (stopped) return Promise.resolve(false);
      return new Promise((resolve) => {
        waiting.push(resolve);
        if (inFlight) { trailing = true; return; }
        schedule(immediate ? 0 : debounceMs);
      });
    },
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      timer = null;
      for (const resolve of waiting) resolve(false);
      waiting = [];
    },
    get runs() { return runs; },
    get busy() { return inFlight; },
  };
}
