import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE ───
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const ROW_ID = "family-main";
const save = async (data) => { try { await supabase.from("app_state").upsert({ id: ROW_ID, data, updated_at: new Date().toISOString() }); } catch (e) { console.error(e); } };
const load = async () => { try { const { data: row } = await supabase.from("app_state").select("data").eq("id", ROW_ID).single(); return row?.data || null; } catch { return null; } };

const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const isoDate = (d) => new Date(d).toISOString().slice(0,10);
const today = () => isoDate(new Date());
const weekStart = (d = new Date()) => { const dd = new Date(d); const day = dd.getDay(); dd.setDate(dd.getDate() - day + (day===0?-6:1)); dd.setHours(0,0,0,0); return dd; };
const monthStart = (d = new Date()) => { const dd = new Date(d); dd.setDate(1); dd.setHours(0,0,0,0); return dd; };
const dayName = (d) => ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(d).getDay()];
const fmtDate = (d) => new Date(d).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});
const prevWeekStart = () => { const d = weekStart(); d.setDate(d.getDate()-7); return d; };
const prevWeekEnd = () => { const d = weekStart(); d.setDate(d.getDate()-1); d.setHours(23,59,59,999); return d; };

// ─── DEFAULT CATEGORIES ───
const DEFAULT_CATEGORIES = ["Ordnung","Küche","Haushalt","Garten","Sonstiges"];
const CATEGORY_EMOJI = {Ordnung:"🧹",Küche:"🍳",Haushalt:"🏠",Garten:"🌱",Sonstiges:"📦"};

const TASK_CLIPARTS = [
  "👟","🧥","🛏️","🧸","🛋️","🍽️","✨","🍴","🗑️","🧹",
  "👕","⛑️","🌱","⛏️","🚿","🐕","📚","🧽","🪣","💧",
  "🚗","🧺","🪴","🍳","🧊","📦","✏️","🎒","🛁","🪥",
];

const REWARD_SUGGESTIONS = [
  {name:"Eis essen gehen",points:50,emoji:"🍦"},
  {name:"Kinobesuch",points:150,emoji:"🎬"},
  {name:"Spielzeug wünschen",points:200,emoji:"🎁"},
  {name:"Lieblingsessen",points:80,emoji:"🍕"},
  {name:"Ausschlafen",points:30,emoji:"😴"},
  {name:"Freund einladen",points:100,emoji:"👫"},
  {name:"Bildschirmzeit +1h",points:60,emoji:"📱"},
  {name:"Schwimmbad",points:120,emoji:"🏊"},
  {name:"Kino zuhause",points:40,emoji:"🎥"},
  {name:"Bowling",points:130,emoji:"🎳"},
];

const BADGES = [
  {id:"first",name:"Erste Schritte",desc:"Erste Aufgabe erledigt",emoji:"🌱",check:(c)=>c.length>=1},
  {id:"bee",name:"Fleißige Biene",desc:"10 Aufgaben erledigt",emoji:"🐝",check:(c)=>c.length>=10},
  {id:"hero",name:"Superheld",desc:"50 Aufgaben erledigt",emoji:"🦸",check:(c)=>c.length>=50},
  {id:"order",name:"Ordnungsprofi",desc:"5x Ordnung-Aufgaben",emoji:"🧹",check:(c)=>c.filter(x=>x.category==="Ordnung").length>=5},
  {id:"cook",name:"Küchenchef",desc:"5x Küche-Aufgaben",emoji:"🍳",check:(c)=>c.filter(x=>x.category==="Küche").length>=5},
  {id:"garden",name:"Gärtner",desc:"3x Garten-Aufgaben",emoji:"🌱",check:(c)=>c.filter(x=>x.category==="Garten").length>=3},
  {id:"streak3",name:"3-Tage-Streak",desc:"3 Tage in Folge",emoji:"🔥",check:(c,streak)=>streak>=3},
  {id:"streak7",name:"Wochenstreaker",desc:"7 Tage in Folge",emoji:"⚡",check:(c,streak)=>streak>=7},
  {id:"champ",name:"Wochenchampion",desc:"Wochenbeste/r",emoji:"🏆",check:(c,s,isChamp)=>isChamp},
  {id:"100",name:"100er Club",desc:"100 Punkte gesammelt",emoji:"💯",check:(c,s,ic,pts)=>pts>=100},
];

const MEMBER_COLORS = ["#6366f1","#f59e0b","#10b981","#f43f5e","#8b5cf6","#06b6d4"];

const DEFAULT_DATA = {
  members: [],
  tasks: [],
  completions: [],
  rewards: [],
  redeemedRewards: [],
  notifications: [],
  categories: DEFAULT_CATEGORIES,
  needsConfirmation: false,
  adminPin: "1234",
};

const resizeImg = (file, maxPx=200) => new Promise(res => {
  const r = new FileReader();
  r.onload = e => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(maxPx/img.width, maxPx/img.height, 1);
      const c = document.createElement("canvas");
      c.width = img.width*s; c.height = img.height*s;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = e.target.result;
  };
  r.readAsDataURL(file);
});

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("home");
  const [active, setActive] = useState(null);
  const [filter, setFilter] = useState("Alle");
  const [toast, setToast] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [editMember, setEditMember] = useState(null);
  const [editReward, setEditReward] = useState(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [adminTab, setAdminTab] = useState("members");
  const [statsView, setStatsView] = useState("week");
  const [detailMember, setDetailMember] = useState(null);
  const [showCategoryMgr, setShowCategoryMgr] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // ─── LOAD & REALTIME ───
  useEffect(() => {
    load().then(d => {
      if (d) {
        if (!d.categories) d.categories = DEFAULT_CATEGORIES;
        if (!d.notifications) d.notifications = [];
        setData(d);
      } else {
        setData(DEFAULT_DATA);
      }
      setLoading(false);
    });
    const channel = supabase.channel("rt-app")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_state", filter: `id=eq.${ROW_ID}` },
        payload => { if (payload.new?.data) { const d = payload.new.data; if (!d.categories) d.categories = DEFAULT_CATEGORIES; if (!d.notifications) d.notifications = []; setData(d); } }
      ).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const update = useCallback((fn) => {
    setData(prev => { const next = fn(prev); save(next); return next; });
  }, []);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };
  const boom = () => { setConfetti(true); setTimeout(() => setConfetti(false), 2200); };

  if (loading || !data) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#1e1b4b",fontFamily:"'Fredoka',sans-serif"}}>
      <div style={{fontSize:52,animation:"spin 1s linear infinite"}}>🏆</div>
    </div>
  );

  const ws = weekStart(), ms = monthStart();
  const weekC = data.completions.filter(c => new Date(c.date) >= ws);
  const monthC = data.completions.filter(c => new Date(c.date) >= ms);
  const todayC = data.completions.filter(c => isoDate(c.date) === today());

  const pts = (mid, arr=data.completions) => arr.filter(c => c.memberId===mid && c.confirmed!==false).reduce((s,c)=>s+c.points,0);
  const weekPts = (mid) => pts(mid, weekC);
  const monthPts = (mid) => pts(mid, monthC);
  const todayPts = (mid) => pts(mid, todayC);
  const redeemed = (mid) => (data.redeemedRewards||[]).filter(r=>r.memberId===mid).reduce((s,r)=>s+r.pointsCost,0);
  const avail = (mid) => pts(mid) - redeemed(mid);

  const pendingConfirm = data.completions.filter(c => c.needsConfirm && !c.confirmed);
  const unreadNotifs = (data.notifications||[]).filter(n => !n.read);

  const champData = data.members.map(m => ({...m, wp:weekPts(m.id)})).sort((a,b)=>b.wp-a.wp);
  const champ = champData[0]?.wp>0 ? champData[0] : null;

  // ─── TODAY'S LEADER (for crown) ───
  const todayLeader = (() => {
    const sorted = data.members.map(m=>({...m, tp:todayPts(m.id)})).sort((a,b)=>b.tp-a.tp);
    if (!sorted[0] || sorted[0].tp===0) return null;
    if (sorted.length>1 && sorted[0].tp===sorted[1].tp) return null; // tie → no crown
    return sorted[0];
  })();

  const categories = ["Alle", ...(data.categories||DEFAULT_CATEGORIES)];
  const catEmoji = (cat) => CATEGORY_EMOJI[cat] || "📋";
  const filtered = filter==="Alle" ? data.tasks : data.tasks.filter(t=>t.category===filter);

  const todayCompForTask = (tid) => data.completions.filter(c=>c.taskId===tid && isoDate(c.date)===today());

  // ─── COMPLETE TASK ───
  const completeTask = (task) => {
    if (!active) return;
    const needsC = data.needsConfirmation && !active.isAdmin;
    update(prev => ({...prev, completions:[...prev.completions, {
      id:uid(), taskId:task.id, taskName:task.name, memberId:active.id, memberName:active.name,
      memberEmoji:active.emoji, memberPhoto:active.photo||null,
      points:task.points, date:new Date().toISOString(), needsConfirm:needsC, confirmed:!needsC, category:task.category||"Sonstiges",
    }]}));
    const nw = weekPts(active.id) + task.points;
    if ((nw>=50&&weekPts(active.id)<50)||(nw>=100&&weekPts(active.id)<100)) boom();
    flash(`+${task.points} ⭐ ${active.name}!${needsC?" (wartet auf Bestätigung)":""}`);
  };

  const undoTask = (taskId) => {
    const myComps = data.completions.filter(c => c.taskId===taskId && c.memberId===active?.id && isoDate(c.date)===today());
    if (!myComps.length) return;
    const last = myComps[myComps.length-1];
    update(prev => ({...prev, completions:prev.completions.filter(c=>c.id!==last.id)}));
    flash("↩️ Rückgängig gemacht");
  };

  const confirmC = (cid) => { update(prev => ({...prev, completions:prev.completions.map(c=>c.id===cid?{...c,confirmed:true,needsConfirm:false}:c)})); flash("✅ Bestätigt!"); };
  const rejectC = (cid) => { update(prev => ({...prev, completions:prev.completions.filter(c=>c.id!==cid)})); flash("❌ Abgelehnt"); };

  const redeemReward = (reward) => {
    if (!active) return;
    const a = avail(active.id);
    if (a < reward.pointsCost) { flash("Nicht genug Punkte! ❌"); return; }
    const notif = { id:uid(), type:"reward", memberId:active.id, memberName:active.name, memberPhoto:active.photo||null, memberEmoji:active.emoji, rewardName:reward.name, rewardEmoji:reward.emoji||"🎁", pointsCost:reward.pointsCost, date:new Date().toISOString(), read:false };
    update(prev => ({...prev,
      redeemedRewards:[...(prev.redeemedRewards||[]), {id:uid(),memberId:active.id,memberName:active.name,rewardId:reward.id,rewardName:reward.name,pointsCost:reward.pointsCost,date:new Date().toISOString()}],
      notifications:[...(prev.notifications||[]), notif],
    }));
    boom();
    flash(`🎉 "${reward.name}" eingelöst!`);
  };

  // ─── STREAK ───
  const getStreak = (mid) => {
    const days = [...new Set(data.completions.filter(c=>c.memberId===mid&&c.confirmed!==false).map(c=>isoDate(c.date)))].sort().reverse();
    let streak=0, d=new Date();
    for (let i=0;i<365;i++) {
      const s = isoDate(d);
      if (days.includes(s)) streak++;
      else if (streak>0) break;
      d.setDate(d.getDate()-1);
    }
    return streak;
  };

  // ─── BADGES ───
  const getMemberBadges = (mid) => {
    const mc = data.completions.filter(c=>c.memberId===mid&&c.confirmed!==false);
    const streak = getStreak(mid);
    const isChamp = champ?.id===mid;
    const totalPts = pts(mid);
    return BADGES.map(b => ({...b, earned:b.check(mc,streak,isChamp,totalPts)}));
  };

  // ─── STYLES ───
  const S = {
    app: {maxWidth:430,margin:"0 auto",minHeight:"100vh",background:"#1e1b4b",fontFamily:"'Fredoka',sans-serif",paddingBottom:80,position:"relative"},
    card: (bg="#2d2b6b",p=16) => ({background:bg,borderRadius:16,padding:p,marginBottom:12}),
    btn: (bg="#6366f1",c="#fff",p="12px 20px") => ({background:bg,color:c,border:"none",borderRadius:12,padding:p,fontFamily:"'Fredoka',sans-serif",fontSize:15,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}),
    input: {background:"#1e1b4b",border:"2px solid #4c4a8f",borderRadius:10,padding:"10px 14px",color:"#fff",fontFamily:"'Fredoka',sans-serif",fontSize:15,width:"100%",boxSizing:"border-box"},
    label: {color:"#a5b4fc",fontSize:13,fontWeight:600,marginBottom:4,display:"block"},
    h2: {color:"#fff",fontSize:20,fontWeight:700,margin:"0 0 12px 0"},
    badge: (earned) => ({
      background: earned ? "linear-gradient(135deg,#f59e0b,#d97706)" : "#c7d2fe",
      borderRadius:12, padding:"10px 12px", textAlign:"center",
      opacity: earned ? 1 : 0.95,
      border: earned ? "none" : "1px solid #a5b4fc",
    }),
    badgeText: (earned) => ({ color: earned ? "#fff" : "#3730a3", fontSize:11, fontWeight:600, marginTop:4 }),
  };

  // ─── AVATAR ───
  const Avatar = (m, size=44) => m.photo
    ? <img src={m.photo} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0}} alt={m.name}/>
    : <div style={{width:size,height:size,borderRadius:"50%",background:MEMBER_COLORS[data.members.indexOf(m)%6]||"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.45,flexShrink:0}}>{m.emoji||"👤"}</div>;

  // ─── CONFETTI ───
  const Confetti = ({show}) => {
    if (!show) return null;
    return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:999,overflow:"hidden"}}>
      {Array.from({length:30}).map((_,i)=>(
        <div key={i} style={{position:"absolute",top:-20,left:`${Math.random()*100}%`,width:8,height:8,borderRadius:"50%",background:["#f59e0b","#6366f1","#10b981","#f43f5e"][i%4],animation:`cFall ${1+Math.random()}s ease-in ${Math.random()*0.5}s forwards`}}/>
      ))}
    </div>;
  };

  // ─── MODAL ───
  const Modal = ({title, onClose, children}) => (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#2d2b6b",borderRadius:"20px 20px 0 0",padding:20,width:"100%",maxWidth:430,maxHeight:"85vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{color:"#fff",margin:0,fontFamily:"'Fredoka',sans-serif",fontSize:18,fontWeight:700}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#a5b4fc",fontSize:24,cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );

  // ─── TASK MODAL ───
  const TaskModal = () => {
    if (!editTask) return null;
    const isNew = editTask === "new";
    const [form, setForm] = useState(isNew ? {name:"",points:10,category:data.categories?.[0]||"Sonstiges",emoji:"✨",assignedTo:[],recurrence:"once"} : {...editTask});
    const imgRef = useRef();
    return Modal({title: isNew?"Neue Aufgabe":"Aufgabe bearbeiten", onClose:()=>setEditTask(null), children:(
      <div>
        <label style={S.label}>Name</label>
        <input style={{...S.input,marginBottom:12}} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Aufgabenname"/>
        <label style={S.label}>Punkte</label>
        <input style={{...S.input,marginBottom:12}} type="number" value={form.points} onChange={e=>setForm(f=>({...f,points:+e.target.value}))} min={1}/>
        <label style={S.label}>Kategorie</label>
        <select style={{...S.input,marginBottom:12}} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}>
          {(data.categories||DEFAULT_CATEGORIES).map(c=><option key={c} value={c}>{catEmoji(c)} {c}</option>)}
        </select>
        <label style={S.label}>Wiederholung</label>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {["once","daily","weekly"].map(r=>(
            <button key={r} onClick={()=>setForm(f=>({...f,recurrence:r}))} style={{...S.btn(form.recurrence===r?"#6366f1":"#1e1b4b","#fff","8px 14px"),flex:1,fontSize:12}}>
              {r==="once"?"Einmalig":r==="daily"?"Täglich":"Wöchentlich"}
            </button>
          ))}
        </div>
        <label style={S.label}>Emoji</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {TASK_CLIPARTS.map(e=>(
            <button key={e} onClick={()=>setForm(f=>({...f,emoji:e}))} style={{...S.btn(form.emoji===e?"#6366f1":"#1e1b4b","#fff","6px"),fontSize:20,width:40,height:40,flexShrink:0}}>{e}</button>
          ))}
        </div>
        <label style={S.label}>Für wen?</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:16}}>
          <button onClick={()=>setForm(f=>({...f,assignedTo:[]}))} style={{...S.btn(form.assignedTo.length===0?"#6366f1":"#1e1b4b","#fff","8px 14px"),fontSize:13}}>Alle</button>
          {data.members.map(m=>(
            <button key={m.id} onClick={()=>setForm(f=>({...f,assignedTo:f.assignedTo.includes(m.id)?f.assignedTo.filter(x=>x!==m.id):[...f.assignedTo,m.id]}))}
              style={{...S.btn(form.assignedTo.includes(m.id)?"#6366f1":"#1e1b4b","#fff","8px 12px"),fontSize:13}}>
              {m.emoji||"👤"} {m.name}
            </button>
          ))}
        </div>
        <button style={{...S.btn(),width:"100%",marginBottom:8}} onClick={()=>{
          if(!form.name.trim()) return;
          update(prev=>({...prev,tasks:isNew?[...prev.tasks,{...form,id:uid()}]:prev.tasks.map(t=>t.id===form.id?form:t)}));
          setEditTask(null);
        }}>Speichern</button>
        {!isNew && <button style={{...S.btn("#ef4444","#fff"),width:"100%"}} onClick={()=>{update(prev=>({...prev,tasks:prev.tasks.filter(t=>t.id!==form.id)}));setEditTask(null);}}>Löschen</button>}
      </div>
    )});
  };

  // ─── MEMBER MODAL ───
  const MemberModal = () => {
    if (!editMember) return null;
    const isNew = editMember === "new";
    const [form, setForm] = useState(isNew ? {name:"",emoji:"😊",photo:null,isAdmin:false} : {...editMember});
    const imgRef = useRef();
    return Modal({title: isNew?"Neues Mitglied":"Mitglied bearbeiten", onClose:()=>setEditMember(null), children:(
      <div>
        <div style={{textAlign:"center",marginBottom:16}}>
          {Avatar(form,72)}
          <div style={{marginTop:8,display:"flex",gap:8,justifyContent:"center"}}>
            <button style={S.btn("#1e1b4b","#a5b4fc","8px 14px")} onClick={()=>imgRef.current?.click()}>📷 Foto wählen</button>
            {form.photo && <button style={S.btn("#ef4444","#fff","8px 14px")} onClick={()=>setForm(f=>({...f,photo:null}))}>✕</button>}
          </div>
          <input ref={imgRef} type="file" accept="image/*" style={{display:"none"}} onChange={async e=>{const f=e.target.files[0];if(f){const b64=await resizeImg(f);setForm(fr=>({...fr,photo:b64}));}}}/>
        </div>
        <label style={S.label}>Name</label>
        <input style={{...S.input,marginBottom:12}} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Name"/>
        <label style={S.label}>Emoji (Fallback)</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {["😊","👦","👧","🧒","👨","👩","🧑","🧔","👴","👵","🤩","😎","🥳","🤓","🦸","🧙"].map(e=>(
            <button key={e} onClick={()=>setForm(f=>({...f,emoji:e}))} style={{...S.btn(form.emoji===e?"#6366f1":"#1e1b4b","#fff","6px"),fontSize:22,width:42,height:42}}>{e}</button>
          ))}
        </div>
        <label style={{...S.label,display:"flex",alignItems:"center",gap:8}}>
          <input type="checkbox" checked={form.isAdmin||false} onChange={e=>setForm(f=>({...f,isAdmin:e.target.checked}))} style={{width:18,height:18}}/>
          Admin-Rechte (Elternteil)
        </label>
        <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8}}>
          <button style={{...S.btn(),width:"100%"}} onClick={()=>{
            if(!form.name.trim()) return;
            update(prev=>({...prev,members:isNew?[...prev.members,{...form,id:uid()}]:prev.members.map(m=>m.id===form.id?form:m)}));
            setEditMember(null);
          }}>Speichern</button>
          {!isNew && <button style={{...S.btn("#ef4444","#fff"),width:"100%"}} onClick={()=>{update(prev=>({...prev,members:prev.members.filter(m=>m.id!==form.id)}));if(active?.id===form.id)setActive(null);setEditMember(null);}}>Löschen</button>}
        </div>
      </div>
    )});
  };

  // ─── REWARD MODAL ───
  const RewardModal = () => {
    if (!editReward) return null;
    const isNew = editReward === "new";
    const [form, setForm] = useState(isNew ? {name:"",pointsCost:50,emoji:"🎁",assignedTo:[]} : {...editReward});
    const [showSug, setShowSug] = useState(false);
    return Modal({title: isNew?"Neue Belohnung":"Belohnung bearbeiten", onClose:()=>setEditReward(null), children:(
      <div>
        <label style={S.label}>Name</label>
        <input style={{...S.input,marginBottom:12}} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Belohnungsname"/>
        <label style={S.label}>Punkte-Kosten</label>
        <input style={{...S.input,marginBottom:12}} type="number" value={form.pointsCost} onChange={e=>setForm(f=>({...f,pointsCost:+e.target.value}))} min={1}/>
        <label style={S.label}>Emoji</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {["🎁","🍦","🎬","🎮","🎢","🏊","🎳","🍕","😴","📱","🚀","⭐","🦁","🐉","🏆"].map(e=>(
            <button key={e} onClick={()=>setForm(f=>({...f,emoji:e}))} style={{...S.btn(form.emoji===e?"#6366f1":"#1e1b4b","#fff","6px"),fontSize:20,width:40,height:40}}>{e}</button>
          ))}
        </div>
        <label style={S.label}>Für wen?</label>
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          <button onClick={()=>setForm(f=>({...f,assignedTo:[]}))} style={{...S.btn(form.assignedTo.length===0?"#6366f1":"#1e1b4b","#fff","8px 14px"),fontSize:13}}>Alle</button>
          {data.members.map(m=>(
            <button key={m.id} onClick={()=>setForm(f=>({...f,assignedTo:f.assignedTo.includes(m.id)?f.assignedTo.filter(x=>x!==m.id):[...f.assignedTo,m.id]}))}
              style={{...S.btn(form.assignedTo.includes(m.id)?"#6366f1":"#1e1b4b","#fff","8px 12px"),fontSize:13}}>
              {m.emoji||"👤"} {m.name}
            </button>
          ))}
        </div>
        <button style={{...S.btn("#1e1b4b","#a5b4fc"),width:"100%",marginBottom:8}} onClick={()=>setShowSug(!showSug)}>💡 Vorschläge</button>
        {showSug && <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
          {REWARD_SUGGESTIONS.map(s=>(
            <button key={s.name} onClick={()=>{setForm(f=>({...f,name:s.name,pointsCost:s.points,emoji:s.emoji}));setShowSug(false);}} style={{...S.btn("#1e1b4b","#c7d2fe","6px 10px"),fontSize:12,flexDirection:"column",gap:2,height:"auto",padding:"8px 10px"}}>
              <span style={{fontSize:18}}>{s.emoji}</span><span>{s.name}</span>
            </button>
          ))}
        </div>}
        <button style={{...S.btn(),width:"100%",marginBottom:8}} onClick={()=>{
          if(!form.name.trim()) return;
          update(prev=>({...prev,rewards:isNew?[...prev.rewards,{...form,id:uid()}]:prev.rewards.map(r=>r.id===form.id?form:r)}));
          setEditReward(null);
        }}>Speichern</button>
        {!isNew && <button style={{...S.btn("#ef4444","#fff"),width:"100%"}} onClick={()=>{update(prev=>({...prev,rewards:prev.rewards.filter(r=>r.id!==form.id)}));setEditReward(null);}}>Löschen</button>}
      </div>
    )});
  };

  // ─── CATEGORY MANAGER MODAL ───
  const CategoryManagerModal = () => {
    if (!showCategoryMgr) return null;
    const [newName, setNewName] = useState("");
    const cats = data.categories || DEFAULT_CATEGORIES;
    return Modal({title:"📂 Kategorien verwalten", onClose:()=>setShowCategoryMgr(false), children:(
      <div>
        <p style={{color:"#a5b4fc",fontSize:13,marginTop:0}}>Hier kannst du Aufgaben-Kategorien anlegen und löschen.</p>
        {cats.map(cat=>(
          <div key={cat} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#1e1b4b",borderRadius:10,padding:"10px 14px",marginBottom:8}}>
            <span style={{color:"#fff",fontSize:15,fontWeight:600}}>{catEmoji(cat)} {cat}</span>
            <button onClick={()=>{
              const used = data.tasks.some(t=>t.category===cat);
              if (used) { flash("Kategorie wird von Aufgaben verwendet – zuerst Aufgaben umkategorisieren."); return; }
              update(prev=>({...prev, categories:(prev.categories||DEFAULT_CATEGORIES).filter(c=>c!==cat)}));
            }} style={{...S.btn("#ef4444","#fff","6px 12px"),fontSize:12}}>Löschen</button>
          </div>
        ))}
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input style={{...S.input,flex:1}} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Neue Kategorie..."/>
          <button style={S.btn()} onClick={()=>{
            if (!newName.trim()) return;
            if ((data.categories||DEFAULT_CATEGORIES).includes(newName.trim())) { flash("Kategorie existiert bereits"); return; }
            update(prev=>({...prev, categories:[...(prev.categories||DEFAULT_CATEGORIES), newName.trim()]}));
            setNewName("");
          }}>+ Hinzufügen</button>
        </div>
      </div>
    )});
  };

  // ─── DETAIL MEMBER MODAL ───
  const DetailMemberModal = () => {
    if (!detailMember) return null;
    const m = data.members.find(x=>x.id===detailMember);
    if (!m) return null;
    const mc = data.completions.filter(c=>c.memberId===m.id&&c.confirmed!==false);
    const badges = getMemberBadges(m.id);
    const streak = getStreak(m.id);
    const catBreakdown = (data.categories||DEFAULT_CATEGORIES).map(cat=>({cat,count:mc.filter(c=>c.category===cat).length})).filter(x=>x.count>0);
    const last7 = Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return{label:dayName(d),pts:pts(m.id,data.completions.filter(c=>isoDate(c.date)===isoDate(d)&&c.memberId===m.id&&c.confirmed!==false))};});
    const maxBar = Math.max(...last7.map(x=>x.pts),1);
    return Modal({title:`📊 ${m.name}`, onClose:()=>setDetailMember(null), children:(
      <div>
        <div style={{textAlign:"center",marginBottom:16}}>
          {Avatar(m,64)}
          <div style={{color:"#f59e0b",fontWeight:700,fontSize:18,marginTop:8}}>{pts(m.id)} Punkte gesamt</div>
          <div style={{color:"#a5b4fc",fontSize:13}}>{streak > 0 ? `🔥 ${streak}-Tage-Streak` : "Kein Streak"}</div>
        </div>
        <div style={S.card()}>
          <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:8}}>LETZTE 7 TAGE</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:60}}>
            {last7.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",background:"#6366f1",borderRadius:4,height:`${(d.pts/maxBar)*52}px`,minHeight:d.pts?4:0,transition:"height .3s"}}/>
                <span style={{color:"#a5b4fc",fontSize:10}}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>
        {catBreakdown.length>0 && <div style={S.card()}>
          <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:8}}>KATEGORIEN</div>
          {catBreakdown.map(x=>(
            <div key={x.cat} style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{color:"#fff",fontSize:14}}>{catEmoji(x.cat)} {x.cat}</span>
              <span style={{color:"#f59e0b",fontWeight:700}}>{x.count}×</span>
            </div>
          ))}
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {badges.map(b=>(
            <div key={b.id} style={S.badge(b.earned)}>
              <div style={{fontSize:26}}>{b.emoji}</div>
              <div style={S.badgeText(b.earned)}>{b.name}</div>
              <div style={{...S.badgeText(b.earned),fontSize:10,opacity:0.85}}>{b.desc}</div>
            </div>
          ))}
        </div>
      </div>
    )});
  };

  // ─── HOME SCREEN ───
  const Home = () => {
    const todayLeaderLocal = todayLeader;
    return (
      <div>
        <div style={{background:"linear-gradient(135deg,#312e81,#1e1b4b)",padding:"16px 16px 12px",borderBottom:"1px solid #3730a3"}}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{fontSize:13,color:"#a5b4fc",fontWeight:600,letterSpacing:1}}>🏆 WOCHEN CHAMPION</div>
            <div style={{fontSize:11,color:"#6366f1",fontWeight:600}}>Wer hat die meisten Punkte?</div>
          </div>
          {/* MEMBER SELECTOR – larger avatars */}
          <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:6,justifyContent:data.members.length<=3?"center":"flex-start"}}>
            {data.members.map(m => {
              const isSel = active?.id===m.id;
              const isLeader = todayLeaderLocal?.id===m.id;
              return (
                <button key={m.id} onClick={()=>setActive(isSel?null:m)}
                  style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0,padding:"4px 6px",minWidth:72}}>
                  <div style={{position:"relative"}}>
                    {isLeader && (
                      <div style={{position:"absolute",top:-14,left:"50%",transform:"translateX(-50%)",fontSize:18,zIndex:2,filter:"drop-shadow(0 1px 3px rgba(0,0,0,0.6))"}}>👑</div>
                    )}
                    <div style={{
                      width:64, height:64, borderRadius:"50%", overflow:"hidden",
                      border: isSel ? "3px solid #f59e0b" : "3px solid transparent",
                      boxShadow: isSel ? "0 0 0 2px #f59e0b55" : "none",
                      flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                      background: m.photo ? "none" : MEMBER_COLORS[data.members.indexOf(m)%6],
                      marginTop: isLeader ? 6 : 0,
                    }}>
                      {m.photo
                        ? <img src={m.photo} style={{width:64,height:64,objectFit:"cover"}} alt={m.name}/>
                        : <span style={{fontSize:30}}>{m.emoji||"👤"}</span>
                      }
                    </div>
                  </div>
                  <span style={{color:isSel?"#f59e0b":"#c7d2fe",fontSize:12,fontWeight:700,maxWidth:72,textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
                  <span style={{color:"#f59e0b",fontSize:11,fontWeight:600}}>{weekPts(m.id)} P</span>
                </button>
              );
            })}
            <button onClick={()=>{setAdminUnlocked(true);setScreen("admin");setAdminTab("members");}}
              style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0,padding:"4px 6px",minWidth:56}}>
              <div style={{width:64,height:64,borderRadius:"50%",background:"#1e1b4b",border:"2px dashed #4c4a8f",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>➕</div>
              <span style={{color:"#6366f1",fontSize:11,fontWeight:600}}>Verwalten</span>
            </button>
          </div>
        </div>

        {/* Active member banner */}
        {active && (
          <div style={{background:"linear-gradient(90deg,#312e81,#4338ca)",margin:"12px 12px 0",borderRadius:14,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
            {Avatar(active,36)}
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{active.name}</div>
              <div style={{color:"#a5b4fc",fontSize:12}}>Diese Woche: {weekPts(active.id)} Punkte · Verfügbar: {avail(active.id)}</div>
            </div>
            <button onClick={()=>setActive(null)} style={{background:"none",border:"none",color:"#a5b4fc",fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
        )}

        {/* Week champ banner */}
        {champ && (
          <div style={{background:"linear-gradient(90deg,#d97706,#f59e0b)",margin:"10px 12px 0",borderRadius:14,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>🏆</span>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>Wochenchampion: {champ.name}</div>
              <div style={{color:"#fef3c7",fontSize:12}}>{champ.wp} Punkte diese Woche</div>
            </div>
          </div>
        )}

        {/* Category filter */}
        <div style={{display:"flex",gap:6,overflowX:"auto",padding:"12px 12px 4px"}}>
          {categories.map(cat=>(
            <button key={cat} onClick={()=>setFilter(cat)} style={{...S.btn(filter===cat?"#6366f1":"#2d2b6b","#fff","7px 14px"),flexShrink:0,fontSize:12,whiteSpace:"nowrap"}}>
              {cat==="Alle"?"Alle":catEmoji(cat)+" "+cat}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div style={{padding:"8px 12px"}}>
          {!active && <div style={{textAlign:"center",padding:"20px",color:"#a5b4fc",fontSize:14}}>👆 Wähle oben ein Familienmitglied aus</div>}
          {active && filtered.filter(t=>!t.assignedTo?.length||t.assignedTo.includes(active.id)).map(task => {
            const todayComps = todayCompForTask(task.id);
            const myComp = todayComps.find(c=>c.memberId===active.id);
            const isDone = !!myComp;
            return (
              <div key={task.id} style={{...S.card(isDone?"#1a2a1a":"#2d2b6b"),display:"flex",alignItems:"center",gap:10,opacity:isDone?0.7:1,border:isDone?"1px solid #166534":"none"}}>
                <div style={{fontSize:28,flexShrink:0}}>{task.emoji||"✨"}</div>
                <div style={{flex:1}}>
                  <div style={{color:isDone?"#86efac":"#fff",fontWeight:700,fontSize:15,textDecoration:isDone?"line-through":"none"}}>{task.name}</div>
                  <div style={{color:"#a5b4fc",fontSize:12}}>{catEmoji(task.category)} {task.category} · {task.points} Pkt · {task.recurrence==="daily"?"täglich":task.recurrence==="weekly"?"wöchentlich":"einmalig"}</div>
                  {todayComps.length>0&&<div style={{color:"#86efac",fontSize:11,marginTop:2}}>✓ {todayComps.map(c=>c.memberName).join(", ")}</div>}
                </div>
                {isDone
                  ? <button onClick={()=>undoTask(task.id)} style={{...S.btn("#374151","#fff","6px 10px"),fontSize:12,flexShrink:0}}>↩️</button>
                  : <button onClick={()=>completeTask(task)} style={{...S.btn("#6366f1","#fff","6px 14px"),fontSize:15,flexShrink:0}}>+{task.points}</button>
                }
              </div>
            );
          })}
          {active && filtered.filter(t=>!t.assignedTo?.length||t.assignedTo.includes(active.id)).length===0 && (
            <div style={{textAlign:"center",padding:"20px",color:"#a5b4fc",fontSize:14}}>Keine Aufgaben in dieser Kategorie</div>
          )}
        </div>
      </div>
    );
  };

  // ─── REWARDS SCREEN ───
  const Rewards = () => {
    const myRewards = active ? data.rewards.filter(r=>!r.assignedTo?.length||r.assignedTo.includes(active.id)) : [];
    return (
      <div style={{padding:12}}>
        <h2 style={S.h2}>🎁 Belohnungen</h2>
        {!active && <div style={{textAlign:"center",padding:20,color:"#a5b4fc"}}>Wähle oben ein Familienmitglied</div>}
        {active && (
          <div style={{...S.card("#312e81"),display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <div>
              <div style={{color:"#fff",fontWeight:700}}>{active.name}</div>
              <div style={{color:"#a5b4fc",fontSize:13}}>Verfügbare Punkte</div>
            </div>
            <div style={{color:"#f59e0b",fontSize:28,fontWeight:800}}>{avail(active.id)}</div>
          </div>
        )}
        {myRewards.map(r=>(
          <div key={r.id} style={{...S.card(),display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:32}}>{r.emoji||"🎁"}</div>
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{r.name}</div>
              <div style={{color:"#f59e0b",fontWeight:600,fontSize:13}}>{r.pointsCost} Punkte</div>
            </div>
            {active && <button onClick={()=>redeemReward(r)} style={{...S.btn(avail(active.id)>=r.pointsCost?"#6366f1":"#374151","#fff","8px 14px"),fontSize:13,opacity:avail(active.id)>=r.pointsCost?1:0.5}}>Einlösen</button>}
          </div>
        ))}
        {active && myRewards.length===0 && <div style={{textAlign:"center",padding:20,color:"#a5b4fc"}}>Noch keine Belohnungen. Im Verwaltungsbereich hinzufügen.</div>}
      </div>
    );
  };

  // ─── STATS SCREEN ───
  const Stats = () => {
    const sorted = [...data.members].sort((a,b)=>weekPts(b.id)-weekPts(a.id));
    const sortedMonth = [...data.members].sort((a,b)=>monthPts(b.id)-monthPts(a.id));
    const sortedAll = [...data.members].sort((a,b)=>pts(b.id)-pts(a.id));
    const maxWk = Math.max(...data.members.map(m=>weekPts(m.id)),1);
    const last7 = Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-6+i);
      return {label:dayName(d), date:isoDate(d), members:data.members.map(m=>({id:m.id,color:MEMBER_COLORS[data.members.indexOf(m)%6],pts:pts(m.id,data.completions.filter(c=>isoDate(c.date)===isoDate(d)&&c.memberId===m.id&&c.confirmed!==false))}))};
    });
    const maxBar = Math.max(...last7.map(d=>d.members.reduce((s,m)=>s+m.pts,0)),1);
    const prevWk = data.completions.filter(c=>new Date(c.date)>=prevWeekStart()&&new Date(c.date)<=prevWeekEnd());
    const prevChamp = data.members.map(m=>({...m,pw:pts(m.id,prevWk)})).sort((a,b)=>b.pw-a.pw)[0];
    const rankList = statsView==="week"?sorted:statsView==="month"?sortedMonth:sortedAll;
    const rankPts = (m) => statsView==="week"?weekPts(m.id):statsView==="month"?monthPts(m.id):pts(m.id);
    return (
      <div style={{padding:12}}>
        <h2 style={S.h2}>📊 Statistiken</h2>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          {["week","month","all"].map(v=>(
            <button key={v} onClick={()=>setStatsView(v)} style={{...S.btn(statsView===v?"#6366f1":"#2d2b6b","#fff","8px 14px"),flex:1,fontSize:13}}>
              {v==="week"?"Woche":v==="month"?"Monat":"Gesamt"}
            </button>
          ))}
        </div>
        {/* Ranking */}
        {rankList.map((m,i)=>(
          <button key={m.id} onClick={()=>setDetailMember(m.id)} style={{...S.card(),width:"100%",display:"flex",alignItems:"center",gap:10,textAlign:"left",cursor:"pointer",boxSizing:"border-box",border:"none"}}>
            <div style={{color:i===0?"#f59e0b":i===1?"#94a3b8":i===2?"#b45309":"#6366f1",fontSize:i<3?24:16,fontWeight:800,width:28,textAlign:"center"}}>{i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`}</div>
            {Avatar(m,36)}
            <div style={{flex:1}}>
              <div style={{color:"#fff",fontWeight:700,fontSize:15}}>{m.name}</div>
              <div style={{background:"#1e1b4b",borderRadius:6,height:6,marginTop:4,overflow:"hidden"}}>
                <div style={{background:"#6366f1",height:"100%",width:`${(rankPts(m)/Math.max(rankPts(rankList[0]),1))*100}%`,borderRadius:6,transition:"width .5s"}}/>
              </div>
            </div>
            <div style={{color:"#f59e0b",fontWeight:800,fontSize:18}}>{rankPts(m)}</div>
          </button>
        ))}
        {/* 7-day stacked bar chart */}
        <div style={{...S.card(),marginTop:8}}>
          <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:10}}>LETZTE 7 TAGE</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:4,height:80}}>
            {last7.map((d,i)=>{
              const total = d.members.reduce((s,m)=>s+m.pts,0);
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <div style={{width:"100%",display:"flex",flexDirection:"column-reverse",borderRadius:4,overflow:"hidden",height:`${(total/maxBar)*72}px`,minHeight:total?4:0}}>
                    {d.members.filter(m=>m.pts>0).map(m=>(
                      <div key={m.id} style={{background:m.color,height:`${(m.pts/total)*100}%`,minHeight:2}}/>
                    ))}
                  </div>
                  <span style={{color:"#a5b4fc",fontSize:10}}>{d.label}</span>
                </div>
              );
            })}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
            {data.members.map((m,i)=>(
              <span key={m.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:"#c7d2fe"}}>
                <span style={{width:8,height:8,borderRadius:2,background:MEMBER_COLORS[i%6],display:"inline-block"}}/>
                {m.name}
              </span>
            ))}
          </div>
        </div>
        {prevChamp?.pw>0 && (
          <div style={{...S.card("#312e81")}}>
            <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:4}}>VORWOCHE</div>
            <div style={{color:"#fff",fontWeight:700}}>🏆 {prevChamp.name} – {prevChamp.pw} Punkte</div>
          </div>
        )}
      </div>
    );
  };

  // ─── ADMIN SCREEN ───
  const Admin = () => {
    if (!adminUnlocked) {
      return (
        <div style={{padding:20,textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:16}}>🔐</div>
          <h2 style={S.h2}>Admin-Bereich</h2>
          <p style={{color:"#a5b4fc",fontSize:14}}>PIN eingeben</p>
          <input style={{...S.input,textAlign:"center",fontSize:24,letterSpacing:8,marginBottom:12}} type="password" maxLength={6} value={pinInput} onChange={e=>setPinInput(e.target.value)} placeholder="••••"/>
          <button style={{...S.btn(),width:"100%"}} onClick={()=>{
            if (pinInput===data.adminPin) { setAdminUnlocked(true); setPinInput(""); }
            else { flash("Falscher PIN ❌"); setPinInput(""); }
          }}>Entsperren</button>
        </div>
      );
    }

    const tabs = [{id:"members",label:"👥 Mitglieder"},{id:"tasks",label:`✅ Aufgaben${pendingConfirm.length?` (${pendingConfirm.length})`:""}`},{id:"rewards",label:`🎁 Belohnungen${unreadNotifs.length?` 🔔${unreadNotifs.length}`:""}`},{id:"settings",label:"⚙️ Einstellungen"}];

    return (
      <div style={{padding:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h2 style={{...S.h2,margin:0}}>Verwaltung</h2>
          <button onClick={()=>setAdminUnlocked(false)} style={{...S.btn("#1e1b4b","#a5b4fc","6px 12px"),fontSize:12}}>🔒 Sperren</button>
        </div>

        <div style={{display:"flex",gap:4,overflowX:"auto",marginBottom:12,paddingBottom:4}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setAdminTab(t.id)} style={{...S.btn(adminTab===t.id?"#6366f1":"#2d2b6b","#fff","8px 12px"),flexShrink:0,fontSize:12,whiteSpace:"nowrap"}}>{t.label}</button>
          ))}
        </div>

        {/* MEMBERS TAB */}
        {adminTab==="members" && (
          <div>
            {data.members.map(m=>(
              <div key={m.id} style={{...S.card(),display:"flex",alignItems:"center",gap:10}}>
                {Avatar(m,40)}
                <div style={{flex:1}}>
                  <div style={{color:"#fff",fontWeight:700}}>{m.name}{m.isAdmin?" 👑":""}</div>
                  <div style={{color:"#a5b4fc",fontSize:12}}>Gesamt: {pts(m.id)} · Woche: {weekPts(m.id)} · Verfügbar: {avail(m.id)}</div>
                </div>
                <button onClick={()=>setEditMember(m)} style={{...S.btn("#1e1b4b","#a5b4fc","8px 12px"),fontSize:13}}>✏️</button>
              </div>
            ))}
            <button style={{...S.btn(),width:"100%"}} onClick={()=>setEditMember("new")}>+ Mitglied hinzufügen</button>
          </div>
        )}

        {/* TASKS TAB */}
        {adminTab==="tasks" && (
          <div>
            {/* Category manager button */}
            <button style={{...S.btn("#312e81","#a5b4fc"),width:"100%",marginBottom:12}} onClick={()=>setShowCategoryMgr(true)}>
              📂 Kategorien verwalten ({(data.categories||DEFAULT_CATEGORIES).length})
            </button>
            {/* Pending confirmations */}
            {pendingConfirm.length>0 && (
              <div style={{...S.card("#312e81"),marginBottom:12}}>
                <div style={{color:"#f59e0b",fontWeight:700,marginBottom:8}}>⏳ Ausstehende Bestätigungen ({pendingConfirm.length})</div>
                {pendingConfirm.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                    <div style={{flex:1}}>
                      <div style={{color:"#fff",fontSize:13,fontWeight:600}}>{c.memberName}: {c.taskName}</div>
                      <div style={{color:"#a5b4fc",fontSize:11}}>{fmtDate(c.date)} · {c.points} Pkt</div>
                    </div>
                    <button onClick={()=>confirmC(c.id)} style={{...S.btn("#10b981","#fff","6px 10px"),fontSize:12}}>✓</button>
                    <button onClick={()=>rejectC(c.id)} style={{...S.btn("#ef4444","#fff","6px 10px"),fontSize:12}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {data.tasks.map(t=>(
              <div key={t.id} style={{...S.card(),display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:24}}>{t.emoji||"✨"}</span>
                <div style={{flex:1}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:14}}>{t.name}</div>
                  <div style={{color:"#a5b4fc",fontSize:12}}>{catEmoji(t.category)} {t.category} · {t.points} Pkt</div>
                </div>
                <button onClick={()=>setEditTask(t)} style={{...S.btn("#1e1b4b","#a5b4fc","8px 12px"),fontSize:13}}>✏️</button>
              </div>
            ))}
            <button style={{...S.btn(),width:"100%",marginTop:4}} onClick={()=>setEditTask("new")}>+ Aufgabe hinzufügen</button>
          </div>
        )}

        {/* REWARDS TAB */}
        {adminTab==="rewards" && (
          <div>
            {/* Notifications */}
            {(data.notifications||[]).length>0 && (
              <div style={{...S.card("#312e81"),marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{color:"#f59e0b",fontWeight:700}}>🔔 Einlösungen {unreadNotifs.length>0&&<span style={{background:"#ef4444",color:"#fff",borderRadius:99,fontSize:11,padding:"1px 7px",marginLeft:4}}>{unreadNotifs.length}</span>}</div>
                  {unreadNotifs.length>0&&<button onClick={()=>update(prev=>({...prev,notifications:(prev.notifications||[]).map(n=>({...n,read:true}))}))} style={{...S.btn("#1e1b4b","#a5b4fc","4px 10px"),fontSize:11}}>Alle gelesen</button>}
                </div>
                {(data.notifications||[]).slice().reverse().slice(0,10).map(n=>(
                  <div key={n.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,opacity:n.read?0.6:1}}>
                    <span style={{fontSize:22}}>{n.rewardEmoji||"🎁"}</span>
                    <div style={{flex:1}}>
                      <div style={{color:"#fff",fontSize:13,fontWeight:600}}>{n.memberName} hat „{n.rewardName}" eingelöst</div>
                      <div style={{color:"#a5b4fc",fontSize:11}}>{fmtDate(n.date)} · {n.pointsCost} Pkte</div>
                    </div>
                    {!n.read&&<div style={{width:8,height:8,borderRadius:"50%",background:"#ef4444",flexShrink:0}}/>}
                  </div>
                ))}
              </div>
            )}
            {data.rewards.map(r=>(
              <div key={r.id} style={{...S.card(),display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:28}}>{r.emoji||"🎁"}</span>
                <div style={{flex:1}}>
                  <div style={{color:"#fff",fontWeight:700,fontSize:14}}>{r.name}</div>
                  <div style={{color:"#f59e0b",fontSize:12,fontWeight:600}}>{r.pointsCost} Punkte{r.assignedTo?.length?` · ${r.assignedTo.map(id=>data.members.find(m=>m.id===id)?.name).join(", ")}`:" · Alle"}</div>
                </div>
                <button onClick={()=>setEditReward(r)} style={{...S.btn("#1e1b4b","#a5b4fc","8px 12px"),fontSize:13}}>✏️</button>
              </div>
            ))}
            <button style={{...S.btn(),width:"100%",marginTop:4}} onClick={()=>setEditReward("new")}>+ Belohnung hinzufügen</button>
          </div>
        )}

        {/* SETTINGS TAB */}
        {adminTab==="settings" && (
          <div>
            <div style={S.card()}>
              <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:8}}>ELTERN-BESTÄTIGUNG</div>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <div onClick={()=>update(prev=>({...prev,needsConfirmation:!prev.needsConfirmation}))}
                  style={{width:48,height:26,borderRadius:13,background:data.needsConfirmation?"#6366f1":"#374151",position:"relative",transition:"background .2s",flexShrink:0}}>
                  <div style={{position:"absolute",top:3,left:data.needsConfirmation?24:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
                </div>
                <span style={{color:"#fff",fontSize:14}}>Kinder brauchen Bestätigung</span>
              </label>
            </div>
            <div style={S.card()}>
              <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:8}}>ADMIN-PIN ÄNDERN</div>
              <PinChanger/>
            </div>
            <div style={S.card()}>
              <div style={{color:"#a5b4fc",fontSize:12,fontWeight:600,marginBottom:8}}>DATEN</div>
              <button style={{...S.btn("#ef4444","#fff"),width:"100%"}} onClick={()=>{
                if (window.confirm("Alle Aufgaben-Erledigungen dieser Woche löschen?")) {
                  update(prev=>({...prev,completions:prev.completions.filter(c=>new Date(c.date)<weekStart())}));
                  flash("Woche zurückgesetzt ✓");
                }
              }}>🗑️ Woche zurücksetzen</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── PIN CHANGER (inline to avoid remount) ───
  const PinChanger = () => {
    const [newPin, setNewPin] = useState("");
    return (
      <div style={{display:"flex",gap:8}}>
        <input style={{...S.input,flex:1}} type="password" placeholder="Neuer PIN" value={newPin} onChange={e=>setNewPin(e.target.value)} maxLength={8}/>
        <button style={S.btn()} onClick={()=>{if(newPin.length>=4){update(prev=>({...prev,adminPin:newPin}));setNewPin("");flash("PIN geändert ✓");}else flash("Mind. 4 Zeichen");}}>OK</button>
      </div>
    );
  };

  // ─── BOTTOM NAV ───
  const Nav = () => (
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:"#0f0d2e",borderTop:"1px solid #312e81",display:"flex",zIndex:100}}>
      {[
        {id:"home",icon:"🏠",label:"Aufgaben"},
        {id:"rewards",icon:"🎁",label:"Belohnungen"},
        {id:"stats",icon:"📊",label:"Rangliste"},
        {id:"admin",icon:"⚙️",label:`Verwalten${unreadNotifs.length?` 🔴`:""}${pendingConfirm.length?` (${pendingConfirm.length})`:""}`},
      ].map(t=>(
        <button key={t.id} onClick={()=>setScreen(t.id)} style={{flex:1,background:"none",border:"none",padding:"10px 4px",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <span style={{fontSize:20}}>{t.icon}</span>
          <span style={{color:screen===t.id?"#f59e0b":"#6366f1",fontSize:10,fontWeight:700}}>{t.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes cFall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
        @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        button:active{transform:scale(0.96)}
        input:focus{outline:none;border-color:#6366f1!important}
        select:focus{outline:none;}
        ::-webkit-scrollbar{display:none}
      `}</style>
      {screen==="home" && Home()}
      {screen==="rewards" && Rewards()}
      {screen==="stats" && Stats()}
      {screen==="admin" && Admin()}
      {Nav()}
      {Confetti({show:confetti})}
      {TaskModal()}
      {MemberModal()}
      {RewardModal()}
      {CategoryManagerModal()}
      {DetailMemberModal()}
      {toast && <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"#fff",padding:"10px 20px",borderRadius:14,fontSize:15,fontWeight:700,zIndex:300,fontFamily:"'Fredoka',sans-serif",boxShadow:"0 4px 20px rgba(0,0,0,0.2)",maxWidth:"80%",textAlign:"center"}}>{toast}</div>}
    </div>
  );
}
