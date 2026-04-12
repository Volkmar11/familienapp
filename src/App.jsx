import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE (Echtzeit-Sync für alle Familiengeräte) ───
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
const ROW_ID = "family-main";

const save = async (data) => {
  try {
    await supabase.from("app_state").upsert({
      id: ROW_ID,
      data: data,
      updated_at: new Date().toISOString(),
    });
  } catch (e) { console.error("Speichern fehlgeschlagen:", e); }
};

const load = async () => {
  try {
    const { data: row } = await supabase
      .from("app_state")
      .select("data")
      .eq("id", ROW_ID)
      .single();
    return row?.data || null;
  } catch { return null; }
};

const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const isoDate = (d) => new Date(d).toISOString().slice(0,10);
const today = () => isoDate(new Date());
const weekStart = (d = new Date()) => { const dd = new Date(d); const day = dd.getDay(); dd.setDate(dd.getDate() - day + (day===0?-6:1)); dd.setHours(0,0,0,0); return dd; };
const monthStart = (d = new Date()) => { const dd = new Date(d); dd.setDate(1); dd.setHours(0,0,0,0); return dd; };
const dayName = (d) => ["So","Mo","Di","Mi","Do","Fr","Sa"][new Date(d).getDay()];
const fmtDate = (d) => new Date(d).toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"});

const CATEGORIES = ["Ordnung","Küche","Haushalt","Garten","Sonstiges"];
const CATEGORY_EMOJI = {Ordnung:"🧹",Küche:"🍳",Haushalt:"🏠",Garten:"🌱",Sonstiges:"📦"};

const BADGES = [
  { id:"b1", name:"Erste Schritte", emoji:"🌟", desc:"Erste Aufgabe erledigt", check: (c) => c.length >= 1 },
  { id:"b2", name:"Fleißige Biene", emoji:"🐝", desc:"10 Aufgaben erledigt", check: (c) => c.length >= 10 },
  { id:"b3", name:"Superheld", emoji:"🦸", desc:"50 Aufgaben erledigt", check: (c) => c.length >= 50 },
  { id:"b4", name:"Ordnungsprofi", emoji:"✨", desc:"100 Punkte in Ordnung", check: (c,tasks) => c.filter(x=>{const t=tasks.find(tt=>tt.id===x.taskId);return t?.category==="Ordnung"}).reduce((s,x)=>s+x.points,0)>=100 },
  { id:"b5", name:"Küchenchef", emoji:"👨‍🍳", desc:"50 Punkte in Küche", check: (c,tasks) => c.filter(x=>{const t=tasks.find(tt=>tt.id===x.taskId);return t?.category==="Küche"}).reduce((s,x)=>s+x.points,0)>=50 },
  { id:"b6", name:"Gärtner", emoji:"🌻", desc:"50 Punkte im Garten", check: (c,tasks) => c.filter(x=>{const t=tasks.find(tt=>tt.id===x.taskId);return t?.category==="Garten"}).reduce((s,x)=>s+x.points,0)>=50 },
  { id:"b7", name:"3-Tage-Streak", emoji:"🔥", desc:"3 Tage am Stück aktiv", check: (c) => getMaxStreak(c)>=3 },
  { id:"b8", name:"7-Tage-Streak", emoji:"💎", desc:"7 Tage am Stück aktiv", check: (c) => getMaxStreak(c)>=7 },
  { id:"b9", name:"Wochenchampion", emoji:"🏆", desc:"Einmal Wochenchampion", check: (c,tasks,data,mid) => (data.championHistory||[]).some(h=>h.memberId===mid) },
  { id:"b10", name:"100er Club", emoji:"💯", desc:"100 Punkte in einer Woche", check: (c) => { const ws=weekStart(); return c.filter(x=>new Date(x.date)>=ws).reduce((s,x)=>s+x.points,0)>=100; }},
];

function getMaxStreak(completions) {
  if (!completions.length) return 0;
  const days = [...new Set(completions.map(c=>isoDate(c.date)))].sort();
  let max=1, cur=1;
  for (let i=1;i<days.length;i++) {
    const prev=new Date(days[i-1]); const curr=new Date(days[i]);
    if ((curr-prev)/(1000*60*60*24)===1) { cur++; max=Math.max(max,cur); } else cur=1;
  }
  return Math.max(max,cur);
}

function getCurrentStreak(completions) {
  if (!completions.length) return 0;
  const days = [...new Set(completions.map(c=>isoDate(c.date)))].sort().reverse();
  const t = today();
  if (days[0]!==t && days[0]!==isoDate(new Date(Date.now()-86400000))) return 0;
  let streak=1;
  for (let i=1;i<days.length;i++) {
    const prev=new Date(days[i-1]); const curr=new Date(days[i]);
    if ((prev-curr)/(1000*60*60*24)===1) streak++; else break;
  }
  return streak;
}

const DEFAULT_TASKS = [
  {id:"t1",name:"Schuhe aufräumen",emoji:"👟",points:5,category:"Ordnung",recurring:"daily"},
  {id:"t2",name:"Jacke aufhängen",emoji:"🧥",points:5,category:"Ordnung",recurring:"daily"},
  {id:"t3",name:"Zimmer aufräumen",emoji:"🛏️",points:15,category:"Ordnung",recurring:"daily"},
  {id:"t4",name:"Spielzeug wegräumen",emoji:"🧸",points:10,category:"Ordnung",recurring:"daily"},
  {id:"t5",name:"Wohnzimmer aufräumen",emoji:"🛋️",points:15,category:"Ordnung",recurring:"daily"},
  {id:"t6",name:"Spülmaschine einräumen",emoji:"🍽️",points:15,category:"Küche",recurring:"daily"},
  {id:"t7",name:"Spülmaschine ausräumen",emoji:"✨",points:15,category:"Küche",recurring:"daily"},
  {id:"t8",name:"Tisch decken",emoji:"🍴",points:10,category:"Küche",recurring:"daily"},
  {id:"t9",name:"Müll rausbringen",emoji:"🗑️",points:10,category:"Haushalt",recurring:"weekly"},
  {id:"t10",name:"Saugen",emoji:"🧹",points:20,category:"Haushalt",recurring:"weekly"},
  {id:"t11",name:"Wäsche wegräumen",emoji:"👕",points:15,category:"Haushalt",recurring:"weekly"},
  {id:"t12",name:"Fahrradhelm aufräumen",emoji:"⛑️",points:5,category:"Ordnung",recurring:"daily"},
  {id:"t13",name:"Gartenarbeit",emoji:"🌱",points:20,category:"Garten",recurring:"weekly"},
  {id:"t14",name:"Grünstreifen umgraben",emoji:"⛏️",points:25,category:"Garten",recurring:"once"},
];

const DEFAULT_MEMBERS = [
  {id:"m1",name:"Papa",color:"#2563eb",isAdmin:true,emoji:"👨"},
  {id:"m2",name:"Mama",color:"#dc2626",isAdmin:true,emoji:"👩"},
  {id:"m3",name:"Marlon",color:"#16a34a",isAdmin:false,emoji:"🧑"},
  {id:"m4",name:"Clara",color:"#eab308",isAdmin:false,emoji:"👧"},
  {id:"m5",name:"Jonah",color:"#f97316",isAdmin:false,emoji:"👶"},
];

const DEFAULT_DATA = {
  members: DEFAULT_MEMBERS, tasks: DEFAULT_TASKS, completions: [], rewards: [
    {id:"r1",name:"Eis essen gehen",pointsCost:100,emoji:"🍦"},
    {id:"r2",name:"30 Min extra Bildschirmzeit",pointsCost:80,emoji:"📱"},
    {id:"r3",name:"Wunschessen",pointsCost:150,emoji:"🍕"},
    {id:"r4",name:"Ausflug wählen",pointsCost:300,emoji:"🎢"},
  ], redeemedRewards: [], adminPin:"1234", championHistory: [], needsConfirmation: true,
};

function Confetti({show}){
  if(!show) return null;
  return <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999}}>
    {Array.from({length:35},(_,i)=>({i,x:Math.random()*100,d:Math.random()*0.6,c:["#fbbf24","#f472b6","#34d399","#60a5fa","#f87171","#a78bfa","#fb923c"][i%7],s:5+Math.random()*7})).map(p=>
      <div key={p.i} style={{position:"absolute",left:`${p.x}%`,top:"-12px",width:p.s,height:p.s,borderRadius:p.s>8?"50%":"2px",background:p.c,animation:`cFall 1.8s ease-out ${p.d}s forwards`}}/>
    )}
  </div>;
}

export default function App(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [screen,setScreen]=useState("home");
  const [active,setActive]=useState(null);
  const [adminMode,setAdminMode]=useState(false);
  const [pin,setPin]=useState("");
  const [confetti,setConfetti]=useState(false);
  const [toast,setToast]=useState(null);
  const [filter,setFilter]=useState("Alle");
  const [editTask,setEditTask]=useState(null);
  const [editMember,setEditMember]=useState(null);
  const [editReward,setEditReward]=useState(null);
  const [selectedStat,setSelectedStat]=useState(null);

  useEffect(()=>{(async()=>{const s=await load();setData(s||{...DEFAULT_DATA});setLoading(false);})();},[]);

  // Echtzeit-Sync: wenn jemand auf einem anderen Gerät etwas ändert
  useEffect(()=>{
    const channel = supabase
      .channel("app_state_changes")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "app_state", filter: `id=eq.${ROW_ID}` },
        (payload) => {
          if (payload.new?.data) {
            setData(payload.new.data);
          }
        }
      )
      .subscribe();
    return ()=>{ supabase.removeChannel(channel); };
  },[]);

  const update=useCallback((fn)=>{
    setData(prev=>{const next=fn(prev);save(next);return next;});
  },[]);

  const flash=(msg)=>{setToast(msg);setTimeout(()=>setToast(null),2200);};
  const boom=()=>{setConfetti(true);setTimeout(()=>setConfetti(false),2200);};

  if(loading||!data) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#fef9ef",fontFamily:"'Fredoka',sans-serif"}}><div style={{fontSize:52,animation:"spin 1s linear infinite"}}>🏠</div></div>;

  const ws=weekStart(), ms=monthStart();
  const weekC=data.completions.filter(c=>new Date(c.date)>=ws);
  const monthC=data.completions.filter(c=>new Date(c.date)>=ms);
  const pts=(mid,arr=data.completions)=>arr.filter(c=>c.memberId===mid&&c.confirmed!==false).reduce((s,c)=>s+c.points,0);
  const weekPts=(mid)=>pts(mid,weekC);
  const monthPts=(mid)=>pts(mid,monthC);
  const redeemed=(mid)=>(data.redeemedRewards||[]).filter(r=>r.memberId===mid).reduce((s,r)=>s+r.pointsCost,0);
  const avail=(mid)=>pts(mid)-redeemed(mid);
  const mc=(mid)=>data.completions.filter(c=>c.memberId===mid&&c.confirmed!==false);

  const pendingConfirm=data.completions.filter(c=>c.needsConfirm&&!c.confirmed);

  const champData=data.members.map(m=>({...m,wp:weekPts(m.id)})).sort((a,b)=>b.wp-a.wp);
  const champ=champData[0]?.wp>0?champData[0]:null;

  const categories=["Alle",...new Set(data.tasks.map(t=>t.category))];
  const filtered=filter==="Alle"?data.tasks:data.tasks.filter(t=>t.category===filter);

  const todayCompForTask=(tid)=>data.completions.filter(c=>c.taskId===tid&&isoDate(c.date)===today());

  const completeTask=(task)=>{
    if(!active) return;
    const needsC=data.needsConfirmation&&!active.isAdmin;
    update(prev=>({...prev,completions:[...prev.completions,{
      id:uid(),taskId:task.id,taskName:task.name,memberId:active.id,memberName:active.name,memberEmoji:active.emoji,
      points:task.points,date:new Date().toISOString(),needsConfirm:needsC,confirmed:!needsC,category:task.category,
    }]}));
    const nw=weekPts(active.id)+task.points;
    if((nw>=50&&weekPts(active.id)<50)||(nw>=100&&weekPts(active.id)<100)) boom();
    flash(`+${task.points} ⭐ ${active.name}!${needsC?" (wartet auf Bestätigung)":""}`);
  };

  const confirmC=(cid)=>{update(prev=>({...prev,completions:prev.completions.map(c=>c.id===cid?{...c,confirmed:true,needsConfirm:false}:c)}));flash("✅ Bestätigt!");};
  const rejectC=(cid)=>{update(prev=>({...prev,completions:prev.completions.filter(c=>c.id!==cid)}));flash("❌ Abgelehnt");};

  const redeemReward=(reward)=>{
    if(!active) return;
    const a=avail(active.id);
    if(a<reward.pointsCost){flash(`Nicht genug! (${a}/${reward.pointsCost})`);return;}
    update(prev=>({...prev,redeemedRewards:[...(prev.redeemedRewards||[]),{id:uid(),rewardId:reward.id,rewardName:reward.name,memberId:active.id,pointsCost:reward.pointsCost,date:new Date().toISOString()}]}));
    boom();flash(`🎉 ${reward.name} eingelöst!`);
  };

  const daysActive=(mid)=>{const d=new Set(mc(mid).map(c=>isoDate(c.date)));return d.size||1;};
  const avgDay=(mid)=>Math.round(pts(mid)/daysActive(mid)*10)/10;
  const avgWeek=(mid)=>{const all=mc(mid);if(!all.length)return 0;const first=new Date(all[0].date);const w=Math.max(1,Math.ceil((Date.now()-first.getTime())/(7*86400000)));return Math.round(pts(mid)/w*10)/10;};

  const S={
    app:{fontFamily:"'Fredoka',sans-serif",background:"linear-gradient(160deg,#fef9ef 0%,#fde8d0 50%,#e0f2fe 100%)",minHeight:"100vh",maxWidth:480,margin:"0 auto",position:"relative",paddingBottom:90},
    hdr:{background:"linear-gradient(135deg,#f59e0b 0%,#f97316 100%)",color:"#fff",padding:"20px 20px 16px",borderRadius:"0 0 28px 28px",boxShadow:"0 4px 20px rgba(249,115,22,0.3)"},
    nav:{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:"#fff",display:"flex",justifyContent:"space-around",padding:"8px 0 env(safe-area-inset-bottom,12px)",boxShadow:"0 -2px 20px rgba(0,0,0,0.08)",borderRadius:"20px 20px 0 0",zIndex:100},
    navB:(a)=>({display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",fontSize:11,color:a?"#f97316":"#94a3b8",fontWeight:a?700:500,fontFamily:"inherit",cursor:"pointer",padding:"4px 12px",position:"relative"}),
    card:{background:"#fff",borderRadius:20,padding:16,margin:"12px 16px",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"},
    taskBtn:{display:"flex",alignItems:"center",gap:12,background:"#fff",border:"2px solid #fed7aa",borderRadius:16,padding:"12px 14px",width:"100%",cursor:"pointer",fontFamily:"inherit",fontSize:15,transition:"all 0.15s",textAlign:"left",marginBottom:8},
    badge:(c="#fbbf24")=>({display:"inline-flex",alignItems:"center",justifyContent:"center",background:c,color:"#fff",borderRadius:99,padding:"2px 10px",fontSize:13,fontWeight:700}),
    pill:(c,a)=>({display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"8px 14px",borderRadius:16,background:a?c+"18":"#f1f5f9",border:a?`2.5px solid ${c}`:"2.5px solid transparent",cursor:"pointer",transition:"all 0.15s",minWidth:66}),
    btn:(bg="#f97316")=>({background:bg,color:"#fff",border:"none",borderRadius:14,padding:"12px 24px",fontSize:16,fontWeight:700,fontFamily:"inherit",cursor:"pointer",width:"100%",transition:"all 0.15s"}),
    inp:{width:"100%",padding:"10px 14px",borderRadius:12,border:"2px solid #e2e8f0",fontSize:15,fontFamily:"inherit",boxSizing:"border-box"},
    tag:(a)=>({padding:"6px 14px",borderRadius:99,border:"none",background:a?"#f97316":"#f1f5f9",color:a?"#fff":"#64748b",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}),
    statBox:{background:"#fff",borderRadius:16,padding:"12px 14px",flex:1,textAlign:"center",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"},
    bar:{height:8,background:"#f1f5f9",borderRadius:99,overflow:"hidden",marginTop:4},
    barF:(pct,c)=>({height:"100%",width:`${Math.min(pct,100)}%`,background:c,borderRadius:99,transition:"width 0.6s ease"}),
  };

  const Nav=()=>(
    <div style={S.nav}>
      {[{id:"home",e:"🏠",l:"Home"},{id:"rewards",e:"🎁",l:"Belohnungen"},{id:"stats",e:"📊",l:"Statistik"},{id:"admin",e:"⚙️",l:"Verwalten"}].map(n=>(
        <button key={n.id} onClick={()=>{setScreen(n.id);setSelectedStat(null);if(n.id!=="admin")setAdminMode(false);}} style={S.navB(screen===n.id)}>
          <span style={{fontSize:22}}>{n.e}</span>{n.l}
          {n.id==="admin"&&pendingConfirm.length>0&&<span style={{position:"absolute",top:0,right:6,background:"#ef4444",color:"#fff",borderRadius:99,width:18,height:18,fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{pendingConfirm.length}</span>}
        </button>
      ))}
    </div>
  );

  // ── HOME ──
  const Home=()=>(
    <>
      <div style={S.hdr}>
        <div style={{fontSize:13,opacity:0.85,marginBottom:4}}>Familien-Haushaltshilfe</div>
        <div style={{fontSize:24,fontWeight:800}}>🏠 Wer hilft heute?</div>
        {champ&&<div style={{marginTop:10,background:"rgba(255,255,255,0.2)",borderRadius:14,padding:"8px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:22}}>🏆</span><span style={{fontSize:14}}><b>Wochenchampion:</b> {champ.emoji} {champ.name} ({champ.wp} ⭐)</span>
        </div>}
      </div>

      <div style={{padding:"16px 16px 0",overflowX:"auto"}}>
        <div style={{display:"flex",gap:10}}>
          {data.members.map(m=>{
            const streak=getCurrentStreak(mc(m.id));
            return <div key={m.id} onClick={()=>setActive(m)} style={S.pill(m.color,active?.id===m.id)}>
              <span style={{fontSize:28}}>{m.emoji}</span>
              <span style={{fontSize:12,fontWeight:700,color:active?.id===m.id?m.color:"#64748b"}}>{m.name}</span>
              <span style={{...S.badge(m.color),fontSize:11,padding:"1px 8px"}}>{weekPts(m.id)} ⭐</span>
              {streak>=2&&<span style={{fontSize:10,color:"#f97316"}}>🔥{streak}d</span>}
            </div>;
          })}
        </div>
      </div>

      {!active&&<div style={{...S.card,textAlign:"center",padding:32}}><div style={{fontSize:48,marginBottom:8}}>👆</div><div style={{fontSize:16,color:"#94a3b8"}}>Wähle oben dein Profil!</div></div>}

      {active&&<>
        <div style={{padding:"12px 16px 4px",display:"flex",gap:6,overflowX:"auto",flexWrap:"nowrap"}}>
          {categories.map(c=><button key={c} onClick={()=>setFilter(c)} style={S.tag(filter===c)}>{c}</button>)}
        </div>

        <div style={{padding:"8px 16px"}}>
          {filtered.map(task=>{
            const todayAll=todayCompForTask(task.id);
            const myDone=todayAll.some(c=>c.memberId===active.id);
            const othersDone=todayAll.filter(c=>c.memberId!==active.id);
            const pending=todayAll.find(c=>c.memberId===active.id&&c.needsConfirm&&!c.confirmed);
            return <button key={task.id} onClick={()=>completeTask(task)}
              style={{...S.taskBtn,background:myDone?"#f0fdf4":"#fff",borderColor:pending?"#fbbf24":myDone?"#86efac":"#fed7aa"}}>
              <span style={{fontSize:28,width:40,textAlign:"center"}}>{task.emoji}</span>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:"#1e293b",display:"flex",alignItems:"center",gap:6}}>
                  {task.name}
                  {task.recurring&&task.recurring!=="once"&&<span style={{fontSize:10,background:"#ede9fe",color:"#7c3aed",borderRadius:6,padding:"1px 5px"}}>{task.recurring==="daily"?"tägl.":"wöch."}</span>}
                </div>
                <div style={{fontSize:12,color:"#94a3b8",display:"flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                  {task.category}
                  {othersDone.length>0&&<>
                    <span style={{margin:"0 2px"}}>·</span>
                    {othersDone.map(c=>{const m=data.members.find(mm=>mm.id===c.memberId);return <span key={c.id} title={m?.name} style={{fontSize:14}}>{m?.emoji}</span>;})}
                    <span style={{fontSize:11,color:"#22c55e"}}>✓ erledigt</span>
                  </>}
                </div>
              </div>
              <div style={S.badge(pending?"#fbbf24":myDone?"#22c55e":"#fbbf24")}>
                {pending?"⏳":myDone?"✓":`+${task.points}`}
              </div>
            </button>;
          })}
        </div>

        <div style={S.card}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>🏅 Abzeichen</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {BADGES.map(b=>{
              const earned=b.check(mc(active.id),data.tasks,data,active.id);
              return <div key={b.id} title={b.desc} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 6px",borderRadius:12,background:earned?"#fef3c7":"#f8fafc",border:earned?"2px solid #fbbf24":"2px solid #e2e8f0",opacity:earned?1:0.4,width:64}}>
                <span style={{fontSize:24}}>{b.emoji}</span>
                <span style={{fontSize:9,fontWeight:700,textAlign:"center",color:earned?"#92400e":"#94a3b8",lineHeight:1.2}}>{b.name}</span>
              </div>;
            })}
          </div>
        </div>
      </>}
    </>
  );

  // ── REWARDS ──
  const Rewards=()=>(
    <>
      <div style={S.hdr}>
        <div style={{fontSize:24,fontWeight:800}}>🎁 Belohnungen</div>
        {active&&<div style={{marginTop:8,fontSize:15}}>{active.emoji} {active.name}: <b>{avail(active.id)} ⭐</b> verfügbar</div>}
      </div>
      {!active?<div style={{...S.card,textAlign:"center",padding:32}}><div style={{fontSize:36,marginBottom:8}}>🏠</div><div style={{color:"#94a3b8"}}>Wähle zuerst auf Home dein Profil!</div><button onClick={()=>setScreen("home")} style={{...S.btn(),marginTop:12}}>Zur Startseite</button></div>
      :<div style={{padding:"8px 16px"}}>
        {data.rewards.map(r=>{const ok=avail(active.id)>=r.pointsCost;return <button key={r.id} onClick={()=>ok&&redeemReward(r)} style={{...S.taskBtn,opacity:ok?1:0.5,borderColor:ok?"#86efac":"#e2e8f0"}}>
          <span style={{fontSize:32}}>{r.emoji}</span><div style={{flex:1}}><div style={{fontWeight:700}}>{r.name}</div><div style={{fontSize:12,color:"#94a3b8"}}>Kosten: {r.pointsCost} ⭐</div></div>
          <div style={S.badge(ok?"#22c55e":"#94a3b8")}>{ok?"Einlösen":"🔒"}</div>
        </button>;})}
        {(data.redeemedRewards||[]).filter(r=>r.memberId===active.id).length>0&&<div style={{...S.card,margin:"12px 0"}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Eingelöste Belohnungen</div>
          {(data.redeemedRewards||[]).filter(r=>r.memberId===active.id).reverse().slice(0,10).map(r=>(
            <div key={r.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
              <span>{r.rewardName}</span><span style={{color:"#94a3b8"}}>{fmtDate(r.date)}</span>
            </div>
          ))}
        </div>}
      </div>}
    </>
  );

  // ── STATS ──
  const Stats=()=>{
    const sorted=[...data.members].sort((a,b)=>weekPts(b.id)-weekPts(a.id));
    const maxW=Math.max(...sorted.map(m=>weekPts(m.id)),1);
    const sortedM=[...data.members].sort((a,b)=>monthPts(b.id)-monthPts(a.id));
    const maxMo=Math.max(...sortedM.map(m=>monthPts(m.id)),1);
    const sortedA=[...data.members].sort((a,b)=>pts(b.id)-pts(a.id));
    const maxA=Math.max(...sortedA.map(m=>pts(m.id)),1);

    const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return isoDate(d);});
    const maxDay=Math.max(...last7.map(d=>data.completions.filter(c=>isoDate(c.date)===d&&c.confirmed!==false).reduce((s,c)=>s+c.points,0)),1);

    const catStats=CATEGORIES.filter(c=>data.tasks.some(t=>t.category===c)).map(cat=>{
      const cc=weekC.filter(c=>{const t=data.tasks.find(tt=>tt.id===c.taskId);return t?.category===cat;});
      return {cat,count:cc.length,pts:cc.reduce((s,c)=>s+c.points,0)};
    });

    // Member detail view
    if(selectedStat){
      const m=data.members.find(mm=>mm.id===selectedStat);
      if(!m){setSelectedStat(null);return null;}
      const mmc=mc(m.id);
      const streak=getCurrentStreak(mmc);
      const mxStreak=getMaxStreak(mmc);
      return <>
        <div style={S.hdr}>
          <button onClick={()=>setSelectedStat(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:10,padding:"6px 12px",fontSize:13,fontFamily:"inherit",cursor:"pointer",marginBottom:8}}>← Zurück</button>
          <div style={{fontSize:24,fontWeight:800}}>{m.emoji} {m.name}</div>
        </div>
        <div style={{display:"flex",gap:8,padding:"12px 16px 0",flexWrap:"wrap"}}>
          {[{l:"Woche",v:weekPts(m.id)+"⭐"},{l:"Monat",v:monthPts(m.id)+"⭐"},{l:"Gesamt",v:pts(m.id)+"⭐"},
            {l:"Verfügbar",v:avail(m.id)+"⭐"},{l:"Ø/Tag",v:avgDay(m.id)+"⭐"},{l:"Ø/Woche",v:avgWeek(m.id)+"⭐"},
            {l:"Aufgaben",v:mmc.length},{l:"Streak",v:`🔥${streak}d`},{l:"Max Streak",v:`💎${mxStreak}d`},{l:"Aktive Tage",v:daysActive(m.id)},
          ].map((s,i)=><div key={i} style={{...S.statBox,minWidth:"28%"}}><div style={{fontSize:11,color:"#94a3b8",fontWeight:600}}>{s.l}</div><div style={{fontSize:17,fontWeight:800,color:m.color}}>{s.v}</div></div>)}
        </div>
        <div style={S.card}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>Aufgaben nach Kategorie</div>
          {CATEGORIES.filter(c=>mmc.some(cc=>{const t=data.tasks.find(tt=>tt.id===cc.taskId);return t?.category===c;})).map(cat=>{
            const cnt=mmc.filter(c=>{const t=data.tasks.find(tt=>tt.id===c.taskId);return t?.category===cat;}).length;
            const tp=mmc.filter(c=>{const t=data.tasks.find(tt=>tt.id===c.taskId);return t?.category===cat;}).reduce((s,c)=>s+c.points,0);
            return <div key={cat} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
              <span>{CATEGORY_EMOJI[cat]||"📦"}</span><div style={{flex:1,fontSize:14}}>{cat}</div><span style={{fontSize:13,color:"#64748b"}}>{cnt}× / {tp}⭐</span>
            </div>;
          })}
        </div>
        <div style={S.card}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>Letzte 7 Tage</div>
          <div style={{display:"flex",gap:4,alignItems:"flex-end",height:90}}>
            {last7.map((d,di)=>{
              const dp=mmc.filter(c=>isoDate(c.date)===d).reduce((s,c)=>s+c.points,0);
              const h=Math.max(dp/Math.max(...last7.map(dd=>mmc.filter(c=>isoDate(c.date)===dd).reduce((s,c)=>s+c.points,0)),1)*80,4);
              return <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <span style={{fontSize:10,fontWeight:700,color:"#64748b"}}>{dp||""}</span>
                <div style={{width:"100%",maxWidth:30,height:h,background:d===today()?m.color:"#e2e8f0",borderRadius:6,transition:"height 0.5s"}}/>
                <span style={{fontSize:10,color:d===today()?m.color:"#94a3b8"}}>{dayName(d)}</span>
              </div>;
            })}
          </div>
        </div>
        <div style={S.card}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>Letzte Aufgaben</div>
          {mmc.slice(-15).reverse().map(c=><div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
            <span>{c.taskName}</span><span style={{color:"#94a3b8"}}>{fmtDate(c.date)} · +{c.points}</span>
          </div>)}
        </div>
        <div style={S.card}>
          <div style={{fontWeight:800,fontSize:16,marginBottom:10}}>Abzeichen</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {BADGES.map(b=>{const earned=b.check(mmc,data.tasks,data,m.id);return <div key={b.id} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"8px 6px",borderRadius:12,background:earned?"#fef3c7":"#f8fafc",border:earned?"2px solid #fbbf24":"2px solid #e2e8f0",opacity:earned?1:0.35,width:64}}>
              <span style={{fontSize:22}}>{b.emoji}</span><span style={{fontSize:9,fontWeight:700,textAlign:"center",color:earned?"#92400e":"#94a3b8",lineHeight:1.2}}>{b.name}</span>
            </div>;})}
          </div>
        </div>
      </>;
    }

    // Main stats view
    return <>
      <div style={S.hdr}><div style={{fontSize:24,fontWeight:800}}>📊 Statistiken</div></div>

      <div style={{display:"flex",gap:8,padding:"12px 16px 0"}}>
        <div style={S.statBox}><div style={{fontSize:11,color:"#94a3b8"}}>Heute</div><div style={{fontSize:22,fontWeight:800,color:"#f97316"}}>{data.completions.filter(c=>isoDate(c.date)===today()).length}</div></div>
        <div style={S.statBox}><div style={{fontSize:11,color:"#94a3b8"}}>Woche</div><div style={{fontSize:22,fontWeight:800,color:"#f97316"}}>{weekC.length}</div></div>
        <div style={S.statBox}><div style={{fontSize:11,color:"#94a3b8"}}>Monat</div><div style={{fontSize:22,fontWeight:800,color:"#f97316"}}>{monthC.length}</div></div>
        <div style={S.statBox}><div style={{fontSize:11,color:"#94a3b8"}}>Gesamt</div><div style={{fontSize:22,fontWeight:800,color:"#f97316"}}>{data.completions.filter(c=>c.confirmed!==false).length}</div></div>
      </div>

      {/* Family averages */}
      <div style={{display:"flex",gap:8,padding:"8px 16px 0"}}>
        <div style={S.statBox}><div style={{fontSize:11,color:"#94a3b8"}}>Ø Punkte/Tag (Familie)</div><div style={{fontSize:18,fontWeight:800,color:"#8b5cf6"}}>{Math.round(data.members.reduce((s,m)=>s+avgDay(m.id),0)*10)/10}</div></div>
        <div style={S.statBox}><div style={{fontSize:11,color:"#94a3b8"}}>Ø Punkte/Woche (Familie)</div><div style={{fontSize:18,fontWeight:800,color:"#8b5cf6"}}>{Math.round(data.members.reduce((s,m)=>s+avgWeek(m.id),0)*10)/10}</div></div>
      </div>

      {/* Week Ranking */}
      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:12}}>🏆 Wochenrangliste</div>
        {sorted.map((m,i)=>{const p=weekPts(m.id);return <div key={m.id} onClick={()=>setSelectedStat(m.id)} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,cursor:"pointer",padding:4,borderRadius:12}}>
          <span style={{fontSize:18,width:26,textAlign:"center"}}>{i===0&&p>0?"🥇":i===1&&p>0?"🥈":i===2&&p>0?"🥉":`${i+1}.`}</span>
          <span style={{fontSize:22}}>{m.emoji}</span>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{m.name} <span style={{fontSize:11,color:"#94a3b8"}}>Ø {avgDay(m.id)}/Tag</span></div>
            <div style={S.bar}><div style={S.barF(p/maxW*100,m.color)}/></div>
          </div>
          <span style={{...S.badge(m.color),minWidth:50}}>{p}⭐</span>
          <span style={{fontSize:14,color:"#94a3b8"}}>›</span>
        </div>;})}
      </div>

      {/* Month */}
      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:12}}>📅 Monatsrangliste</div>
        {sortedM.map((m,i)=>{const p=monthPts(m.id);return <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <span style={{fontSize:16,width:24,textAlign:"center"}}>{i+1}.</span><span style={{fontSize:20}}>{m.emoji}</span>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{m.name} <span style={{fontSize:11,color:"#94a3b8"}}>Ø {avgWeek(m.id)}/Wo</span></div><div style={S.bar}><div style={S.barF(p/maxMo*100,m.color)}/></div></div>
          <span style={{fontWeight:700,fontSize:13,color:m.color}}>{p}⭐</span>
        </div>;})}
      </div>

      {/* 7-day chart */}
      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:12}}>📈 Letzte 7 Tage</div>
        <div style={{display:"flex",gap:4,alignItems:"flex-end",height:120}}>
          {last7.map((d)=>{
            const segs=data.members.map(m=>({color:m.color,pts:data.completions.filter(c=>c.memberId===m.id&&isoDate(c.date)===d&&c.confirmed!==false).reduce((s,c)=>s+c.points,0)})).filter(s=>s.pts>0);
            const total=segs.reduce((s,seg)=>s+seg.pts,0);
            return <div key={d} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:10,fontWeight:700,color:"#64748b"}}>{total||""}</span>
              <div style={{width:"100%",maxWidth:36,height:Math.max(total/maxDay*90,4),borderRadius:8,overflow:"hidden",display:"flex",flexDirection:"column-reverse"}}>
                {segs.map((seg,si)=><div key={si} style={{height:`${seg.pts/total*100}%`,background:seg.color,minHeight:2}}/>)}
                {!segs.length&&<div style={{height:"100%",background:"#e2e8f0"}}/>}
              </div>
              <span style={{fontSize:10,color:d===today()?"#f97316":"#94a3b8",fontWeight:d===today()?800:500}}>{dayName(d)}</span>
            </div>;
          })}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:10}}>
          {data.members.map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}>
            <div style={{width:8,height:8,borderRadius:99,background:m.color}}/>{m.name}
          </div>)}
        </div>
      </div>

      {/* Categories */}
      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:12}}>📂 Kategorien (Woche)</div>
        {catStats.map(c=><div key={c.cat} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f1f5f9"}}>
          <span>{CATEGORY_EMOJI[c.cat]||"📦"}</span><div style={{flex:1,fontSize:14}}>{c.cat}</div>
          <span style={{fontSize:12,color:"#64748b"}}>{c.count}× · {c.pts}⭐</span>
        </div>)}
      </div>

      {/* All-time */}
      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:12}}>🌟 Gesamtrangliste</div>
        {sortedA.map((m,i)=>{const p=pts(m.id);return <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <span style={{fontSize:16,width:24,textAlign:"center"}}>{i+1}.</span><span style={{fontSize:20}}>{m.emoji}</span>
          <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{m.name}</div><div style={S.bar}><div style={S.barF(p/maxA*100,m.color)}/></div></div>
          <span style={{fontWeight:700,fontSize:13,color:m.color}}>{p}⭐</span>
        </div>;})}
      </div>

      {/* Activity feed */}
      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:12}}>🕐 Letzte Aktivitäten</div>
        {data.completions.slice(-20).reverse().map(c=>{const m=data.members.find(mm=>mm.id===c.memberId);return <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
          <span>{m?.emoji}</span><span style={{flex:1}}><b>{m?.name||c.memberName}</b> → {c.taskName}{c.needsConfirm&&!c.confirmed&&<span style={{color:"#fbbf24"}}> ⏳</span>}</span>
          <span style={{color:"#f97316",fontWeight:700}}>+{c.points}</span><span style={{color:"#94a3b8",fontSize:11}}>{fmtDate(c.date)}</span>
        </div>;})}
        {!data.completions.length&&<div style={{color:"#94a3b8",textAlign:"center"}}>Noch keine Aktivitäten</div>}
      </div>
    </>;
  };

  // ── ADMIN ──
  const Admin=()=>{
    if(!adminMode) return <>
      <div style={S.hdr}><div style={{fontSize:24,fontWeight:800}}>⚙️ Eltern-Bereich</div></div>
      <div style={{...S.card,textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:12}}>🔒</div>
        <div style={{marginBottom:16,color:"#64748b"}}>PIN eingeben (Standard: 1234)</div>
        <input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={e=>setPin(e.target.value)} style={{...S.inp,textAlign:"center",fontSize:24,letterSpacing:8,marginBottom:12}} placeholder="••••"/>
        <button onClick={()=>{if(pin===data.adminPin){setAdminMode(true);setPin("");}else{flash("Falsche PIN!");setPin("");}}} style={S.btn()}>Entsperren</button>
      </div>
    </>;

    return <>
      <div style={S.hdr}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:24,fontWeight:800}}>⚙️ Verwalten</div>
          <button onClick={()=>setAdminMode(false)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:10,padding:"6px 12px",fontSize:13,fontFamily:"inherit",cursor:"pointer"}}>🔒 Sperren</button>
        </div>
      </div>

      {pendingConfirm.length>0&&<div style={{...S.card,border:"2px solid #fbbf24"}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:10}}>⏳ Bestätigungen ({pendingConfirm.length})</div>
        {pendingConfirm.map(c=>{const m=data.members.find(mm=>mm.id===c.memberId);return <div key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
          <span style={{fontSize:20}}>{m?.emoji||c.memberEmoji}</span>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{m?.name||c.memberName}: {c.taskName}</div><div style={{fontSize:11,color:"#94a3b8"}}>{fmtDate(c.date)} · +{c.points}⭐</div></div>
          <button onClick={()=>confirmC(c.id)} style={{background:"#22c55e",color:"#fff",border:"none",borderRadius:10,padding:"6px 12px",fontSize:18,cursor:"pointer"}}>✓</button>
          <button onClick={()=>rejectC(c.id)} style={{background:"#ef4444",color:"#fff",border:"none",borderRadius:10,padding:"6px 12px",fontSize:18,cursor:"pointer"}}>✗</button>
        </div>;})}
      </div>}

      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:10}}>🛡️ Einstellungen</div>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 0"}}>
          <input type="checkbox" checked={data.needsConfirmation} onChange={e=>update(prev=>({...prev,needsConfirmation:e.target.checked}))} style={{width:20,height:20,accentColor:"#f97316"}}/>
          <div><div style={{fontWeight:700,fontSize:14}}>Eltern-Bestätigung nötig</div><div style={{fontSize:12,color:"#94a3b8"}}>Kinder-Aufgaben müssen bestätigt werden</div></div>
        </label>
      </div>

      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:17}}>📋 Aufgaben ({data.tasks.length})</div>
          <button onClick={()=>setEditTask({id:"",name:"",emoji:"✅",points:10,category:"Ordnung",recurring:"daily"})} style={{background:"#f97316",color:"#fff",border:"none",borderRadius:10,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Neu</button>
        </div>
        {data.tasks.map(t=><div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
          <span style={{fontSize:18}}>{t.emoji}</span>
          <div style={{flex:1,fontSize:13}}>{t.name} <span style={{color:"#94a3b8"}}>({t.category})</span>{t.recurring&&t.recurring!=="once"&&<span style={{fontSize:10,background:"#ede9fe",color:"#7c3aed",borderRadius:4,padding:"0 4px",marginLeft:4}}>{t.recurring==="daily"?"tägl.":"wöch."}</span>}</div>
          <span style={{fontWeight:700,color:"#f97316",fontSize:12}}>{t.points}⭐</span>
          <button onClick={()=>setEditTask({...t})} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>✏️</button>
          <button onClick={()=>{update(prev=>({...prev,tasks:prev.tasks.filter(tt=>tt.id!==t.id)}));flash("Gelöscht");}} style={{background:"#fef2f2",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>🗑️</button>
        </div>)}
      </div>

      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:17}}>👨‍👩‍👧‍👦 Mitglieder</div>
          <button onClick={()=>setEditMember({id:"",name:"",emoji:"😊",color:"#6366f1",isAdmin:false})} style={{background:"#f97316",color:"#fff",border:"none",borderRadius:10,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Neu</button>
        </div>
        {data.members.map(m=><div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
          <span style={{fontSize:20}}>{m.emoji}</span><div style={{flex:1,fontSize:13}}>{m.name} {m.isAdmin&&<span style={{color:"#94a3b8"}}>(Admin)</span>}</div>
          <div style={{width:14,height:14,borderRadius:99,background:m.color}}/>
          <button onClick={()=>setEditMember({...m})} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>✏️</button>
        </div>)}
      </div>

      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:17}}>🎁 Belohnungen</div>
          <button onClick={()=>setEditReward({id:"",name:"",emoji:"🎉",pointsCost:50})} style={{background:"#f97316",color:"#fff",border:"none",borderRadius:10,padding:"6px 14px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>+ Neu</button>
        </div>
        {data.rewards.map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #f1f5f9"}}>
          <span style={{fontSize:18}}>{r.emoji}</span><div style={{flex:1,fontSize:13}}>{r.name}</div>
          <span style={{fontWeight:700,color:"#f97316",fontSize:12}}>{r.pointsCost}⭐</span>
          <button onClick={()=>setEditReward({...r})} style={{background:"#f1f5f9",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>✏️</button>
          <button onClick={()=>{update(prev=>({...prev,rewards:prev.rewards.filter(rr=>rr.id!==r.id)}));flash("Gelöscht");}} style={{background:"#fef2f2",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer"}}>🗑️</button>
        </div>)}
      </div>

      <div style={S.card}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:10}}>🔐 PIN ändern</div>
        <input type="text" inputMode="numeric" maxLength={6} placeholder="Neue PIN (mind. 4 Zeichen)" onChange={e=>{const v=e.target.value;if(v.length>=4){update(prev=>({...prev,adminPin:v}));flash("PIN geändert!");}}} style={S.inp}/>
      </div>

      <div style={S.card}>
        <button onClick={()=>{if(confirm("ALLE Daten zurücksetzen?")){update(()=>({...DEFAULT_DATA}));setActive(null);flash("Zurückgesetzt!");}}} style={S.btn("#ef4444")}>⚠️ Alles zurücksetzen</button>
      </div>
    </>;
  };

  // ── MODALS ──
  const Modal=({children,onClose})=><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div style={{background:"#fff",borderRadius:"24px 24px 0 0",padding:24,width:"100%",maxWidth:480,maxHeight:"80vh",overflow:"auto"}}>{children}</div>
  </div>;

  const TaskModal=()=>{
    if(!editTask) return null;
    const isNew=!editTask.id;
    return <Modal onClose={()=>setEditTask(null)}>
      <div style={{fontWeight:800,fontSize:20,marginBottom:16}}>{isNew?"Neue Aufgabe":"Aufgabe bearbeiten"}</div>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Name</label>
      <input value={editTask.name} onChange={e=>setEditTask({...editTask,name:e.target.value})} style={{...S.inp,marginBottom:12}}/>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Emoji</label>
      <input value={editTask.emoji} onChange={e=>setEditTask({...editTask,emoji:e.target.value})} style={{...S.inp,marginBottom:12}}/>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Punkte</label>
      <input type="number" value={editTask.points} onChange={e=>setEditTask({...editTask,points:parseInt(e.target.value)||0})} style={{...S.inp,marginBottom:12}}/>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Kategorie</label>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {CATEGORIES.map(c=><button key={c} onClick={()=>setEditTask({...editTask,category:c})} style={S.tag(editTask.category===c)}>{CATEGORY_EMOJI[c]} {c}</button>)}
      </div>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Wiederholung</label>
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[["once","Einmalig"],["daily","Täglich"],["weekly","Wöchentlich"]].map(([v,l])=>
          <button key={v} onClick={()=>setEditTask({...editTask,recurring:v})} style={S.tag(editTask.recurring===v)}>{l}</button>
        )}
      </div>
      <button onClick={()=>{if(!editTask.name.trim()){flash("Name fehlt!");return;}update(prev=>{if(isNew)return{...prev,tasks:[...prev.tasks,{...editTask,id:uid()}]};return{...prev,tasks:prev.tasks.map(t=>t.id===editTask.id?editTask:t)};});setEditTask(null);flash(isNew?"Erstellt!":"Gespeichert!");}} style={S.btn()}>Speichern</button>
      <button onClick={()=>setEditTask(null)} style={{...S.btn("#94a3b8"),marginTop:8}}>Abbrechen</button>
    </Modal>;
  };

  const MemberModal=()=>{
    if(!editMember) return null;
    const isNew=!editMember.id;
    const emojis=["👨","👩","🧑","👧","👶","👦","🧒","👴","👵","😊","🦸","🧙","🐱","🐶"];
    const colors=["#2563eb","#dc2626","#16a34a","#eab308","#f97316","#8b5cf6","#ec4899","#06b6d4","#84cc16"];
    return <Modal onClose={()=>setEditMember(null)}>
      <div style={{fontWeight:800,fontSize:20,marginBottom:16}}>{isNew?"Neues Mitglied":"Bearbeiten"}</div>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Name</label>
      <input value={editMember.name} onChange={e=>setEditMember({...editMember,name:e.target.value})} style={{...S.inp,marginBottom:12}}/>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:8}}>Avatar</label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {emojis.map(em=><button key={em} onClick={()=>setEditMember({...editMember,emoji:em})} style={{fontSize:26,padding:5,borderRadius:12,border:editMember.emoji===em?"3px solid #f97316":"2px solid #e2e8f0",background:"none",cursor:"pointer"}}>{em}</button>)}
      </div>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:8}}>Farbe</label>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
        {colors.map(c=><button key={c} onClick={()=>setEditMember({...editMember,color:c})} style={{width:34,height:34,borderRadius:99,background:c,border:editMember.color===c?"3px solid #1e293b":"2px solid transparent",cursor:"pointer"}}/>)}
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,fontSize:14,marginBottom:16,cursor:"pointer"}}><input type="checkbox" checked={editMember.isAdmin} onChange={e=>setEditMember({...editMember,isAdmin:e.target.checked})} style={{width:18,height:18,accentColor:"#f97316"}}/> Admin (Eltern)</label>
      <button onClick={()=>{if(!editMember.name.trim()){flash("Name fehlt!");return;}update(prev=>{if(isNew)return{...prev,members:[...prev.members,{...editMember,id:uid()}]};return{...prev,members:prev.members.map(m=>m.id===editMember.id?editMember:m)};});setEditMember(null);flash(isNew?"Hinzugefügt!":"Gespeichert!");}} style={S.btn()}>Speichern</button>
      <button onClick={()=>setEditMember(null)} style={{...S.btn("#94a3b8"),marginTop:8}}>Abbrechen</button>
    </Modal>;
  };

  const RewardModal=()=>{
    if(!editReward) return null;
    const isNew=!editReward.id;
    return <Modal onClose={()=>setEditReward(null)}>
      <div style={{fontWeight:800,fontSize:20,marginBottom:16}}>{isNew?"Neue Belohnung":"Bearbeiten"}</div>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Name</label>
      <input value={editReward.name} onChange={e=>setEditReward({...editReward,name:e.target.value})} style={{...S.inp,marginBottom:12}}/>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Emoji</label>
      <input value={editReward.emoji} onChange={e=>setEditReward({...editReward,emoji:e.target.value})} style={{...S.inp,marginBottom:12}}/>
      <label style={{fontSize:13,fontWeight:700,color:"#64748b",display:"block",marginBottom:4}}>Punktekosten</label>
      <input type="number" value={editReward.pointsCost} onChange={e=>setEditReward({...editReward,pointsCost:parseInt(e.target.value)||0})} style={{...S.inp,marginBottom:16}}/>
      <button onClick={()=>{if(!editReward.name.trim()){flash("Name fehlt!");return;}update(prev=>{if(isNew)return{...prev,rewards:[...prev.rewards,{...editReward,id:uid()}]};return{...prev,rewards:prev.rewards.map(r=>r.id===editReward.id?editReward:r)};});setEditReward(null);flash(isNew?"Erstellt!":"Gespeichert!");}} style={S.btn()}>Speichern</button>
      <button onClick={()=>setEditReward(null)} style={{...S.btn("#94a3b8"),marginTop:8}}>Abbrechen</button>
    </Modal>;
  };

  return <div style={S.app}>
    <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
    <style>{`
      @keyframes cFall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(100vh) rotate(720deg);opacity:0}}
      @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
      *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
      button:active{transform:scale(0.96)}
      input:focus{outline:none;border-color:#f97316!important}
      ::-webkit-scrollbar{display:none}
    `}</style>
    {screen==="home"&&<Home/>}
    {screen==="rewards"&&<Rewards/>}
    {screen==="stats"&&<Stats/>}
    {screen==="admin"&&<Admin/>}
    <Nav/>
    <Confetti show={confetti}/>
    <TaskModal/><MemberModal/><RewardModal/>
    {toast&&<div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"#fff",padding:"10px 20px",borderRadius:14,fontSize:15,fontWeight:700,zIndex:300,fontFamily:"'Fredoka',sans-serif",boxShadow:"0 4px 20px rgba(0,0,0,0.2)",maxWidth:"80%",textAlign:"center"}}>{toast}</div>}
  </div>;
}
