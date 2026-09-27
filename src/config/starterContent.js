// Neutrale Vorschläge für das spätere Onboarding (Phase 3+).
// Noch NICHT in die bestehende App eingebunden.
// Enthält bewusst keine persönlichen Namen oder Familiendaten.
// `suggestedPoints` sind unverbindliche Vorschlagswerte, keine festgelegten Limits.

export const STARTER_CATEGORIES = [
  { key: "haushalt", name: "Haushalt", icon: "🏠" },
  { key: "schule", name: "Schule", icon: "🎒" },
  { key: "alltag", name: "Alltag", icon: "☀️" },
];

export const STARTER_TASKS = [
  // Haushalt
  { key: "zimmer-aufraeumen", category: "haushalt", title: "Zimmer aufräumen", icon: "🛏️", suggestedPoints: 15, recurrence: "daily" },
  { key: "tisch-decken", category: "haushalt", title: "Tisch decken", icon: "🍴", suggestedPoints: 10, recurrence: "daily" },
  { key: "tisch-abraeumen", category: "haushalt", title: "Tisch abräumen", icon: "🍽️", suggestedPoints: 10, recurrence: "daily" },
  { key: "spuelmaschine-ausraeumen", category: "haushalt", title: "Spülmaschine ausräumen", icon: "✨", suggestedPoints: 15, recurrence: "daily" },
  { key: "muell-rausbringen", category: "haushalt", title: "Müll rausbringen", icon: "🗑️", suggestedPoints: 10, recurrence: "weekly" },
  { key: "staubsaugen", category: "haushalt", title: "Staubsaugen", icon: "🧹", suggestedPoints: 20, recurrence: "weekly" },
  { key: "pflanzen-giessen", category: "haushalt", title: "Pflanzen gießen", icon: "🪴", suggestedPoints: 5, recurrence: "weekly" },

  // Schule
  { key: "hausaufgaben", category: "schule", title: "Hausaufgaben erledigen", icon: "✏️", suggestedPoints: 15, recurrence: "daily" },
  { key: "schulranzen-packen", category: "schule", title: "Schulranzen packen", icon: "🎒", suggestedPoints: 5, recurrence: "daily" },
  { key: "lesen", category: "schule", title: "Lesen", icon: "📚", suggestedPoints: 10, recurrence: "daily" },

  // Alltag
  { key: "kleidung-wegraeumen", category: "alltag", title: "Kleidung wegräumen", icon: "👕", suggestedPoints: 5, recurrence: "daily" },
  { key: "zaehne-putzen", category: "alltag", title: "Zähne putzen", icon: "🪥", suggestedPoints: 5, recurrence: "daily" },
  { key: "schuhe-wegraeumen", category: "alltag", title: "Schuhe wegräumen", icon: "👟", suggestedPoints: 5, recurrence: "daily" },
  { key: "haustier-versorgen", category: "alltag", title: "Haustier versorgen", icon: "🐕", suggestedPoints: 10, recurrence: "daily" },
];

export const STARTER_REWARDS = [
  { key: "film-aussuchen", title: "Film aussuchen", icon: "🎬", suggestedPoints: 100 },
  { key: "lieblingsessen", title: "Lieblingsessen aussuchen", icon: "🍕", suggestedPoints: 150 },
  { key: "spiel-aussuchen", title: "Gemeinsames Spiel aussuchen", icon: "🎲", suggestedPoints: 80 },
  { key: "medienzeit", title: "Zusätzliche Medienzeit (30 Min.)", icon: "📱", suggestedPoints: 80 },
  { key: "ausschlafen", title: "Am Wochenende ausschlafen", icon: "😴", suggestedPoints: 60 },
  { key: "ausflug", title: "Ausflugsziel aussuchen", icon: "🎢", suggestedPoints: 300 },
  { key: "eis", title: "Eis essen gehen", icon: "🍦", suggestedPoints: 100 },
  { key: "gemeinsam-backen", title: "Gemeinsam backen", icon: "🧁", suggestedPoints: 90 },
];
