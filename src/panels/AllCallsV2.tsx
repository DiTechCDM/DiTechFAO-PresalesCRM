/* ════════════════════════════════════════════════════════════════
   All Calls (new) — served at /all-calls.
   Runs side by side with the existing All Calls panel, which is
   unchanged. Uses the same store (calls, reminders, firms) so
   everything logged here shows up everywhere else too.
   ════════════════════════════════════════════════════════════════ */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../store';
import { Call, Firm, Reminder } from '../types';
import { OC_LABELS, OC_COLORS, TYPE_LBL, uid } from '../lib/utils';
import * as api from '../lib/api';
import {
  IST, MIN, useNow, tsMs, istParts, dueMs, hasTime, fmtClock, fmtDay, dayRel, whenLabel, firmTz,
  myRepName, isTeamViewer, fuStatus, FuStatus, openReminderFor, firmCalls, callQuality, QUALITY_COL, Quality,
  withDueDeliberate, snoozeTarget, CREATED_FROM_NEW, logHistory, takePendingFirm, takePendingView,
  clockOffset, setClockOffset,
} from '../lib/followups';
import { EditCallModal } from './CallTracker'; // same edit form the old All Calls used
import './AllCallsV2.css';

const PER_PAGE = 50;

const OUTCOMES: { key: string; label: string }[] = [
  { key: 'dm',  label: '🎯 Decision maker' },
  { key: 'mtg', label: '📅 Meeting set' },
  { key: 'in',  label: '👍 Interested' },
  { key: 'cb',  label: '🔄 Callback requested' },
  { key: 'em',  label: '✉️ Email requested' },
  { key: 'gk',  label: '🚧 Gatekeeper' },
  { key: 'na',  label: '📵 No answer' },
  { key: 'vm',  label: '📨 Voicemail' },
  { key: 'ni',  label: '❌ Not interested' },
];

type Period = 'today' | '7d' | '30d' | 'month' | 'custom';
const PERIODS: [Period, string][] = [['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['month', 'This month'], ['custom', 'Custom']];

type ViewKey = 'all' | 'good' | 'dm' | 'cb' | 'em' | 'gk' | 'ni' | 'due' | 'missed';

interface Meta { migrated: boolean; history: Record<string, api.HistoryEntry[]>; goodLeads: Set<string> }

/* ── small date helpers (IST calendar) ── */
const istMs = (date: string, hm: string) => Date.parse(`${date}T${hm}:00+05:30`);
function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const weekday = (date: string) => new Date(date + 'T12:00:00Z').getUTCDay(); // 0 Sun … 6 Sat
function nextWorkingDay(date: string) {
  let d = addDays(date, 1);
  while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1);
  return d;
}
/** "2026-11-25T17:05" (datetime-local value, IST) → ms */
const localInputMs = (v: string) => (v && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? istMs(v.slice(0, 10), v.slice(11, 16)) : NaN);
const msToLocalInput = (ms: number) => { const p = istParts(ms); return `${p.date}T${p.time}`; };

const chip = (st: { bg: string; fg: string }) => ({ background: st.bg, color: st.fg });

export default function AllCallsV2() {
  const {
    currentUser, admin, firms, setFirms, calls, setCalls, reminders, setReminders, scopeCalls, showToast,
  } = useAppContext();
  const now = useNow(20_000);
  const me = myRepName(currentUser, admin.reps);
  const team = isTeamViewer(currentUser);
  const today = istParts(now).date;

  /* ── page state ── */
  const [period, setPeriod] = useState<Period>('7d');
  const [view, setView] = useState<ViewKey>('all');
  const [search, setSearch] = useState('');
  const [repF, setRepF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [cFrom, setCFrom] = useState(() => addDays(istParts(Date.now()).date, -6));
  const [cTo, setCTo] = useState(() => istParts(Date.now()).date);
  const [page, setPage] = useState(1);
  const [editingCall, setEditingCall] = useState<Call | null>(null);

  /* ── Admin test clock (display only; saves are paused while it's moved) ── */
  const isAdminUser = currentUser?.role === 'admin';
  const testing = clockOffset() !== 0;
  const [clockOpen, setClockOpen] = useState(false);
  const shiftClock = (mins: number) => setClockOffset(clockOffset() + mins * MIN);
  const jumpClock = (hm: string) => setClockOffset(istMs(istParts(Date.now()).date, hm) - Date.now());
  const PAUSED = 'Test clock is on — set it back to real time to save changes.';

  const saveEdit = (original: Call, updated: Partial<Call>) => {
    setCalls(calls.map(c => c.id === original.id ? { ...c, ...updated } : c));
    setEditingCall(null);
    showToast('Call updated', 'ok');
  };

  /* ── drawer state ── */
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<'calls' | 'rems'>('calls');
  const [fContact, setFContact] = useState('');
  const [fOut, setFOut] = useState('');
  const [fNote, setFNote] = useState('');
  const [fFu, setFFu] = useState<number | 'close' | 'custom' | null>(null);
  const [fCustom, setFCustom] = useState('');
  const [fRemark, setFRemark] = useState('');
  const [fRep, setFRep] = useState('');
  const [fStage, setFStage] = useState('');
  const [raRep, setRaRep] = useState('');
  const [raSlot, setRaSlot] = useState<number | 'custom' | null>(null);
  const [raCustom, setRaCustom] = useState('');
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  /* ── history + good-lead flags (needs the migration) ── */
  const [meta, setMeta] = useState<Meta | null>(null);
  const [metaErr, setMetaErr] = useState(false);
  useEffect(() => {
    api.followups.meta()
      .then(m => setMeta({ migrated: m.migrated, history: m.history || {}, goodLeads: new Set(m.goodLeads || []) }))
      .catch(() => setMetaErr(true));
  }, []);
  const migrated = !!meta?.migrated;

  useEffect(() => {
    const onHist = (e: Event) => {
      const { id, entry } = (e as CustomEvent).detail || {};
      if (!id || !entry) return;
      setMeta(m => m ? { ...m, history: { ...m.history, [id]: [...(m.history[id] || []), entry] } } : m);
    };
    const onFirm = (e: Event) => { const id = (e as CustomEvent).detail; takePendingFirm(); if (id) openFirmRef.current(id); };
    const onView = (e: Event) => { const v = (e as CustomEvent).detail; takePendingView(); if (v) { setView(v); setPage(1); } };
    window.addEventListener('ac2:history', onHist);
    window.addEventListener('ac2:open-firm', onFirm);
    window.addEventListener('ac2:open-view', onView);
    const pf = takePendingFirm(); if (pf) openFirmRef.current(pf);
    const pv = takePendingView(); if (pv) setView(pv as ViewKey);
    return () => {
      window.removeEventListener('ac2:history', onHist);
      window.removeEventListener('ac2:open-firm', onFirm);
      window.removeEventListener('ac2:open-view', onView);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── reps ── */
  const activeReps = useMemo(() => {
    const names = (admin.reps || []).filter(r => r.status === 'Active').map(r => r.name);
    return names.length ? names : (admin.dropdowns?.assigned_to || []);
  }, [admin]);
  const repCol = (name: string) => admin.reps?.find(r => r.name === name)?.col || '#888';

  /* ── lookups ── */
  const firmById = useMemo(() => new Map(firms.map(f => [f.id, f])), [firms]);
  const firmByName = useMemo(() => new Map(firms.map(f => [f.name, f])), [firms]);
  const firmOf = (c: Call): Firm | undefined => (c.firmId && firmById.get(c.firmId)) || firmByName.get(c.firm);
  const isGood = (firmId?: string) => !!firmId && !!meta?.goodLeads.has(firmId);
  const scoped = useMemo(() => scopeCalls(calls), [calls, scopeCalls]);
  const myRems = useMemo(() => (team ? reminders : reminders.filter(r => r.rep === me)), [reminders, team, me]);
  const status = (r: Reminder) => fuStatus(r, now, calls);
  const openRemByFirm = useMemo(() => {
    const m = new Map<string, Reminder>();
    for (const r of reminders) {
      if (r.done || !r.firmId) continue;
      const cur = m.get(r.firmId);
      if (!cur || dueMs(r) < dueMs(cur)) m.set(r.firmId, r);
    }
    return m;
  }, [reminders]);
  const callCountByFirm = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of calls) { const k = c.firmId || 'n:' + c.firm; m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }, [calls]);

  /* ── date range ── */
  const fromDate = period === 'today' ? today : period === '7d' ? addDays(today, -6) : period === '30d' ? addDays(today, -29)
    : period === 'month' ? today.slice(0, 8) + '01' : (cFrom <= cTo ? cFrom : cTo);
  const toDate = period === 'custom' ? (cFrom <= cTo ? cTo : cFrom) : today;
  const callDate = (c: Call) => istParts(tsMs(c.ts)).date;
  const inRange = useMemo(() => scoped.filter(c => { const d = callDate(c); return d >= fromDate && d <= toDate; }), [scoped, fromDate, toDate]);

  /* ── today's follow-up queue ── */
  const weekAgo = now - 7 * 1440 * MIN;
  const queue = useMemo(() => myRems
    .filter(r => {
      const d = dueMs(r);
      if (r.done) return sameDay(d);
      return sameDay(d) || (d < now && d >= weekAgo);
    })
    .sort((a, b) => dueMs(a) - dueMs(b)), [myRems, now]); // eslint-disable-line react-hooks/exhaustive-deps
  function sameDay(ms: number) { return istParts(ms).date === today; }

  const dueToday = myRems.filter(r => sameDay(dueMs(r)));
  const missedAll = myRems.filter(r => status(r).k === 'missed');
  const oldestMissed = missedAll.length ? Math.min(...missedAll.map(dueMs)) : null;
  const goodN = inRange.filter(c => ['Hot', 'Warm'].includes(callQuality(c, isGood(firmOf(c)?.id)))).length;

  /* ── views (filters on the table) ── */
  const q = search.trim().toLowerCase();
  const matchesBase = (c: Call) => (!repF || c.rep === repF) && (!typeF || c.type === typeF) &&
    (!q || `${c.firm} ${c.contact || ''} ${c.notes || ''} ${c.rep}`.toLowerCase().includes(q));
  const remStatusOfCall = (c: Call): FuStatus | null => {
    const f = firmOf(c); const r = f && openRemByFirm.get(f.id);
    return r ? status(r) : null;
  };
  const latestPerFirm = (pred: (c: Call) => boolean) => {
    const seen = new Set<string>(); const out: Call[] = [];
    for (const c of [...scoped].sort((a, b) => tsMs(b.ts) - tsMs(a.ts))) {
      const k = c.firmId || c.firm;
      if (seen.has(k)) continue; seen.add(k);
      if (pred(c)) out.push(c);
    }
    return out;
  };
  const VIEWS: { key: ViewKey; label: string; rows: () => Call[] }[] = [
    { key: 'all',    label: 'All',                   rows: () => inRange },
    { key: 'good',   label: 'Good calls',            rows: () => inRange.filter(c => ['Hot', 'Warm'].includes(callQuality(c, isGood(firmOf(c)?.id)))) },
    { key: 'dm',     label: 'Decision maker',        rows: () => inRange.filter(c => ['dm', 'mtg', 'in'].includes(c.oc)) },
    { key: 'cb',     label: 'Callback requested',    rows: () => inRange.filter(c => c.oc === 'cb') },
    { key: 'em',     label: 'Email',                 rows: () => inRange.filter(c => c.oc === 'em') },
    { key: 'gk',     label: 'Gatekeeper / no answer', rows: () => inRange.filter(c => ['gk', 'na', 'vm'].includes(c.oc)) },
    { key: 'ni',     label: 'Not interested',        rows: () => inRange.filter(c => c.oc === 'ni') },
    { key: 'due',    label: 'Follow-up due today',   rows: () => latestPerFirm(c => { const f = firmOf(c); const r = f && openRemByFirm.get(f.id); return !!r && sameDay(dueMs(r)) && (team || r.rep === me); }) },
    { key: 'missed', label: 'Missed follow-up',      rows: () => latestPerFirm(c => { const f = firmOf(c); const r = f && openRemByFirm.get(f.id); return !!r && status(r).k === 'missed' && (team || r.rep === me); }) },
  ];
  const viewRows = VIEWS.map(v => ({ ...v, list: v.rows().filter(matchesBase) }));
  const current = viewRows.find(v => v.key === view) || viewRows[0];
  const rows = [...current.list].sort((a, b) => tsMs(b.ts) - tsMs(a.ts));
  const totalPages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  /* ── drawer ── */
  const fo = openId ? firmById.get(openId) : undefined;
  const dCalls = fo ? firmCalls(calls, fo.id, fo.name).sort((a, b) => tsMs(b.ts) - tsMs(a.ts)) : [];
  const dRems = fo ? reminders.filter(r => r.firmId === fo.id).sort((a, b) => dueMs(b) - dueMs(a)) : [];
  const rem = fo ? openReminderFor(reminders, fo.id) : null;
  const rst = rem ? status(rem) : null;
  const contacts = fo ? (fo.contacts?.length ? fo.contacts : fo.contact_name ? [{ id: 'legacy', name: fo.contact_name, title: fo.contact_title, phone: fo.phone, isPrimary: true }] : []) : [];
  const primary = contacts.find((c: any) => c.isPrimary) || contacts[0];
  const canEditRem = !!rem && (team || rem.rep === me);

  function openFirm(id: string) {
    const f = firms.find(x => x.id === id);
    setOpenId(id);
    setTab('calls');
    setFOut(''); setFNote(''); setFFu(null); setFCustom(''); setFRemark(''); setFStage('');
    const p = f?.contacts?.find(c => c.isPrimary) || f?.contacts?.[0];
    setFContact(p?.name || f?.contact_name || '');
    setFRep(team ? (f?.assigned_to || me) : me);
    const r = openReminderFor(reminders, id);
    setRaRep(r?.rep || ''); setRaSlot(null); setRaCustom('');
    setFlash(null);
  }
  const openFirmRef = useRef(openFirm);
  openFirmRef.current = openFirm;
  const closeDrawer = () => setOpenId(null);
  useEffect(() => {
    if (!openId) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openId]);

  /* slot choices (IST) */
  const slots: [string, number][] = (() => {
    const nwd = nextWorkingDay(today);
    const nwdLabel = dayRel(istMs(nwd, '12:00'), now);
    const s: [string, number][] = [
      ['Today 5:00 PM', istMs(today, '17:00')],
      ['Today 6:00 PM', istMs(today, '18:00')],
      [`${nwdLabel} 3:00 PM`, istMs(nwd, '15:00')],
      [`${nwdLabel} 6:00 PM`, istMs(nwd, '18:00')],
    ];
    return s.filter(x => x[1] > now);
  })();
  const fuChoices: [string, number][] = (() => {
    const inHour = Math.ceil((now + 60 * MIN) / (15 * MIN)) * 15 * MIN;
    let mon = addDays(today, 1); while (weekday(mon) !== 1) mon = addDays(mon, 1);
    return [['In 1 hour', inHour], ...slots.slice(0, 3), [`Next Mon (${fmtDay(istMs(mon, '12:00'))}) 3:00 PM`, istMs(mon, '15:00')]];
  })();

  const fuMs = fFu === 'custom' ? localInputMs(fCustom) : typeof fFu === 'number' ? fFu : NaN;
  const fuValid = fFu === 'close' || (Number.isFinite(fuMs) && fuMs > now - MIN);
  const canSave = !testing && !!fo && !!fOut && !!fNote.trim() && fFu !== null && fuValid;
  const saveHint = testing ? PAUSED : !fOut ? 'Pick an outcome.' : !fNote.trim() ? 'Write what happened.' : fFu === null ? 'Choose the next follow-up (or close).'
    : !fuValid ? 'Pick a follow-up time in the future.' : 'Closes the current follow-up and sets the next one.';

  const raMs = raSlot === 'custom' ? localInputMs(raCustom) : typeof raSlot === 'number' ? raSlot : NaN;

  /* ── actions ── */
  const toggleGood = () => {
    if (!fo || !meta) return;
    if (!migrated) { showToast('Needs the database update first', 'warn'); return; }
    const on = !meta.goodLeads.has(fo.id);
    const set = (v: boolean) => setMeta(m => { if (!m) return m; const g = new Set(m.goodLeads); v ? g.add(fo.id) : g.delete(fo.id); return { ...m, goodLeads: g }; });
    set(on);
    api.followups.goodLead(fo.id, on).catch(e => { set(!on); showToast('Could not save: ' + e.message, 'err'); });
  };

  const doReassign = () => {
    if (!rem || !rst) return;
    if (testing) { setFlash({ text: PAUSED, ok: false }); return; }
    const to = (team && raRep) ? raRep : rem.rep;
    const at = Number.isFinite(raMs) ? raMs : dueMs(rem);
    if (!Number.isFinite(raMs) && to === rem.rep) { setFlash({ text: 'Pick a new time or person first.', ok: false }); return; }
    if (at < now - MIN) { setFlash({ text: 'That time is in the past.', ok: false }); return; }
    const next = { ...withDueDeliberate(rem, at), rep: to };
    setReminders(reminders.map(r => r.id === rem.id ? next : r));
    logHistory(rem.id, `${rst.k === 'missed' ? `Missed (was due ${whenLabel(rem, now)}). ` : ''}Moved: ${rem.rep || '—'} ${whenLabel(rem, now)} → ${to} ${whenLabel(next, now)}`);
    setRaSlot(null); setRaCustom(''); setRaRep(to);
    setFlash({ text: `${to} will get a pop-up at ${fmtClock(at - 15 * MIN)} and again at ${fmtClock(at)}.`, ok: true });
  };

  const snooze15 = () => {
    if (!rem) return;
    if (testing) { setFlash({ text: PAUSED, ok: false }); return; }
    const next = withDueDeliberate(rem, snoozeTarget(rem, now));
    setReminders(reminders.map(r => r.id === rem.id ? next : r));
    logHistory(rem.id, `Snoozed 15 min · ${fmtClock(dueMs(rem))} → ${fmtClock(dueMs(next))}`);
    setFlash({ text: `Snoozed to ${fmtClock(dueMs(next))}.`, ok: true });
  };

  const markDone = () => {
    if (!rem || !rst) return;
    if (testing) { setFlash({ text: PAUSED, ok: false }); return; }
    setReminders(reminders.map(r => r.id === rem.id ? { ...r, done: true } : r));
    logHistory(rem.id, `Marked done without logging a call here${rst.k === 'called' ? ' (' + rst.label.replace(' · not closed', '') + ')' : ''}`);
    setFlash({ text: 'Follow-up closed.', ok: true });
  };

  const save = () => {
    if (!canSave || !fo || clockOffset() !== 0) return;
    const ts = new Date(now).toLocaleString('sv-SE', { timeZone: IST }).replace(' ', 'T');
    const nextDue = fFu === 'close' ? null : fuMs;
    const nextParts = nextDue !== null ? istParts(nextDue) : null;
    const owner = fRep || me;
    const newCall: Call = {
      id: uid(), rep: me, firm: fo.name, firmId: fo.id,
      contact: fContact === '__other__' ? 'Other / Reception' : fContact,
      type: dCalls.length ? 'followup' : 'call', oc: fOut,
      stage: fStage || undefined, notes: fNote.trim(),
      fu: nextParts?.date, ts,
    };

    // close every open follow-up for this firm, then add the next one
    const open = reminders.filter(r => r.firmId === fo.id && !r.done);
    let nextRems = reminders.map(r => r.firmId === fo.id && !r.done ? { ...r, done: true } : r);
    if (nextParts) {
      const nr: Reminder = {
        id: uid(), type: 'follow-up', title: `Follow up — ${fo.name}`,
        firmId: fo.id, firmName: fo.name, contact: newCall.contact,
        dueDate: nextParts.date, dueTime: nextParts.time,
        notes: fRemark.trim() || fNote.trim(), rep: owner, done: false,
        createdAt: new Date(now).toISOString(), createdFrom: CREATED_FROM_NEW as Reminder['createdFrom'],
      };
      nextRems = [nr, ...nextRems];
    }

    setCalls([newCall, ...calls]);
    setReminders(nextRems);
    // same firm update the existing call drawer does
    setFirms(firms.map(x => x.id === fo.id ? { ...x, last_contact: today, ...(fStage ? { stage: fStage } : {}), ...(nextParts ? { follow_up: nextParts.date } : {}) } : x));
    for (const r of open) {
      const late = (now - dueMs(r)) / MIN;
      logHistory(r.id, `Done — call logged by ${me} (${OC_LABELS[fOut] || fOut})${hasTime(r) && late >= 30 ? `, ${Math.round(late)} min late` : ''}`);
    }

    setFOut(''); setFNote(''); setFFu(null); setFCustom(''); setFRemark(''); setFStage('');
    setRaRep(owner);
    setFlash({ text: nextParts ? `Call saved. Next follow-up: ${owner}, ${dayRel(nextDue as number, now)} ${fmtClock(nextDue as number)}.` : 'Call saved. No further follow-up.', ok: true });
    showToast(`${OC_LABELS[fOut] || fOut} — ${fo.name}`, 'ok');
  };

  /* ── render ── */
  const kpiCard = (key: ViewKey, label: string, value: React.ReactNode, sub: string, color?: string, border?: string) => (
    <button className={`ac2-kpi ${view === key ? 'on' : ''}`} style={border ? { borderColor: border } : undefined} onClick={() => { setView(key); setPage(1); }}>
      <div className="l">{label}</div>
      <div className="v" style={color ? { color } : undefined}>{value}</div>
      <div className="s">{sub}</div>
    </button>
  );

  return (
    <div className="ac2-page">
      {isAdminUser && (clockOpen || testing) && (
        <div className="ac2-clock">
          <span className="lbl">Test clock</span>
          <span className="now">{new Date(now).toLocaleDateString('en-GB', { timeZone: IST, weekday: 'short', day: 'numeric', month: 'short' })}, {fmtClock(now)}</span>
          <button className="ac2-btn" onClick={() => shiftClock(-15)}>−15 min</button>
          <button className="ac2-btn" onClick={() => shiftClock(15)}>+15 min</button>
          <button className="ac2-btn" onClick={() => shiftClock(60)}>+1 hour</button>
          <button className="ac2-btn" onClick={() => jumpClock('16:50')}>Jump to 4:50 PM</button>
          <button className="ac2-btn" onClick={() => jumpClock('17:00')}>Jump to 5:00 PM</button>
          <button className="ac2-btn primary" onClick={() => { setClockOffset(0); setClockOpen(false); }}>Back to real time</button>
          <span className="note">
            {testing ? 'Only your screen sees this time. Saving is paused until you go back to real time.' : 'Admin only · moves time on your screen to watch reminders fire.'}
          </span>
        </div>
      )}

      <div className="ac2-hd">
        <div>
          <div className="ac2-title">All Calls</div>
          <div className="ac2-sub">{rows.length} calls · {fmtDay(istMs(fromDate, '12:00'))} – {fmtDay(istMs(toDate, '12:00'))} · click any row for the firm's full history</div>
        </div>
        <div className="ac2-row">
          {PERIODS.map(([k, l]) => <button key={k} className={`ac2-pill ${period === k ? 'on' : ''}`} onClick={() => { setPeriod(k); setPage(1); }}>{l}</button>)}
          {period === 'custom' && (
            <>
              <input type="date" className="ac2-input" aria-label="From" value={cFrom} onChange={e => { setCFrom(e.target.value); setPage(1); }} />
              <span className="ac2-muted">to</span>
              <input type="date" className="ac2-input" aria-label="To" value={cTo} onChange={e => { setCTo(e.target.value); setPage(1); }} />
            </>
          )}
          {isAdminUser && !clockOpen && !testing && (
            <>
              <span className="ac2-divider" aria-hidden="true" />
              <button className="ac2-clock-btn" onClick={() => setClockOpen(true)} title="Admin only: move time on your screen to test reminders">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
                </svg>
                Test clock
              </button>
            </>
          )}
        </div>
      </div>

      {(metaErr || (meta && !migrated)) && (
        <div className="ac2-warn">
          {metaErr ? 'Could not load follow-up history (server unreachable or not restarted). The page still works.'
            : 'Database update not run yet: reminder history and “good lead” are off. Run migrations/2026-11-25-all-calls-v2.sql to switch them on.'}
        </div>
      )}

      {/* Today's follow-ups */}
      <section className="ac2-card ac2-sec">
        <div className="ac2-sec-hd">
          <h2>{team ? "Today's follow-ups — whole team" : `Your follow-ups today, ${me}`} ({queue.length})</h2>
          <span className="ac2-muted">Pop-up 15 min before due. 30 min late = missed, and Admin is alerted.</span>
        </div>
        {queue.length === 0 ? <div className="ac2-muted" style={{ padding: '6px 0' }}>Nothing due today.</div> : (
          <div className="ac2-queue">
            {queue.map(r => {
              const st = status(r); const f = r.firmId ? firmById.get(r.firmId) : undefined;
              const border = st.k === 'missed' ? '#F3B4AE' : st.k === 'due' || st.k === 'soon' ? '#F2C38B' : undefined;
              return (
                <button key={r.id} className="ac2-qcard" style={{ ...(border ? { borderColor: border } : {}), ...(st.k === 'done' ? { opacity: .6, background: '#FAFAFC' } : {}) }}
                  onClick={() => f ? openFirm(f.id) : showToast('This reminder is not linked to a firm', 'warn')}>
                  <span className="ac2-chip" style={chip(st)}>{st.k === 'missed' && hasTime(r) ? `${fmtClock(dueMs(r))} · missed` : st.label}</span>
                  <span className="f">{r.firmName || f?.name || r.title}</span>
                  <span className="c">{[r.contact || f?.contact_name, r.rep].filter(Boolean).join(' · ')}</span>
                  {(r.notes || r.title) && <span className="m">{r.notes || r.title}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* KPIs */}
      <div className="ac2-kpis">
        {kpiCard('all', 'Calls made', inRange.length, 'Cold + follow-up, in range')}
        {kpiCard('good', 'Good calls', goodN, `${Math.round(100 * goodN / Math.max(1, inRange.length))}% reached decision maker or got a date`, '#1D9E75')}
        {kpiCard('due', 'Follow-ups due today', dueToday.length, `${dueToday.filter(r => r.done).length} done so far`, '#A14600')}
        {kpiCard('missed', 'Missed follow-ups', missedAll.length, oldestMissed ? `Still open · oldest ${fmtDay(oldestMissed)} — reassign or close` : 'None open', '#A32D2D', '#F3C7C3')}
      </div>

      {/* Table */}
      <section className="ac2-card">
        <div className="ac2-filters">
          <div className="ac2-row">
            {viewRows.map(v => (
              <button key={v.key} className={`ac2-pill ${view === v.key ? 'on' : ''}`} onClick={() => { setView(v.key); setPage(1); }}>
                {v.label}<span className="n">{v.list.length}</span>
              </button>
            ))}
          </div>
          <div className="ac2-row">
            <input className="ac2-input" style={{ flex: '1 1 260px' }} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search firm, contact, notes…" aria-label="Search" />
            <label className="ac2-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Type
              <select className="ac2-select" value={typeF} onChange={e => { setTypeF(e.target.value); setPage(1); }}>
                <option value="">All types</option>
                {Object.entries(TYPE_LBL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            {team && (
              <label className="ac2-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Rep
                <select className="ac2-select" value={repF} onChange={e => { setRepF(e.target.value); setPage(1); }}>
                  <option value="">All reps</option>
                  {(admin.reps || []).map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>
        <div className="ac2-table-wrap">
          <table className="ac2-table">
            <thead><tr>
              <th>Time</th><th>Rep</th><th>Firm</th><th>Contact</th><th>Outcome</th><th>Quality</th><th>Notes</th><th>Next follow-up</th><th></th>
            </tr></thead>
            <tbody>
              {paged.map(c => {
                const f = firmOf(c);
                const n = callCountByFirm.get(c.firmId || 'n:' + c.firm) || 1;
                const ql: Quality = callQuality(c, isGood(f?.id));
                const st = remStatusOfCall(c);
                const ms = tsMs(c.ts);
                return (
                  <tr key={c.id} onClick={() => f ? openFirm(f.id) : showToast('Firm not found in Firms DB', 'warn')}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--t2)' }}>{fmtDay(ms)}, {fmtClock(ms)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}><span className="ac2-dot" style={{ background: repCol(c.rep) }} />{c.rep}</td>
                    <td style={{ fontWeight: 600 }}>
                      {c.firm}{isGood(f?.id) && <span title="Good lead" style={{ color: '#E0A100', marginLeft: 4 }}>★</span>}
                      <div className="ac2-faint" style={{ fontWeight: 400, marginTop: 2 }}>{n > 1 ? `${n} calls in history` : 'First call'} · {TYPE_LBL[c.type] || c.type}</div>
                    </td>
                    <td>{c.contact || '—'}</td>
                    <td><span className="ac2-chip" style={{ background: `${OC_COLORS[c.oc] || '#888'}22`, color: OC_COLORS[c.oc] || '#555' }}>{OC_LABELS[c.oc] || c.oc}</span></td>
                    <td><span className="ac2-chip" style={{ background: QUALITY_COL[ql][0], color: QUALITY_COL[ql][1] }}>{ql}</span></td>
                    <td style={{ color: 'var(--t2)', maxWidth: 320 }} title={c.notes || ''}>{(c.notes || '—').length > 90 ? c.notes!.slice(0, 88) + '…' : (c.notes || '—')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{st ? <span className="ac2-chip" style={chip(st)}>{st.label}</span> : <span className="ac2-faint">—</span>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ac2-btn" onClick={e => { e.stopPropagation(); f ? openFirm(f.id) : showToast('Firm not found in Firms DB', 'warn'); }}>Open</button>{' '}
                      <button className="ac2-btn" onClick={e => { e.stopPropagation(); setEditingCall(c); }}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="ac2-empty">No calls match this view.</div>}
        </div>
        {rows.length > PER_PAGE && (
          <div className="ac2-pager">
            <span>Showing {(safePage - 1) * PER_PAGE + 1}–{Math.min(safePage * PER_PAGE, rows.length)} of {rows.length}</span>
            <button className="ac2-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Prev</button>
            <span>Page {safePage} of {totalPages}</span>
            <button className="ac2-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next →</button>
          </div>
        )}
      </section>

      {/* ── Firm drawer ── */}
      {fo && (
        <>
          <div className="ac2-scrim" onClick={closeDrawer} />
          <aside className="ac2-drawer" aria-label="Firm details">
            <div className="ac2-dhd">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div className="ac2-dname">{fo.name}</div>
                  <div className="ac2-muted" style={{ marginTop: 2 }}>
                    {[fo.city, fo.region].filter(Boolean).join(', ') || '—'} · Stage: {fo.stage || 'Lead'} · Owner: {fo.assigned_to || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className={`ac2-pill ${isGood(fo.id) ? 'on' : ''}`} onClick={toggleGood} disabled={!migrated}
                    title={migrated ? 'Flag this firm as a good lead (counts its calls as Hot)' : 'Needs the database update'}>
                    {isGood(fo.id) ? '★ Good lead' : '☆ Mark good lead'}
                  </button>
                  <button className="ac2-btn" aria-label="Close" onClick={closeDrawer} style={{ width: 34, height: 32 }}>✕</button>
                </div>
              </div>
              <div className="ac2-strip">
                <span><b>{primary?.name || '—'}</b> {primary?.title || ''}</span>
                {(primary?.phone || fo.phone || fo.main_phone) && (
                  <a href={'tel:' + String(primary?.phone || fo.phone || fo.main_phone).replace(/[^0-9+]/g, '')}>{primary?.phone || fo.phone || fo.main_phone}</a>
                )}
                <span className="ac2-muted">Their time now: <b style={{ color: 'var(--text)' }}>{fmtClock(now, firmTz(fo))} {firmTz(fo) === 'Europe/Dublin' ? 'Ireland' : 'UK'}</b></span>
                <span className="ac2-muted">{dCalls.length} call{dCalls.length === 1 ? '' : 's'}{dCalls.length ? ' since ' + fmtDay(tsMs(dCalls[dCalls.length - 1].ts)) : ''}</span>
              </div>
            </div>

            <div className="ac2-dbody">
              {rem && rst ? (
                <section className="ac2-box" style={{
                  borderColor: rst.k === 'missed' ? '#F3B4AE' : undefined,
                  background: rst.k === 'missed' ? '#FFF6F5' : rst.k === 'due' || rst.k === 'soon' ? '#FFF9F0' : '#F9F9FD',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div className="ac2-lbl">Next follow-up</div>
                    <span className="ac2-chip" style={chip(rst)}>{rst.label}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginTop: 6 }}>{whenLabel(rem, now)} · {rem.rep || 'unassigned'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 4 }}>Remark: {rem.notes || rem.title}</div>
                  {rst.k === 'missed' && <div className="ac2-err" style={{ marginTop: 6 }}>Missed. Admin has been alerted. {team ? 'Pick who calls and when:' : 'Call now or reschedule:'}</div>}
                  {rst.k === 'called' && <div style={{ fontSize: 12, color: 'var(--blue)', marginTop: 6 }}>A call was logged for this firm but the follow-up is still open. Close it, or log the call here to set the next one.</div>}

                  {canEditRem && (
                    <>
                      {team && (
                        <div className="ac2-row" style={{ marginTop: 10 }}>
                          <span className="ac2-faint" style={{ width: 44 }}>Who</span>
                          {activeReps.map(r => <button key={r} className={`ac2-pill ${(raRep || rem.rep) === r ? 'on' : ''}`} onClick={() => setRaRep(r)}>{r}</button>)}
                        </div>
                      )}
                      <div className="ac2-row" style={{ marginTop: 6 }}>
                        <span className="ac2-faint" style={{ width: 44 }}>When</span>
                        {slots.map(([l, ms]) => <button key={l} className={`ac2-pill ${raSlot === ms ? 'on' : ''}`} onClick={() => setRaSlot(ms)}>{l}</button>)}
                        <button className={`ac2-pill ${raSlot === 'custom' ? 'on' : ''}`} onClick={() => { setRaSlot('custom'); if (!raCustom) setRaCustom(msToLocalInput(Math.ceil((now + 30 * MIN) / (15 * MIN)) * 15 * MIN)); }}>Pick time…</button>
                        {raSlot === 'custom' && <input type="datetime-local" className="ac2-input" value={raCustom} onChange={e => setRaCustom(e.target.value)} />}
                      </div>
                      <div className="ac2-row" style={{ marginTop: 10 }}>
                        <button className="ac2-btn primary lg" onClick={doReassign}>
                          {Number.isFinite(raMs) || (team && raRep && raRep !== rem.rep)
                            ? `Move to ${(team && raRep) || rem.rep}, ${Number.isFinite(raMs) ? dayRel(raMs, now) + ' ' + fmtClock(raMs) : whenLabel(rem, now)}`
                            : team ? 'Reassign / reschedule' : 'Reschedule'}
                        </button>
                        <button className="ac2-btn lg" onClick={snooze15}>Snooze 15 min</button>
                        <button className="ac2-btn lg" onClick={markDone} title="Close this follow-up without logging a call here">Mark done</button>
                      </div>
                    </>
                  )}
                  {flash && <div className={flash.ok ? 'ac2-ok' : 'ac2-err'} style={{ marginTop: 8 }}>{flash.text}</div>}
                </section>
              ) : (
                <div className="ac2-box" style={{ borderStyle: 'dashed', fontSize: 12.5, color: 'var(--t2)' }}>
                  No open follow-up for this firm. Log the call below and set one.
                  {flash && <div className={flash.ok ? 'ac2-ok' : 'ac2-err'} style={{ marginTop: 8 }}>{flash.text}</div>}
                </div>
              )}

              {/* Log this call */}
              <section className="ac2-box">
                <div className="ac2-lbl">Log this call</div>
                {contacts.length > 1 && (
                  <label className="ac2-fl" style={{ marginTop: 10 }}>Spoke to
                    <select className="ac2-select" style={{ display: 'block', width: '100%', marginTop: 4 }} value={fContact} onChange={e => setFContact(e.target.value)}>
                      {contacts.map((c: any) => <option key={c.id} value={c.name}>{c.name}{c.title ? ` — ${c.title}` : ''}{c.isPrimary ? ' ★' : ''}</option>)}
                      <option value="__other__">Other / Reception / Gatekeeper</option>
                    </select>
                  </label>
                )}
                <div className="ac2-row" style={{ marginTop: 10 }}>
                  {OUTCOMES.map(o => (
                    <button key={o.key} className={`ac2-pill ${fOut === o.key ? 'on' : ''}`} onClick={() => setFOut(o.key)}>{o.label}</button>
                  ))}
                </div>
                <label className="ac2-fl" style={{ marginTop: 10 }}>What happened *
                  <textarea className="ac2-textarea" style={{ marginTop: 4 }} rows={3} value={fNote} onChange={e => setFNote(e.target.value)}
                    placeholder="e.g. Alan back Thursday, wants pricing for 2 FTE" />
                </label>
                <div className="ac2-fl" style={{ marginTop: 10 }}>Next follow-up * <span className="ac2-faint">(your time, IST)</span></div>
                <div className="ac2-row" style={{ marginTop: 4 }}>
                  {fuChoices.map(([l, ms]) => <button key={l} className={`ac2-pill ${fFu === ms ? 'on' : ''}`} onClick={() => setFFu(ms)}>{l}</button>)}
                  <button className={`ac2-pill ${fFu === 'custom' ? 'on' : ''}`} onClick={() => { setFFu('custom'); if (!fCustom) setFCustom(msToLocalInput(istMs(nextWorkingDay(today), '15:00'))); }}>Pick time…</button>
                  <button className={`ac2-pill ${fFu === 'close' ? 'on' : ''}`} onClick={() => setFFu('close')}>Close – no follow-up</button>
                  {fFu === 'custom' && <input type="datetime-local" className="ac2-input" value={fCustom} onChange={e => setFCustom(e.target.value)} />}
                </div>
                {fFu !== 'close' && (
                  <div className="ac2-row" style={{ marginTop: 8, alignItems: 'flex-end' }}>
                    <label className="ac2-fl" style={{ flex: '1 1 220px' }}>Reminder remark
                      <input className="ac2-input" style={{ display: 'block', width: '100%', marginTop: 4 }} value={fRemark} onChange={e => setFRemark(e.target.value)} placeholder="What to say / ask next time" />
                    </label>
                    <label className="ac2-fl">Assign to
                      <select className="ac2-select" style={{ display: 'block', marginTop: 4 }} value={fRep} onChange={e => setFRep(e.target.value)}>
                        {[...new Set([...activeReps, fRep].filter(Boolean))].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                <label className="ac2-fl" style={{ marginTop: 8 }}>Update stage
                  <select className="ac2-select" style={{ display: 'block', marginTop: 4 }} value={fStage} onChange={e => setFStage(e.target.value)}>
                    <option value="">Keep current ({fo.stage || 'Lead'})</option>
                    {(admin.dropdowns?.stage || ['Lead', 'Suspect', 'Proposal', 'Win', 'Lost']).map(s => <option key={s}>{s}</option>)}
                  </select>
                </label>
                <div className="ac2-row" style={{ marginTop: 12 }}>
                  <button className="ac2-btn primary lg" disabled={!canSave} onClick={save}>Save call &amp; set reminder</button>
                  <span className="ac2-faint">{saveHint}</span>
                </div>
              </section>

              <div className="ac2-tabs">
                <button className={`ac2-tab ${tab === 'calls' ? 'on' : ''}`} onClick={() => setTab('calls')}>Call history ({dCalls.length})</button>
                <button className={`ac2-tab ${tab === 'rems' ? 'on' : ''}`} onClick={() => setTab('rems')}>Reminders ({dRems.length})</button>
              </div>

              {tab === 'calls' ? (
                dCalls.length === 0 ? <div className="ac2-muted">No calls logged yet.</div> : (
                  <ol className="ac2-tl">
                    {dCalls.map(c => {
                      const ms = tsMs(c.ts);
                      return (
                        <li key={c.id}>
                          <div className="d">{fmtDay(ms)}<div>{fmtClock(ms)}</div></div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="ac2-row" style={{ gap: 6 }}>
                              <span className="ac2-dot" style={{ background: repCol(c.rep), marginRight: 0 }} />
                              <b style={{ fontSize: 12.5 }}>{c.rep}</b>
                              <span className="ac2-faint">{TYPE_LBL[c.type] || c.type}{c.contact ? ' · ' + c.contact : ''}</span>
                              <span className="ac2-chip" style={{ background: `${OC_COLORS[c.oc] || '#888'}22`, color: OC_COLORS[c.oc] || '#555' }}>{OC_LABELS[c.oc] || c.oc}</span>
                              <button className="ac2-link" style={{ marginLeft: 'auto' }} onClick={() => setEditingCall(c)}>Edit</button>
                            </div>
                            {c.notes && <div style={{ fontSize: 12.5, color: 'var(--t2)', marginTop: 4, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.notes}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )
              ) : (
                dRems.length === 0 ? <div className="ac2-muted">No reminders for this firm.</div> : (
                  <ol className="ac2-tl" style={{ gap: 8 }}>
                    {dRems.map(r => {
                      const st = status(r);
                      const hist = meta?.history[r.id] || [];
                      return (
                        <li key={r.id} style={{ flexDirection: 'column', gap: 3, border: '.5px solid var(--border)', borderRadius: 8, padding: '9px 11px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <b style={{ fontSize: 12.5 }}>{whenLabel(r, now)} · {r.rep || '—'}</b>
                            <span className="ac2-chip" style={chip(st)}>{st.label}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: 'var(--t2)' }}>{r.notes || r.title}</div>
                          {r.createdAt && <div className="ac2-faint">Created {fmtDay(Date.parse(r.createdAt))}{r.createdFrom ? ' · ' + r.createdFrom : ''}</div>}
                          {hist.map((h, i) => <div key={i} className="ac2-faint">{h.at.slice(5, 16).replace('T', ' ')} · {h.by}: {h.text}</div>)}
                        </li>
                      );
                    })}
                  </ol>
                )
              )}
            </div>
          </aside>
        </>
      )}

      {editingCall && <EditCallModal call={editingCall} firms={firms} onSave={saveEdit} onClose={() => setEditingCall(null)} />}
    </div>
  );
}
