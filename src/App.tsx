import React, { useState, useEffect } from 'react';
import { AppProvider, useAppContext } from './store';
import Login from './components/Login';
import Layout from './components/Layout';
import FirmsDB from './panels/FirmsDB';
import CallTracker from './panels/CallTracker';
import AllCalls from './panels/AllCalls';
import TeamKPIs from './panels/TeamKPIs';
import FunnelRevenue from './panels/FunnelRevenue';
import Admin from './panels/Admin';
import Reminders from './panels/Reminders';
import { OC_LABELS, OC_COLORS, TYPE_LBL, STAGE_BG, uid, fmtDate, TODAY } from './lib/utils';
import { Call, Reminder } from './types';

function Main() {
  const { currentUser, firms, setFirms, calls, setCalls, reminders, admin, showToast, isRep, getActiveFYKpi, scopeCalls, loading } = useAppContext();
  const [panel, setPanel] = useState('firms');
  const [drawerFirmId, setDrawerFirmId] = useState<string | null>(null);
  const [drContact, setDrContact] = useState('');
  const [drType, setDrType] = useState('call');
  const [drOC, setDrOC] = useState('');
  const [drStage, setDrStage] = useState('');
  const [drNotes, setDrNotes] = useState('');
  const [drFU, setDrFU] = useState('');
  const [drMtg, setDrMtg] = useState('');
  const [eodOpen, setEodOpen] = useState(false);
  const [eodPage, setEodPage] = useState(1);
  const [eodPeriod, setEodPeriod] = useState<'today'|'week'|'month'|'quarter'|'custom'>('today');
  const [eodFrom, setEodFrom] = useState('');
  const [eodTo, setEodTo] = useState('');
  const EOD_PER_PAGE = 3;
  const [drCallPage, setDrCallPage] = useState(1);
  const DR_PER_PAGE = 4;

  // Show overdue/due-today toast on first mount
  useEffect(() => {
    const rep = currentUser?.linkedRep || currentUser?.name || '';
    const isAdm = currentUser?.role === 'admin' || (currentUser?.perms as any)?.viewAll;
    const myR = isAdm ? reminders : reminders.filter((r: Reminder) => r.rep === rep);
    const dueCount = myR.filter((r: Reminder) => !r.done && r.dueDate <= TODAY).length;
    if (dueCount > 0) {
      setTimeout(() => showToast(`🔔 ${dueCount} reminder${dueCount > 1 ? 's' : ''} due today or overdue`, 'warn'), 900);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const drawerFirm = firms.find(f => f.id === drawerFirmId);
  const drawerCalls = drawerFirmId
    ? calls.filter(c => c.firmId === drawerFirmId || (c.firm === drawerFirm?.name && !c.firmId))
        .slice().sort((a, b) => b.ts.localeCompare(a.ts))
    : [];

  const openDrawer = (firmId: string) => {
    const f = firms.find(x => x.id === firmId);
    if (!f) return;
    setDrawerFirmId(firmId);
    setDrCallPage(1);
    // Pre-select primary contact if contacts array exists, else fall back to legacy field
    const primary = f.contacts?.find((c: any) => c.isPrimary) || f.contacts?.[0];
    setDrContact(primary?.name || f.contact_name || '');
    setDrType('call'); setDrOC(''); setDrStage('');
    setDrNotes(''); setDrFU(f.follow_up || ''); setDrMtg('');
  };

  const closeDrawer = () => { setDrawerFirmId(null); setDrOC(''); };

  const saveDrawerCall = () => {
    if (!drawerFirmId || !drOC) { showToast('Pick an outcome', 'err'); return; }
    const f = firms.find(x => x.id === drawerFirmId);
    if (!f) return;
    const rep = isRep() ? currentUser?.linkedRep || currentUser?.name || '' : currentUser?.name || '';
    const newCall: Call = {
      id: uid(), rep, firm: f.name, firmId: drawerFirmId,
      contact: drContact, type: drType, oc: drOC,
      stage: drStage || undefined, notes: drNotes,
      fu: drFU || undefined, mtgDate: drMtg || undefined,
      ts: new Date().toISOString(),
    };
    setCalls([newCall, ...calls]);
    setFirms(firms.map(x => x.id === drawerFirmId ? {
      ...x, last_contact: TODAY,
      ...(drStage ? { stage: drStage } : {}),
      ...(drFU ? { follow_up: drFU } : {}),
    } : x));
    showToast(`${OC_LABELS[drOC]} — ${f.name}`, 'ok');
    closeDrawer();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const inInp = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') { closeDrawer(); setEodOpen(false); return; }
      if (inInp) return;
      if (e.key === '/') { e.preventDefault(); setPanel('firms'); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); setPanel('calls'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontSize:18,color:'#888'}}>Loading…</div>;
  if (!currentUser) return <Login />;

  const OUTCOMES = [
    { key: 'mtg', emoji: '📅', label: 'Meeting set',    cls: 'oc-mtg' },
    { key: 'cb',  emoji: '🔄', label: 'Callback',       cls: 'oc-cb'  },
    { key: 'in',  emoji: '👍', label: 'Interested',     cls: 'oc-in'  },
    { key: 'na',  emoji: '📵', label: 'No answer',      cls: 'oc-na'  },
    { key: 'gk',  emoji: '🚧', label: 'Gatekeeper',     cls: 'oc-gk'  },
    { key: 'ni',  emoji: '❌', label: 'Not interested', cls: 'oc-ni'  },
    { key: 'vm',  emoji: '📨', label: 'Voicemail',      cls: 'oc-vm'  },
  ];

  // EOD — period-aware data computation
  const kpi = getActiveFYKpi();
  const allCalls = scopeCalls(calls);
  const activeReps = admin.reps?.filter(r => r.status === 'Active') || [];

  // Compute date range for selected period
  const getEodRange = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    const today = fmt(now);
    if (eodPeriod === 'today') return { from: today, to: today, label: 'Today', days: 1 };
    if (eodPeriod === 'week') {
      const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7));
      return { from: fmt(mon), to: today, label: 'This week', days: (now.getDay()+6)%7 + 1 };
    }
    if (eodPeriod === 'month') {
      const start = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
      return { from: start, to: today, label: 'This month', days: now.getDate() };
    }
    if (eodPeriod === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const start = fmt(new Date(now.getFullYear(), q * 3, 1));
      const daysSince = Math.ceil((now.getTime() - new Date(now.getFullYear(), q*3, 1).getTime()) / 86400000) + 1;
      return { from: start, to: today, label: 'This quarter', days: daysSince };
    }
    if (eodPeriod === 'custom' && eodFrom && eodTo) {
      const ms = new Date(eodTo).getTime() - new Date(eodFrom).getTime();
      return { from: eodFrom, to: eodTo, label: `${eodFrom} → ${eodTo}`, days: Math.ceil(ms/86400000)+1 };
    }
    return { from: today, to: today, label: 'Today', days: 1 };
  };
  const eodRange = getEodRange();

  // Working days multiplier for scaling targets (Mon–Fri only, rough)
  const workDays = Math.max(1, Math.round(eodRange.days * 5/7));

  const eodRows = activeReps.map(r => {
    const rc = allCalls.filter(c => {
      const d = c.ts.split('T')[0];
      return c.rep === r.name && d >= eodRange.from && d <= eodRange.to;
    });
    // Scale targets to period
    const callTarget = eodPeriod === 'today'
      ? (r.calls || kpi.calls_day)
      : eodPeriod === 'week'
      ? (r.calls || kpi.calls_day) * 5
      : eodPeriod === 'month'
      ? (r.calls || kpi.calls_day) * workDays
      : eodPeriod === 'quarter'
      ? (r.calls || kpi.calls_day) * workDays
      : (r.calls || kpi.calls_day) * workDays; // custom

    const mtgTarget = eodPeriod === 'today'
      ? Math.ceil((r.mtg || kpi.meetings_month) / 22)
      : eodPeriod === 'week'
      ? Math.ceil((r.mtg || kpi.meetings_month) / 4.3)
      : eodPeriod === 'month'
      ? (r.mtg || kpi.meetings_month)
      : eodPeriod === 'quarter'
      ? (r.mtg || kpi.meetings_month) * 3
      : Math.ceil((r.mtg || kpi.meetings_month) * eodRange.days / 30); // custom

    const liTarget = eodPeriod === 'today'
      ? (r.li || kpi.li_day || 10)
      : eodPeriod === 'week'
      ? (r.li || kpi.li_day || 10) * 5
      : eodPeriod === 'month'
      ? (r.li || kpi.li_day || 10) * workDays
      : (r.li || kpi.li_day || 10) * workDays;

    const nC = rc.filter(c => c.type === 'call' || c.type === 'followup').length;
    const nL = rc.filter(c => c.type === 'linkedin').length;
    const nM = rc.filter(c => c.oc === 'mtg').length;
    const nI = rc.filter(c => c.oc === 'ni').length;
    const nN = rc.filter(c => c.oc === 'na').length;
    const nVM = rc.filter(c => c.oc === 'vm').length;
    const nCB = rc.filter(c => c.oc === 'cb').length;
    const nIN = rc.filter(c => c.oc === 'in').length;
    const connRate = nC > 0 ? Math.round((nC - nN - nVM) / nC * 100) : 0;

    return {
      r: r.name, col: r.col, init: r.init || r.name.substring(0,2).toUpperCase(),
      callTarget: Math.round(callTarget),
      mtgTarget: Math.round(mtgTarget),
      liTarget: Math.round(liTarget),
      nC, nL, nM, nI, nN, nVM, nCB, nIN, connRate,
      total: rc.length,
    };
  });

  const eodTotalMtg = eodRows.reduce((s, r) => s + r.nM, 0);
  const eodTotalCalls = eodRows.reduce((s, r) => s + r.nC, 0);
  const eodMissed = eodRows.filter(r => r.nC < r.callTarget);
  const eodHit = eodRows.filter(r => r.nC >= r.callTarget);
  const eodTotalPages = Math.max(1, Math.ceil(eodRows.length / EOD_PER_PAGE));
  const eodPagedRows = eodRows.slice((eodPage - 1) * EOD_PER_PAGE, eodPage * EOD_PER_PAGE);

  // CSV export
  const exportEodCSV = () => {
    const rows = [
      ['Rep','Period','Calls','Call Target','Calls %','LinkedIn','Mtg Target','Meetings Set','LI Target','Connect Rate %','No Answer','Voicemail','Callback','Interested','Not Interested'],
      ...eodRows.map(r => [
        r.r, eodRange.label,
        r.nC, r.callTarget, Math.round(r.nC/r.callTarget*100),
        r.nL, r.liTarget, r.nM, r.mtgTarget,
        r.connRate, r.nN, r.nVM, r.nCB, r.nIN, r.nI,
      ])
    ];
    const csv = rows.map(row => row.map(v => `"${v}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `DiTechFAO_Report_${eodRange.label.replace(/[^a-z0-9]/gi,'_')}_${TODAY}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Report exported', 'ok');
  };

  return (
    <Layout currentPanel={panel} setPanel={setPanel}>
      <div className="panel active" style={{ display: 'flex', flexDirection: 'column' }}>
        {panel === 'firms'     && <FirmsDB onLogCall={openDrawer} />}
        {panel === 'calls'     && <CallTracker onOpenEOD={() => { setEodPage(1); setEodOpen(true); }} />}
        {panel === 'allcalls'  && <AllCalls />}
        {panel === 'team'      && <TeamKPIs />}
        {panel === 'funnel'    && <FunnelRevenue />}
        {panel === 'reminders' && <Reminders />}
        {panel === 'admin'     && <Admin />}
      </div>

      {/* ── Call Log Drawer ── */}
      {drawerFirm && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 399 }} onClick={closeDrawer} />
          <div className="drawer open">
            <div className="dr-hd">
              <h3>{drawerFirm.name}</h3>
              <div className="dr-sub">{[drawerFirm.city, drawerFirm.region, drawerFirm.size].filter(Boolean).join(' · ')}</div>
              <button className="dr-x" onClick={closeDrawer}>✕</button>
            </div>
            <div className="dr-body">
              {/* Firm info strip */}
              <div style={{ padding: '9px 11px', background: 'var(--brand-light)', borderRadius: 'var(--r)', border: '.5px solid #c8c7e8' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--brand)', marginBottom: 6 }}>Firm</div>
                <div style={{ fontSize: 12, color: 'var(--t2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 8 }}>
                  {(drawerFirm.phone || drawerFirm.main_phone) && (
                    <div><span style={{ color: 'var(--t3)', fontSize: 10 }}>Switchboard</span><br />
                      <a href={`tel:${drawerFirm.phone || drawerFirm.main_phone}`} style={{ color: 'var(--blue)' }}>{drawerFirm.phone || drawerFirm.main_phone}</a>
                    </div>
                  )}
                  {drawerFirm.software && <div><span style={{ color: 'var(--t3)', fontSize: 10 }}>Software</span><br />{drawerFirm.software}</div>}
                  <div style={{ gridColumn: '1/-1' }}>
                    <span style={{ color: 'var(--t3)', fontSize: 10 }}>Stage</span><br />
                    <span className={`badge ${STAGE_BG[drawerFirm.stage] || 'b-none'}`}>{drawerFirm.stage || 'Lead'}</span>
                  </div>
                  {drawerFirm.notes && (
                    <div style={{ gridColumn: '1/-1' }}>
                      <span style={{ color: 'var(--t3)', fontSize: 10 }}>Notes</span><br />
                      <span style={{ fontSize: 11, fontStyle: 'italic' }}>{drawerFirm.notes.slice(0, 80)}{drawerFirm.notes.length > 80 ? '…' : ''}</span>
                    </div>
                  )}
                </div>

                {/* Contacts list — all contacts for this firm */}
                {(() => {
                  const allContacts = drawerFirm.contacts && drawerFirm.contacts.length > 0
                    ? drawerFirm.contacts
                    : drawerFirm.contact_name
                    ? [{ id: 'legacy', name: drawerFirm.contact_name, title: drawerFirm.contact_title, phone: drawerFirm.phone, email: drawerFirm.email, isPrimary: true }]
                    : [];
                  if (!allContacts.length) return null;
                  return (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t3)', marginBottom: 5 }}>
                        Contacts ({allContacts.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {allContacts.map((c: any) => (
                          <div key={c.id}
                            onClick={() => setDrContact(c.name)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', borderRadius: 6,
                              background: drContact === c.name ? 'var(--brand)' : '#fff',
                              border: `.5px solid ${drContact === c.name ? 'var(--brand)' : 'var(--border)'}`,
                              cursor: 'pointer', transition: 'all .1s' }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                              background: drContact === c.name ? 'rgba(255,255,255,.2)' : c.isPrimary ? 'var(--brand-light)' : 'var(--grl)',
                              color: drContact === c.name ? '#fff' : 'var(--brand)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                              {c.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: drContact === c.name ? '#fff' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.name} {c.isPrimary && <span style={{ fontSize: 9, opacity: .7 }}>★</span>}
                              </div>
                              {c.title && <div style={{ fontSize: 10, color: drContact === c.name ? 'rgba(255,255,255,.75)' : 'var(--t2)' }}>{c.title}</div>}
                            </div>
                            {c.phone && (
                              <a href={`tel:${c.phone}`} onClick={e => e.stopPropagation()}
                                style={{ fontSize: 10, color: drContact === c.name ? 'rgba(255,255,255,.8)' : 'var(--blue)', whiteSpace: 'nowrap' }}>
                                📞
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 5 }}>Click a contact to select them for this call</div>
                    </div>
                  );
                })()}
              </div>

              {/* Previous calls — paginated, newest first */}
              {drawerCalls.length > 0 && (() => {
                const totalPages = Math.ceil(drawerCalls.length / DR_PER_PAGE);
                const safePage = Math.min(drCallPage, totalPages);
                const pageStart = (safePage - 1) * DR_PER_PAGE;
                const pageCalls = drawerCalls.slice(pageStart, pageStart + DR_PER_PAGE);
                return (
                  <div>
                    {/* Header row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--t2)' }}>
                        Previous calls
                        <span style={{ fontWeight: 400, color: 'var(--t3)', marginLeft: 4 }}>({drawerCalls.length})</span>
                      </div>
                      {/* Pagination controls — only show if more than one page */}
                      {totalPages > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => setDrCallPage(p => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            style={{ padding: '2px 7px', borderRadius: 4, border: '.5px solid var(--border2)', background: '#fff', fontSize: 11, cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? 0.35 : 1, color: 'var(--t2)' }}
                          >←</button>
                          <span style={{ fontSize: 11, color: 'var(--t3)', minWidth: 40, textAlign: 'center' }}>
                            {safePage} / {totalPages}
                          </span>
                          <button
                            onClick={() => setDrCallPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            style={{ padding: '2px 7px', borderRadius: 4, border: '.5px solid var(--border2)', background: '#fff', fontSize: 11, cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? 0.35 : 1, color: 'var(--t2)' }}
                          >→</button>
                        </div>
                      )}
                    </div>

                    {/* Call rows */}
                    {pageCalls.map((c, i) => {
                      const isToday = c.ts.startsWith(TODAY);
                      return (
                        <div
                          key={c.id}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 8px', borderRadius: 6, background: i % 2 === 0 ? 'var(--s2)' : '#fff', marginBottom: 2 }}
                          title={c.notes || ''}
                        >
                          <div style={{ width: 7, height: 7, borderRadius: '50%', background: OC_COLORS[c.oc] || '#888', flexShrink: 0, marginTop: 3 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: `${OC_COLORS[c.oc]}18`, color: OC_COLORS[c.oc], fontWeight: 500, whiteSpace: 'nowrap' }}>
                                {OC_LABELS[c.oc] || c.oc}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--t3)' }}>{TYPE_LBL[c.type] || c.type}</span>
                              {c.contact && (
                                <span style={{ fontSize: 11, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {c.contact}</span>
                              )}
                            </div>
                            {c.notes && (
                              <div style={{ fontSize: 10, color: 'var(--t3)', fontStyle: 'italic', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.notes}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: isToday ? 'var(--green)' : 'var(--t3)', fontWeight: isToday ? 600 : 400, whiteSpace: 'nowrap' }}>
                              {isToday ? 'Today' : fmtDate(c.ts)}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                              {new Date(c.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Footer: showing X–Y of N */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 5 }}>
                      <span style={{ fontSize: 10, color: 'var(--t3)' }}>
                        Showing {pageStart + 1}–{Math.min(pageStart + DR_PER_PAGE, drawerCalls.length)} of {drawerCalls.length}
                      </span>
                      <button
                        onClick={() => { setPanel('allcalls'); closeDrawer(); }}
                        style={{ fontSize: 10, color: 'var(--blue)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        See all in All Calls →
                      </button>
                    </div>
                  </div>
                );
              })()}

              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--brand)', paddingTop: 4 }}>New call</div>

              <div className="fg">
                <label>Contact spoken to</label>
                {/* If firm has multiple contacts, show a dropdown; else free text */}
                {(() => {
                  const allC = drawerFirm.contacts && drawerFirm.contacts.length > 0
                    ? drawerFirm.contacts
                    : drawerFirm.contact_name
                    ? [{ id: 'legacy', name: drawerFirm.contact_name, title: drawerFirm.contact_title }]
                    : [];
                  if (allC.length > 1) {
                    return (
                      <select value={drContact} onChange={e => setDrContact(e.target.value)}>
                        <option value="">— Select contact —</option>
                        {allC.map((c: any) => (
                          <option key={c.id} value={c.name}>{c.name}{c.title ? ` — ${c.title}` : ''}{c.isPrimary ? ' ★' : ''}</option>
                        ))}
                        <option value="__other__">Other / Reception / Gatekeeper</option>
                      </select>
                    );
                  }
                  return (
                    <input value={drContact === '__other__' ? '' : drContact}
                      onChange={e => setDrContact(e.target.value)}
                      placeholder="Name of person you spoke to" />
                  );
                })()}
              </div>
              <div className="fg"><label>Activity type</label>
                <select value={drType} onChange={e => setDrType(e.target.value)}>
                  <option value="call">Cold call</option><option value="followup">Follow-up call</option>
                  <option value="linkedin">LinkedIn message</option><option value="email">Email</option><option value="meeting">Meeting held</option>
                </select>
              </div>
              <div className="fg">
                <label>Outcome *</label>
                <div className="og" style={{ marginTop: 4 }}>
                  {OUTCOMES.map(o => (
                    <div key={o.key} className={`oo ${o.cls} ${drOC === o.key ? 'sel' : ''}`} onClick={() => setDrOC(o.key)}>
                      {o.emoji} {o.label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="fg"><label>Update stage</label>
                <select value={drStage} onChange={e => setDrStage(e.target.value)}>
                  <option value="">Keep current stage</option>
                  {['Lead', 'Suspect', 'Proposal', 'Win', 'Lost'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="fg"><label>Notes / key points</label><textarea value={drNotes} onChange={e => setDrNotes(e.target.value)} placeholder="Objections, pain points, next steps…" style={{ height: 72 }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="fg"><label>Follow-up date</label><input type="date" value={drFU} onChange={e => setDrFU(e.target.value)} /></div>
                <div className="fg"><label>Meeting date</label><input type="date" value={drMtg} onChange={e => setDrMtg(e.target.value)} /></div>
              </div>
            </div>
            <div className="dr-ft" style={{ flexWrap: 'wrap', gap: 6 }}>
              <button className="dr-cancel" onClick={closeDrawer}>Cancel</button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  closeDrawer();
                  setTimeout(() => setPanel('reminders'), 50);
                }}
                title="Go to Reminders to set a reminder for this firm"
                style={{ borderColor: '#EF9F27', color: '#854F0B' }}
              >
                🔔 Set reminder
              </button>
              <button className="dr-save" onClick={saveDrawerCall}>Save call entry</button>
            </div>
          </div>
        </>
      )}

      {/* ── Progress Report Modal ── */}
      {eodOpen && (
        <div className="mov" onClick={e => { if (e.target === e.currentTarget) setEodOpen(false); }}>
          <div className="modal wide" style={{ maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>

            {/* Fixed header */}
            <div className="mhd" style={{ flexShrink: 0 }}>
              <div>
                <h2>📊 Team Progress Report</h2>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>
                  {eodRange.label} · {activeReps.length} active rep{activeReps.length !== 1 ? 's' : ''} · {eodTotalCalls} calls · {eodTotalMtg} meetings
                </div>
              </div>
              <button className="mx" onClick={() => setEodOpen(false)}>✕</button>
            </div>

            {/* Period filter bar */}
            <div style={{ padding: '10px 18px', borderBottom: '.5px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 600, marginRight: 2 }}>Period:</span>
              {(['today','week','month','quarter','custom'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => { setEodPeriod(p); setEodPage(1); }}
                  className={`dr-btn ${eodPeriod === p ? 'on' : ''}`}
                >
                  {p === 'today' ? 'Today' : p === 'week' ? 'This week' : p === 'month' ? 'This month' : p === 'quarter' ? 'This quarter' : 'Custom'}
                </button>
              ))}
              {eodPeriod === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                  <input type="date" value={eodFrom} onChange={e => { setEodFrom(e.target.value); setEodPage(1); }} className="date-inp" />
                  <span style={{ fontSize: 11, color: 'var(--t2)' }}>to</span>
                  <input type="date" value={eodTo} onChange={e => { setEodTo(e.target.value); setEodPage(1); }} className="date-inp" />
                </div>
              )}
            </div>

            {/* Summary strip */}
            <div style={{ padding: '8px 18px', borderBottom: '.5px solid var(--border)', flexShrink: 0, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { l: 'Total calls', v: eodTotalCalls, col: 'var(--brand)' },
                { l: 'Meetings set', v: eodTotalMtg, col: '#1D9E75' },
                { l: 'Hit target', v: `${eodHit.length}/${activeReps.length}`, col: eodHit.length === activeReps.length ? '#1D9E75' : '#EF9F27' },
                { l: 'Missed target', v: eodMissed.length, col: eodMissed.length > 0 ? '#A32D2D' : '#888' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.col, lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: 'var(--t2)', marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
              {eodMissed.length > 0 && (
                <div className="alert warn" style={{ margin: 0, padding: '4px 10px', fontSize: 11, alignSelf: 'center' }}>
                  ⚠ {eodMissed.map(r => r.r).join(', ')} behind target
                </div>
              )}
              {eodMissed.length === 0 && activeReps.length > 0 && (
                <div className="alert ok" style={{ margin: 0, padding: '4px 10px', fontSize: 11, alignSelf: 'center' }}>
                  ✅ All reps hit target
                </div>
              )}
            </div>

            {/* Scrollable rep cards */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              {activeReps.length === 0 ? (
                <div className="empty-st">No active reps. Go to Admin → Rep config.</div>
              ) : eodPagedRows.map(r => {
                const hitCalls = r.nC >= r.callTarget;
                const hitMtg = r.nM >= r.mtgTarget;
                const pctC = Math.min(100, r.callTarget > 0 ? Math.round(r.nC / r.callTarget * 100) : 0);
                const pctM = Math.min(100, r.mtgTarget > 0 ? Math.round(r.nM / r.mtgTarget * 100) : 0);
                const pctL = Math.min(100, r.liTarget > 0 ? Math.round(r.nL / r.liTarget * 100) : 0);
                const colC = pctC >= 100 ? '#1D9E75' : pctC >= 60 ? '#EF9F27' : '#E24B4A';
                const colM = pctM >= 100 ? '#1D9E75' : pctM >= 60 ? '#EF9F27' : '#E24B4A';
                const colL = pctL >= 100 ? '#1D9E75' : pctL >= 60 ? '#EF9F27' : '#E24B4A';

                return (
                  <div key={r.r} style={{ background: '#fff', border: `.5px solid ${hitCalls ? '#9FE1CB' : '#f0c0c0'}`, borderRadius: 'var(--rl2)', padding: '16px', marginBottom: 12 }}>

                    {/* Rep header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${r.col}22`, color: r.col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                          {r.init}
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 700 }}>{r.r}</div>
                          <div style={{ fontSize: 11, color: 'var(--t2)' }}>
                            {r.total} total activities · {r.connRate}% connect rate
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span className={`hit-badge ${hitCalls ? 'hit-yes' : 'hit-no'}`}>
                          {hitCalls ? '✓ Calls hit' : `✗ Calls ${r.nC}/${r.callTarget}`}
                        </span>
                        <span className={`hit-badge ${hitMtg ? 'hit-yes' : pctM >= 60 ? 'hit-warn' : 'hit-no'}`}>
                          {hitMtg ? '✓ Mtgs hit' : `Mtgs ${r.nM}/${r.mtgTarget}`}
                        </span>
                      </div>
                    </div>

                    {/* 3 progress bars */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                      {[
                        { l: 'Calls', v: r.nC, t: r.callTarget, pct: pctC, col: colC },
                        { l: 'Meetings set', v: r.nM, t: r.mtgTarget, pct: pctM, col: colM },
                        { l: 'LinkedIn', v: r.nL, t: r.liTarget, pct: pctL, col: colL },
                      ].map(b => (
                        <div key={b.l}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                            <span style={{ color: 'var(--t2)', fontWeight: 500 }}>{b.l}</span>
                            <span style={{ fontWeight: 700, color: b.col }}>{b.v} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>/ {b.t}</span></span>
                          </div>
                          <div style={{ height: 7, background: '#eee', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${b.pct}%`, background: b.col, borderRadius: 4, transition: 'width .4s' }} />
                          </div>
                          <div style={{ fontSize: 10, color: b.col, fontWeight: 600, marginTop: 2 }}>{b.pct}% of target</div>
                        </div>
                      ))}
                    </div>

                    {/* Outcome breakdown tiles */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, textAlign: 'center' }}>
                      {([
                        ['Meeting set', r.nM, '#1D9E75'],
                        ['Callback', r.nCB, '#EF9F27'],
                        ['Interested', r.nIN, '#378ADD'],
                        ['No answer', r.nN, '#888'],
                        ['Voicemail', r.nVM, '#7F77DD'],
                        ['Not int.', r.nI, '#A32D2D'],
                      ] as [string, number, string][]).map(([l, v, col]) => (
                        <div key={l} style={{ background: 'var(--s2)', padding: '8px 4px', borderRadius: 6, border: '.5px solid var(--border)' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: v > 0 ? col : 'var(--t3)' }}>{v}</div>
                          <div style={{ fontSize: 9, color: 'var(--t2)', marginTop: 2, lineHeight: 1.3 }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fixed footer — pagination + export + close */}
            <div style={{ padding: '10px 18px', borderTop: '.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: '#fff' }}>
              {/* Pagination */}
              {eodTotalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>
                  <button className="btn sm" disabled={eodPage <= 1} onClick={() => setEodPage(p => p - 1)}>← Prev</button>
                  {Array.from({ length: eodTotalPages }, (_, i) => i + 1).map(p => (
                    <button key={p} onClick={() => setEodPage(p)} style={{ width: 28, height: 28, borderRadius: 6, border: '.5px solid var(--border)', background: p === eodPage ? 'var(--brand)' : '#fff', color: p === eodPage ? '#fff' : 'var(--text)', fontSize: 12, cursor: 'pointer', fontWeight: p === eodPage ? 600 : 400 }}>{p}</button>
                  ))}
                  <button className="btn sm" disabled={eodPage >= eodTotalPages} onClick={() => setEodPage(p => p + 1)}>Next →</button>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{(eodPage-1)*EOD_PER_PAGE+1}–{Math.min(eodPage*EOD_PER_PAGE, activeReps.length)} of {activeReps.length} reps</span>
                </div>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn" onClick={exportEodCSV}>↓ Export CSV</button>
                <button className="btn" onClick={() => setEodOpen(false)}>Close</button>
                <button className="btn primary" onClick={() => { showToast('Report saved', 'ok'); setEodOpen(false); }}>Save report</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default function App() {
  return <AppProvider><Main /></AppProvider>;
}
