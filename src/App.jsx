import React, { useState, useCallback, useRef, useEffect } from "react";
import { Upload, Cpu, Trophy, Users, Download, Trash2, Swords, Map, Target, Star, AlertCircle, CheckCircle, LogIn, LogOut } from "lucide-react";
const PLACEMENT_PTS = {1:10,2:6,3:5,4:4,5:3,6:2,7:1,8:1};
const MAPS = ["Erangel","Miramar","Sanhok","Vikendi","Nusa","Livik"];
const getPlacePts = r => PLACEMENT_PTS[r] ?? 0;

const toB64 = file => new Promise((resolve,reject)=>{
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const maxDim = 1280;
      let { width, height } = img;
      if(width > height && width > maxDim) { height = height*maxDim/width; width = maxDim; }
      else if(height > maxDim) { width = width*maxDim/height; height = maxDim; }
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = reader.result;
  };
  reader.onerror = () => reject(new Error("Read failed"));
  reader.readAsDataURL(file);
});

export default function BGMITracker() {
  const [teamCode, setTeamCode] = useState("");
  const [teamCodeInput, setTeamCodeInput] = useState("");
  const [teamCodeError, setTeamCodeError] = useState("");
  const [matches, setMatches] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);

  const enterTeam = () => {
    const code = teamCodeInput.trim().toUpperCase();
    if(code.length < 3) { setTeamCodeError("Minimum 3 characters chahiye"); return; }
    setTeamCode(code);
    setDbLoading(true);
    fetch(`/api/db?team_code=${code}`)
      .then(r => r.json())
      .then(data => {
        if(Array.isArray(data)) {
          setMatches(data.map(m => ({
            id: m.id, matchNum: m.match_num, map: m.map, rank: m.rank,
            placePts: m.place_pts, teamKills: m.team_kills, totalPts: m.total_pts, players: m.players
          })));
        }
        setDbLoading(false);
      })
      .catch(() => setDbLoading(false));
  };
  const [view, setView] = useState("dashboard");
  const [dragging, setDragging] = useState(false);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [ocrError, setOcrError] = useState("");
  const [simOpen, setSimOpen] = useState(false);
  const [simData, setSimData] = useState({map:"Erangel",rank:1,players:[{name:"",kills:0},{name:"",kills:0},{name:"",kills:0},{name:"",kills:0}]});
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef();

  const runOCR = useCallback(async (file) => {
    setOcrStatus("loading"); setOcrError("");
    try {
      const b64 = await toB64(file);
      const mimeType = "image/jpeg";
      const res = await fetch("/api/ocr", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ imageBase64: b64, mimeType })
      });
      const parsed = await res.json();
      if(parsed.error) throw new Error(parsed.error);

      const players = (parsed.players||[]).slice(0,4);
      while(players.length < 4) players.push({name:"",kills:0});
      setSimData({
        map: MAPS.includes(parsed.map) ? parsed.map : "Erangel",
        rank: Number(parsed.rank)||1,
        players
      });
      setOcrStatus("success");
      setSimOpen(true);
    } catch(err) {
      setOcrStatus("error");
      setOcrError(err.message || "OCR failed. Clearer screenshot try karo.");
    }
  }, []);

  const handleFile = useCallback(file => {
    if(!file || !file.type.startsWith("image/")) return;
    setPreviewUrl(URL.createObjectURL(file));
    runOCR(file);
  }, [runOCR]);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const submitMatch = async () => {
    const teamKills = simData.players.reduce((s,p)=>s+Number(p.kills),0);
    const placePts = getPlacePts(Number(simData.rank));
    const newMatch = {
      matchNum: matches.length + 1,
      map: simData.map,
      rank: Number(simData.rank),
      placePts,
      teamKills,
      totalPts: placePts + teamKills,
      players: simData.players.filter(p=>p.name).map(p=>({name:p.name, kills:Number(p.kills)})),
      teamCode
    };
    const res = await fetch("/api/db", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newMatch)
    });
    const saved = await res.json();
    const m = saved[0];
    setMatches(prev => [...prev, {
      id: m.id, matchNum: m.match_num, map: m.map, rank: m.rank,
      placePts: m.place_pts, teamKills: m.team_kills, totalPts: m.total_pts, players: m.players
    }]);
    setSimOpen(false); setPreviewUrl(null); setOcrStatus(null);
  };

  const deleteMatch = async (id) => {
    await fetch("/api/db", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, teamCode })
    });
    setMatches(prev => prev.filter(m => m.id !== id));
  };

  const leaderboard = () => {
    const agg = {};
    matches.forEach(m=>m.players.forEach(p=>{
      if(!p.name) return;
      if(!agg[p.name]) agg[p.name]={name:p.name,kills:0,matches:0};
      agg[p.name].kills+=p.kills; agg[p.name].matches++;
    }));
    return Object.values(agg).sort((a,b)=>b.kills-a.kills);
  };

  const exportData = fmt => {
    let content,type,ext;
    if(fmt==="json"){ content=JSON.stringify(matches,null,2); type="application/json"; ext="json"; }
    else {
      const rows=[["Match#","Map","Rank","PlacePts","TeamKills","TotalPts","Players"]];
      matches.forEach(m=>rows.push([m.matchNum,m.map,m.rank,m.placePts,m.teamKills,m.totalPts,m.players.map(p=>`${p.name}(${p.kills})`).join("|")]));
      content=rows.map(r=>r.join(",")).join("\n"); type="text/csv"; ext="csv";
    }
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=`bgmi_matches.${ext}`; a.click();
  };

  const totalPts=matches.reduce((s,m)=>s+m.totalPts,0);
  const totalKills=matches.reduce((s,m)=>s+m.teamKills,0);
  const bestRank=matches.length?Math.min(...matches.map(m=>m.rank)):"--";
  const lb=leaderboard();
  const rankColor=r=>r===1?"#FFD700":r<=3?"#4ade80":r<=8?"#60a5fa":"#94a3b8";
  const rankBg=r=>r===1?"#FFD70018":r<=3?"#4ade8018":r<=8?"#60a5fa18":"#ffffff0a";
  const rankLabel=r=>r===1?"#1 WWCD":`#${r} Finish`;

  const S={
    wrap:{fontFamily:"'Inter',sans-serif",background:"#0f1117",minHeight:"100vh",color:"#e2e8f0"},
    header:{background:"#1a1d27",borderBottom:"1px solid #2d3148",padding:"14px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"},
    logo:{display:"flex",alignItems:"center",gap:8,fontSize:17,fontWeight:700,color:"#fff"},
    nav:{display:"flex",gap:4},
    navBtn:a=>({background:a?"#f59e0b22":"transparent",color:a?"#f59e0b":"#94a3b8",border:a?"1px solid #f59e0b44":"1px solid transparent",borderRadius:8,padding:"6px 14px",fontSize:13,fontWeight:500,cursor:"pointer"}),
    body:{maxWidth:920,margin:"0 auto",padding:"24px 16px"},
    card:{background:"#1a1d27",border:"1px solid #2d3148",borderRadius:12,padding:"20px 22px",marginBottom:16},
    statGrid:{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:18},
    statCard:{background:"#252836",borderRadius:10,padding:"14px 16px",textAlign:"center"},
    statVal:{fontSize:26,fontWeight:700,color:"#f59e0b",margin:"4px 0 2px"},
    statLbl:{fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px"},
    drop:a=>({border:`2px dashed ${a?"#f59e0b":"#2d3148"}`,borderRadius:12,padding:"32px 20px",textAlign:"center",cursor:"pointer",background:a?"#f59e0b08":"transparent",transition:"all 0.2s"}),
    btn:v=>({display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer",border:"none",
      background:v==="primary"?"#f59e0b":v==="danger"?"#ef444420":"#252836",
      color:v==="primary"?"#0f1117":v==="danger"?"#f87171":"#94a3b8"}),
    inp:{background:"#252836",border:"1px solid #2d3148",borderRadius:8,padding:"7px 12px",color:"#e2e8f0",fontSize:13,width:"100%",boxSizing:"border-box"},
    sel:{background:"#252836",border:"1px solid #2d3148",borderRadius:8,padding:"7px 12px",color:"#e2e8f0",fontSize:13,width:"100%"},
    th:{textAlign:"left",fontSize:11,color:"#64748b",textTransform:"uppercase",letterSpacing:"0.5px",padding:"8px 10px",borderBottom:"1px solid #2d3148"},
    td:{padding:"10px 10px",borderBottom:"1px solid #1e2235",fontSize:13},
    secTitle:{fontSize:12,fontWeight:600,color:"#64748b",marginBottom:14,display:"flex",alignItems:"center",gap:7,textTransform:"uppercase",letterSpacing:"0.6px"},
    modal:{position:"fixed",inset:0,background:"#000000cc",display:"flex",alignItems:"center",justifyContent:"center",zIndex:999},
    modalCard:{background:"#1a1d27",border:"1px solid #2d3148",borderRadius:16,padding:26,width:500,maxWidth:"95vw",maxHeight:"88vh",overflowY:"auto"},
  };

  return (
    <div style={S.wrap}>
      {/* Team Code Entry Screen */}
      {!teamCode && (
        <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f1117"}}>
          <div style={{background:"#1a1d27",border:"1px solid #2d3148",borderRadius:16,padding:36,width:380,maxWidth:"90vw",textAlign:"center"}}>
            <Swords size={36} color="#f59e0b" style={{margin:"0 auto 16px"}}/>
            <div style={{fontSize:22,fontWeight:700,color:"#fff",marginBottom:6}}>BGMI Match Tracker</div>
            <div style={{fontSize:13,color:"#64748b",marginBottom:24}}>Apna Team Code enter karo — naya code likhoge toh naya data, purana code likhoge toh purana data milega</div>
            <input
              placeholder="Team Code (e.g. TEAM_BTX)"
              style={{...S.inp,textAlign:"center",fontSize:15,fontWeight:600,letterSpacing:"1px",marginBottom:8,textTransform:"uppercase"}}
              value={teamCodeInput}
              onChange={e=>{ setTeamCodeInput(e.target.value); setTeamCodeError(""); }}
              onKeyDown={e=>e.key==="Enter"&&enterTeam()}
            />
            {teamCodeError && <div style={{fontSize:12,color:"#f87171",marginBottom:8}}>{teamCodeError}</div>}
            <button style={{...S.btn("primary"),width:"100%",justifyContent:"center",padding:"10px",fontSize:14}} onClick={enterTeam}>
              <LogIn size={15}/> Enter
            </button>
          </div>
        </div>
      )}

      {/* Main App */}
      {teamCode && <>
      <div style={S.header}>
        <div style={S.logo}><Swords size={20} color="#f59e0b"/> BGMI <span style={{color:"#f59e0b"}}>Match Tracker</span>
          {teamCode && <span style={{fontSize:11,background:"#f59e0b22",color:"#f59e0b",border:"1px solid #f59e0b44",borderRadius:99,padding:"2px 8px",marginLeft:8}}>{teamCode}</span>}
        </div>
        <div style={S.nav}>
          <button style={S.navBtn(view==="dashboard")} onClick={()=>setView("dashboard")}>Dashboard</button>
          <button style={S.navBtn(view==="leaderboard")} onClick={()=>setView("leaderboard")}>Leaderboard</button>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={S.btn()} onClick={()=>exportData("json")}><Download size={13}/> JSON</button>
          <button style={S.btn()} onClick={()=>exportData("csv")}><Download size={13}/> CSV</button>
          <button style={S.btn("danger")} onClick={()=>{setTeamCode("");setTeamCodeInput("");setMatches([]);}}><LogOut size={13}/> Exit</button>
        </div>
      </div>

      <div style={S.body}>
        {view==="dashboard" && <>
          <div style={S.statGrid}>
            {[
              {icon:<Trophy size={15}/>,val:matches.length,lbl:"Matches"},
              {icon:<Star size={15}/>,val:totalPts,lbl:"Total Points"},
              {icon:<Target size={15}/>,val:totalKills,lbl:"Team Kills"},
              {icon:<Map size={15}/>,val:`#${bestRank}`,lbl:"Best Rank"},
            ].map((x,i)=>(
              <div key={i} style={S.statCard}>
                <div style={{color:"#f59e0b",marginBottom:4}}>{x.icon}</div>
                <div style={S.statVal}>{x.val}</div>
                <div style={S.statLbl}>{x.lbl}</div>
              </div>
            ))}
          </div>

          <div style={S.card}>
            <div style={S.secTitle}><Upload size={13}/> Upload Match Screenshot (Gemini Vision OCR)</div>
            <div
              style={S.drop(dragging)}
              onDragOver={e=>{e.preventDefault();setDragging(true)}}
              onDragLeave={()=>setDragging(false)}
              onDrop={onDrop}
              onClick={()=>fileRef.current.click()}
            >
              <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
              {ocrStatus==="loading" ? (
                <div style={{color:"#f59e0b"}}>
                  <Cpu size={26} style={{margin:"0 auto 8px",display:"block"}}/>
                  <div style={{fontSize:13}}>Gemini screenshot padh raha hai...</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Map, rank, player names & kills extract ho rahe hain</div>
                </div>
              ) : ocrStatus==="success" ? (
                <div style={{color:"#4ade80",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
                  <CheckCircle size={16}/> Data extracted — form mein verify karo
                </div>
              ) : ocrStatus==="error" ? (
                <div style={{color:"#f87171"}}>
                  <AlertCircle size={22} style={{margin:"0 auto 6px",display:"block"}}/>
                  <div style={{fontSize:13}}>{ocrError}</div>
                  <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Click to retry</div>
                </div>
              ) : (
                <div>
                  <Upload size={26} color="#f59e0b" style={{margin:"0 auto 8px",display:"block"}}/>
                  <div style={{fontSize:13,color:"#94a3b8"}}>Drop screenshot ya <span style={{color:"#f59e0b"}}>browse karo</span></div>
                  <div style={{fontSize:11,color:"#475569",marginTop:4}}>Gemini Vision automatically data extract karega</div>
                </div>
              )}
            </div>
            <div style={{marginTop:10,textAlign:"center"}}>
              <button style={S.btn("primary")} onClick={()=>{setSimData({map:"Erangel",rank:1,players:[{name:"",kills:0},{name:"",kills:0},{name:"",kills:0},{name:"",kills:0}]});setSimOpen(true);}}>
                Manual Entry
              </button>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.secTitle}><Trophy size={13}/> Match History</div>
            {matches.length===0 ? (
              <div style={{textAlign:"center",color:"#475569",padding:"20px 0",fontSize:13}}>No matches yet.</div>
            ) : (
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["#","Map","Rank","Place Pts","Kills","Total Pts","Players",""].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {matches.map(m=>(
                      <tr key={m.id}>
                        <td style={S.td}><span style={{color:"#475569"}}>#</span>{m.matchNum}</td>
                        <td style={S.td}>{m.map}</td>
                        <td style={S.td}><span style={{display:"inline-block",padding:"2px 9px",borderRadius:99,fontSize:11,fontWeight:600,background:rankBg(m.rank),color:rankColor(m.rank)}}>{rankLabel(m.rank)}</span></td>
                        <td style={{...S.td,color:"#f59e0b",fontWeight:600}}>{m.placePts}</td>
                        <td style={S.td}>{m.teamKills}</td>
                        <td style={{...S.td,fontWeight:700,color:"#fff",fontSize:15}}>{m.totalPts}</td>
                        <td style={{...S.td,fontSize:11,color:"#64748b",maxWidth:180}}>{m.players.map(p=>`${p.name}(${p.kills}k)`).join(", ")}</td>
                        <td style={S.td}><button style={S.btn("danger")} onClick={()=>deleteMatch(m.id)}><Trash2 size={12}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>}

        {view==="leaderboard" && (
          <div style={S.card}>
            <div style={S.secTitle}><Users size={13}/> Individual Kill Leaderboard</div>
            {lb.length===0 ? (
              <div style={{textAlign:"center",color:"#475569",padding:"24px 0",fontSize:13}}>No player data yet.</div>
            ) : lb.map((p,i)=>(
              <div key={p.name} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 0",borderBottom:"1px solid #1e2235"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:i<3?"#f59e0b22":"#252836",border:`1px solid ${i<3?"#f59e0b55":"#2d3148"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:i<3?"#f59e0b":"#64748b",flexShrink:0}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14}}>{p.name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{p.matches} match{p.matches!==1?"es":""}</div>
                </div>
                <div style={{textAlign:"right",marginRight:12}}>
                  <div style={{fontSize:20,fontWeight:700,color:"#f59e0b"}}>{p.kills}</div>
                  <div style={{fontSize:10,color:"#64748b"}}>kills</div>
                </div>
                <div style={{width:90,background:"#252836",borderRadius:99,height:5,overflow:"hidden"}}>
                  <div style={{height:"100%",background:"#f59e0b",borderRadius:99,width:`${Math.round((p.kills/lb[0].kills)*100)}%`,transition:"width 0.4s"}}/>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {simOpen && (
        <div style={S.modal} onClick={e=>{if(e.target===e.currentTarget)setSimOpen(false)}}>
          <div style={S.modalCard}>
            <div style={{fontSize:15,fontWeight:700,color:"#fff",marginBottom:16,display:"flex",alignItems:"center",gap:8}}>
              <Swords size={17} color="#f59e0b"/> Log Match Result
              {ocrStatus==="success" && <span style={{fontSize:11,background:"#4ade8018",color:"#4ade80",border:"1px solid #4ade8033",borderRadius:99,padding:"2px 8px",marginLeft:"auto"}}>Gemini extracted ✓</span>}
            </div>
            {previewUrl && <div style={{marginBottom:14,borderRadius:8,overflow:"hidden",border:"1px solid #2d3148",maxHeight:120}}><img src={previewUrl} alt="ss" style={{width:"100%",objectFit:"cover",maxHeight:120}}/></div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Map</div>
                <select style={S.sel} value={simData.map} onChange={e=>setSimData(d=>({...d,map:e.target.value}))}>
                  {MAPS.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:"#64748b",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.5px"}}>Team Rank</div>
                <select style={S.sel} value={simData.rank} onChange={e=>setSimData(d=>({...d,rank:Number(e.target.value)}))}>
                  {Array.from({length:20},(_,i)=><option key={i+1} value={i+1}>#{i+1}{i===0?" (WWCD)":""}</option>)}
                </select>
              </div>
            </div>
            <div style={{fontSize:11,color:"#64748b",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.5px"}}>Players & Kills</div>
            {simData.players.map((p,i)=>(
              <div key={i} style={{display:"flex",gap:8,marginBottom:7,alignItems:"center"}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:"#252836",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#64748b",flexShrink:0}}>{i+1}</div>
                <input placeholder={`Player ${i+1}`} style={{...S.inp,flex:1}} value={p.name} onChange={e=>setSimData(d=>({...d,players:d.players.map((pp,j)=>j===i?{...pp,name:e.target.value}:pp)}))}/>
                <input type="number" min="0" max="26" placeholder="Kills" style={{...S.inp,width:68}} value={p.kills||""} onChange={e=>setSimData(d=>({...d,players:d.players.map((pp,j)=>j===i?{...pp,kills:Number(e.target.value)}:pp)}))}/>
              </div>
            ))}
            <div style={{background:"#252836",borderRadius:8,padding:"10px 14px",margin:"12px 0",fontSize:12}}>
              <div style={{display:"flex",justifyContent:"space-between",color:"#64748b",marginBottom:3}}><span>Placement pts (Rank #{simData.rank})</span><span style={{color:"#f59e0b",fontWeight:600}}>{getPlacePts(simData.rank)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",color:"#64748b",marginBottom:3}}><span>Kill pts</span><span style={{color:"#f59e0b",fontWeight:600}}>{simData.players.reduce((s,p)=>s+Number(p.kills),0)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,borderTop:"1px solid #2d3148",paddingTop:7,marginTop:4}}><span style={{color:"#fff"}}>Total Points</span><span style={{color:"#f59e0b",fontSize:16}}>{getPlacePts(simData.rank)+simData.players.reduce((s,p)=>s+Number(p.kills),0)}</span></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button style={S.btn()} onClick={()=>{setSimOpen(false);setPreviewUrl(null);setOcrStatus(null);}}>Cancel</button>
              <button style={S.btn("primary")} onClick={submitMatch}>Save Match</button>
            </div>
          </div>
        </div>
      )}
      {/* End Main App */}
      </>}
    </div>
  );
}
