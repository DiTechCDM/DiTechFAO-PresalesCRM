import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppContext } from '../store';
import { uid, fmtTime, OC_LABELS, OC_COLORS, TYPE_LBL, TODAY, NOW, MONTH_START } from '../lib/utils';
import { Call, Firm } from '../types';

const OUTCOMES = [
  { key:'mtg', emoji:'📅', label:'Meeting set', cls:'oc-mtg' },
  { key:'cb',  emoji:'🔄', label:'Callback',    cls:'oc-cb'  },
  { key:'in',  emoji:'👍', label:'Interested',  cls:'oc-in'  },
  { key:'na',  emoji:'📵', label:'No answer',   cls:'oc-na'  },
  { key:'gk',  emoji:'🚧', label:'Gatekeeper',  cls:'oc-gk'  },
  { key:'ni',  emoji:'❌', label:'Not interested', cls:'oc-ni' },
  { key:'vm',  emoji:'📨', label:'Voicemail',   cls:'oc-vm'  },
];

// ── Edit Call Modal ────────────────────────────────────────────────────────
function EditCallModal({ call, firms, onSave, onClose }: {
  call: Call;
  firms: Firm[];
  onSave: (original: Call, updated: Partial<Call>) => void;
  onClose: () => void;
}) {
  const [contact, setContact] = useState(call.contact || '');
  const [type, setType] = useState(call.type);
  const [oc, setOc] = useState(call.oc);
  const [stage, setStage] = useState(call.stage || '');
  const [notes, setNotes] = useState(call.notes || '');
  const [fu, setFu] = useState(call.fu || '');
  const [mtgDate, setMtgDate] = useState(call.mtgDate || '');

  return (
    <div className="mov" style={{zIndex:600}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="modal" style={{width:580}} onClick={e=>e.stopPropagation()}>
        <div className="mhd">
          <h2>Edit call — {call.firm}</h2>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mbd" style={{display:'flex',flexDirection:'column',gap:12}}>
          {/* Firm + time (read-only context) */}
          <div style={{padding:'8px 12px',background:'var(--brand-light)',borderRadius:'var(--r)',fontSize:12,color:'var(--brand)',display:'flex',gap:16}}>
            <span><strong>{call.firm}</strong></span>
            <span style={{color:'var(--t2)'}}>·</span>
            <span style={{color:'var(--t2)'}}>Logged: {new Date(call.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</span>
            <span style={{color:'var(--t2)'}}>· Rep: {call.rep}</span>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="fg">
              <label>Contact</label>
              <input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Who you spoke to" />
            </div>
            <div className="fg">
              <label>Activity type</label>
              <select value={type} onChange={e=>setType(e.target.value)}>
                <option value="call">Cold call</option>
                <option value="followup">Follow-up</option>
                <option value="linkedin">LinkedIn</option>
                <option value="email">Email</option>
                <option value="meeting">Meeting</option>
              </select>
            </div>
          </div>

          <div className="fg">
            <label>Outcome *</label>
            <div className="og" style={{marginTop:4}}>
              {OUTCOMES.map(o=>(
                <div key={o.key} className={`oo ${o.cls} ${oc===o.key?'sel':''}`} onClick={()=>setOc(o.key)}>
                  {o.emoji} {o.label}
                </div>
              ))}
            </div>
          </div>

          <div className="fg">
            <label>Update stage</label>
            <select value={stage} onChange={e=>setStage(e.target.value)}>
              <option value="">Keep current</option>
              {['Lead','Suspect','Proposal','Win','Lost'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="fg">
            <label>Notes / key points</label>
            <textarea
              value={notes}
              onChange={e=>setNotes(e.target.value)}
              placeholder="Objections, pain points, next steps…"
              style={{minHeight:90,lineHeight:1.6}}
            />
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="fg"><label>Follow-up date</label><input type="date" value={fu} onChange={e=>setFu(e.target.value)} /></div>
            <div className="fg"><label>Meeting date</label><input type="date" value={mtgDate} onChange={e=>setMtgDate(e.target.value)} /></div>
          </div>
        </div>
        <div className="mft">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={()=>onSave(call,{contact,type,oc,stage:stage||undefined,notes,fu:fu||undefined,mtgDate:mtgDate||undefined})}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main CallTracker ───────────────────────────────────────────────────────

interface Props { defaultFirmId?: string; onClearFirm?: () => void; onOpenEOD?: () => void; }

export default function CallTracker({ defaultFirmId, onClearFirm, onOpenEOD }: Props) {
  const { calls, setCalls, firms, setFirms, currentUser, admin, showToast, hasPerm, isRep, scopeCalls, scopeFirms, getActiveFYKpi } = useAppContext();

  const canViewAll = hasPerm('viewAll');
  const activeReps = admin.reps?.filter(r => r.status === 'Active') || [];

  // Rep selector
  const [selRep, setSelRep] = useState<string>(isRep() ? currentUser?.linkedRep || '' : 'all');

  // Log form state
  const [firmSearch, setFirmSearch] = useState('');
  const [firmDropOpen, setFirmDropOpen] = useState(false);
  const [selFirm, setSelFirm] = useState<Firm | null>(null);
  const [contact, setContact] = useState('');
  const [callType, setCallType] = useState('call');
  const [stage, setStage] = useState('');
  const [outcome, setOutcome] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [mtgDate, setMtgDate] = useState('');
  const [notes, setNotes] = useState('');
  const [ocFilter, setOcFilter] = useState('');
  const firmInputRef = useRef<HTMLInputElement>(null);

  // Pre-fill firm from Firms DB "Log call" button
  useEffect(() => {
    if (defaultFirmId) {
      const f = firms.find(x => x.id === defaultFirmId);
      if (f) { setSelFirm(f); setFirmSearch(f.name); setContact(f.contact_name || ''); }
    }
  }, [defaultFirmId]);

  // Firm search dropdown
  const firmMatches = useMemo(() => {
    if (!firmSearch || selFirm) return [];
    return scopeFirms(firms).filter(f => f.name.toLowerCase().includes(firmSearch.toLowerCase())).slice(0, 8);
  }, [firms, firmSearch, selFirm, scopeFirms]);

  // Filter calls
  const repFilter = isRep() ? currentUser?.linkedRep || '' : (selRep === 'all' ? '' : selRep);
  const allCalls = scopeCalls(calls);
  const todayCalls = allCalls.filter(c => c.ts.startsWith(TODAY) && (!repFilter || c.rep === repFilter));
  const shownCalls = ocFilter ? todayCalls.filter(c => c.oc === ocFilter) : todayCalls;

  // KPI metrics
  const kpi = getActiveFYKpi();
  const nCalls = todayCalls.filter(c => c.type === 'call' || c.type === 'followup').length;
  const nLI = todayCalls.filter(c => c.type === 'linkedin').length;
  const nMtg = todayCalls.filter(c => c.oc === 'mtg').length;
  const nConn = todayCalls.filter(c => !['na','vm','gk'].includes(c.oc)).length;
  const nNI = todayCalls.filter(c => c.oc === 'ni').length;
  const connRate = nCalls > 0 ? Math.round(nConn / nCalls * 100) : 0;
  const dailyMtgTarget = Math.ceil((kpi.meetings_month || 20) / 22);

  // Monthly meetings
  const monthMtgs = allCalls.filter(c => c.oc === 'mtg' && c.ts >= MONTH_START && (!repFilter || c.rep === repFilter)).length;
  const daysInM = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0).getDate();
  const dayOfM = NOW.getDate();
  const proj = dayOfM > 0 ? Math.round(monthMtgs / dayOfM * daysInM) : 0;

  const logCall = () => {
    if (!selFirm && !firmSearch.trim()) { showToast('Enter a firm name', 'err'); return; }
    if (!outcome) { showToast('Pick an outcome', 'err'); return; }
    const repName = isRep() ? currentUser?.linkedRep || currentUser?.name || '' : (selRep === 'all' ? currentUser?.name || '' : selRep);
    const newCall: Call = {
      id: uid(), rep: repName,
      firm: selFirm?.name || firmSearch.trim(),
      firmId: selFirm?.id || '',
      contact, type: callType, oc: outcome,
      stage: stage || undefined,
      notes, fu: followUp || undefined,
      mtgDate: mtgDate || undefined,
      ts: new Date().toISOString()
    };
    setCalls([newCall, ...calls]);
    // Update firm last_contact, stage, follow_up
    if (selFirm) {
      setFirms(firms.map(f => f.id === selFirm.id ? {
        ...f,
        last_contact: TODAY,
        ...(stage ? { stage } : {}),
        ...(followUp ? { follow_up: followUp } : {})
      } : f));
    }
    showToast(`${OC_LABELS[outcome]} — ${newCall.firm}`, 'ok');
    resetForm();
    if (onClearFirm) onClearFirm();
  };

  const resetForm = () => {
    setFirmSearch(''); setSelFirm(null); setContact(''); setCallType('call');
    setStage(''); setOutcome(''); setFollowUp(''); setMtgDate(''); setNotes('');
  };

  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingCall, setEditingCall] = useState<Call | null>(null);

  const deleteCall = (id: string) => { setCalls(calls.filter(c => c.id !== id)); showToast('Removed', 'err'); };

  // Edit opens an inline modal pre-filled with the call — saves as a replacement
  const saveEdit = (original: Call, updated: Partial<Call>) => {
    setCalls(calls.map(c => c.id === original.id ? { ...c, ...updated } : c));
    setEditingCall(null);
    showToast('Call updated', 'ok');
  };

  const pctBar = (v:number, t:number) => { const p=Math.min(100,Math.round(v/(t||1)*100)); const bc=p>=100?'#1D9E75':p>=60?'#EF9F27':'#E24B4A'; return {p,bc}; };

  const todayLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div>
      {/* Header */}
      <div className="page-hd">
        <div>
          <div className="page-title">Call Tracker</div>
          <div className="page-sub">{selRep === 'all' ? 'All reps' : (repFilter || 'My calls')} · {todayLabel}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {canViewAll && (
            <select value={selRep} onChange={e=>setSelRep(e.target.value)} style={{padding:'5px 9px',border:'.5px solid var(--border2)',borderRadius:'var(--r)',fontSize:12,background:'#fff',outline:'none',minWidth:120}}>
              <option value="all">All reps</option>
              {activeReps.map(r=><option key={r.name} value={r.name}>{r.name}</option>)}
            </select>
          )}
          <button className="btn primary" onClick={()=>firmInputRef.current?.focus()}>📞 Log call</button>
          <button className="btn ghost" onClick={() => onOpenEOD?.()}>📋 EOD report</button>
        </div>
      </div>

      {/* Log Form */}
      <div style={{background:'var(--gl)',border:'.5px solid #9FE1CB',borderRadius:'var(--rl2)',padding:'14px 16px',marginBottom:14}}>
        {/* Row 1: Firm | Contact | Type | Stage | + Log */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1.2fr 1fr 1.1fr 110px',gap:8,marginBottom:10,alignItems:'end'}}>
          <div className="fg search-wrap">
            <label style={{color:'var(--red)',fontWeight:700}}>FIRM *</label>
            <input
              ref={firmInputRef}
              value={selFirm ? selFirm.name : firmSearch}
              placeholder="Search or type firm…"
              style={{borderColor:'#9FE1CB'}}
              onFocus={()=>{if(selFirm){setSelFirm(null);setFirmSearch('');}setFirmDropOpen(true);}}
              onChange={e=>{setFirmSearch(e.target.value);setSelFirm(null);setFirmDropOpen(true);}}
              onBlur={()=>setTimeout(()=>setFirmDropOpen(false),200)}
            />
            {firmDropOpen && firmMatches.length > 0 && (
              <div className="sr-list open">
                {firmMatches.map(f=>(
                  <div key={f.id} className="sri" onMouseDown={()=>{setSelFirm(f);setFirmSearch(f.name);setContact(f.contact_name||'');setFirmDropOpen(false);}}>
                    <div className="sri-name">{f.name}</div>
                    <div className="sri-meta">{f.city} · {f.stage} · {f.assigned_to||'Unassigned'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="fg">
            <label>CONTACT</label>
            <input value={contact} onChange={e=>setContact(e.target.value)} placeholder="Who you spoke to" style={{borderColor:'#9FE1CB'}} />
          </div>
          <div className="fg">
            <label>TYPE</label>
            <select value={callType} onChange={e=>setCallType(e.target.value)} style={{borderColor:'#9FE1CB'}}>
              <option value="call">Cold call</option><option value="followup">Follow-up</option>
              <option value="linkedin">LinkedIn</option><option value="email">Email</option><option value="meeting">Meeting</option>
            </select>
          </div>
          <div className="fg">
            <label>STAGE →</label>
            <select value={stage} onChange={e=>setStage(e.target.value)} style={{borderColor:'#9FE1CB'}}>
              <option value="">Keep current</option>
              {['Lead','Suspect','Proposal','Win','Lost'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="fg" style={{justifyContent:'flex-end'}}>
            <label style={{visibility:'hidden'}}>x</label>
            <button className="btn primary" style={{width:'100%',padding:'9px 0',fontSize:13,fontWeight:700}} onClick={logCall}>+ Log</button>
          </div>
        </div>

        {/* Row 2: Outcome pills + Follow-up + Meeting date */}
        <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:8}}>
          <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',color:'var(--gd)',whiteSpace:'nowrap'}}>OUTCOME:</span>
          <div className="og">
            {OUTCOMES.map(o=>(
              <div key={o.key} className={`oo ${o.cls} ${outcome===o.key?'sel':''}`} onClick={()=>setOutcome(o.key)}>
                {o.emoji} {o.label}
              </div>
            ))}
          </div>
          <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',flexShrink:0}}>
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              <label style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--gd)'}}>FOLLOW-UP:</label>
              <input type="date" value={followUp} onChange={e=>setFollowUp(e.target.value)} style={{padding:'5px 8px',border:'.5px solid #9FE1CB',borderRadius:6,fontSize:12,background:'#fff',outline:'none',width:140}} />
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:2}}>
              <label style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--gd)'}}>MEETING DATE:</label>
              <input type="date" value={mtgDate} onChange={e=>setMtgDate(e.target.value)} style={{padding:'5px 8px',border:'.5px solid #9FE1CB',borderRadius:6,fontSize:12,background:'#fff',outline:'none',width:140}} />
            </div>
          </div>
        </div>

        {/* Row 3: Notes */}
        <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes — objections, key points, next steps…" style={{width:'100%',padding:'8px 10px',border:'.5px solid #9FE1CB',borderRadius:'var(--r)',fontSize:12,resize:'none',height:48,outline:'none',fontFamily:'inherit',background:'#fff',color:'var(--text)',lineHeight:1.5}} />
      </div>

      {/* Bottom split */}
      <div className="two" style={{gap:12,alignItems:'start'}}>
        {/* Left: Today's log */}
        <div>
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <div className="card-hd" style={{padding:'12px 16px 10px',borderBottom:'.5px solid var(--border)'}}>
              <div>
                <div className="card-title">Today's log</div>
                <div className="card-sub">{shownCalls.length} entries logged today</div>
              </div>
              <select value={ocFilter} onChange={e=>setOcFilter(e.target.value)} style={{padding:'4px 9px',border:'.5px solid var(--border2)',borderRadius:'var(--r)',fontSize:11,background:'#fff',outline:'none'}}>
                <option value="">All outcomes</option>
                {OUTCOMES.map(o=><option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <div style={{padding:'6px 10px',maxHeight:480,overflowY:'auto'}}>
              {shownCalls.length === 0 ? (
                <div style={{color:'var(--t3)',fontSize:12,fontStyle:'italic',padding:'20px 0',textAlign:'center'}}>No calls logged yet today</div>
              ) : shownCalls.slice().sort((a,b)=>b.ts.localeCompare(a.ts)).map(c => {
                const isExpanded = expandedNoteId === c.id;
                return (
                  <div key={c.id}>
                    <div className="cl-item">
                      <div className="cl-dot" style={{background:OC_COLORS[c.oc]||'#888'}} />
                      <div className="cl-body">
                        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                          <span className="cl-firm">{c.firm}</span>
                          {c.contact && <span style={{fontSize:11,color:'var(--t3)'}}>· {c.contact}</span>}
                        </div>
                        <div className="cl-meta" style={{marginTop:3}}>
                          <span className="badge" style={{background:`${OC_COLORS[c.oc]}22`,color:OC_COLORS[c.oc],border:`.5px solid ${OC_COLORS[c.oc]}44`,fontSize:11,padding:'1px 7px',borderRadius:8}}>{OC_LABELS[c.oc]||c.oc}</span>
                          <span style={{fontSize:11,color:'var(--t3)'}}>{TYPE_LBL[c.type]||c.type}</span>
                          {c.stage && <span style={{fontSize:11,color:'var(--blue)',fontWeight:500}}>→ {c.stage}</span>}
                        </div>
                        {/* Notes — truncated with click to expand */}
                        {c.notes && (
                          <div
                            onClick={()=>setExpandedNoteId(isExpanded ? null : c.id)}
                            style={{marginTop:4,fontSize:11,color:'var(--t2)',cursor:'pointer',lineHeight:1.5,
                              ...(isExpanded ? {whiteSpace:'pre-wrap',wordBreak:'break-word'} : {overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:340})
                            }}
                            title={isExpanded ? 'Click to collapse' : 'Click to read full note'}
                          >
                            {c.notes}
                            {!isExpanded && c.notes.length > 60 && (
                              <span style={{color:'var(--blue)',marginLeft:4,fontWeight:500}}>· · ·</span>
                            )}
                          </div>
                        )}
                        {/* Expand toggle label */}
                        {c.notes && c.notes.length > 60 && (
                          <button
                            onClick={()=>setExpandedNoteId(isExpanded ? null : c.id)}
                            style={{background:'none',border:'none',padding:0,fontSize:10,color:'var(--blue)',cursor:'pointer',marginTop:2,fontWeight:500}}
                          >
                            {isExpanded ? '▲ Collapse' : '▼ Read full note'}
                          </button>
                        )}
                      </div>
                      <div className="cl-time">{fmtTime(c.ts)}</div>
                      <div className="cl-acts">
                        <button className="cl-act" onClick={()=>setEditingCall(c)}>Edit</button>
                        <button className="cl-act del" onClick={()=>deleteCall(c.id)}>✕</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Stats + Progress + Monthly */}
        <div>
          {/* 5 stat chips */}
          <div className="sg sg5" style={{marginBottom:10}}>
            {[
              {l:'Calls',v:nCalls,t:kpi.calls_day,col:'var(--text)'},
              {l:'LinkedIn',v:nLI,t:kpi.li_day||10,col:'#7F77DD'},
              {l:'Meetings today',v:nMtg,t:dailyMtgTarget,col:'#1D9E75'},
              {l:'Connect rate',v:`${connRate}%`,t:null,col:connRate>=50?'#1D9E75':'#E24B4A',sub:`${nConn} of ${nCalls} connected`},
              {l:'Not interested',v:nNI,t:null,col:'#A32D2D',sub:'Disqualified'},
            ].map(s=>{
              const pct = s.t ? Math.min(100,Math.round((typeof s.v==='number'?s.v:parseInt(s.v))/s.t*100)) : null;
              const bc = pct!==null ? (pct>=100?'#1D9E75':pct>=60?'#EF9F27':'#E24B4A') : s.col;
              return (
                <div key={s.l} className="sc">
                  <div className="sl">{s.l}</div>
                  <div className="sv" style={{color:s.col}}>{s.v}{s.t!=null&&<span style={{fontSize:13,fontWeight:400,color:'var(--t2)'}}>/{s.t}</span>}</div>
                  <div className="ss" style={{color:bc||'var(--t3)'}}>{pct!==null?`${pct}% of target`:s.sub}</div>
                  {pct!==null && <div className="sc-bar"><div className="sc-bar-fill" style={{width:`${pct}%`,background:bc||'#888'}} /></div>}
                </div>
              );
            })}
          </div>

          {/* Daily progress */}
          <div className="card">
            <div className="card-hd" style={{marginBottom:10}}><div className="card-title">Daily progress</div></div>
            {[{l:'Calls',v:nCalls,t:kpi.calls_day},{l:'LinkedIn',v:nLI,t:kpi.li_day||10},{l:'Meetings today',v:nMtg,t:dailyMtgTarget}].map(x=>{
              const {p,bc}=pctBar(x.v,x.t);
              return (
                <div key={x.l} style={{marginBottom:14}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:500}}>{x.l}</span>
                    <span style={{fontSize:13,color:'var(--t2)'}}>{x.v} / {x.t}</span>
                  </div>
                  <div className="mpb" style={{height:7}}><div className="mpf" style={{width:`${p}%`,background:bc}} /></div>
                </div>
              );
            })}
          </div>

          {/* Meetings this month */}
          <div className="card">
            <div className="card-hd" style={{marginBottom:10}}><div className="card-title">Meetings this month</div></div>
            {(()=>{
              const pctM=Math.min(100,Math.round(monthMtgs/(kpi.meetings_month||20)*100));
              const mc=pctM>=100?'#1D9E75':pctM>=60?'#EF9F27':'#E24B4A';
              return (<>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                  <span style={{fontSize:28,fontWeight:700,color:mc,lineHeight:1}}>{monthMtgs}</span>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:12,color:'var(--t2)'}}>/ {kpi.meetings_month} target</div>
                    <div style={{fontSize:11,color:proj>=(kpi.meetings_month||20)?'var(--green)':'var(--amber)',marginTop:2}}>Projected: {proj} by month end</div>
                  </div>
                </div>
                <div className="mpb" style={{height:8}}><div className="mpf" style={{width:`${pctM}%`,background:mc}} /></div>
                <div style={{fontSize:11,color:'var(--t3)',marginTop:5}}>Day {dayOfM} of {daysInM}</div>
              </>);
            })()}
          </div>
        </div>
      </div>

      {/* ── Inline Edit Call Modal ── */}
      {editingCall && <EditCallModal
        call={editingCall}
        firms={firms}
        onSave={saveEdit}
        onClose={()=>setEditingCall(null)}
      />}
    </div>
  );
}
