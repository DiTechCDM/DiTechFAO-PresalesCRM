/* ════════════════════════════════════════════════════════════════
   Follow-up logic shared by the new All Calls page (/all-calls)
   and the follow-up pop-ups. Pure helpers + two small hooks.

   Times: reminders store dueDate + dueTime as IST (the reps' clock),
   same as the rest of the app. Everything here works in epoch ms.
   ════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { Call, Firm, Reminder, User, Rep } from '../types';
import * as api from './api';

export const IST = 'Asia/Kolkata';
export const MIN = 60_000;
export const SOON_MIN = 15;   // pop-up this many minutes before due
export const MISSED_MIN = 30; // this many minutes late = missed → Admin

/* ── Time helpers ─────────────────────────────────────────────── */

/** Call timestamps come as "…+05:30" from the server, or without an offset
 *  when just created in the browser (IST wall clock). Treat no-offset as IST. */
export function tsMs(ts: string): number {
  if (!ts) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + '+05:30');
}

/** "YYYY-MM-DD" and "HH:MM" in IST for an epoch value. */
export function istParts(ms: number) {
  const s = new Date(ms).toLocaleString('sv-SE', { timeZone: IST }); // 2026-11-25 17:05:00
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}

/** Marks reminders created by the new page; their time is always deliberate. */
export const CREATED_FROM_NEW = 'all-calls';

/** Does this reminder have a real due time?
 *  The old Reminders form defaults the time to 09:00, and on live data every
 *  09:00 reminder came from it — reps call 14:00–21:00 IST, so 09:00 there
 *  means "no specific time". Those are treated as all-day (no pop-ups, missed
 *  only after the day ends). Reminders set on the new page always count as timed. */
export const hasTime = (r: Reminder) => {
  const t = r.dueTime || '';
  if (!/^\d{1,2}:\d{2}/.test(t)) return false;
  if (t.startsWith('09:00') && (r.createdFrom as string) !== CREATED_FROM_NEW) return false;
  return true;
};

/** Due moment of a reminder. Untimed ("all day") reminders are due at 23:59 IST. */
export function dueMs(r: Reminder): number {
  const date = (r.dueDate || '').slice(0, 10);
  const t = hasTime(r) ? (r.dueTime as string).slice(0, 5).padStart(5, '0') : '23:59';
  return Date.parse(`${date}T${t}:00+05:30`);
}

export function fmtClock(ms: number, tz = IST) {
  return new Date(ms).toLocaleTimeString('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}
export function fmtDay(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { timeZone: IST, day: 'numeric', month: 'short' });
}
export function dayRel(ms: number, now: number) {
  const a = Date.parse(istParts(ms).date + 'T00:00:00+05:30');
  const b = Date.parse(istParts(now).date + 'T00:00:00+05:30');
  const d = Math.round((a - b) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return new Date(ms).toLocaleDateString('en-GB', { timeZone: IST, weekday: 'short' }) + ' ' + fmtDay(ms);
}
export function fmtDur(mins: number) {
  mins = Math.abs(Math.round(mins));
  if (mins >= 1440) return Math.floor(mins / 1440) + 'd ' + Math.floor((mins % 1440) / 60) + 'h';
  return mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ' min';
}
export function whenLabel(r: Reminder, now: number) {
  const d = dueMs(r);
  return dayRel(d, now) + (hasTime(r) ? ', ' + fmtClock(d) : ' (all day)');
}
export const sameIstDay = (a: number, b: number) => istParts(a).date === istParts(b).date;

/** The firm's local time zone (UK/Ireland), from its address. */
export function firmTz(f?: Firm) {
  const s = `${f?.region || ''} ${f?.city || ''} ${f?.name || ''} ${f?.email || ''}`;
  return /ireland|dublin|cork|galway|limerick|\.ie\b/i.test(s) ? 'Europe/Dublin' : 'Europe/London';
}

/* ── Admin test clock ─────────────────────────────────────────
   Lets Admin move "now" in their own browser tab to watch reminders
   fire. Only affects what this tab displays; the page disables every
   save while it's moved, so nothing is ever stored with a fake time. */
const CLOCK_KEY = 'ac2_clock_offset';
export function clockOffset(): number {
  try { return Number(sessionStorage.getItem(CLOCK_KEY)) || 0; } catch { return 0; }
}
export function setClockOffset(ms: number) {
  if (ms) sessionStorage.setItem(CLOCK_KEY, String(Math.round(ms)));
  else sessionStorage.removeItem(CLOCK_KEY);
  window.dispatchEvent(new Event('ac2:clock'));
}

/** Ticking clock for live statuses (includes the Admin test-clock offset). */
export function useNow(intervalMs = 20_000) {
  const [now, setNow] = useState(() => Date.now() + clockOffset());
  useEffect(() => {
    const tick = () => setNow(Date.now() + clockOffset());
    const t = setInterval(tick, intervalMs);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('ac2:clock', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('ac2:clock', tick); };
  }, [intervalMs]);
  return now;
}

/* ── Who is looking ───────────────────────────────────────────── */

/** The rep name the current user acts as (linkedRep may be a rep id or a name). */
export function myRepName(u: User | null, reps: Rep[] = []) {
  if (!u) return '';
  const lr = u.linkedRep || '';
  const hit = reps.find(r => r.id === lr || r.name === lr);
  return hit?.name || lr || u.name;
}
/** Admin/manager or anyone with "view all" sees the whole team's follow-ups. */
export function isTeamViewer(u: User | null) {
  return !!u && (u.role === 'admin' || u.role === 'manager' || (u.perms as any)?.viewAll === true);
}
/** Only Admin gets the "missed by someone else" escalation pop-ups. */
export function isEscalationViewer(u: User | null) {
  return !!u && u.role === 'admin';
}

/** When a reminder is moved or snoozed, its new due time is deliberate:
 *  mark it as set by the new page so the 09:00 rule above no longer applies. */
export function withDueDeliberate(r: Reminder, ms: number): Reminder {
  return { ...withDue(r, ms), createdFrom: CREATED_FROM_NEW as Reminder['createdFrom'] };
}
/** 15 minutes from the later of now / the due time (all-day ones: from now). */
export function snoozeTarget(r: Reminder, now: number) {
  return (hasTime(r) ? Math.max(dueMs(r), now) : now) + 15 * MIN;
}

/* ── Follow-up status ─────────────────────────────────────────── */

export type FuKind = 'done' | 'called' | 'missed' | 'due' | 'soon' | 'today' | 'later';
export interface FuStatus { k: FuKind; label: string; bg: string; fg: string; lateMin?: number; callMs?: number }

export function firmCalls(calls: Call[], firmId?: string, firmName?: string) {
  if (!firmId && !firmName) return [];
  return calls.filter(c => (firmId && c.firmId === firmId) || (!c.firmId && firmName && c.firm === firmName));
}

/** Status of a reminder at `now`.
 *  "called": someone logged a call for this firm from 15 min before the
 *  due time onward but didn't close the reminder (e.g. logged it in the old
 *  Call Tracker). It is not counted as missed and doesn't pop up. */
export function fuStatus(r: Reminder, now: number, calls: Call[]): FuStatus {
  if (r.done) return { k: 'done', label: 'Done', bg: '#E1F5EE', fg: '#0F6E56' };
  const due = dueMs(r);
  if (r.firmId || r.firmName) {
    const after = firmCalls(calls, r.firmId, r.firmName).map(c => tsMs(c.ts)).filter(t => t >= due - SOON_MIN * MIN && t <= now);
    if (after.length) {
      const t = Math.max(...after);
      return { k: 'called', label: 'Called ' + fmtClock(t) + ' · not closed', bg: '#E6F1FB', fg: '#185FA5', callMs: t };
    }
  }
  if (!hasTime(r)) {
    if (now > due) return { k: 'missed', label: 'Missed · ' + fmtDay(due), bg: '#FCEBEB', fg: '#A32D2D', lateMin: (now - due) / MIN };
    if (sameIstDay(due, now)) return { k: 'today', label: 'Today (all day)', bg: '#F0F0FA', fg: '#282780' };
    return { k: 'later', label: dayRel(due, now), bg: '#F1EFE8', fg: '#5F5E5A' };
  }
  const diff = (now - due) / MIN;
  if (diff >= MISSED_MIN) return { k: 'missed', label: 'Missed · ' + fmtDur(diff) + ' late', bg: '#FCEBEB', fg: '#A32D2D', lateMin: diff };
  if (diff >= 0) return { k: 'due', label: 'Due now', bg: '#FFE4CC', fg: '#A14600' };
  if (diff >= -SOON_MIN) return { k: 'soon', label: 'In ' + Math.ceil(-diff) + ' min', bg: '#FAEEDA', fg: '#854F0B' };
  if (sameIstDay(due, now)) return { k: 'today', label: 'Today ' + fmtClock(due), bg: '#F0F0FA', fg: '#282780' };
  return { k: 'later', label: dayRel(due, now) + ' ' + fmtClock(due), bg: '#F1EFE8', fg: '#5F5E5A' };
}

/** Earliest open reminder for a firm. */
export function openReminderFor(reminders: Reminder[], firmId: string) {
  return reminders.filter(r => r.firmId === firmId && !r.done).sort((a, b) => dueMs(a) - dueMs(b))[0] || null;
}

/* ── Call quality ─────────────────────────────────────────────── */

export type Quality = 'Hot' | 'Warm' | 'Cold' | 'Lost';
const DATED = /tomorrow|today|monday|tuesday|wednesday|thursday|friday|next week|january|february|march|april|may|june|july|august|september|october|november|december|\d/i;
export function callQuality(c: Call, goodLead: boolean): Quality {
  if (goodLead || c.oc === 'mtg') return 'Hot';
  if (c.oc === 'ni') return 'Lost';
  if (c.oc === 'dm' || c.oc === 'in' || c.oc === 'em' || (c.oc === 'cb' && DATED.test(c.notes || ''))) return 'Warm';
  return 'Cold';
}
export const QUALITY_COL: Record<Quality, [string, string]> = {
  Hot: ['#E1F5EE', '#0F6E56'], Warm: ['#FAEEDA', '#854F0B'], Cold: ['#F1EFE8', '#5F5E5A'], Lost: ['#FCEBEB', '#A32D2D'],
};

/* ── Reminder edits (shared by page + pop-ups) ───────────────── */

/** Copy of a reminder moved to a new due moment (IST). */
export function withDue(r: Reminder, ms: number): Reminder {
  const p = istParts(ms);
  return { ...r, dueDate: p.date, dueTime: p.time };
}

/** Append a history entry (server sets who/when) and tell open pages about it. */
export function logHistory(reminderId: string, text: string) {
  return api.followups.log(reminderId, text)
    .then(entry => { window.dispatchEvent(new CustomEvent('ac2:history', { detail: { id: reminderId, entry } })); return entry; })
    .catch(err => { console.warn('Follow-up history not saved:', err.message); return null; });
}

/* ── Open a firm in the new page from anywhere (pop-ups) ─────── */

const PENDING_KEY = 'ac2_open_firm';
export function requestOpenFirm(firmId: string) {
  sessionStorage.setItem(PENDING_KEY, firmId);
  window.dispatchEvent(new CustomEvent('ac2:open-firm', { detail: firmId }));
}
export function takePendingFirm() {
  const id = sessionStorage.getItem(PENDING_KEY);
  if (id) sessionStorage.removeItem(PENDING_KEY);
  return id;
}
const VIEW_KEY = 'ac2_open_view';
export function requestView(view: string) {
  sessionStorage.setItem(VIEW_KEY, view);
  window.dispatchEvent(new CustomEvent('ac2:open-view', { detail: view }));
}
export function takePendingView() {
  const v = sessionStorage.getItem(VIEW_KEY);
  if (v) sessionStorage.removeItem(VIEW_KEY);
  return v;
}

/* ── Pop-up dismissals (per browser tab session) ─────────────── */

const DISMISS_KEY = 'ac2_dismissed';
export function dismissedSet(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]')); } catch { return new Set(); }
}
export function dismiss(key: string) {
  const s = dismissedSet(); s.add(key);
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...s].slice(-300)));
}
