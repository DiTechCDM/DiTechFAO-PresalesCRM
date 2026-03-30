import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store';
import { uid, TODAY, fmtDate } from '../lib/utils';
import { Reminder } from '../types';

const TYPE_META = {
  'follow-up': { label: 'Follow-up call', emoji: '📞', col: '#185FA5', bg: '#E6F1FB' },
  'meeting':   { label: 'Meeting',        emoji: '📅', col: '#1D9E75', bg: '#E1F5EE' },
  'task':      { label: 'Task',           emoji: '✅', col: '#854F0B', bg: '#FAEEDA' },
  'linkedin':  { label: 'LinkedIn',       emoji: '💼', col: '#7F77DD', bg: '#f5f0ff' },
} as Record<string, { label:string; emoji:string; col:string; bg:string }>;

const BLANK: Partial<Reminder> = {
  type: 'follow-up', title: '', firmName: '', contact: '',
  dueDate: TODAY, dueTime: '09:00', notes: '', createdFrom: 'manual',
};

type Filter = 'all'|'today'|'overdue'|'upcoming'|'done';
const PER_PAGE = 10;

export default function Reminders() {
  const { reminders, setReminders, firms, admin, currentUser, showToast } = useAppContext();

  const [filter, setFilter]         = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal]           = useState<'add'|'edit'|null>(null);
  const [form, setForm]             = useState<Partial<Reminder>>(BLANK);
  const [editId, setEditId]         = useState<string|null>(null);
  const [firmSearch, setFirmSearch] = useState('');
  const [firmDropOpen, setFirmDropOpen] = useState(false);
  const [page, setPage]             = useState(1);

  const rep     = currentUser?.linkedRep || currentUser?.name || '';
  const isAdmin = currentUser?.role === 'admin';
  const activeReps = (admin.reps || []).filter((r: any) => r.status === 'Active');

  // Scope: reps see own, admins see all
  const scoped = useMemo(() =>
    isAdmin ? reminders : reminders.filter(r => r.rep === rep),
    [reminders, rep, isAdmin]
  );

  const todayStr    = TODAY;
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const filtered = useMemo(() => {
    const res = scoped
      .filter(r => {
        if (typeFilter && r.type !== typeFilter) return false;
        if (filter === 'today')    return !r.done && r.dueDate === todayStr;
        if (filter === 'overdue')  return !r.done && r.dueDate < todayStr;
        if (filter === 'upcoming') return !r.done && r.dueDate > todayStr;
        if (filter === 'done')     return r.done;
        return true;
      })
      .sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1;
        return a.dueDate.localeCompare(b.dueDate) || (a.dueTime||'').localeCompare(b.dueTime||'');
      });
    return res;
  }, [scoped, filter, typeFilter, todayStr]);

  const overdueCount = scoped.filter(r => !r.done && r.dueDate < todayStr).length;
  const todayCount   = scoped.filter(r => !r.done && r.dueDate === todayStr).length;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Firm search matches
  const firmMatches = useMemo(() =>
    firmSearch.length > 0
      ? firms.filter(f => f.name.toLowerCase().includes(firmSearch.toLowerCase())).slice(0, 8)
      : [],
    [firms, firmSearch]
  );

  const openAdd = (prefill?: Partial<Reminder>) => {
    setForm({ ...BLANK, rep, dueDate: TODAY, ...prefill });
    setEditId(null);
    setFirmSearch(prefill?.firmName || '');
    setModal('add');
  };

  const openEdit = (r: Reminder) => {
    setForm({ ...r });
    setEditId(r.id);
    setFirmSearch(r.firmName || '');
    setModal('edit');
  };

  const saveReminder = () => {
    if (!form.title?.trim()) { showToast('Title is required', 'err'); return; }
    if (!form.dueDate)       { showToast('Due date is required', 'err'); return; }
    if (editId) {
      setReminders(reminders.map(r => r.id === editId ? { ...r, ...form } as Reminder : r));
      showToast('Reminder updated', 'ok');
    } else {
      setReminders([{ id: uid(), done: false, createdAt: new Date().toISOString(), rep, createdFrom: 'manual', ...form } as Reminder, ...reminders]);
      showToast('Reminder added ✓', 'ok');
      setPage(1);
    }
    setModal(null);
  };

  const toggleDone = (id: string) => {
    const r = reminders.find(x => x.id === id);
    if (!r) return;
    setReminders(reminders.map(x => x.id === id ? { ...x, done: !x.done } : x));
    showToast(r.done ? 'Reopened' : '✓ Done', r.done ? 'warn' : 'ok');
  };

  const deleteReminder = (id: string) => {
    setReminders(reminders.filter(r => r.id !== id));
    showToast('Deleted', 'err');
  };

  const changeFilter = (f: Filter) => { setFilter(f); setPage(1); };
  const changeType   = (t: string)  => { setTypeFilter(t); setPage(1); };

  const FILTERS = [
    { key: 'all'      as Filter, label: 'All' },
    { key: 'overdue'  as Filter, label: 'Overdue',  badge: overdueCount, danger: true },
    { key: 'today'    as Filter, label: 'Today',    badge: todayCount },
    { key: 'upcoming' as Filter, label: 'Upcoming' },
    { key: 'done'     as Filter, label: 'Done' },
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>

      {/* ── Header ── */}
      <div className="page-hd">
        <div>
          <div className="page-title">Reminders & Tasks</div>
          <div className="page-sub" style={{ color: overdueCount > 0 ? 'var(--red)' : undefined }}>
            {overdueCount > 0 ? `⚠ ${overdueCount} overdue · ` : ''}
            {todayCount > 0 ? `${todayCount} due today · ` : ''}
            {scoped.filter(r => !r.done).length} open
          </div>
        </div>
        <button className="btn primary" onClick={() => openAdd()}>+ Add reminder</button>
      </div>

      {/* ── Filter bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => changeFilter(f.key)}
            className={`dr-btn ${filter===f.key?'on':''}`}
            style={{ position:'relative' }}
          >
            {f.label}
            {f.badge != null && f.badge > 0 && (
              <span style={{ position:'absolute', top:-5, right:-5,
                background: f.danger ? 'var(--red)' : 'var(--brand)',
                color:'#fff', borderRadius:'50%', width:15, height:15,
                fontSize:9, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                {f.badge}
              </span>
            )}
          </button>
        ))}
        <div style={{ width:1, height:20, background:'var(--border)', flexShrink:0 }} />
        <select value={typeFilter} onChange={e => changeType(e.target.value)}
          style={{ padding:'4px 9px', border:'.5px solid var(--border2)', borderRadius:'var(--r)', fontSize:12, background:'#fff', outline:'none' }}>
          <option value="">All types</option>
          {Object.entries(TYPE_META).map(([k,v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <span style={{ fontSize:11, color:'var(--t3)', marginLeft:'auto' }}>
          {filtered.length} item{filtered.length!==1?'s':''}
          {totalPages > 1 ? ` · page ${safePage}/${totalPages}` : ''}
        </span>
      </div>

      {/* ── Reminders table ── */}
      {filtered.length === 0 ? (
        <div className="empty-st">
          <div style={{ fontSize:32, marginBottom:8 }}>🔔</div>
          <div style={{ fontSize:14, fontWeight:500, color:'var(--t2)', marginBottom:4 }}>
            {filter==='overdue' ? 'No overdue reminders — all clear!' :
             filter==='today'   ? 'Nothing due today' :
             filter==='done'    ? 'No completed items yet' : 'No reminders yet'}
          </div>
          <div style={{ fontSize:12, color:'var(--t3)', marginBottom:16 }}>Click "+ Add reminder" to get started</div>
          <button className="btn primary" onClick={() => openAdd()}>+ Add reminder</button>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="tw" style={{ flex:1, minHeight:0 }}>
            <div className="tscroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width:32 }}></th>
                    <th style={{ width:120 }}>Type</th>
                    <th>Title</th>
                    <th>Firm</th>
                    <th>Contact</th>
                    <th style={{ width:95 }}>Due date</th>
                    <th style={{ width:70 }}>Time</th>
                    {isAdmin && <th style={{ width:90 }}>Rep</th>}
                    <th>Notes</th>
                    <th style={{ width:80 }}>Status</th>
                    <th style={{ width:90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map(r => {
                    const meta = TYPE_META[r.type] || TYPE_META['task'];
                    const ov = !r.done && r.dueDate < todayStr;
                    const td = !r.done && r.dueDate === todayStr;
                    const repObj = activeReps.find((x: any) => x.name === r.rep);

                    return (
                      <tr key={r.id} style={{
                        background: r.done ? 'var(--grl)' : ov ? '#FFF5F5' : td ? '#F0F7FF' : undefined,
                        opacity: r.done ? 0.65 : 1,
                      }}>
                        {/* Checkbox */}
                        <td style={{ textAlign:'center' }}>
                          <input type="checkbox" checked={r.done} onChange={() => toggleDone(r.id)}
                            style={{ width:15, height:15, cursor:'pointer', accentColor:'var(--brand)' }} />
                        </td>

                        {/* Type pill */}
                        <td>
                          <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10,
                            background:meta.bg, color:meta.col, fontWeight:600, whiteSpace:'nowrap' }}>
                            {meta.emoji} {meta.label}
                          </span>
                        </td>

                        {/* Title */}
                        <td style={{ fontWeight:600, fontSize:13,
                          textDecoration: r.done ? 'line-through' : 'none',
                          color: r.done ? 'var(--t3)' : 'var(--text)',
                          maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.title}
                        </td>

                        {/* Firm — with bell icon if linked */}
                        <td style={{ fontSize:12, maxWidth:140 }}>
                          {r.firmName ? (
                            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                              <span style={{ fontSize:13 }}>🔔</span>
                              <span style={{ color:'var(--blue)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {r.firmName}
                              </span>
                            </div>
                          ) : <span style={{ color:'var(--t3)' }}>—</span>}
                        </td>

                        {/* Contact */}
                        <td style={{ fontSize:12, color:'var(--t2)', whiteSpace:'nowrap' }}>
                          {r.contact || '—'}
                        </td>

                        {/* Due date */}
                        <td style={{ fontSize:12, fontWeight: ov||td ? 600 : 400,
                          color: ov ? 'var(--red)' : td ? 'var(--blue)' : 'var(--t2)',
                          whiteSpace:'nowrap' }}>
                          {fmtDate(r.dueDate)}
                          {ov && <div style={{ fontSize:9, color:'var(--red)' }}>Overdue</div>}
                          {td && !ov && <div style={{ fontSize:9, color:'var(--blue)' }}>Today</div>}
                        </td>

                        {/* Time */}
                        <td style={{ fontSize:12, color:'var(--t2)' }}>
                          {r.dueTime || '—'}
                        </td>

                        {/* Rep — admin only */}
                        {isAdmin && (
                          <td>
                            {repObj ? (
                              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                <div style={{ width:20, height:20, borderRadius:'50%',
                                  background:`${repObj.col}22`, color:repObj.col,
                                  display:'flex', alignItems:'center', justifyContent:'center',
                                  fontSize:8, fontWeight:700, flexShrink:0 }}>
                                  {repObj.init}
                                </div>
                                <span style={{ fontSize:12 }}>{r.rep}</span>
                              </div>
                            ) : <span style={{ fontSize:12, color:'var(--t2)' }}>{r.rep||'—'}</span>}
                          </td>
                        )}

                        {/* Notes — truncated */}
                        <td style={{ fontSize:11, color:'var(--t2)', maxWidth:200,
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                          fontStyle: r.notes ? 'italic' : 'normal' }}>
                          {r.notes || '—'}
                        </td>

                        {/* Status */}
                        <td>
                          {r.done ? (
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8,
                              background:'var(--gl)', color:'#1D9E75', fontWeight:600 }}>✓ Done</span>
                          ) : ov ? (
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8,
                              background:'var(--rl)', color:'var(--red)', fontWeight:600 }}>Overdue</span>
                          ) : td ? (
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8,
                              background:'var(--bl)', color:'var(--blue)', fontWeight:600 }}>Today</span>
                          ) : (
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:8,
                              background:'var(--s2)', color:'var(--t2)', fontWeight:500 }}>Upcoming</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td>
                          <div className="qa">
                            <button className="qa-btn" onClick={() => openEdit(r)}>✏️ Edit</button>
                            <button className="qa-btn" style={{ borderColor:'#f0c0c0', color:'var(--red)' }}
                              onClick={() => deleteReminder(r.id)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination footer inside .tw */}
            <div className="pager">
              <div className="pg-info">
                Showing {filtered.length ? (safePage-1)*PER_PAGE+1 : 0}–{Math.min(safePage*PER_PAGE, filtered.length)} of {filtered.length}
              </div>
              <button className="pg-btn" disabled={safePage <= 1} onClick={() => setPage(p => p-1)}>← Prev</button>
              <div className="pg-pages">
                {Array.from({ length: totalPages }, (_, i) => i+1)
                  .filter(p => p===1 || p===totalPages || Math.abs(p-safePage)<=1)
                  .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i>0 && arr[i-1] !== p-1 && (
                        <button disabled style={{ border:'none', background:'none', color:'var(--t3)', cursor:'default' }}>…</button>
                      )}
                      <button className={p===safePage?'on':''} onClick={() => setPage(p)}>{p}</button>
                    </React.Fragment>
                  ))}
              </div>
              <button className="pg-btn" disabled={safePage >= totalPages} onClick={() => setPage(p => p+1)}>Next →</button>
            </div>
          </div>
        </>
      )}

      {/* ── Add / Edit Modal ── */}
      {modal && (
        <div className="mov" onClick={e => { if(e.target===e.currentTarget) setModal(null); }}>
          <div className="modal" style={{ width:560 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <h2>{modal==='add' ? '+ Add reminder / task' : 'Edit reminder'}</h2>
              <button className="mx" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="mbd" style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Type pills */}
              <div className="fg">
                <label>Type</label>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:4 }}>
                  {Object.entries(TYPE_META).map(([k,v]) => (
                    <button key={k}
                      onClick={() => setForm(f => ({...f, type: k as Reminder['type']}))}
                      style={{ padding:'5px 13px', borderRadius:14, fontSize:12, fontWeight:500,
                        cursor:'pointer', transition:'all .1s',
                        border:`.5px solid ${form.type===k ? v.col : 'var(--border2)'}`,
                        background: form.type===k ? v.bg : '#fff',
                        color: form.type===k ? v.col : 'var(--t2)',
                      }}
                    >
                      {v.emoji} {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div className="fg">
                <label>Title *</label>
                <input value={form.title||''} autoFocus
                  onChange={e => setForm(f => ({...f, title: e.target.value}))}
                  placeholder={
                    form.type==='follow-up' ? 'e.g. Call Andrew Nash re: proposal' :
                    form.type==='meeting'   ? 'e.g. Meeting with Buzzacott LLP 10am' :
                    form.type==='linkedin'  ? 'e.g. Connect with Claire Ford' :
                    'e.g. Send contract to FRP Advisory'
                  }
                />
              </div>

              {/* Firm — searchable dropdown from Firms DB */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="fg search-wrap">
                  <label>Firm <span style={{ fontSize:10, color:'var(--t3)', fontWeight:400 }}>(from your database)</span></label>
                  <input
                    value={firmSearch}
                    onChange={e => {
                      setFirmSearch(e.target.value);
                      setForm(f => ({...f, firmName: e.target.value, firmId: undefined}));
                      setFirmDropOpen(true);
                    }}
                    onFocus={() => setFirmDropOpen(true)}
                    onBlur={() => setTimeout(() => setFirmDropOpen(false), 180)}
                    placeholder="Type to search firms…"
                  />
                  {/* Show all firms on focus if empty, or filtered results */}
                  {firmDropOpen && (firmMatches.length > 0 || firmSearch.length === 0) && (
                    <div className="sr-list open">
                      {firmSearch.length === 0 ? (
                        // Show first 8 firms when field is empty
                        firms.slice(0, 8).map(f => (
                          <div key={f.id} className="sri"
                            onMouseDown={() => {
                              setFirmSearch(f.name);
                              setForm(x => ({...x, firmId:f.id, firmName:f.name, contact:x.contact||f.contact_name||''}));
                              setFirmDropOpen(false);
                            }}>
                            <div className="sri-name">{f.name}</div>
                            <div className="sri-meta">{f.city} · {f.stage} · {f.contact_name||'No contact'}</div>
                          </div>
                        ))
                      ) : firmMatches.map(f => (
                        <div key={f.id} className="sri"
                          onMouseDown={() => {
                            setFirmSearch(f.name);
                            setForm(x => ({...x, firmId:f.id, firmName:f.name, contact:x.contact||f.contact_name||''}));
                            setFirmDropOpen(false);
                          }}>
                          <div className="sri-name">{f.name}</div>
                          <div className="sri-meta">{f.city} · {f.stage} · {f.contact_name||'No contact'}</div>
                        </div>
                      ))}
                      {/* Clear option */}
                      {form.firmName && (
                        <div className="sri" style={{ color:'var(--t3)', fontStyle:'italic' }}
                          onMouseDown={() => { setFirmSearch(''); setForm(f => ({...f, firmId:undefined, firmName:''})); setFirmDropOpen(false); }}>
                          ✕ Clear firm
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Contact — auto-filled from firm, editable */}
                <div className="fg">
                  <label>Contact</label>
                  <input value={form.contact||''}
                    onChange={e => setForm(f => ({...f, contact: e.target.value}))}
                    placeholder="Auto-filled from firm" />
                </div>
              </div>

              {/* Due date + time */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="fg">
                  <label>Due date *</label>
                  <input type="date" value={form.dueDate||TODAY}
                    onChange={e => setForm(f => ({...f, dueDate: e.target.value}))} />
                </div>
                <div className="fg">
                  <label>Due time</label>
                  <input type="time" value={form.dueTime||'09:00'}
                    onChange={e => setForm(f => ({...f, dueTime: e.target.value}))} />
                </div>
              </div>

              {/* Notes */}
              <div className="fg">
                <label>Notes / prep</label>
                <textarea value={form.notes||''}
                  onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                  placeholder="Talking points, what to prepare, key context…"
                  style={{ minHeight:72 }} />
              </div>

              {/* Assign to rep — admin only, real rep dropdown */}
              {isAdmin && (
                <div className="fg">
                  <label>Assign to rep</label>
                  <select value={form.rep||rep} onChange={e => setForm(f => ({...f, rep: e.target.value}))}>
                    <option value="">— Select rep —</option>
                    {activeReps.map((r: any) => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}

            </div>
            <div className="mft">
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn primary" onClick={saveReminder}>
                {modal==='add' ? 'Add reminder' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
