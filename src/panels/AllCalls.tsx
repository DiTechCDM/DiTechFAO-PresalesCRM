import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store';
import { fmtFull, fmtDate, OC_LABELS, OC_COLORS, TYPE_LBL, TODAY, MONTH_START } from '../lib/utils';

export default function AllCalls() {
  const { calls, admin, scopeCalls } = useAppContext();
  const [search, setSearch] = useState('');
  const [repF, setRepF] = useState('');
  const [ocF, setOcF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [rangePreset, setRangePreset] = useState('7d');
  const [rangeFrom, setRangeFrom] = useState(() => { const d=new Date(); d.setDate(d.getDate()-6); return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }); });
  const [rangeTo, setRangeTo] = useState(TODAY);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [expandedNoteId, setExpandedNoteId] = useState<string|null>(null);

  const setPreset = (p: string) => {
    setRangePreset(p);
    const t = new Date(); t.setHours(0,0,0,0);
    if (p === 'today') { setRangeFrom(TODAY); setRangeTo(TODAY); }
    else if (p === 'yesterday') { const y=new Date(t); y.setDate(y.getDate()-1); const s=y.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }); setRangeFrom(s); setRangeTo(s); }
    else if (p === '7d') { const f=new Date(t); f.setDate(f.getDate()-6); setRangeFrom(f.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })); setRangeTo(TODAY); }
    else if (p === '30d') { const f=new Date(t); f.setDate(f.getDate()-29); setRangeFrom(f.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' })); setRangeTo(TODAY); }
    else if (p === 'month') { setRangeFrom(MONTH_START); setRangeTo(TODAY); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    return scopeCalls(calls).filter(c => {
      const d = c.ts.split('T')[0];
      if (d < rangeFrom || d > rangeTo) return false;
      if (repF && c.rep !== repF) return false;
      if (ocF && c.oc !== ocF) return false;
      if (typeF && c.type !== typeF) return false;
      if (search) { const b=[c.firm,c.rep,c.notes||'',c.contact||''].join(' ').toLowerCase(); if (!b.includes(search.toLowerCase())) return false; }
      return true;
    }).sort((a,b) => b.ts.localeCompare(a.ts));
  }, [calls, scopeCalls, rangeFrom, rangeTo, repF, ocF, typeF, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page-1)*perPage, page*perPage);
  const nC = filtered.filter(c=>c.type==='call'||c.type==='followup').length;
  const nM = filtered.filter(c=>c.oc==='mtg').length;
  const nL = filtered.filter(c=>c.type==='linkedin').length;
  const conv = nC > 0 ? (nM/nC*100).toFixed(1) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="page-hd">
        <div><div className="page-title">All Calls</div><div className="page-sub">{filtered.length} entries in range</div></div>
      </div>

      <div className="date-bar">
        <span style={{fontSize:11,color:'var(--t2)'}}>Period:</span>
        {['today','yesterday','7d','30d','month','custom'].map(p=>(
          <button key={p} className={`dr-btn ${rangePreset===p?'on':''}`} onClick={()=>setPreset(p)}>
            {p==='today'?'Today':p==='yesterday'?'Yesterday':p==='7d'?'Last 7 days':p==='30d'?'Last 30 days':p==='month'?'This month':'Custom'}
          </button>
        ))}
        {rangePreset === 'custom' && (
          <div style={{display:'flex',alignItems:'center',gap:5}}>
            <input type="date" className="date-inp" value={rangeFrom} onChange={e=>{setRangeFrom(e.target.value);setPage(1);}} />
            <span style={{fontSize:11,color:'var(--t2)'}}>to</span>
            <input type="date" className="date-inp" value={rangeTo} onChange={e=>{setRangeTo(e.target.value);setPage(1);}} />
          </div>
        )}
        <span style={{fontSize:11,color:'var(--t2)'}}>{rangeFrom===rangeTo ? fmtDate(rangeFrom) : `${fmtDate(rangeFrom)} – ${fmtDate(rangeTo)}`}</span>
      </div>

      <div className="sg sg4" style={{marginBottom:10}}>
        <div className="sc"><div className="sl">Entries</div><div className="sv">{filtered.length}</div><div className="ss">In selected range</div></div>
        <div className="sc"><div className="sl">Calls made</div><div className="sv">{nC}</div><div className="ss">Cold + follow-up</div></div>
        <div className="sc"><div className="sl">Meetings set</div><div className="sv" style={{color:'#1D9E75'}}>{nM}</div><div className="ss">{conv}% conv.</div></div>
        <div className="sc"><div className="sl">LinkedIn msgs</div><div className="sv">{nL}</div><div className="ss">Outreach</div></div>
      </div>

      <div className="toolbar">
        <input type="text" placeholder="Search firm, rep, notes…" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
        <select value={repF} onChange={e=>{setRepF(e.target.value);setPage(1);}}>
          <option value="">All reps</option>{admin.reps?.map(r=><option key={r.name}>{r.name}</option>)}
        </select>
        <select value={ocF} onChange={e=>{setOcF(e.target.value);setPage(1);}}>
          <option value="">All outcomes</option>
          {Object.entries(OC_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select value={typeF} onChange={e=>{setTypeF(e.target.value);setPage(1);}}>
          <option value="">All types</option><option value="call">Cold call</option><option value="followup">Follow-up</option><option value="linkedin">LinkedIn</option><option value="email">Email</option><option value="meeting">Meeting</option>
        </select>
      </div>

      <div className="tw">
        <div className="tscroll">
          <table>
            <thead><tr>
              <th>Time</th><th>Rep</th><th>Firm</th><th>Contact</th><th>Type</th><th>Outcome</th><th>Stage</th><th>Notes</th><th>Follow-up</th>
            </tr></thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={9} style={{padding:24,textAlign:'center',color:'var(--t3)',fontStyle:'italic'}}>No entries for this period</td></tr>
              ) : paged.map(c => {
                const repObj = admin.reps?.find(r=>r.name===c.rep);
                const col = repObj?.col || '#888';
                return (
                  <tr key={c.id}>
                    <td style={{fontSize:12,color:'var(--t2)',whiteSpace:'nowrap'}}>{fmtFull(c.ts)}</td>
                    <td><div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:7,height:7,borderRadius:'50%',background:col}} /><span style={{fontWeight:500}}>{c.rep}</span></div></td>
                    <td style={{fontWeight:500}}>{c.firm}</td>
                    <td style={{fontSize:12,color:'var(--t2)'}}>{c.contact||'—'}</td>
                    <td style={{fontSize:12,color:'var(--t2)'}}>{TYPE_LBL[c.type]||c.type}</td>
                    <td><span style={{fontSize:11,padding:'2px 8px',borderRadius:6,background:`${OC_COLORS[c.oc]}22`,color:OC_COLORS[c.oc],fontWeight:500}}>{OC_LABELS[c.oc]||c.oc}</span></td>
                    <td style={{fontSize:12,color:'var(--blue)'}}>{c.stage||'—'}</td>
                    <td style={{maxWidth:240,fontSize:12,color:'var(--t2)',verticalAlign:'top'}}>
                      {c.notes && c.notes !== '—' ? (
                        <div>
                          <div
                            onClick={()=>setExpandedNoteId(expandedNoteId===c.id?null:c.id)}
                            style={{cursor:'pointer',lineHeight:1.5,
                              ...(expandedNoteId===c.id
                                ? {whiteSpace:'pre-wrap',wordBreak:'break-word'}
                                : {overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'})
                            }}
                            title={expandedNoteId===c.id?'Click to collapse':'Click to read full note'}
                          >{c.notes}</div>
                          {c.notes.length > 50 && (
                            <button onClick={()=>setExpandedNoteId(expandedNoteId===c.id?null:c.id)}
                              style={{background:'none',border:'none',padding:0,fontSize:10,color:'var(--blue)',cursor:'pointer',fontWeight:500}}>
                              {expandedNoteId===c.id?'▲ Less':'▼ More'}
                            </button>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td style={{fontSize:12,color:'var(--amber)'}}>{c.fu ? fmtDate(c.fu) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <div className="pg-info">Showing {filtered.length?(page-1)*perPage+1:0}–{Math.min(page*perPage,filtered.length)} of {filtered.length}</div>
          <button className="pg-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
          <span style={{fontSize:12,color:'var(--t2)'}}>Page {page} of {totalPages}</span>
          <button className="pg-btn" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>
      </div>
    </div>
  );
}
