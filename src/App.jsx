// LEGACY-Wrapper: bestehende Produktions-App mit public.app_state / family-main.
// Enthält ausschließlich Persistenz (Laden, Speichern, Realtime) und die Legacy-Standarddaten.
// Die Oberfläche kommt aus src/shared/ChampionApp.jsx (gemeinsam mit dem FAMILY-Modus).
import { useState, useEffect, useCallback } from "react";
import { supabaseLegacy as supabase } from "./lib/supabaseLegacy.js";
import ChampionApp from "./shared/ChampionApp.jsx";
import { DEFAULT_DATA, REWARD_SUGGESTIONS } from "./legacy/legacyDefaults.js";

// ─── SUPABASE (LEGACY: public.app_state) ───
const ROW_ID = "family-main";
// Speichern ist erst erlaubt, wenn der erste Ladevorgang sicher abgeschlossen ist
// (Datensatz geladen oder nachweislich nicht vorhanden). Nach einem Ladefehler
// bleibt es gesperrt, damit Standarddaten nie echte Daten überschreiben.
const persist = { ready: false, onError: null };
const save = async (data) => {
  if (!persist.ready) { console.error("[save] blockiert: Daten wurden nicht erfolgreich geladen"); return false; }
  try {
    const { error } = await supabase.from("app_state").upsert({ id: ROW_ID, data, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
  } catch (e) { console.error("[save] fehlgeschlagen", e); persist.onError?.(e); return false; }
};
// Liefert { status: "loaded", data } | { status: "empty" } | { status: "error", error }
const load = async () => {
  try {
    const { data: row, error } = await supabase.from("app_state").select("data").eq("id", ROW_ID).maybeSingle();
    if (error) throw error;
    if (!row) return { status: "empty" };
    if (!row.data || typeof row.data !== "object") throw new Error("Datensatz ohne gültige Daten");
    return { status: "loaded", data: row.data };
  } catch (e) { console.error("[load] fehlgeschlagen", e); return { status: "error", error: e }; }
};

export default function App(){
  const [data,setData]=useState(null);
  const [loadState,setLoadState]=useState("loading"); // loading | loaded | error
  const [notice,setNotice]=useState(null);

  const init=useCallback(async()=>{
    persist.ready=false;
    setLoadState("loading");
    const r=await load();
    if(r.status==="error"){setLoadState("error");return;}
    // Nur wenn wirklich noch kein Datensatz existiert, mit Standarddaten starten
    setData(r.status==="loaded"?r.data:{...DEFAULT_DATA});
    persist.ready=true;
    setLoadState("loaded");
  },[]);

  useEffect(()=>{
    persist.onError=()=>setNotice({id:Date.now(),text:"⚠️ Speichern fehlgeschlagen – bitte Verbindung prüfen"});
    init();
    return ()=>{persist.onError=null;};
  },[init]);

  useEffect(()=>{
    const channel = supabase.channel("app_state_changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"app_state",filter:`id=eq.${ROW_ID}`},
        (payload)=>{if(persist.ready&&payload.new?.data)setData(payload.new.data);}
      ).subscribe();
    return ()=>{supabase.removeChannel(channel);};
  },[]);

  const update=useCallback((fn)=>{
    setData(prev=>{const next=fn(prev);save(next);return next;});
  },[]);

  if(loadState==="error") return <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,height:"100vh",padding:24,textAlign:"center",background:"#1e1b4b",color:"#fff",fontFamily:"'Fredoka',sans-serif"}}>
    <div style={{fontSize:52}}>⚠️</div>
    <div style={{fontSize:20,fontWeight:800}}>Daten konnten nicht geladen werden</div>
    <div style={{fontSize:14,color:"#a5b4fc",maxWidth:320}}>Bitte Internetverbindung prüfen. Es wurde nichts gespeichert – deine Daten bleiben unverändert.</div>
    <button onClick={init} style={{background:"#fbbf24",color:"#1e1b4b",border:"none",borderRadius:14,padding:"12px 24px",fontSize:16,fontWeight:700,fontFamily:"inherit",cursor:"pointer"}}>Erneut versuchen</button>
  </div>;

  if(loadState!=="loaded"||!data) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#1e1b4b",fontFamily:"'Fredoka',sans-serif"}}><div style={{fontSize:52,animation:"spin 1s linear infinite"}}>🏆</div></div>;

  return <ChampionApp data={data} update={update} notice={notice} rewardSuggestions={REWARD_SUGGESTIONS} resetData={DEFAULT_DATA}
    checkAdminPin={(pin)=>pin===data.adminPin} changeAdminPin={(v)=>(prev)=>({...prev,adminPin:v})} />;
}
