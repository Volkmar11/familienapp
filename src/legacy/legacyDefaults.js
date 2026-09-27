// LEGACY-Standarddaten (bestehende Produktions-App mit app_state).
// Enthält persönliche Startdaten der ursprünglichen Familie und darf NIEMALS vom
// FAMILY-Code importiert werden (statisch getestet in tests/onboarding.test.mjs / tests/familyData.test.mjs).

export const REWARD_SUGGESTIONS = [
  {name:"Eis essen gehen",emoji:"🍦",pointsCost:100},
  {name:"30 Min extra Bildschirmzeit",emoji:"📱",pointsCost:80},
  {name:"Wunschessen",emoji:"🍕",pointsCost:150},
  {name:"Ausflug wählen",emoji:"🎢",pointsCost:300},
  {name:"Kino-Abend",emoji:"🎬",pointsCost:200},
  {name:"Freund einladen",emoji:"🏠",pointsCost:120},
  {name:"Spielzeug aussuchen (bis 10€)",emoji:"🧸",pointsCost:250},
  {name:"Ausschlafen am Wochenende",emoji:"😴",pointsCost:60},
  {name:"Lieblingssüßigkeit",emoji:"🍫",pointsCost:50},
  {name:"1 Stunde Tablet/Konsole",emoji:"🎮",pointsCost:100},
  {name:"Bastelmaterial kaufen",emoji:"🎨",pointsCost:150},
  {name:"Buch aussuchen",emoji:"📖",pointsCost:120},
  {name:"Mini-Ausflug (Spielplatz, Park)",emoji:"🌳",pointsCost:80},
  {name:"Besonderes Frühstück",emoji:"🥞",pointsCost:70},
  {name:"Übernachtung bei Freund/in",emoji:"🛏️",pointsCost:200},
  {name:"Fahrrad-Tour",emoji:"🚲",pointsCost:100},
  {name:"Gemeinsam backen",emoji:"🧁",pointsCost:90},
  {name:"Zoo / Tierpark",emoji:"🦁",pointsCost:350},
  {name:"Schwimmbad",emoji:"🏊",pointsCost:150},
  {name:"Papa/Mama-Zeit (1 Stunde nur für dich)",emoji:"💕",pointsCost:100},
];

export const DEFAULT_TASKS = [
  {id:"t1",name:"Schuhe aufräumen",emoji:"👟",points:5,category:"Ordnung",recurring:"daily",assignedTo:[],photo:null},
  {id:"t2",name:"Jacke aufhängen",emoji:"🧥",points:5,category:"Ordnung",recurring:"daily",assignedTo:[],photo:null},
  {id:"t3",name:"Zimmer aufräumen",emoji:"🛏️",points:15,category:"Ordnung",recurring:"daily",assignedTo:[],photo:null},
  {id:"t4",name:"Spielzeug wegräumen",emoji:"🧸",points:10,category:"Ordnung",recurring:"daily",assignedTo:[],photo:null},
  {id:"t5",name:"Wohnzimmer aufräumen",emoji:"🛋️",points:15,category:"Ordnung",recurring:"daily",assignedTo:[],photo:null},
  {id:"t6",name:"Spülmaschine einräumen",emoji:"🍽️",points:15,category:"Küche",recurring:"daily",assignedTo:[],photo:null},
  {id:"t7",name:"Spülmaschine ausräumen",emoji:"✨",points:15,category:"Küche",recurring:"daily",assignedTo:[],photo:null},
  {id:"t8",name:"Tisch decken",emoji:"🍴",points:10,category:"Küche",recurring:"daily",assignedTo:[],photo:null},
  {id:"t9",name:"Müll rausbringen",emoji:"🗑️",points:10,category:"Haushalt",recurring:"weekly",assignedTo:[],photo:null},
  {id:"t10",name:"Saugen",emoji:"🧹",points:20,category:"Haushalt",recurring:"weekly",assignedTo:[],photo:null},
  {id:"t11",name:"Wäsche wegräumen",emoji:"👕",points:15,category:"Haushalt",recurring:"weekly",assignedTo:[],photo:null},
  {id:"t12",name:"Fahrradhelm aufräumen",emoji:"⛑️",points:5,category:"Ordnung",recurring:"daily",assignedTo:[],photo:null},
  {id:"t13",name:"Gartenarbeit",emoji:"🌱",points:20,category:"Garten",recurring:"weekly",assignedTo:[],photo:null},
  {id:"t14",name:"Grünstreifen umgraben",emoji:"⛏️",points:25,category:"Garten",recurring:"once",assignedTo:[],photo:null},
];

export const DEFAULT_MEMBERS = [
  {id:"m1",name:"Papa",color:"#2563eb",isAdmin:true,emoji:"👨",photo:null},
  {id:"m2",name:"Mama",color:"#dc2626",isAdmin:true,emoji:"👩",photo:null},
  {id:"m3",name:"Marlon",color:"#16a34a",isAdmin:false,emoji:"🧑",photo:null},
  {id:"m4",name:"Clara",color:"#eab308",isAdmin:false,emoji:"👧",photo:null},
  {id:"m5",name:"Jonah",color:"#f97316",isAdmin:false,emoji:"👶",photo:null},
];

export const DEFAULT_DATA = {
  members: DEFAULT_MEMBERS, tasks: DEFAULT_TASKS, completions: [],
  rewards: [
    {id:"r1",name:"Eis essen gehen",pointsCost:100,emoji:"🍦",assignedTo:[]},
    {id:"r2",name:"30 Min extra Bildschirmzeit",pointsCost:80,emoji:"📱",assignedTo:[]},
    {id:"r3",name:"Wunschessen",pointsCost:150,emoji:"🍕",assignedTo:[]},
    {id:"r4",name:"Ausflug wählen",pointsCost:300,emoji:"🎢",assignedTo:[]},
  ],
  redeemedRewards: [], adminPin:"1234", championHistory: [], needsConfirmation: true,
  notifications: [], lastChampionWeek: null, customCategories: null,
};
