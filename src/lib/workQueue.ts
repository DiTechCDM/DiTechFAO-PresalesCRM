/* ── Work Queue — logic ─────────────────────────────────────────
   Implements work-queue-logic-spec.md against this app's real,
   already-structured call data (the `oc` field on every Call),
   instead of the prototype's free-text parsing. Section 6.3 of
   the spec calls exact structured outcomes the "recommended fix"
   for the text-parsing problem — this app already has that, via
   the 9-option outcome picker in the call log drawer — so this
   module maps those 9 codes onto the spec's 6-bucket model
   instead of re-deriving them from note text.

   This file is pure logic (no React, no fetch) so the rules can
   be read and audited on their own, next to the spec.
   ─────────────────────────────────────────────────────────────── */
import { Call, WorkQueueAction } from '../types';

export type OutcomeBucket = 'meeting' | 'dm' | 'email' | 'no' | 'gate' | 'dead';

/** §2 of the spec, six buckets — mapped from this app's 9 real outcome
 *  codes instead of parsed from note text. `cb` (Callback) and `in`
 *  (Interested) aren't in the spec's vocabulary; both land in the `dm`
 *  bucket, since either one is a reason to come back to this firm. */
export const BUCKET_OF_OC: Record<string, OutcomeBucket> = {
  mtg: 'meeting',
  dm: 'dm',
  cb: 'dm',
  in: 'dm',
  em: 'email',
  ni: 'no',
  na: 'dead',
  vm: 'dead',
  gk: 'gate',
};

/** Anything unrecognised falls through to `gate`, per spec §2 rule 6. */
export function bucketOf(oc: string): OutcomeBucket {
  return BUCKET_OF_OC[oc] || 'gate';
}

export const SIGNAL_BUCKETS: OutcomeBucket[] = ['meeting', 'dm', 'email'];
export function isSignal(oc: string): boolean {
  return SIGNAL_BUCKETS.includes(bucketOf(oc));
}

export const BUCKET_ORDER: OutcomeBucket[] = ['meeting', 'dm', 'email', 'no', 'gate', 'dead'];
export const BUCKET_LABEL: Record<OutcomeBucket, string> = {
  meeting: 'Meeting or files agreed',
  dm: 'Decision maker will revert',
  email: 'Email route opened',
  no: 'Refused / has a provider',
  gate: 'Stopped at gatekeeper',
  dead: 'Dead line / voicemail',
};
export const BUCKET_COLOR: Record<OutcomeBucket, string> = {
  meeting: 'var(--green)',
  dm: 'var(--blue)',
  email: 'var(--amber)',
  no: 'var(--red)',
  gate: '#8a95a6',
  dead: '#c7cdd6',
};

export type Band = 'act' | 'due' | 'slip' | 'cold';
export const BAND_ORDER: Band[] = ['act', 'due', 'slip', 'cold'];
export const BAND_META: Record<Band, { title: string; why: string; badgeClass: string }> = {
  act:  { title: 'Act today',     why: 'Called yesterday or today and they gave a route. Reply while it is still warm.', badgeClass: 'b-lost' },
  due:  { title: 'Due this week', why: '2 to 7 days since they answered. Chase before the thread cools.',                badgeClass: 'b-suspect' },
  slip: { title: 'Slipping',      why: '8 to 21 days. Overdue — send the email and book a dated callback.',              badgeClass: 'b-lead' },
  cold: { title: 'Gone cold',     why: 'Over 21 days. Re-qualify from scratch or take it off the list.',                 badgeClass: 'b-none' },
};

/** Same accent colours used on screen for each band (index.css --red/--amber/--blue/--t3),
 *  as plain 6-hex RGB — for contexts like the Excel export that can't use CSS vars. */
export const BAND_COLOR_HEX: Record<Band, string> = {
  act: 'A32D2D', due: '854F0B', slip: '185FA5', cold: '8A8A86',
};

const DAY_MS = 86400000;
function toDateStr(ts: string) { return (ts || '').split('T')[0]; }
function daysBetween(fromDate: string, toDate: string) {
  return Math.round((new Date(toDate + 'T00:00:00').getTime() - new Date(fromDate + 'T00:00:00').getTime()) / DAY_MS);
}

/** §6.1 recommendation: skip weekends. The most recent working day
 *  strictly before `today` — so a Monday review still treats Friday's
 *  calls as "act today". */
export function prevWorkingDay(today: string): string {
  const d = new Date(today + 'T00:00:00');
  do { d.setDate(d.getDate() - 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return d.toLocaleDateString('sv-SE');
}

export function bandOf(lastSignalDate: string, today: string): Band {
  if (lastSignalDate === today || lastSignalDate === prevWorkingDay(today)) return 'act';
  const days = daysBetween(lastSignalDate, today);
  if (days <= 7) return 'due';
  if (days <= 21) return 'slip';
  return 'cold';
}

export interface QueueCard {
  firmId: string;
  firmName: string;
  rep: string;
  who: string;
  stage: string;
  lastSignalDate: string;
  lastSignalOc: string;
  lastSignalBucket: OutcomeBucket;
  note: string;
  daysWaiting: number;
  band: Band;
  attemptsSinceSignal: number;
}

/** A firm may log calls before it has a firmId wired up (see CallTracker's
 *  `selFirm?.id || ''`); fall back to a name key so those still roll up
 *  instead of silently vanishing from the queue. */
function firmKey(c: Call): string | null {
  if (c.firmId) return c.firmId;
  if (c.firm && c.firm.trim()) return 'name:' + c.firm.trim().toLowerCase();
  return null;
}

/**
 * Roll calls up into one work-queue card per firm — spec §3 and §4,
 * with the §6.2 fix applied as the actual behaviour rather than a bug:
 * a firm stays in the queue through gatekeeper/dead-line noise that
 * follows a real signal, and leaves only when
 *   (a) explicitly refused — a `no`-bucket call logged after the signal
 *   (b) dismissed here — see reason codes in dismiss()
 *   (c) superseded — a newer signal call resets the clock
 * `calls` should already be scoped to whatever the viewer is allowed to
 * see (and optionally narrowed by the rep filter) — this function does
 * not do permission scoping itself.
 */
export function buildQueue(calls: Call[], dismissals: WorkQueueAction[], today: string): QueueCard[] {
  const byFirm = new Map<string, Call[]>();
  for (const c of calls) {
    const key = firmKey(c);
    if (!key) continue;
    const arr = byFirm.get(key);
    if (arr) arr.push(c); else byFirm.set(key, [c]);
  }

  const latestDismissal = new Map<string, WorkQueueAction>();
  for (const d of dismissals) {
    if (!d.firmId) continue;
    const prev = latestDismissal.get(d.firmId);
    if (!prev || d.closedAt > prev.closedAt) latestDismissal.set(d.firmId, d);
  }

  const cards: QueueCard[] = [];
  for (const [key, list] of byFirm) {
    const sorted = list.slice().sort((a, b) => a.ts.localeCompare(b.ts));

    let lastSignal: Call | null = null;
    for (const c of sorted) if (isSignal(c.oc)) lastSignal = c;
    if (!lastSignal) continue; // never gave us a route

    const after = sorted.filter(c => c.ts > lastSignal!.ts);
    if (after.some(c => bucketOf(c.oc) === 'no')) continue; // (a) explicitly refused

    const dismissal = latestDismissal.get(key);
    if (dismissal && dismissal.closedAt >= lastSignal.ts) continue; // (b) dismissed, not yet superseded

    const lastSignalDate = toDateStr(lastSignal.ts);
    cards.push({
      firmId: lastSignal.firmId || key,
      firmName: lastSignal.firm || '(unnamed firm)',
      rep: lastSignal.rep,
      who: lastSignal.contact || '',
      stage: lastSignal.stage || '',
      lastSignalDate,
      lastSignalOc: lastSignal.oc,
      lastSignalBucket: bucketOf(lastSignal.oc),
      note: lastSignal.notes || '',
      daysWaiting: daysBetween(lastSignalDate, today),
      band: bandOf(lastSignalDate, today),
      attemptsSinceSignal: after.length,
    });
  }
  return cards;
}

export interface OutcomeStats {
  total: number;
  firms: number;
  byBucket: Record<OutcomeBucket, number>;
  signal: number;
  signalPct: number;
  minutesBurned: number;
}

const MINUTES_PER_CALL = 3; // §7 — confirm with pre-sales if this should change

/** Headline stats for the period filter — §5: this is the ONLY thing
 *  the period filter should touch. It must never be applied to
 *  buildQueue()'s input, or firms waiting three weeks vanish the
 *  moment someone picks "Yesterday". */
export function computeStats(periodCalls: Call[]): OutcomeStats {
  const byBucket: Record<OutcomeBucket, number> = { meeting: 0, dm: 0, email: 0, no: 0, gate: 0, dead: 0 };
  const firmSet = new Set<string>();
  for (const c of periodCalls) {
    byBucket[bucketOf(c.oc)]++;
    const fk = firmKey(c);
    if (fk) firmSet.add(fk);
  }
  const signal = byBucket.meeting + byBucket.dm + byBucket.email;
  const total = periodCalls.length;
  const burn = byBucket.gate + byBucket.dead;
  return {
    total, firms: firmSet.size, byBucket, signal,
    signalPct: total ? Math.round((signal / total) * 1000) / 10 : 0,
    minutesBurned: Math.round(burn * MINUTES_PER_CALL),
  };
}

export interface RepStat { rep: string; calls: number; firms: number; signal: number; rate: number }

export function computeRepStats(periodCalls: Call[]): RepStat[] {
  const map = new Map<string, { calls: number; firms: Set<string>; signal: number }>();
  for (const c of periodCalls) {
    const key = c.rep || 'Unassigned';
    let r = map.get(key);
    if (!r) { r = { calls: 0, firms: new Set(), signal: 0 }; map.set(key, r); }
    r.calls++;
    const fk = firmKey(c);
    if (fk) r.firms.add(fk);
    if (isSignal(c.oc)) r.signal++;
  }
  return Array.from(map.entries())
    .map(([rep, v]) => ({ rep, calls: v.calls, firms: v.firms.size, signal: v.signal, rate: v.calls ? Math.round((v.signal / v.calls) * 1000) / 10 : 0 }))
    .sort((a, b) => b.calls - a.calls);
}

export const DISMISS_REASONS = ['Meeting held / fulfilled', 'Refused', 'Not pursuing', 'Duplicate', 'Other'];
