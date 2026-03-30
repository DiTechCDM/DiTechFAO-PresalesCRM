import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '../store';
import { SDC, fmtDate, fmtGBP, OC_LABELS, OC_COLORS, uid, TODAY } from '../lib/utils';
import { exportToXlsx, parseCSVText, parseXlsxBinary } from '../lib/xlsx';
import { Firm, FirmContact } from '../types';

const BLANK_FIRM: Partial<Firm> = { name:'',ch_number:'',city:'',region:'',size:'',staff_count:'',contact_name:'',contact_title:'',phone:'',email:'',main_phone:'',contact_li:'',website:'',linkedin:'',software:'',source:'',stage:'Lead',pricing_model:'',service_interest:'',assigned_to:'',last_contact:'',follow_up:'',notes:'',win_amount:0 };

export default function FirmsDB({ onLogCall }: { onLogCall?: (firmId: string) => void }) {
  const { firms, setFirms, calls, currentUser, admin, showToast, hasPerm, scopeFirms } = useAppContext();
  const [search, setSearch] = useState('');
  const [stageF, setStageF] = useState('');
  const [sizeF, setSizeF] = useState('');
  const [srcF, setSrcF] = useState('');
  const [repF, setRepF] = useState('');
  const [sortCol, setSortCol] = useState('added_date');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [page, setPage] = useState(1);
  const perPage = 25;
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<'add'|'edit'|'upload'|null>(null);
  const [modalTab, setModalTab] = useState<'details'|'contacts'|'pipeline'>('details');
  const [editId, setEditId] = useState<string|null>(null);
  const [form, setForm] = useState<Partial<Firm>>(BLANK_FIRM);
  const [confirm, setConfirm] = useState<{title:string;body:string;ok:string;cls?:string;cb:()=>void}|null>(null);
  const [uploadData, setUploadData] = useState<{headers:string[];rows:any[][]}|null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const scoped = useMemo(() => scopeFirms(firms), [firms, scopeFirms]);

  const filtered = useMemo(() => {
    let res = scoped.filter(f => {
      if (stageF && f.stage !== stageF) return false;
      if (sizeF && f.size !== sizeF) return false;
      if (srcF && f.source !== srcF) return false;
      if (repF && f.assigned_to !== repF) return false;
      if (search) { const q = search.toLowerCase(); const b = [f.name,f.city,f.contact_name,f.email,f.phone,f.notes,f.region,f.software,f.ch_number].join(' ').toLowerCase(); if (!b.includes(q)) return false; }
      return true;
    });
    res.sort((a:any,b:any) => { const av=a[sortCol]||'', bv=b[sortCol]||''; const r=String(av).localeCompare(String(bv),undefined,{numeric:true,sensitivity:'base'}); return sortDir==='asc'?r:-r; });
    return res;
  }, [scoped, search, stageF, sizeF, srcF, repF, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page-1)*perPage, page*perPage);
  const winsTotal = scoped.filter(f=>f.stage==='Win').reduce((s,f)=>s+(f.win_amount||0),0);

  const handleSort = (col:string) => { if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortCol(col);setSortDir('asc');} setPage(1); };
  const toggleAll = (checked:boolean) => { const n=new Set(sel); paged.forEach(f=>checked?n.add(f.id):n.delete(f.id)); setSel(n); };
  const toggleRow = (id:string, checked:boolean) => { const n=new Set(sel); checked?n.add(id):n.delete(id); setSel(n); };

  const openAdd = () => { setForm({...BLANK_FIRM, contacts:[]}); setEditId(null); setModalTab('details'); setModal('add'); };
  const openEdit = (f:Firm) => { setForm({...f, contacts: f.contacts||[]}); setEditId(f.id); setModalTab('details'); setModal('edit'); };

  const saveFirm = () => {
    if (!form.name?.trim()) { showToast('Firm name required','err'); return; }
    if (editId) { setFirms(firms.map(f=>f.id===editId?{...f,...form}:f)); showToast('Firm updated','ok'); }
    else { setFirms([{id:uid(),added_date:TODAY,added_by:currentUser?.name||'',...(form as Firm)}, ...firms]); showToast('Firm added','ok'); }
    setModal(null);
  };

  const deleteFirm = (id:string) => {
    const f=firms.find(x=>x.id===id); if(!f) return;
    setConfirm({title:'Delete firm',body:`Delete <strong>${f.name}</strong>? This cannot be undone.`,ok:'Delete',cls:'danger',cb:()=>{setFirms(firms.filter(x=>x.id!==id));const next=new Set(sel);next.delete(id);setSel(next);showToast('Firm deleted','err');}});
  };

  const quickStage = (id:string, stage:string) => {
    setFirms(firms.map(f=>f.id===id?{...f,stage}:f));
    showToast(`Stage → ${stage}`,'ok');
  };

  const exportData = () => {
    const headers = ['Firm Name','Companies House','City','Region','Size','Contact','Phone','Email','Software','Source','Stage','Assigned','Win Amount £','Last Contact','Follow-up','Notes'];
    const rows = filtered.map(f => ({
      'Firm Name': f.name, 'Companies House': f.ch_number ?? '', 'City': f.city ?? '',
      'Region': f.region ?? '', 'Size': f.size ?? '', 'Contact': f.contact_name ?? '',
      'Phone': f.phone ?? '', 'Email': f.email ?? '', 'Software': f.software ?? '',
      'Source': f.source ?? '', 'Stage': f.stage, 'Assigned': f.assigned_to ?? '',
      'Win Amount £': f.win_amount || '', 'Last Contact': f.last_contact ?? '',
      'Follow-up': f.follow_up ?? '', 'Notes': f.notes ?? '',
    }));
    exportToXlsx(headers, rows, `DiTechFAO_Firms_${TODAY}.xlsx`);
    showToast(`Exported ${rows.length} firms`, 'ok');
  };

  const handleUploadFile = (file: File) => {
    const r = new FileReader();
    if (file.name.toLowerCase().endsWith('.csv')) {
      r.onload = e => {
        const text = e.target?.result as string;
        const rows = parseCSVText(text);
        if (rows.length < 2) { showToast('File appears empty', 'err'); return; }
        setUploadData({ headers: rows[0], rows: rows.slice(1) });
        setModal('upload');
      };
      r.readAsText(file);
    } else {
      // .xlsx / .xls
      r.onload = async e => {
        const buf = e.target?.result as ArrayBuffer;
        const rows = await parseXlsxBinary(buf);
        if (rows.length < 2) { showToast('File appears empty or unreadable', 'err'); return; }
        setUploadData({ headers: rows[0], rows: rows.slice(1) });
        setModal('upload');
      };
      r.readAsArrayBuffer(file);
    }
  };

  const importData = () => {
    if (!uploadData) return;
    const hs = uploadData.headers.map((h:string)=>String(h).toLowerCase().trim());
    const g = (keys:string[]) => { for(const k of keys){const i=hs.findIndex(h=>h.includes(k));if(i>=0)return i;} return -1; };

    // Core firm columns
    const idx = {
      name:         g(['firm name','company name','firm','company']),
      city:         g(['city','town']),
      region:       g(['region']),
      size:         g(['size']),
      staff_count:  g(['staff count','staff']),
      ch_number:    g(['companies house','ch number','ch no']),
      website:      g(['website','web']),
      software:     g(['software','accounting software']),
      source:       g(['source','lead source']),
      stage:        g(['stage','status']),
      assigned_to:  g(['assigned to','rep','assigned']),
      notes:        g(['firm notes','notes','comments']),
      win_amount:   g(['win amount','amount','value']),
      main_phone:   g(['switchboard','main phone','main number']),
    };

    // Contact columns — support up to 3 contacts per row
    const cIdx = (n: number, field: string) => {
      const prefix = n === 1 ? ['contact','contact 1','c1'] : [`contact ${n}`,`c${n}`];
      const suffixes: Record<string,string[]> = {
        name:     ['name'],
        title:    ['title','job title','role'],
        phone:    ['phone','direct phone','direct','tel'],
        email:    ['email'],
        linkedin: ['linkedin','li'],
        notes:    ['notes','contact notes'],
      };
      const keys = prefix.flatMap(p => (suffixes[field]||[field]).map(s => `${p} ${s}`));
      // Also try bare "contact name" for single-contact CSVs
      if (n === 1 && field === 'name') keys.push('contact name','key contact');
      if (n === 1 && field === 'title') keys.push('contact title','job title');
      if (n === 1 && field === 'phone') keys.push('phone','direct phone','telephone');
      if (n === 1 && field === 'email') keys.push('email');
      return g(keys);
    };

    const newFirms = [...firms];
    let added = 0, skipped = 0, updated = 0;

    uploadData.rows.forEach(row => {
      const gv = (i:number) => i>=0 ? String(row[i]||'').trim() : '';
      const name = gv(idx.name);
      if (!name) { skipped++; return; }

      // Build contacts array from CSV contact columns
      const contacts: FirmContact[] = [];
      for (let n = 1; n <= 3; n++) {
        const cName = gv(cIdx(n, 'name'));
        if (!cName) continue;
        contacts.push({
          id: uid(),
          name: cName,
          title:    gv(cIdx(n, 'title'))    || undefined,
          phone:    gv(cIdx(n, 'phone'))    || undefined,
          email:    gv(cIdx(n, 'email'))    || undefined,
          linkedin: gv(cIdx(n, 'linkedin')) || undefined,
          notes:    gv(cIdx(n, 'notes'))    || undefined,
          isPrimary: n === 1,
        });
      }

      // Primary contact → also sync legacy flat fields
      const primary = contacts[0];
      const data: Partial<Firm> = {
        name,
        city:         gv(idx.city)        || undefined,
        region:       gv(idx.region)      || undefined,
        size:         gv(idx.size)        || undefined,
        staff_count:  gv(idx.staff_count) || undefined,
        ch_number:    gv(idx.ch_number)   || undefined,
        website:      gv(idx.website)     || undefined,
        main_phone:   gv(idx.main_phone)  || undefined,
        software:     gv(idx.software)    || undefined,
        source:       gv(idx.source)      || undefined,
        stage:        gv(idx.stage)       || 'Lead',
        assigned_to:  gv(idx.assigned_to) || undefined,
        notes:        gv(idx.notes)       || undefined,
        win_amount:   parseFloat(gv(idx.win_amount)) || 0,
        added_date:   TODAY,
        added_by:     'Import',
        // Sync primary contact to legacy fields for backwards compat
        ...(primary ? {
          contact_name:  primary.name,
          contact_title: primary.title,
          phone:         primary.phone,
          email:         primary.email,
          contact_li:    primary.linkedin,
        } : {}),
        // Merge contacts: keep existing contacts not in new CSV, add/update new ones
        contacts: contacts.length > 0 ? contacts : undefined,
      };

      const ex = newFirms.find(f => f.name.toLowerCase() === name.toLowerCase());
      if (ex) {
        // Merge contacts rather than replace — add new, keep existing
        const existingContacts = ex.contacts || [];
        const mergedContacts = [...existingContacts];
        (contacts || []).forEach(nc => {
          const already = mergedContacts.find(ec => ec.name.toLowerCase() === nc.name.toLowerCase());
          if (!already) mergedContacts.push(nc);
          else Object.assign(already, nc); // update existing
        });
        Object.assign(ex, { ...data, contacts: mergedContacts.length ? mergedContacts : undefined });
        updated++;
      } else {
        newFirms.unshift({ id: uid(), ...data } as Firm);
        added++;
      }
    });

    setFirms(newFirms);
    setModal(null);
    setUploadData(null);
    showToast(`Imported ${added} new · ${updated} updated${skipped ? ` · ${skipped} skipped` : ''}`, 'ok');
  };

  const bulkStage = () => {
    const stages=['Lead','Suspect','Proposal','Win','Lost'];
    setConfirm({title:`Move ${sel.size} firms`,body:`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${stages.map(s=>`<label style="display:flex;align-items:center;gap:5px;padding:5px 10px;border:.5px solid #ddd;border-radius:12px;cursor:pointer"><input type="radio" name="bs" value="${s}"> ${s}</label>`).join('')}</div>`,ok:'Move',cb:()=>{const s=document.querySelector<HTMLInputElement>('input[name="bs"]:checked')?.value;if(!s){showToast('Pick a stage','err');return;}setFirms(firms.map(f=>sel.has(f.id)?{...f,stage:s}:f));setSel(new Set());showToast(`Stage → ${s}`,'ok');}});
  };
  const bulkAssign = () => {
    const reps=admin.reps?.filter(r=>r.status==='Active').map(r=>r.name)||[];
    setConfirm({title:`Assign ${sel.size} firms`,body:`<div style="display:flex;flex-direction:column;gap:5px;margin-top:8px">${reps.map(r=>`<label style="display:flex;align-items:center;gap:8px;padding:7px;border:.5px solid #ddd;border-radius:6px;cursor:pointer"><input type="radio" name="ba" value="${r}"> ${r}</label>`).join('')}</div>`,ok:'Assign',cb:()=>{const r=document.querySelector<HTMLInputElement>('input[name="ba"]:checked')?.value;if(!r){showToast('Pick a rep','err');return;}setFirms(firms.map(f=>sel.has(f.id)?{...f,assigned_to:r}:f));setSel(new Set());showToast(`Assigned to ${r}`,'ok');}});
  };
  const bulkDelete = () => { setConfirm({title:`Delete ${sel.size} firms`,body:`Delete <strong>${sel.size} firms</strong>? Cannot be undone.`,ok:'Delete all',cls:'danger',cb:()=>{setFirms(firms.filter(f=>!sel.has(f.id)));setSel(new Set());showToast('Deleted','err');}}); };

  const th = (col:string,label:string) => (
    <th onClick={()=>handleSort(col)} className={sortCol===col?'sorted':''}>
      {label}<span className="sort-arrow">{sortCol===col?(sortDir==='asc'?'↑':'↓'):'↕'}</span>
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="page-hd">
        <div>
          <div className="page-title">UK Firms Database</div>
          <div className="page-sub">{scoped.length} firms · {filtered.length} shown</div>
        </div>
        <div style={{display:'flex',gap:7}}>
          {hasPerm('addFirm') && <button className="btn ghost" onClick={openAdd}>+ Add firm</button>}
          <button className="btn primary" onClick={()=>setModal('upload')}>↑ Upload</button>
          {hasPerm('export') && <button className="btn" onClick={exportData}>↓ Export</button>}
        </div>
      </div>

      <div className="sg sg5">
        <div className="sc"><div className="sl">Total in DB</div><div className="sv">{scoped.length}</div><div className="ss">{filtered.length} shown</div></div>
        <div className="sc"><div className="sl">Leads</div><div className="sv">{scoped.filter(f=>f.stage==='Lead').length}</div><div className="ss">Top of funnel</div></div>
        <div className="sc"><div className="sl">Proposals</div><div className="sv">{scoped.filter(f=>f.stage==='Proposal').length}</div><div className="ss">Closest to close</div></div>
        <div className="sc"><div className="sl">Wins</div><div className="sv" style={{color:'#1D9E75'}}>{scoped.filter(f=>f.stage==='Win').length}</div><div className="ss">{fmtGBP(winsTotal)} total</div></div>
        <div className="sc"><div className="sl">Follow-ups overdue</div><div className="sv" style={{color:'#A32D2D'}}>{scoped.filter(f=>f.follow_up&&f.follow_up<=TODAY&&f.stage!=='Win'&&f.stage!=='Lost').length}</div><div className="ss">Need attention</div></div>
      </div>

      {sel.size>0 && (
        <div className="bulk-bar">
          <span className="bc">{sel.size} selected</span>
          <div className="bulk-acts">
            <button className="bb2" onClick={bulkAssign}>Assign rep</button>
            <button className="bb2" onClick={bulkStage}>Change stage</button>
            {hasPerm('export')&&<button className="bb2" onClick={exportData}>Export</button>}
            {hasPerm('delete')&&<button className="bb2 red" onClick={bulkDelete}>Delete</button>}
            <button className="bb2" onClick={()=>setSel(new Set())}>Clear</button>
          </div>
        </div>
      )}

      <div className="toolbar">
        <input type="text" placeholder="Search firm, city, contact, notes… ( / )" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} />
        <select value={stageF} onChange={e=>{setStageF(e.target.value);setPage(1);}}><option value="">All stages</option><option>Lead</option><option>Suspect</option><option>Proposal</option><option>Win</option><option>Lost</option></select>
        <select value={sizeF} onChange={e=>{setSizeF(e.target.value);setPage(1);}}><option value="">All sizes</option><option>SME (1–10)</option><option>Mid (11–50)</option><option>Large (50+)</option></select>
        <select value={srcF} onChange={e=>{setSrcF(e.target.value);setPage(1);}}><option value="">All sources</option><option>Data mining</option><option>LinkedIn</option><option>Event</option><option>SEO / Inbound</option><option>Referral</option></select>
        <select value={repF} onChange={e=>{setRepF(e.target.value);setPage(1);}}><option value="">All reps</option>{admin.reps?.map(r=><option key={r.name}>{r.name}</option>)}</select>
        <button className="btn" onClick={()=>{setSearch('');setStageF('');setSizeF('');setSrcF('');setRepF('');setPage(1);}}>Clear</button>
      </div>

      <div className="tw">
        <div className="tscroll">
          <table>
            <thead><tr>
              <th className="cb-col"><input type="checkbox" checked={paged.length>0&&paged.every(f=>sel.has(f.id))} onChange={e=>toggleAll(e.target.checked)} /></th>
              {th('name','Firm name')}{th('city','City')}{th('size','Size')}{th('contact_name','Contact')}{th('phone','Phone / Email')}{th('software','Software')}{th('source','Source')}
              {th('stage','Stage')}{th('assigned_to','Rep')}{th('win_amount','Amount')}
              <th>Calls</th>{th('last_contact','Last contact')}<th>Last outcome</th>{th('follow_up','Follow-up')}<th></th>
            </tr></thead>
            <tbody>
              {paged.length===0 ? (
                <tr><td colSpan={16}><div className="empty-st"><div style={{fontSize:28,marginBottom:8}}>🔍</div><div style={{fontSize:14,fontWeight:500,color:'var(--t2)'}}>No firms match</div></div></td></tr>
              ) : paged.map(f => {
                const firmCalls = calls.filter(c=>c.firmId===f.id||(c.firm===f.name&&!c.firmId));
                const lastCall = firmCalls.length ? firmCalls.slice().sort((a,b)=>b.ts.localeCompare(a.ts))[0] : null;
                const fuOver = f.follow_up && f.follow_up<=TODAY && f.stage!=='Win' && f.stage!=='Lost';
                return (
                  <tr key={f.id} className={`hrow ${sel.has(f.id)?'sel-row':''}`}>
                    <td className="cb-col"><input type="checkbox" checked={sel.has(f.id)} onChange={e=>toggleRow(f.id,e.target.checked)} /></td>
                    <td style={{whiteSpace:'nowrap',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis'}} title={f.name}><strong>{f.name}</strong></td>
                    <td style={{color:'var(--t2)',fontSize:12}}>{f.city}</td>
                    <td style={{fontSize:12}}>{f.size||'—'}</td>
                    <td style={{maxWidth:120}}><div style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{f.contact_name||'—'}</div><div style={{fontSize:11,color:'var(--t2)'}}>{f.contact_title}</div></td>
                    <td style={{maxWidth:130}}><div style={{fontSize:12,color:'var(--blue)'}}>{f.phone||f.main_phone||'—'}</div><div style={{fontSize:11,color:'var(--t2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.email}</div></td>
                    <td><span className="spill">{f.software||'—'}</span></td>
                    <td><span className="spill">{f.source||'—'}</span></td>
                    <td>
                      <select className={`stage-dd ${SDC[f.stage]||'sd-lead'}`} value={f.stage} onChange={e=>quickStage(f.id,e.target.value)} onClick={e=>e.stopPropagation()}>
                        {['Lead','Suspect','Proposal','Win','Lost'].map(s=><option key={s}>{s}</option>)}
                      </select>
                    </td>
                    <td style={{fontSize:12,color:'var(--t2)'}}>{f.assigned_to||'—'}</td>
                    <td style={{fontSize:12,fontWeight:500,color:f.win_amount?'#7F77DD':'var(--t3)'}}>{f.win_amount?fmtGBP(f.win_amount):'—'}</td>
                    <td style={{textAlign:'center'}}>
                      <div style={{fontSize:13,fontWeight:600,color:firmCalls.length>0?'var(--brand)':'var(--t3)'}}>{firmCalls.length||'—'}</div>
                      {firmCalls.length>0&&<div style={{fontSize:10,color:'var(--t3)'}}>{firmCalls.length===1?'call':'calls'}</div>}
                    </td>
                    <td style={{fontSize:12,color:'var(--t2)'}}>{fmtDate(f.last_contact)}</td>
                    <td>
                      {lastCall ? <><span style={{fontSize:11,padding:'2px 7px',borderRadius:6,background:`${OC_COLORS[lastCall.oc]}18`,color:OC_COLORS[lastCall.oc],fontWeight:500,border:`.5px solid ${OC_COLORS[lastCall.oc]}33`,whiteSpace:'nowrap'}}>{OC_LABELS[lastCall.oc]||lastCall.oc}</span><div style={{fontSize:10,color:'var(--t3)',marginTop:2}}>{fmtDate(lastCall.ts)}</div></> : <span style={{fontSize:11,color:'var(--t3)'}}>No calls yet</span>}
                    </td>
                    <td style={{fontSize:12,color:fuOver?'var(--red)':'var(--t2)',fontWeight:fuOver?600:'normal'}}>{fmtDate(f.follow_up)}{fuOver?' ⚠':''}</td>
                    <td>
                      <div className="qa">
                        <button className="qa-btn qg" onClick={()=>onLogCall?.(f.id)}>📞 Log call</button>
                        {hasPerm('editFirm')&&<button className="qa-btn" onClick={()=>openEdit(f)}>✏️ Edit</button>}
                        {hasPerm('delete')&&<button className="qa-btn" style={{borderColor:'#f0c0c0',color:'var(--red)'}} onClick={()=>deleteFirm(f.id)}>🗑</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <div className="pg-info">Showing {filtered.length?(page-1)*perPage+1:0}–{Math.min(page*perPage,filtered.length)} of {filtered.length}</div>
          <button className="pg-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>
          <div className="pg-pages">
            {Array.from({length:totalPages},((_,i)=>i+1)).filter(p=>p===1||p===totalPages||Math.abs(p-page)<=1).map((p,i,arr)=>(
              <React.Fragment key={p}>{i>0&&arr[i-1]!==p-1&&<button disabled style={{border:'none',background:'none',color:'var(--t3)',cursor:'default'}}>…</button>}<button className={p===page?'on':''} onClick={()=>setPage(p)}>{p}</button></React.Fragment>
            ))}
          </div>
          <button className="pg-btn" disabled={page>=totalPages} onClick={()=>setPage(p=>p+1)}>Next →</button>
        </div>
      </div>

      {/* Add/Edit Modal — tabbed */}
      {(modal==='add'||modal==='edit') && (
        <div className="mov" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}>
          <div className="modal" style={{width:620,maxHeight:'90vh',display:'flex',flexDirection:'column'}} onClick={e=>e.stopPropagation()}>

            {/* Header */}
            <div className="mhd" style={{flexShrink:0}}>
              <h2>{modal==='add'?'Add new firm':`Edit — ${form.name}`}</h2>
              <button className="mx" onClick={()=>setModal(null)}>✕</button>
            </div>

            {/* Tab bar */}
            <div style={{display:'flex',gap:0,borderBottom:'.5px solid var(--border)',flexShrink:0,padding:'0 18px'}}>
              {([
                {key:'details',   label:'🏢 Firm details'},
                {key:'contacts',  label:`👥 Contacts (${(form.contacts||[]).length})`},
                {key:'pipeline',  label:'📊 Pipeline & sourcing'},
              ] as {key:'details'|'contacts'|'pipeline';label:string}[]).map(t=>(
                <button key={t.key} onClick={()=>setModalTab(t.key)}
                  style={{padding:'10px 16px',border:'none',background:'none',fontSize:13,fontWeight:modalTab===t.key?700:400,
                    color:modalTab===t.key?'var(--brand)':'var(--t2)',cursor:'pointer',
                    borderBottom:modalTab===t.key?'2.5px solid var(--brand)':'2.5px solid transparent',
                    marginBottom:-1,transition:'all .1s'}}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Scrollable body */}
            <div className="mbd" style={{flex:1,overflowY:'auto'}}>

              {/* ── TAB 1: Firm details ── */}
              {modalTab==='details' && (
                <div className="form-grid">
                  <div className="fs-title">Firm details</div>
                  <div className="fg"><label>Firm name *</label><input value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                  <div className="fg"><label>Companies House</label><input value={form.ch_number||''} onChange={e=>setForm(f=>({...f,ch_number:e.target.value}))} /></div>
                  <div className="fg"><label>City *</label><input value={form.city||''} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></div>
                  <div className="fg"><label>Region</label>
                    <select value={form.region||''} onChange={e=>setForm(f=>({...f,region:e.target.value}))}>
                      <option value="">Select</option>
                      {['London','South East','South West','East of England','Midlands','North West','North East','Yorkshire','Scotland','Wales','Northern Ireland'].map(r=><option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>Firm size</label>
                    <select value={form.size||''} onChange={e=>setForm(f=>({...f,size:e.target.value}))}>
                      <option value="">Select</option><option>SME (1–10)</option><option>Mid (11–50)</option><option>Large (50+)</option>
                    </select>
                  </div>
                  <div className="fg"><label>Staff count</label><input type="number" value={form.staff_count||''} onChange={e=>setForm(f=>({...f,staff_count:e.target.value}))} /></div>
                  <div className="fg"><label>Website</label><input value={form.website||''} onChange={e=>setForm(f=>({...f,website:e.target.value}))} /></div>
                  <div className="fg"><label>Switchboard</label><input value={form.main_phone||''} onChange={e=>setForm(f=>({...f,main_phone:e.target.value}))} /></div>
                  <div className="fg full"><label>Notes / intel</label><textarea value={form.notes||''} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} /></div>
                </div>
              )}

              {/* ── TAB 2: Contacts ── */}
              {modalTab==='contacts' && (
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>People at {form.name||'this firm'}</div>
                      <div style={{fontSize:11,color:'var(--t2)',marginTop:2}}>Add every person you've spoken to or plan to contact. The primary contact syncs to the Firms DB table.</div>
                    </div>
                    <button className="btn primary sm" onClick={()=>{
                      const newC:FirmContact={id:uid(),name:'',title:'',phone:'',email:'',linkedin:'',notes:'',isPrimary:(form.contacts||[]).length===0};
                      setForm(f=>({...f,contacts:[...(f.contacts||[]),newC]}));
                    }}>+ Add contact</button>
                  </div>

                  {(form.contacts||[]).length===0 ? (
                    <div style={{padding:'32px 0',textAlign:'center',color:'var(--t3)'}}>
                      <div style={{fontSize:28,marginBottom:8}}>👤</div>
                      <div style={{fontSize:13,fontWeight:500,marginBottom:4}}>No contacts yet</div>
                      <div style={{fontSize:12,marginBottom:16}}>Add the people you speak to at {form.name||'this firm'}</div>
                      <button className="btn primary" onClick={()=>{
                        const newC:FirmContact={id:uid(),name:'',title:'',phone:'',email:'',linkedin:'',notes:'',isPrimary:true};
                        setForm(f=>({...f,contacts:[newC]}));
                      }}>+ Add first contact</button>
                    </div>
                  ) : (form.contacts||[]).map((c,ci)=>(
                    <div key={c.id} style={{background:c.isPrimary?'var(--brand-light)':'var(--s2)',border:`.5px solid ${c.isPrimary?'#c8c7e8':'var(--border)'}`,borderRadius:'var(--rl2)',padding:'14px 16px',marginBottom:10}}>

                      {/* Contact header */}
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:32,height:32,borderRadius:'50%',background:c.isPrimary?'var(--brand)':'#ddd',color:c.isPrimary?'#fff':'var(--t2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>
                            {c.name?c.name.substring(0,2).toUpperCase():'?'}
                          </div>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:c.isPrimary?'var(--brand)':'var(--text)'}}>{c.name||'New contact'}</div>
                            <div style={{fontSize:11,color:'var(--t2)'}}>{c.title||'No title yet'}</div>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:6,alignItems:'center'}}>
                          {c.isPrimary
                            ? <span style={{fontSize:10,padding:'2px 8px',borderRadius:8,background:'var(--brand)',color:'#fff',fontWeight:600}}>★ Primary</span>
                            : <button className="btn xs" onClick={()=>{
                                setForm(f=>({...f,contacts:(f.contacts||[]).map((x,i)=>({...x,isPrimary:i===ci}))}));
                              }} style={{fontSize:10}}>Set primary</button>
                          }
                          <button className="btn xs danger" onClick={()=>{
                            setForm(f=>({...f,contacts:(f.contacts||[]).filter((_,i)=>i!==ci)}));
                          }}>Remove</button>
                        </div>
                      </div>

                      {/* Contact fields — 2 col grid */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        <div className="fg">
                          <label>Full name *</label>
                          <input value={c.name||''} placeholder="e.g. Alan Griffiths"
                            onChange={e=>{
                              const n=e.target.value;
                              setForm(f=>({...f,
                                contacts:(f.contacts||[]).map((x,i)=>i===ci?{...x,name:n}:x),
                                // keep legacy contact_name in sync for primary
                                ...(c.isPrimary?{contact_name:n}:{})
                              }));
                            }} />
                        </div>
                        <div className="fg">
                          <label>Job title</label>
                          <input value={c.title||''} placeholder="e.g. Managing Partner"
                            onChange={e=>{
                              const v=e.target.value;
                              setForm(f=>({...f,
                                contacts:(f.contacts||[]).map((x,i)=>i===ci?{...x,title:v}:x),
                                ...(c.isPrimary?{contact_title:v}:{})
                              }));
                            }} />
                        </div>
                        <div className="fg">
                          <label>Direct phone</label>
                          <input value={c.phone||''} placeholder="0207 123 4567"
                            onChange={e=>{
                              const v=e.target.value;
                              setForm(f=>({...f,
                                contacts:(f.contacts||[]).map((x,i)=>i===ci?{...x,phone:v}:x),
                                ...(c.isPrimary?{phone:v}:{})
                              }));
                            }} />
                        </div>
                        <div className="fg">
                          <label>Email</label>
                          <input type="email" value={c.email||''} placeholder="alan@firm.co.uk"
                            onChange={e=>{
                              const v=e.target.value;
                              setForm(f=>({...f,
                                contacts:(f.contacts||[]).map((x,i)=>i===ci?{...x,email:v}:x),
                                ...(c.isPrimary?{email:v}:{})
                              }));
                            }} />
                        </div>
                        <div className="fg">
                          <label>LinkedIn URL</label>
                          <input value={c.linkedin||''} placeholder="linkedin.com/in/…"
                            onChange={e=>{const v=e.target.value;setForm(f=>({...f,contacts:(f.contacts||[]).map((x,i)=>i===ci?{...x,linkedin:v}:x)}));}} />
                        </div>
                        <div className="fg">
                          <label>Notes on this person</label>
                          <input value={c.notes||''} placeholder="Decision maker, gatekeeper, friendly…"
                            onChange={e=>{const v=e.target.value;setForm(f=>({...f,contacts:(f.contacts||[]).map((x,i)=>i===ci?{...x,notes:v}:x)}));}} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── TAB 3: Pipeline & sourcing ── */}
              {modalTab==='pipeline' && (
                <div className="form-grid">
                  <div className="fs-title">Pipeline</div>
                  <div className="fg"><label>Stage</label>
                    <select value={form.stage||'Lead'} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}>
                      {['Lead','Suspect','Proposal','Win','Lost'].map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>Assigned rep</label>
                    <select value={form.assigned_to||''} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))}>
                      <option value="">Unassigned</option>{admin.reps?.map((r:any)=><option key={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>Software</label>
                    <select value={form.software||''} onChange={e=>setForm(f=>({...f,software:e.target.value}))}>
                      <option value="">Unknown</option>{(admin.dropdowns?.software||[]).map((s:string)=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>Source</label>
                    <select value={form.source||''} onChange={e=>setForm(f=>({...f,source:e.target.value}))}>
                      <option value="">Select</option>{(admin.dropdowns?.source||[]).map((s:string)=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="fg"><label>Pricing model</label>
                    <select value={form.pricing_model||''} onChange={e=>setForm(f=>({...f,pricing_model:e.target.value}))}>
                      <option value="">Not discussed</option><option>FTE</option><option>PAYG</option><option>Both discussed</option>
                    </select>
                  </div>
                  <div className="fg"><label>Service interest</label>
                    <select value={form.service_interest||''} onChange={e=>setForm(f=>({...f,service_interest:e.target.value}))}>
                      <option value="">TBD</option><option>Bookkeeping & VAT</option><option>Payroll</option><option>Personal Tax & Year-End</option><option>Full package</option>
                    </select>
                  </div>
                  <div className="fs-title">Dates & revenue</div>
                  <div className="fg"><label>Win amount (£)</label><input type="number" value={form.win_amount||''} onChange={e=>setForm(f=>({...f,win_amount:parseFloat(e.target.value)||0}))} /></div>
                  <div className="fg"><label>Last contact</label><input type="date" value={form.last_contact||''} onChange={e=>setForm(f=>({...f,last_contact:e.target.value}))} /></div>
                  <div className="fg"><label>Follow-up date</label><input type="date" value={form.follow_up||''} onChange={e=>setForm(f=>({...f,follow_up:e.target.value}))} /></div>
                  <div className="fg"><label>LinkedIn (company)</label><input value={form.linkedin||''} onChange={e=>setForm(f=>({...f,linkedin:e.target.value}))} /></div>
                </div>
              )}
            </div>

            {/* Footer — sync primary contact hint */}
            <div className="mft" style={{flexShrink:0}}>
              {modalTab==='contacts' && (form.contacts||[]).length>0 && (
                <div style={{fontSize:11,color:'var(--t2)',flex:1}}>
                  ★ Primary contact syncs to the Firms DB table and call log
                </div>
              )}
              <button className="btn" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn primary" onClick={saveFirm}>{modal==='add'?'Save firm':'Save changes'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {modal==='upload' && (
        <div className="mov" onClick={e=>{if(e.target===e.currentTarget){setModal(null);setUploadData(null);}}}>
          <div className="modal" style={{width:560}} onClick={e=>e.stopPropagation()}>
            <div className="mhd">
              <h2>Upload firms & contacts</h2>
              <button className="mx" onClick={()=>{setModal(null);setUploadData(null);}}>✕</button>
            </div>
            <div className="mbd">

              {/* Template download */}
              <div style={{background:'var(--brand-light)',border:'.5px solid #c8c7e8',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--brand)',marginBottom:4}}>📥 Download the template first</div>
                <div style={{fontSize:12,color:'var(--t2)',marginBottom:8}}>
                  Use this CSV template — it has the exact column headers the importer expects, including up to 3 contacts per firm.
                </div>
                <button className="btn primary sm" onClick={()=>{
                  const headers = [
                    'Firm Name','City','Region','Size','Staff Count','Companies House',
                    'Website','Switchboard','Software','Source','Stage','Assigned To',
                    'Firm Notes','Win Amount',
                    'Contact Name','Contact Title','Contact Phone','Contact Email','Contact LinkedIn','Contact Notes',
                    'Contact 2 Name','Contact 2 Title','Contact 2 Phone','Contact 2 Email','Contact 2 LinkedIn',
                    'Contact 3 Name','Contact 3 Title','Contact 3 Phone','Contact 3 Email','Contact 3 LinkedIn',
                  ];
                  const example = [
                    'Begbies Traynor','Manchester','North West','Large (50+)','120','12345678',
                    'www.begbies-traynor.com','0161 837 1700','Sage 50','Data mining','Lead','Diksha',
                    'Strong prospect — met at Summit','',
                    'Alan Griffiths','Managing Partner','0161 837 1700','alan@begbies.co.uk','linkedin.com/in/alan','Key DM — friendly',
                    'Sarah Blake','Finance Director','0161 837 1701','sarah@begbies.co.uk','',
                    '','','','','',
                  ];
                  const csv = [headers, example].map(r => r.map(v => `"${v}"`).join(',')).join('\r\n');
                  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href=url; a.download='DiTechFAO_Import_Template.csv'; a.click();
                  setTimeout(()=>URL.revokeObjectURL(url),1000);
                }}>↓ Download CSV template</button>
              </div>

              {/* Drop zone */}
              <div className="uzone" onClick={()=>uploadRef.current?.click()}>
                <input ref={uploadRef} type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}}
                  onChange={e=>{const f=e.target.files?.[0];if(f)handleUploadFile(f);}} />
                <div style={{fontSize:26,marginBottom:6}}>📊</div>
                <div style={{fontSize:14,fontWeight:500,marginBottom:3}}>
                  {uploadData ? `✓ ${uploadData.rows.length} rows ready to import` : 'Drop your CSV/Excel here, or click to browse'}
                </div>
                <div style={{fontSize:12,color:'var(--t2)'}}>.xlsx, .xls, .csv · existing firms are updated, new ones added</div>
              </div>

              {uploadData && (
                <div className="alert ok" style={{marginTop:8,fontSize:12}}>
                  ✓ {uploadData.headers.length} columns detected · {uploadData.rows.length} rows · ready to import
                </div>
              )}

              {/* Column guide */}
              <div style={{marginTop:12,fontSize:11,color:'var(--t2)',lineHeight:1.8}}>
                <div style={{fontWeight:600,color:'var(--text)',marginBottom:3}}>Supported columns</div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 16px'}}>
                  <div><span style={{color:'var(--brand)',fontWeight:600}}>Firm:</span> Firm Name, City, Region, Size, Companies House, Software, Source, Stage, Assigned To, Firm Notes, Win Amount, Switchboard</div>
                  <div><span style={{color:'var(--brand)',fontWeight:600}}>Contacts (up to 3):</span> Contact Name, Contact Title, Contact Phone, Contact Email, Contact LinkedIn — repeat with "Contact 2 …" and "Contact 3 …"</div>
                </div>
                <div style={{marginTop:6,color:'var(--t3)'}}>Firm Name is required. Existing firms are matched by name and updated — contacts are merged, not replaced.</div>
              </div>
            </div>
            <div className="mft">
              <button className="btn" onClick={()=>{setModal(null);setUploadData(null);}}>Cancel</button>
              <button className="btn primary" disabled={!uploadData} onClick={importData}>Import records</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirm && (
        <div className="mov" style={{zIndex:700}} onClick={e=>{if(e.target===e.currentTarget)setConfirm(null)}}>
          <div className="modal" style={{width:420}} onClick={e=>e.stopPropagation()}>
            <div className="mhd"><h2>{confirm.title}</h2><button className="mx" onClick={()=>setConfirm(null)}>✕</button></div>
            <div className="mbd"><div style={{fontSize:13,lineHeight:1.6,color:'var(--t2)'}} dangerouslySetInnerHTML={{__html:confirm.body}} /></div>
            <div className="mft"><button className="btn" onClick={()=>setConfirm(null)}>Cancel</button><button className={`btn primary ${confirm.cls||''}`} onClick={()=>{confirm.cb();setConfirm(null);}}>{confirm.ok}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
