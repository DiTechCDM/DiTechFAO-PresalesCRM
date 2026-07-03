import React, { useState, useMemo, useRef } from 'react';
import { useAppContext } from '../store';
import { uid, TODAY, fmtDate } from '../lib/utils';
import { parseCSVText, parseXlsxBinary } from '../lib/xlsx';
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
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [modal, setModal]           = useState<'add'|'edit'|null>(null);
  const [form, setForm]             = useState<Partial<Reminder>>(BLANK);
  const [editId, setEditId]         = useState<string|null>(null);
  const [firmSearch, setFirmSearch] = useState('');
  const [firmDropOpen, setFirmDropOpen] = useState(false);
  const [page, setPage]             = useState(1);
  const [importGuide, setImportGuide] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows]   = useState<Partial<Reminder>[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        if (dateFrom && r.dueDate < dateFrom) return false;
        if (dateTo && r.dueDate > dateTo) return false;
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
  }, [scoped, filter, typeFilter, dateFrom, dateTo, todayStr]);

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

  // ── CSV import helpers ──
  const colIdx = (headers: string[], names: string[]) => {
    const hl = headers.map(h => h.toLowerCase().trim());
    for (const n of names) { const i = hl.indexOf(n.toLowerCase()); if (i >= 0) return i; }
    return -1;
  };

  const parseDate = (raw: string): string => {
    if (!raw) return TODAY;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) { const [d,m,y] = raw.split('/'); return `${y}-${m}-${d}`; }
    if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) { const [d,m,y] = raw.split('-'); return `${y}-${m}-${d}`; }
    return TODAY;
  };

  const resolveType = (raw: string): Reminder['type'] => {
    const v = raw.toLowerCase().replace(/[^a-z]/g, '');
    if (v === 'followupcall' || v === 'followup' || v === 'follow') return 'follow-up';
    if (v === 'meeting')  return 'meeting';
    if (v === 'task')     return 'task';
    if (v === 'linkedin') return 'linkedin';
    return 'follow-up';
  };

  const parseImportRows = (rows: string[][]): Partial<Reminder>[] => {
    if (rows.length < 2) return [];
    const headers = rows[0];
    const iType    = colIdx(headers, ['type', 'reminder type']);
    const iTitle   = colIdx(headers, ['title', 'task', 'reminder title', 'reminder']);
    const iFirm    = colIdx(headers, ['firm', 'firm name', 'company', 'company name']);
    const iContact = colIdx(headers, ['contact', 'contact name']);
    const iDate    = colIdx(headers, ['due date', 'date', 'duedate', 'due_date']);
    const iTime    = colIdx(headers, ['due time', 'time', 'duetime', 'due_time']);
    const iNotes   = colIdx(headers, ['notes / prep', 'notes', 'prep', 'notes/prep', 'description', 'note']);
    const iRep     = colIdx(headers, ['assign to rep', 'assigned to rep', 'rep', 'assigned to', 'assignee', 'sales rep']);
    const parsed: Partial<Reminder>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const title = (iTitle >= 0 ? row[iTitle] : '')?.trim();
      if (!title) continue;
      const rawType = (iType >= 0 ? row[iType] : '')?.trim();
      const type = resolveType(rawType);
      const firmNameRaw = (iFirm >= 0 ? row[iFirm] : '')?.trim();
      const matched = firmNameRaw ? firms.find(f => f.name.toLowerCase() === firmNameRaw.toLowerCase()) : undefined;
      parsed.push({
        type, title,
        firmId:   matched?.id,
        firmName: matched?.name || firmNameRaw || '',
        contact:  (iContact >= 0 ? row[iContact] : '')?.trim() || matched?.contact_name || '',
        dueDate:  parseDate((iDate >= 0 ? row[iDate] : '')?.trim() || ''),
        dueTime:  (iTime >= 0 ? row[iTime] : '')?.trim() || '09:00',
        notes:    (iNotes >= 0 ? row[iNotes] : '')?.trim() || '',
        rep:      (iRep >= 0 ? row[iRep] : '')?.trim() || rep,
        createdFrom: 'manual',
      });
    }
    return parsed;
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    if (isXlsx) {
      const reader = new FileReader();
      reader.onload = async ev => {
        const buf = ev.target?.result as ArrayBuffer;
        const rows = await parseXlsxBinary(buf);
        const parsed = parseImportRows(rows);
        if (!parsed.length) { showToast('No valid rows found in file', 'err'); return; }
        setImportRows(parsed);
        setImportModal(true);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        const text = ev.target?.result as string;
        const rows = parseCSVText(text);
        const parsed = parseImportRows(rows);
        if (!parsed.length) { showToast('No valid rows found in CSV', 'err'); return; }
        setImportRows(parsed);
        setImportModal(true);
      };
      reader.readAsText(file);
    }
  };

  const confirmImport = () => {
    if (!importRows.length) return;
    const now = new Date().toISOString();
    const newOnes = importRows.map(r => ({ ...r, id: uid(), done: false, createdAt: now } as Reminder));
    setReminders([...newOnes, ...reminders]);
    showToast(`Imported ${newOnes.length} reminder${newOnes.length !== 1 ? 's' : ''} ✓`, 'ok');
    setImportModal(false);
    setPage(1);
  };

  const downloadTemplate = () => {
    const csv = [
      'Type,Title,Firm,Contact,Due Date,Due Time,Notes / Prep,Assign to Rep',
      '"Follow-up call","Call Andrew Nash re: proposal","Acme Accountants","Andrew Nash","2026-07-10","09:00","Discuss the new pricing proposal","Diksha"',
      '"Meeting","Intro meeting with Clarke & Co","Clarke & Co","Sarah Lee","2026-07-15","14:00","Prepare slides and case studies",""',
      '"Task","Send brochure to FRP Advisory","","","2026-07-12","09:00","Email the PDF brochure to the main contact",""',
      '"LinkedIn","Connect with Claire Ford","Sterling Grove Accountants","Claire Ford","2026-07-20","","Send connection request with personalised note",""',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reminders-import-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

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
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls"
            style={{ display:'none' }} onChange={handleImportFile} />
          <button className="btn" onClick={() => setImportGuide(true)}
            style={{ fontSize:13, display:'flex', alignItems:'center', gap:5 }}>
            ⬆ Import CSV
          </button>
          <button className="btn primary" onClick={() => openAdd()}>+ Add reminder</button>
        </div>
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
        <div style={{ width:1, height:20, background:'var(--border)', flexShrink:0 }} />
        <button onClick={() => setShowCustomDate(v => !v)}
          className={`dr-btn ${showCustomDate ? 'on' : ''}`}>Custom</button>
        {showCustomDate && (
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--t2)', fontWeight:600 }}>From:</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              style={{ padding:'4px 8px', border:'.5px solid var(--border2)', borderRadius:'var(--r)', fontSize:12, background:'#fff', outline:'none' }} />
            <span style={{ fontSize:11, color:'var(--t2)', fontWeight:600 }}>To:</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
              style={{ padding:'4px 8px', border:'.5px solid var(--border2)', borderRadius:'var(--r)', fontSize:12, background:'#fff', outline:'none' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
                style={{ fontSize:11, color:'var(--red)', background:'none', border:'none', cursor:'pointer', padding:'2px 4px' }}>✕ Clear</button>
            )}
          </div>
        )}
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

      {/* ── CSV Format Guide Modal ── */}
      {importGuide && (
        <div className="mov" onClick={e => { if (e.target === e.currentTarget) setImportGuide(false); }}>
          <div className="modal" style={{ width:660 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <h2>⬆ Import reminders from CSV / Excel</h2>
              <button className="mx" onClick={() => setImportGuide(false)}>✕</button>
            </div>
            <div className="mbd" style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* Step 1 — download template */}
              <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 14px',
                background:'var(--bl)', border:'.5px solid #BFDBFE', borderRadius:'var(--r)' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'var(--brand)', color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>1</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Download the example CSV template</div>
                  <div style={{ fontSize:12, color:'var(--t2)', marginBottom:10 }}>
                    Use this as your starting point — it already has the correct column headers and 3 example rows so you know exactly what to fill in.
                  </div>
                  <button onClick={downloadTemplate}
                    style={{ padding:'7px 16px', borderRadius:'var(--r)', border:'.5px solid var(--brand)',
                      background:'#fff', color:'var(--brand)', fontWeight:600, fontSize:12, cursor:'pointer',
                      display:'inline-flex', alignItems:'center', gap:6 }}>
                    ⬇ Download example CSV
                  </button>
                </div>
              </div>

              {/* Column reference table */}
              <div>
                <div style={{ fontSize:12, fontWeight:600, color:'var(--t2)', marginBottom:8 }}>
                  Column reference — what each column means:
                </div>
                <div style={{ border:'.5px solid var(--border2)', borderRadius:'var(--r)', overflow:'hidden' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:'var(--s2)' }}>
                        {['Column','Required?','Accepted values / format'].map(h => (
                          <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontWeight:600,
                            fontSize:11, color:'var(--t2)', borderBottom:'.5px solid var(--border2)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Type',          'No',  '"Follow-up call"  ·  "Meeting"  ·  "Task"  ·  "LinkedIn"  — defaults to Follow-up call if blank'],
                        ['Title',         'Yes', 'Any text, e.g. "Call Andrew Nash re: proposal" — rows without a title are skipped'],
                        ['Firm',          'No',  'Firm name exactly as it appears in your Firms DB — auto-links and fills Contact if matched'],
                        ['Contact',       'No',  'Contact person name — auto-filled from Firms DB when Firm is matched'],
                        ['Due Date',      'Yes', 'YYYY-MM-DD  or  DD/MM/YYYY  e.g. 2026-07-10 or 10/07/2026'],
                        ['Due Time',      'No',  'HH:MM in 24-hour format, e.g. 09:00 or 14:30  (defaults to 09:00)'],
                        ['Notes / Prep',  'No',  'Talking points, what to prepare, key context for the reminder'],
                        ['Assign to Rep', 'No',  'Rep name as shown in the system, e.g. "Diksha" — defaults to your name if blank'],
                      ].map(([col, req, desc], i) => (
                        <tr key={col} style={{ borderBottom:'.5px solid var(--border)', background: i%2===0 ? '#fff' : 'var(--grl)' }}>
                          <td style={{ padding:'7px 12px', fontWeight:600, whiteSpace:'nowrap', color:'var(--text)' }}>{col}</td>
                          <td style={{ padding:'7px 12px', whiteSpace:'nowrap', textAlign:'center' }}>
                            {req === 'Yes'
                              ? <span style={{ fontSize:10, padding:'1px 7px', borderRadius:8, background:'#FEE2E2', color:'#B91C1C', fontWeight:600 }}>Required</span>
                              : <span style={{ fontSize:10, padding:'1px 7px', borderRadius:8, background:'var(--s2)', color:'var(--t3)', fontWeight:500 }}>Optional</span>}
                          </td>
                          <td style={{ padding:'7px 12px', color:'var(--t2)' }}>{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step 2 — upload */}
              <div style={{ display:'flex', gap:12, alignItems:'flex-start', padding:'12px 14px',
                background:'#F0FDF4', border:'.5px solid #BBF7D0', borderRadius:'var(--r)' }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'#1D9E75', color:'#fff',
                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>2</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>Upload your completed file</div>
                  <div style={{ fontSize:12, color:'var(--t2)', marginBottom:10 }}>
                    Accepts <strong>.csv</strong> or <strong>.xlsx / .xls</strong>. You'll see a preview before anything is saved.
                  </div>
                  <button onClick={() => { setImportGuide(false); fileInputRef.current?.click(); }}
                    style={{ padding:'7px 16px', borderRadius:'var(--r)', border:'none',
                      background:'#1D9E75', color:'#fff', fontWeight:600, fontSize:12, cursor:'pointer',
                      display:'inline-flex', alignItems:'center', gap:6 }}>
                    ⬆ Choose file to upload
                  </button>
                </div>
              </div>

            </div>
            <div className="mft">
              <button className="btn" onClick={() => setImportGuide(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Preview Modal ── */}
      {importModal && (
        <div className="mov" onClick={e => { if (e.target === e.currentTarget) setImportModal(false); }}>
          <div className="modal" style={{ width:700 }} onClick={e => e.stopPropagation()}>
            <div className="mhd">
              <h2>📋 Preview — {importRows.length} reminder{importRows.length !== 1 ? 's' : ''} to import</h2>
              <button className="mx" onClick={() => setImportModal(false)}>✕</button>
            </div>
            <div className="mbd" style={{ display:'flex', flexDirection:'column', gap:12 }}>

              <div style={{ fontSize:12, color:'var(--t2)', padding:'8px 12px',
                background:'var(--bl)', borderRadius:'var(--r)', border:'.5px solid #BFDBFE' }}>
                Review the rows below before importing. Rows without a Title were already skipped.
                <button onClick={() => { setImportModal(false); setImportGuide(true); }}
                  style={{ marginLeft:10, fontSize:11, color:'var(--brand)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>
                  ← Back to guide
                </button>
              </div>

              {/* Preview table */}
              <div style={{ overflowX:'auto', maxHeight:320, border:'.5px solid var(--border2)', borderRadius:'var(--r)' }}>
                <table style={{ fontSize:11, width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'var(--s2)', position:'sticky', top:0 }}>
                      {['#','Type','Title','Firm','Contact','Due Date','Time','Notes','Rep'].map(h => (
                        <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontWeight:600,
                          fontSize:10, color:'var(--t2)', borderBottom:'.5px solid var(--border2)', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 20).map((r, i) => {
                      const meta = TYPE_META[r.type || 'follow-up'];
                      return (
                        <tr key={i} style={{ borderBottom:'.5px solid var(--border)' }}>
                          <td style={{ padding:'5px 10px', color:'var(--t3)', fontSize:10 }}>{i + 1}</td>
                          <td style={{ padding:'5px 10px', whiteSpace:'nowrap' }}>
                            <span style={{ fontSize:10, padding:'1px 6px', borderRadius:8,
                              background:meta.bg, color:meta.col, fontWeight:600 }}>
                              {meta.emoji} {meta.label}
                            </span>
                          </td>
                          <td style={{ padding:'5px 10px', fontWeight:500, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.title}</td>
                          <td style={{ padding:'5px 10px', color:'var(--t2)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.firmName || '—'}</td>
                          <td style={{ padding:'5px 10px', color:'var(--t2)', whiteSpace:'nowrap' }}>{r.contact || '—'}</td>
                          <td style={{ padding:'5px 10px', color:'var(--t2)', whiteSpace:'nowrap' }}>{r.dueDate}</td>
                          <td style={{ padding:'5px 10px', color:'var(--t2)', whiteSpace:'nowrap' }}>{r.dueTime || '—'}</td>
                          <td style={{ padding:'5px 10px', color:'var(--t3)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontStyle:'italic' }}>{r.notes || '—'}</td>
                          <td style={{ padding:'5px 10px', color:'var(--t2)', whiteSpace:'nowrap' }}>{r.rep || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {importRows.length > 20 && (
                  <div style={{ padding:'8px 12px', fontSize:11, color:'var(--t3)', textAlign:'center',
                    background:'var(--s2)', borderTop:'.5px solid var(--border2)' }}>
                    … and {importRows.length - 20} more rows · all {importRows.length} will be imported
                  </div>
                )}
              </div>

            </div>
            <div className="mft">
              <button className="btn" onClick={() => setImportModal(false)}>Cancel</button>
              <button className="btn primary" onClick={confirmImport}>
                ✓ Import {importRows.length} reminder{importRows.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
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
