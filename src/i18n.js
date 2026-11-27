// ─── Sprachen / Languages ───
// Eine App, mehrere Sprachen. Die Sprache folgt automatisch der Gerätesprache
// (iOS: Einstellungen › Allgemein › Sprache & Region bzw. pro App) und lässt sich
// im Eltern-Bereich jederzeit umstellen. Neue Sprache: Objekt unten ergänzen.

export const LANGS = { de: "Deutsch", en: "English" };
const STORAGE_KEY = "wc-lang";

export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch {}
  const prefs = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
  for (const p of prefs) {
    const code = String(p || "").slice(0, 2).toLowerCase();
    if (LANGS[code]) return code;
  }
  return "en"; // alle anderen Länder: Englisch
}

export function storeLang(lang) {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
}

export const LOCALE = { de: "de-DE", en: "en-US" };

const STRINGS = {
  de: {
    appName: "Wochen Champion",
    tagline: "Wer hat die meisten Punkte?",
    currentChampion: "AKTUELLER CHAMPION",
    nav_home: "Home", nav_rewards: "Belohnungen", nav_stats: "Statistik", nav_admin: "Verwalten",
    week: "Woche", month: "Monat", total: "Gesamt", available: "Verfügbar",
    pickProfile: "Wähle oben dein Profil!",
    all: "Alle", allKids: "Alle Kinder",
    daily_short: "tägl.", weekly_short: "wöch.",
    badges: "Abzeichen", badgesTitle: "🏅 Abzeichen",
    rewardsTitle: "🎁 Belohnungen",
    availableSuffix: "verfügbar",
    pickProfileFirst: "Wähle zuerst auf Home dein Profil!",
    toHome: "Zur Startseite",
    cost: "Kosten: {n} ⭐",
    redeem: "Einlösen",
    noRewards: "Keine Belohnungen für dich eingerichtet.",
    redeemedRewards: "Eingelöste Belohnungen",
    back: "← Zurück",
    perDay: "Ø/Tag", perWeek: "Ø/Woche", tasks: "Aufgaben", streak: "Streak", maxStreak: "Max Streak", activeDays: "Aktive Tage",
    tasksByCategory: "Aufgaben nach Kategorie",
    last7: "Letzte 7 Tage", last7Title: "📈 Letzte 7 Tage",
    lastTasks: "Letzte Aufgaben",
    statsTitle: "📊 Statistiken",
    today: "Heute",
    avgPtsDay: "Ø Punkte/Tag", avgPtsWeek: "Ø Punkte/Woche",
    weekRanking: "🏆 Wochenrangliste", monthRanking: "📅 Monatsrangliste", allTimeRanking: "🌟 Gesamtrangliste",
    perDayShort: "Ø {n}/Tag", perWeekShort: "Ø {n}/Wo",
    categoriesWeek: "📂 Kategorien (Woche)",
    recentActivity: "🕐 Letzte Aktivitäten", noActivity: "Noch keine Aktivitäten",
    pastChampions: "🏆 Bisherige Champions",
    weekOf: "Woche ab {d}",
    parentArea: "⚙️ Eltern-Bereich", enterPin: "PIN eingeben", unlock: "Entsperren", wrongPin: "Falsche PIN!",
    manageTitle: "⚙️ Verwalten",
    notifications: "🔔 Benachrichtigungen", markRead: "✓ Gelesen", markAllRead: "Alle als gelesen markieren",
    confirmations: "⏳ Bestätigungen ({n})",
    tasksTitle: "📋 Aufgaben ({n})", new: "+ Neu", deleted: "Gelöscht",
    suggestions: "💡 Vorschläge", suggestionsHint: "Vorschläge (antippen zum Hinzufügen):", added: "{x} hinzugefügt!",
    membersTitle: "👨‍👩‍👧‍👦 Mitglieder", admin: "(Admin)",
    categoriesTitle: "📂 Kategorien",
    settingsTitle: "🛡️ Einstellungen",
    needsConfirm: "Eltern-Bestätigung nötig", needsConfirmHint: "Kinder-Aufgaben müssen bestätigt werden",
    language: "🌐 Sprache",
    changePin: "🔐 PIN ändern", newPinPh: "Neue PIN (mind. 4 Zeichen)", pinChanged: "PIN geändert!",
    dataTitle: "🗑️ Daten-Verwaltung",
    managePoints: "⭐ Punkte verwalten / korrigieren",
    resetWeek: "🔄 Nur Wochenpunkte zurücksetzen",
    resetWeekConfirm: "Alle Wochenpunkte der Kinder zurücksetzen? Gesamtpunkte, Aufgaben, Belohnungen und Profile bleiben erhalten.",
    resetWeekDone: "Wochenpunkte zurückgesetzt!",
    resetAllPts: "⚠️ Alle Punkte zurücksetzen",
    resetAllPtsConfirm: "ALLE verdienten Punkte aller Kinder zurücksetzen? Aufgaben, Belohnungen, Profile und Kategorien bleiben erhalten.",
    resetAllPtsDone: "Alle Punkte zurückgesetzt!",
    resetAll: "💥 Komplett-Reset (alles löschen)",
    resetAllConfirm: "ALLE Daten komplett zurücksetzen? Aufgaben, Belohnungen, Mitglieder, Profile – alles wird gelöscht und auf Standard gesetzt!",
    resetAllDone: "Alles zurückgesetzt!",
    newTask: "Neue Aufgabe", editTask: "Aufgabe bearbeiten", name: "Name", imageIcon: "Bild / Icon",
    uploadOwnImage: "Eigenes Bild hochladen", removeImage: "Bild entfernen", points: "Punkte", category: "Kategorie",
    repeat: "Wiederholung", once: "Einmalig", daily: "Täglich", weekly: "Wöchentlich",
    assignedTo: "Zugeordnet an", multiple: "(mehrere möglich)",
    assignHint: "Wähle \"Alle\" oder tippe mehrere Kinder an, um die Aufgabe individuell zuzuordnen.",
    nameMissing: "Name fehlt!", created: "Erstellt!", saved: "Gespeichert!", save: "Speichern", cancel: "Abbrechen",
    newMember: "Neues Mitglied", edit: "Bearbeiten", profilePhoto: "Profilbild", removePhoto: "Foto entfernen",
    emojiFallback: "Emoji (Fallback)", color: "Farbe", adminParents: "Admin (Eltern)", memberAdded: "Hinzugefügt!",
    changePhoto: "Foto ändern", choosePhoto: "Foto wählen",
    newReward: "Neue Belohnung", emoji: "Emoji", pointsCost: "Punktekosten",
    newCategory: "Neue Kategorie", editCategory: "Kategorie bearbeiten", visibleFor: "Sichtbar für",
    managePointsTitle: "⭐ Punkte verwalten",
    managePointsHint: "Wähle ein Mitglied, um dessen Punkte einzeln zu korrigieren oder zurückzunehmen.",
    pointsSummary: "Gesamt: {t} ⭐ · Woche: {w} ⭐ · Verfügbar: {a} ⭐",
    close: "Schließen", backPlain: "Zurück",
    completedTasks: "📋 Erledigte Aufgaben ({n})", noCompletedTasks: "Keine erledigten Aufgaben",
    unconfirmed: "· ⏳ unbestätigt", revoke: "🗑️ Zurücknehmen",
    revokeConfirm: "\"{x}\" (+{n}⭐) zurücknehmen?", revoked: "Zurückgenommen!",
    redeemedTitle: "🎁 Eingelöste Belohnungen ({n})", noRedeemed: "Keine Belohnungen eingelöst",
    revokeRedeemConfirm: "Einlösung \"{x}\" (-{n}⭐) zurücknehmen? Die Punkte werden wieder gutgeschrieben.",
    redeemRevoked: "Einlösung zurückgenommen!",
    ceremonyTitle: "Wochen Champion!", great: "🎉 Super!",
    toastPoints: "+{n} ⭐ {name}!", awaitingConfirm: " (wartet auf Bestätigung)",
    undone: "↩️ Rückgängig gemacht", confirmed: "✅ Bestätigt!", rejected: "❌ Abgelehnt",
    notEnough: "Nicht genug! ({a}/{c})", redeemed: "🎉 {x} eingelöst!",
    notifRedeemed: "{emoji} {name} hat \"{x}\" ({n}⭐) eingelöst!",
  },
  en: {
    appName: "Weekly Champion",
    tagline: "Who has the most points?",
    currentChampion: "CURRENT CHAMPION",
    nav_home: "Home", nav_rewards: "Rewards", nav_stats: "Stats", nav_admin: "Manage",
    week: "Week", month: "Month", total: "Total", available: "Available",
    pickProfile: "Pick your profile above!",
    all: "All", allKids: "All kids",
    daily_short: "daily", weekly_short: "weekly",
    badges: "Badges", badgesTitle: "🏅 Badges",
    rewardsTitle: "🎁 Rewards",
    availableSuffix: "available",
    pickProfileFirst: "Pick your profile on Home first!",
    toHome: "Go to Home",
    cost: "Cost: {n} ⭐",
    redeem: "Redeem",
    noRewards: "No rewards set up for you yet.",
    redeemedRewards: "Redeemed rewards",
    back: "← Back",
    perDay: "Avg/day", perWeek: "Avg/week", tasks: "Chores", streak: "Streak", maxStreak: "Best streak", activeDays: "Active days",
    tasksByCategory: "Chores by category",
    last7: "Last 7 days", last7Title: "📈 Last 7 days",
    lastTasks: "Recent chores",
    statsTitle: "📊 Stats",
    today: "Today",
    avgPtsDay: "Avg points/day", avgPtsWeek: "Avg points/week",
    weekRanking: "🏆 This week's leaderboard", monthRanking: "📅 This month's leaderboard", allTimeRanking: "🌟 All-time leaderboard",
    perDayShort: "avg {n}/day", perWeekShort: "avg {n}/wk",
    categoriesWeek: "📂 Categories (this week)",
    recentActivity: "🕐 Recent activity", noActivity: "No activity yet",
    pastChampions: "🏆 Past champions",
    weekOf: "Week of {d}",
    parentArea: "⚙️ Parents' area", enterPin: "Enter PIN", unlock: "Unlock", wrongPin: "Wrong PIN!",
    manageTitle: "⚙️ Manage",
    notifications: "🔔 Notifications", markRead: "✓ Read", markAllRead: "Mark all as read",
    confirmations: "⏳ Approvals ({n})",
    tasksTitle: "📋 Chores ({n})", new: "+ New", deleted: "Deleted",
    suggestions: "💡 Ideas", suggestionsHint: "Ideas (tap to add):", added: "{x} added!",
    membersTitle: "👨‍👩‍👧‍👦 Family members", admin: "(Admin)",
    categoriesTitle: "📂 Categories",
    settingsTitle: "🛡️ Settings",
    needsConfirm: "Parent approval required", needsConfirmHint: "Kids' chores must be approved by a parent",
    language: "🌐 Language",
    changePin: "🔐 Change PIN", newPinPh: "New PIN (at least 4 digits)", pinChanged: "PIN changed!",
    dataTitle: "🗑️ Data",
    managePoints: "⭐ Manage / correct points",
    resetWeek: "🔄 Reset this week's points only",
    resetWeekConfirm: "Reset all of this week's points? Total points, chores, rewards and profiles are kept.",
    resetWeekDone: "Weekly points reset!",
    resetAllPts: "⚠️ Reset all points",
    resetAllPtsConfirm: "Reset ALL earned points for everyone? Chores, rewards, profiles and categories are kept.",
    resetAllPtsDone: "All points reset!",
    resetAll: "💥 Full reset (delete everything)",
    resetAllConfirm: "Reset ALL data? Chores, rewards, members, profiles – everything will be deleted and restored to defaults!",
    resetAllDone: "Everything reset!",
    newTask: "New chore", editTask: "Edit chore", name: "Name", imageIcon: "Picture / icon",
    uploadOwnImage: "Upload your own picture", removeImage: "Remove picture", points: "Points", category: "Category",
    repeat: "Repeats", once: "Once", daily: "Daily", weekly: "Weekly",
    assignedTo: "Assigned to", multiple: "(choose several)",
    assignHint: "Choose \"All\" or tap several kids to assign this chore to them only.",
    nameMissing: "Name is missing!", created: "Created!", saved: "Saved!", save: "Save", cancel: "Cancel",
    newMember: "New family member", edit: "Edit", profilePhoto: "Profile photo", removePhoto: "Remove photo",
    emojiFallback: "Emoji (fallback)", color: "Color", adminParents: "Admin (parent)", memberAdded: "Added!",
    changePhoto: "Change photo", choosePhoto: "Choose photo",
    newReward: "New reward", emoji: "Emoji", pointsCost: "Point cost",
    newCategory: "New category", editCategory: "Edit category", visibleFor: "Visible to",
    managePointsTitle: "⭐ Manage points",
    managePointsHint: "Pick a family member to correct or undo individual points.",
    pointsSummary: "Total: {t} ⭐ · Week: {w} ⭐ · Available: {a} ⭐",
    close: "Close", backPlain: "Back",
    completedTasks: "📋 Completed chores ({n})", noCompletedTasks: "No completed chores",
    unconfirmed: "· ⏳ pending", revoke: "🗑️ Undo",
    revokeConfirm: "Undo \"{x}\" (+{n}⭐)?", revoked: "Undone!",
    redeemedTitle: "🎁 Redeemed rewards ({n})", noRedeemed: "No rewards redeemed",
    revokeRedeemConfirm: "Undo redemption of \"{x}\" (-{n}⭐)? The points will be credited back.",
    redeemRevoked: "Redemption undone!",
    ceremonyTitle: "Weekly Champion!", great: "🎉 Awesome!",
    toastPoints: "+{n} ⭐ {name}!", awaitingConfirm: " (waiting for approval)",
    undone: "↩️ Undone", confirmed: "✅ Approved!", rejected: "❌ Rejected",
    notEnough: "Not enough points! ({a}/{c})", redeemed: "🎉 {x} redeemed!",
    notifRedeemed: "{emoji} {name} redeemed \"{x}\" ({n}⭐)!",
  },
};

export function makeT(lang) {
  const dict = STRINGS[lang] || STRINGS.en;
  return (key, vars) => {
    let s = dict[key] ?? STRINGS.de[key] ?? key;
    if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
    return s;
  };
}

// ── Startinhalte je Sprache (nur für neue Familien bzw. Komplett-Reset) ──
// Kategorien werden per Name referenziert; CAT_ALIASES hält die Abzeichen
// sprachunabhängig (eine deutsche Familie, die auf Englisch umstellt, behält ihre Abzeichen).
export const CAT_ALIASES = {
  tidy: ["Ordnung", "Tidying"],
  kitchen: ["Küche", "Kitchen"],
  garden: ["Garten", "Garden"],
};

const CATS = {
  de: { tidy: "Ordnung", kitchen: "Küche", house: "Haushalt", garden: "Garten", other: "Sonstiges" },
  en: { tidy: "Tidying", kitchen: "Kitchen", house: "Household", garden: "Garden", other: "Other" },
};

export const defaultCategories = (lang) => {
  const c = CATS[lang] || CATS.en;
  return [
    { id: "c1", name: c.tidy, emoji: "🧹", assignedTo: [] },
    { id: "c2", name: c.kitchen, emoji: "🍳", assignedTo: [] },
    { id: "c3", name: c.house, emoji: "🏠", assignedTo: [] },
    { id: "c4", name: c.garden, emoji: "🌱", assignedTo: [] },
    { id: "c5", name: c.other, emoji: "📦", assignedTo: [] },
  ];
};

export const CATEGORY_EMOJI_FALLBACK = {
  Ordnung: "🧹", Küche: "🍳", Haushalt: "🏠", Garten: "🌱", Sonstiges: "📦",
  Tidying: "🧹", Kitchen: "🍳", Household: "🏠", Garden: "🌱", Other: "📦",
};

const TASKS = {
  de: [
    ["Schuhe aufräumen", "👟", 5, "tidy", "daily"],
    ["Jacke aufhängen", "🧥", 5, "tidy", "daily"],
    ["Zimmer aufräumen", "🛏️", 15, "tidy", "daily"],
    ["Spielzeug wegräumen", "🧸", 10, "tidy", "daily"],
    ["Wohnzimmer aufräumen", "🛋️", 15, "tidy", "daily"],
    ["Spülmaschine einräumen", "🍽️", 15, "kitchen", "daily"],
    ["Spülmaschine ausräumen", "✨", 15, "kitchen", "daily"],
    ["Tisch decken", "🍴", 10, "kitchen", "daily"],
    ["Müll rausbringen", "🗑️", 10, "house", "weekly"],
    ["Saugen", "🧹", 20, "house", "weekly"],
    ["Wäsche wegräumen", "👕", 15, "house", "weekly"],
    ["Fahrradhelm aufräumen", "⛑️", 5, "tidy", "daily"],
    ["Gartenarbeit", "🌱", 20, "garden", "weekly"],
    ["Grünstreifen umgraben", "⛏️", 25, "garden", "once"],
  ],
  en: [
    ["Put shoes away", "👟", 5, "tidy", "daily"],
    ["Hang up jacket", "🧥", 5, "tidy", "daily"],
    ["Clean your room", "🛏️", 15, "tidy", "daily"],
    ["Pick up toys", "🧸", 10, "tidy", "daily"],
    ["Tidy the living room", "🛋️", 15, "tidy", "daily"],
    ["Load the dishwasher", "🍽️", 15, "kitchen", "daily"],
    ["Unload the dishwasher", "✨", 15, "kitchen", "daily"],
    ["Set the table", "🍴", 10, "kitchen", "daily"],
    ["Take out the trash", "🗑️", 10, "house", "weekly"],
    ["Vacuum", "🧹", 20, "house", "weekly"],
    ["Put laundry away", "👕", 15, "house", "weekly"],
    ["Put bike helmet away", "⛑️", 5, "tidy", "daily"],
    ["Yard work", "🌱", 20, "garden", "weekly"],
    ["Weed the flower bed", "⛏️", 25, "garden", "once"],
  ],
};

export const defaultTasks = (lang) => {
  const c = CATS[lang] || CATS.en;
  return (TASKS[lang] || TASKS.en).map(([name, emoji, points, cat, recurring], i) => ({
    id: `t${i + 1}`, name, emoji, points, category: c[cat], recurring, assignedTo: [], photo: null,
  }));
};

const REWARDS = {
  de: [
    ["Eis essen gehen", "🍦", 100], ["30 Min extra Bildschirmzeit", "📱", 80], ["Wunschessen", "🍕", 150],
    ["Ausflug wählen", "🎢", 300], ["Kino-Abend", "🎬", 200], ["Freund einladen", "🏠", 120],
    ["Spielzeug aussuchen (bis 10€)", "🧸", 250], ["Ausschlafen am Wochenende", "😴", 60],
    ["Lieblingssüßigkeit", "🍫", 50], ["1 Stunde Tablet/Konsole", "🎮", 100], ["Bastelmaterial kaufen", "🎨", 150],
    ["Buch aussuchen", "📖", 120], ["Mini-Ausflug (Spielplatz, Park)", "🌳", 80], ["Besonderes Frühstück", "🥞", 70],
    ["Übernachtung bei Freund/in", "🛏️", 200], ["Fahrrad-Tour", "🚲", 100], ["Gemeinsam backen", "🧁", 90],
    ["Zoo / Tierpark", "🦁", 350], ["Schwimmbad", "🏊", 150], ["Papa/Mama-Zeit (1 Stunde nur für dich)", "💕", 100],
  ],
  en: [
    ["Go out for ice cream", "🍦", 100], ["30 min extra screen time", "📱", 80], ["Pick what's for dinner", "🍕", 150],
    ["Choose a family outing", "🎢", 300], ["Movie night", "🎬", 200], ["Have a friend over", "🏠", 120],
    ["Pick a toy (up to $10)", "🧸", 250], ["Sleep in on the weekend", "😴", 60],
    ["Favorite candy", "🍫", 50], ["1 hour of tablet/video games", "🎮", 100], ["Buy craft supplies", "🎨", 150],
    ["Pick a new book", "📖", 120], ["Mini trip (playground, park)", "🌳", 80], ["Special breakfast", "🥞", 70],
    ["Sleepover at a friend's", "🛏️", 200], ["Bike ride together", "🚲", 100], ["Bake together", "🧁", 90],
    ["Trip to the zoo", "🦁", 350], ["Swimming pool", "🏊", 150], ["One-on-one time with Mom/Dad (1 hour)", "💕", 100],
  ],
};

export const rewardSuggestions = (lang) =>
  (REWARDS[lang] || REWARDS.en).map(([name, emoji, pointsCost]) => ({ name, emoji, pointsCost }));

export const badgeTexts = {
  de: {
    b1: ["Erste Schritte", "Erste Aufgabe erledigt"], b2: ["Fleißige Biene", "10 Aufgaben erledigt"],
    b3: ["Superheld", "50 Aufgaben erledigt"], b4: ["Ordnungsprofi", "100 Punkte in Ordnung"],
    b5: ["Küchenchef", "50 Punkte in Küche"], b6: ["Gärtner", "50 Punkte im Garten"],
    b7: ["3-Tage-Streak", "3 Tage am Stück aktiv"], b8: ["7-Tage-Streak", "7 Tage am Stück aktiv"],
    b9: ["Wochenchampion", "Einmal Wochenchampion"], b10: ["100er Club", "100 Punkte in einer Woche"],
  },
  en: {
    b1: ["First Steps", "First chore done"], b2: ["Busy Bee", "10 chores done"],
    b3: ["Superhero", "50 chores done"], b4: ["Tidy Pro", "100 points in Tidying"],
    b5: ["Master Chef", "50 points in Kitchen"], b6: ["Green Thumb", "50 points in Garden"],
    b7: ["3-Day Streak", "Active 3 days in a row"], b8: ["7-Day Streak", "Active 7 days in a row"],
    b9: ["Weekly Champ", "Weekly Champion once"], b10: ["100 Club", "100 points in one week"],
  },
};

const MEMBERS = { de: ["Papa", "Mama", "Kind 1", "Kind 2"], en: ["Dad", "Mom", "Kid 1", "Kid 2"] };
export const defaultMembers = (lang) => {
  const n = MEMBERS[lang] || MEMBERS.en;
  return [
    { id: "m1", name: n[0], color: "#2563eb", isAdmin: true, emoji: "👨", photo: null },
    { id: "m2", name: n[1], color: "#dc2626", isAdmin: true, emoji: "👩", photo: null },
    { id: "m3", name: n[2], color: "#16a34a", isAdmin: false, emoji: "🧒", photo: null },
    { id: "m4", name: n[3], color: "#eab308", isAdmin: false, emoji: "👧", photo: null },
  ];
};
