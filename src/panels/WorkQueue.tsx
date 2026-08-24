import React, { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../store';
import * as api from '../lib/api';
import { TODAY, fmtDate, OC_LABELS } from '../lib/utils';
import { WorkQueueAction } from '../types';
import {
  BUCKET_ORDER, BUCKET_LABEL, BUCKET_COLOR,
  BAND_ORDER, BAND_META, buildQueue, computeStats, computeRepStats,
  DISMISS_REASONS, QueueCard,
} from '../lib/workQueue';

/* ── Work Queue ────────────────────────────────────────────────
   Every firm that gave us a route and is waiting on a reply,
   grouped by how long they've been waiting. See
   work-queue-logic-spec.md for the rules this panel implements.

   Standalone panel: reads `calls` from the shared store (read
   only — never calls setCalls) and its own /api/work-queue
   dismissal log. Does not modify firms/calls/reminders state or
   any other panel.
   ─────────────────────────────────────────────────────────────── */

type Period = 'yesterday' | '7d' | '30d' | 'month' | 'all';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
  { key: 'all', label: 'All' },
];

function DismissModal({ card, onClose, onConfirm }: { card: QueueCard; onClose: () => void; onConfirm: (reason: string, notes: string) => Promise<void> | void }) {
  const [reason, setReason] = useState(DISMISS_REASONS[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const confirm = async () => {
    setSubmitting(true);
    try { await onConfirm(reason, notes); } finally { setSubmitting(false); }
  };
  return (
    <div className="mov" style={{ zIndex: 600 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div className="mhd">
          <h2>Close this card — {card.firmName}</h2>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mbd" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: '8px 12px', background: 'var(--s2)', borderRadius: 'var(--r)', fontSize: 11, color: 'var(--t2)', fontStyle: 'italic' }}>
            "{card.note || '—'}"
          </div>
          <div className="fg">
            <label>Why is this closed?</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {DISMISS_REASONS.map(r => (
                <button key={r} type="button" onClick={() => setReason(r)}
                  style={{ padding: '5px 12px', borderRadius: 14, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: `.5px solid ${reason === r ? 'var(--brand)' : 'var(--border2)'}`,
                    background: reason === r ? 'var(--brand-light)' : '#fff',
                    color: reason === r ? 'var(--brand)' : 'var(--t2)' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="fg">
            <label>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything worth remembering…" style={{ minHeight: 60 }} />
          </div>
        </div>
        <div className="mft">
          <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="btn primary" onClick={confirm} disabled={submitting}>{submitting ? 'Closing…' : 'Close card'}</button>
        </div>
      </div>
    </div>
  );
}

export default function WorkQueue({ onLogCall }: { onLogCall?: (firmId: string) => void }) {
  const { calls, hasPerm, scopeCalls, showToast } = useAppContext();
  const [dismissals, setDismissals] = useState<WorkQueueAction[]>([]);
  const [dismissError, setDismissError] = useState(false);
  const [repFilter, setRepFilter] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  const [dismissCard, setDismissCard] = useState<QueueCard | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedBands, setExpandedBands] = useState<Set<string>>(new Set());
  const toggleExpanded = (band: string) => setExpandedBands(prev => {
    const next = new Set(prev);
    next.has(band) ? next.delete(band) : next.add(band);
    return next;
  });

  const viewAll = hasPerm('viewAll');

  const loadDismissals = () => {
    api.workQueue.getAll()
      .then(rows => { setDismissals(rows); setDismissError(false); })
      .catch(err => { console.error('Work queue history failed to load:', err); setDismissError(true); });
  };
  useEffect(() => { loadDismissals(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const baseCalls = useMemo(() => scopeCalls(calls), [calls, scopeCalls]);
  const reps = useMemo(() => Array.from(new Set(baseCalls.map(c => c.rep).filter(Boolean))).sort(), [baseCalls]);
  const repCalls = useMemo(() => repFilter ? baseCalls.filter(c => c.rep === repFilter) : baseCalls, [baseCalls, repFilter]);

  // The queue always looks at full call history — the period filter below
  // must never reach this. See work-queue-logic-spec.md §5.
  const queue = useMemo(() => buildQueue(repCalls, dismissals, TODAY), [repCalls, dismissals]);
  const byBand = useMemo(() => {
    const g: Record<string, QueueCard[]> = { act: [], due: [], slip: [], cold: [] };
    for (const c of queue) g[c.band].push(c);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.lastSignalDate.localeCompare(b.lastSignalDate));
    return g;
  }, [queue]);

  const periodRange = useMemo(() => {
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const fmt = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
    if (period === 'yesterday') { const y = new Date(t); y.setDate(y.getDate() - 1); const s = fmt(y); return { from: s, to: s }; }
    if (period === '7d')  { const f = new Date(t); f.setDate(f.getDate() - 6);  return { from: fmt(f), to: TODAY }; }
    if (period === '30d') { const f = new Date(t); f.setDate(f.getDate() - 29); return { from: fmt(f), to: TODAY }; }
    if (period === 'month') return { from: TODAY.slice(0, 8) + '01', to: TODAY };
    return { from: '0000-01-01', to: '9999-12-31' };
  }, [period]);

  const periodCalls = useMemo(
    () => repCalls.filter(c => { const d = c.ts.split('T')[0]; return d >= periodRange.from && d <= periodRange.to; }),
    [repCalls, periodRange]
  );
  const stats = useMemo(() => computeStats(periodCalls), [periodCalls]);
  const repStats = useMemo(() => computeRepStats(periodCalls), [periodCalls]);

  // Dismissals aren't tagged by rep, so the rep filter doesn't narrow this list.
  const recentlyClosed = useMemo(
    () => dismissals.slice().sort((a, b) => b.closedAt.localeCompare(a.closedAt)).slice(0, 8),
    [dismissals]
  );

  const doDismiss = async (reason: string, notes: string) => {
    if (!dismissCard) return;
    try {
      await api.workQueue.dismiss({ firmId: dismissCard.firmId, firmName: dismissCard.firmName, reason, notes });
      showToast(`Closed — ${dismissCard.firmName}`, 'ok');
      setDismissCard(null);
      loadDismissals();
    } catch (err: any) {
      showToast(err.message || 'Could not close card', 'err');
    }
  };

  const doReopen = async (id: string, firmName?: string) => {
    setBusyId(id);
    try {
      await api.workQueue.reopen(id);
      showToast(`Reopened — ${firmName || 'firm'}`, 'ok');
      loadDismissals();
    } catch (err: any) {
      showToast(err.message || 'Could not reopen card', 'err');
    } finally {
      setBusyId(null);
    }
  };

  const burnHours = (stats.minutesBurned / 60).toFixed(1);
  const maxBucket = Math.max(1, ...BUCKET_ORDER.map(b => stats.byBucket[b]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div className="page-hd">
        <div>
          <div className="page-title">Work Queue</div>
          <div className="page-sub">Every firm that gave us a route and is waiting on a reply, sorted by how long they've waited</div>
        </div>
        {viewAll && (
          <select value={repFilter} onChange={e => setRepFilter(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">All reps</option>
            {reps.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
      </div>

      {dismissError && (
        <div className="alert warn">⚠ Couldn't load the close/dismiss history — cards you've already closed may show up again until this loads.</div>
      )}

      {/* ── Work queue — four bands, always full history ── */}
      <div className="sg sg4" style={{ marginBottom: 14 }}>
        {BAND_ORDER.map(b => (
          <div key={b} className="sc" style={{ borderTop: `3px solid ${b === 'act' ? 'var(--red)' : b === 'due' ? 'var(--amber)' : b === 'slip' ? 'var(--blue)' : 'var(--t3)'}` }}>
            <div className="sl">{BAND_META[b].title}</div>
            <div className="sv" style={{ color: b === 'act' ? 'var(--red)' : b === 'due' ? 'var(--amber)' : b === 'slip' ? 'var(--blue)' : 'var(--t3)' }}>{byBand[b].length}</div>
            <div className="ss">{BAND_META[b].why}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginBottom: 22 }}>
        {BAND_ORDER.map(band => {
          const expanded = expandedBands.has(band);
          const cards = expanded ? byBand[band] : byBand[band].slice(0, 100);
          const overflow = byBand[band].length - cards.length;
          const accent = band === 'act' ? 'var(--red)' : band === 'due' ? 'var(--amber)' : band === 'slip' ? 'var(--blue)' : 'var(--t3)';
          return (
            <div key={band} style={{ background: '#fff', border: '.5px solid var(--border)', borderRadius: 'var(--rl2)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ padding: '10px 12px', borderBottom: '.5px solid var(--border)', borderTop: `3px solid ${accent}`, borderRadius: 'var(--rl2) var(--rl2) 0 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{BAND_META[band].title}</span>
                  <span style={{ fontWeight: 700, fontSize: 17, color: accent }}>{byBand[band].length}</span>
                </div>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 440, overflowY: 'auto' }}>
                {cards.length === 0 ? (
                  <div className="empty-st" style={{ padding: '18px 8px', fontSize: 12 }}>Nothing here.</div>
                ) : cards.map(c => (
                  <div key={c.firmId} style={{ border: '.5px solid var(--border)', borderLeft: `3px solid ${accent}`, borderRadius: 'var(--r)', padding: '8px 10px', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
                      <span style={{ fontWeight: 650, fontSize: 12.5, lineHeight: 1.25 }}>{c.firmName}</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 10.5, fontWeight: 700, color: accent, whiteSpace: 'nowrap' }}>{c.daysWaiting}d</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--t3)', marginTop: 2 }}>
                      {c.who || '—'} · {c.rep}{c.stage ? ` · ${c.stage}` : ''}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t2)' }}>
                      <span style={{ padding: '1px 6px', borderRadius: 4, background: `${BUCKET_COLOR[c.lastSignalBucket]}22`, color: BUCKET_COLOR[c.lastSignalBucket], fontWeight: 500 }}>
                        {OC_LABELS[c.lastSignalOc] || c.lastSignalOc}
                      </span>
                      {' '}on {fmtDate(c.lastSignalDate)}
                      {c.attemptsSinceSignal > 0 && <span> · {c.attemptsSinceSignal} tries since</span>}
                    </div>
                    {c.note && <div style={{ fontSize: 10.5, color: '#39404F', fontStyle: 'italic', marginTop: 3, lineHeight: 1.3 }}>"{c.note.length > 90 ? c.note.slice(0, 90) + '…' : c.note}"</div>}
                    <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                      <button className="btn xs" onClick={() => onLogCall?.(c.firmId)} disabled={!onLogCall || c.firmId.startsWith('name:')} title={c.firmId.startsWith('name:') ? 'This call was logged without a linked firm record — open it from All Calls instead' : ''}>📞 Log call</button>
                      <button className="btn xs" onClick={() => setDismissCard(c)} disabled={c.firmId.startsWith('name:')} title={c.firmId.startsWith('name:') ? 'This call was logged without a linked firm record, so it can\'t be tracked as closed' : ''}>✓ Close</button>
                    </div>
                  </div>
                ))}
                {overflow > 0 && (
                  <button className="btn xs" onClick={() => toggleExpanded(band)} style={{ width: '100%', color: 'var(--blue)' }}>+{overflow} more — show all</button>
                )}
                {expanded && byBand[band].length > 100 && (
                  <button className="btn xs" onClick={() => toggleExpanded(band)} style={{ width: '100%', color: 'var(--t3)' }}>Show fewer</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Activity stats — period filter applies here ONLY, never to the queue above ── */}
      <div className="page-hd" style={{ marginBottom: 8 }}>
        <div><div className="page-title" style={{ fontSize: 15 }}>Activity</div><div className="page-sub">How the calls in this period broke down — the queue above always looks at full history regardless of this filter</div></div>
      </div>
      <div className="date-bar">
        <span style={{ fontSize: 11, color: 'var(--t2)' }}>Period:</span>
        {PERIODS.map(p => (
          <button key={p.key} className={`dr-btn ${period === p.key ? 'on' : ''}`} onClick={() => setPeriod(p.key)}>{p.label}</button>
        ))}
        <span style={{ fontSize: 11, color: 'var(--t2)' }}>{stats.total.toLocaleString()} attempts</span>
      </div>

      {/* ── Verdict strip ── */}
      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'minmax(280px,1.3fr) 2fr', gap: 24, alignItems: 'center', marginTop: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 650, letterSpacing: '-.01em', lineHeight: 1.3 }}>
            <b style={{ fontFamily: 'monospace' }}>{stats.signalPct}%</b> of calls moved something forward.
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 6 }}>
            <b>{(stats.byBucket.gate + stats.byBucket.dead).toLocaleString()}</b> reached nobody who decides — about <b>{burnHours} hours</b>.
            {stats.byBucket.meeting > 0 && <> <b>{stats.byBucket.meeting}</b> produced a meeting or files.</>}
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', height: 24, borderRadius: 3, overflow: 'hidden', border: '.5px solid var(--border)', background: '#fff' }}>
            {BUCKET_ORDER.map(b => stats.byBucket[b] > 0 && (
              <span key={b} title={`${BUCKET_LABEL[b]}: ${stats.byBucket[b]}`} style={{ display: 'block', width: `${(stats.byBucket[b] / Math.max(1, stats.total)) * 100}%`, background: BUCKET_COLOR[b] }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--t2)', marginTop: 6 }}>
            {BUCKET_ORDER.map(b => (
              <span key={b}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 1, marginRight: 5, background: BUCKET_COLOR[b] }} />{BUCKET_LABEL[b]} <b style={{ color: 'var(--text)' }}>{stats.byBucket[b]}</b></span>
            ))}
          </div>
        </div>
      </div>

      <div className="sg sg6" style={{ marginBottom: 16 }}>
        <div className="sc"><div className="sl">Attempts</div><div className="sv">{stats.total.toLocaleString()}</div><div className="ss">In selected period</div></div>
        <div className="sc"><div className="sl">Firms</div><div className="sv">{stats.firms.toLocaleString()}</div><div className="ss">Contacted in period</div></div>
        <div className="sc"><div className="sl">Signal</div><div className="sv" style={{ color: 'var(--green)' }}>{stats.signal.toLocaleString()}</div><div className="ss">{stats.signalPct}% of attempts</div></div>
        <div className="sc"><div className="sl">Act today</div><div className="sv" style={{ color: 'var(--red)' }}>{byBand.act.length}</div><div className="ss">From yesterday's calls</div></div>
        <div className="sc"><div className="sl">Owed in total</div><div className="sv">{queue.length}</div><div className="ss">Firms waiting on us</div></div>
        <div className="sc"><div className="sl">Time burned</div><div className="sv" style={{ color: 'var(--red)' }}>{burnHours}h</div><div className="ss">Reached nobody</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 20, marginBottom: 20 }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">Where the time went</div>
          <div className="card-sub" style={{ marginBottom: 10 }}>By outcome, selected period</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {BUCKET_ORDER.map(b => (
              <div key={b} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 40px', gap: 8, alignItems: 'center', fontSize: 11.5 }}>
                <span style={{ color: 'var(--t2)' }}>{BUCKET_LABEL[b]}</span>
                <div style={{ height: 12, background: 'var(--s2)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(stats.byBucket[b] / maxBucket) * 100}%`, background: BUCKET_COLOR[b], borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' }}>{stats.byBucket[b]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="card-title">By rep</div>
          <div className="card-sub" style={{ marginBottom: 10 }}>Volume vs signal, selected period</div>
          <table style={{ width: '100%', fontSize: 12 }}>
            <thead><tr style={{ color: 'var(--t3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              <th style={{ textAlign: 'left', paddingBottom: 6 }}>Rep</th><th style={{ textAlign: 'right' }}>Calls</th><th style={{ textAlign: 'right' }}>Firms</th><th style={{ textAlign: 'right' }}>Signal</th><th style={{ textAlign: 'right' }}>Rate</th>
            </tr></thead>
            <tbody>
              {repStats.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '12px 0', textAlign: 'center', color: 'var(--t3)', fontStyle: 'italic' }}>No calls in this period</td></tr>
              ) : repStats.map(r => (
                <tr key={r.rep} style={{ borderTop: '.5px solid var(--border)' }}>
                  <td style={{ padding: '6px 0', fontWeight: 500 }}>{r.rep}</td>
                  <td style={{ textAlign: 'right' }}>{r.calls}</td>
                  <td style={{ textAlign: 'right' }}>{r.firms}</td>
                  <td style={{ textAlign: 'right' }}>{r.signal}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recently closed — undo a mistaken close ── */}
      <div className="card" style={{ margin: 0, marginBottom: 20 }}>
        <div className="card-title">Recently closed</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>Cards someone marked handled — reopen if that was too soon</div>
        {recentlyClosed.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t3)', fontStyle: 'italic' }}>Nothing closed yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {recentlyClosed.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, background: 'var(--s2)', fontSize: 11.5 }}>
                <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.firmName || d.firmId}</span>
                <span style={{ color: 'var(--t2)' }}>{d.reason}</span>
                <span style={{ color: 'var(--t3)' }}>{fmtDate(d.closedAt)}{d.closedBy ? ` · ${d.closedBy}` : ''}</span>
                <button className="btn xs" disabled={busyId === d.id} onClick={() => doReopen(d.id, d.firmName)}>Reopen</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {dismissCard && (
        <DismissModal card={dismissCard} onClose={() => setDismissCard(null)} onConfirm={doDismiss} />
      )}
    </div>
  );
}
