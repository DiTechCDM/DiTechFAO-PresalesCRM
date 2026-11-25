/* ════════════════════════════════════════════════════════════════
   Follow-up pop-ups (part of the new All Calls page work).
   Mounted once in Layout so reps get them on every screen.

   • Rep: pop-up 15 min before a follow-up, again when it's due,
     and "you missed this" once it's 30+ min late.
   • Admin only: pop-up for every follow-up missed by anyone.
   Only timed reminders due in the last 24 h pop up, so old
   overdue items don't flood the screen.

   Wrapped in an error boundary: if anything in here throws,
   it renders nothing and the rest of the CRM is unaffected.
   ════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import { useAppContext } from '../store';
import { Reminder } from '../types';
import {
  useNow, fuStatus, dueMs, hasTime, fmtClock, fmtDur, whenLabel, withDueDeliberate, snoozeTarget, logHistory,
  myRepName, isEscalationViewer, dismissedSet, dismiss, MIN,
} from '../lib/followups';
import '../panels/AllCallsV2.css';

interface Props { onOpenFirm: (firmId: string | null, view?: string) => void }

function Alerts({ onOpenFirm }: Props) {
  const { currentUser, admin, reminders, setReminders, calls, firms, showToast } = useAppContext();
  const now = useNow(20_000);
  const [, bump] = useState(0);
  if (!currentUser) return null;

  const me = myRepName(currentUser, admin.reps);
  const team = isEscalationViewer(currentUser); // Admin only
  const gone = dismissedSet();

  type Item = { r: Reminder; key: string; kind: string; tone: string; cta: string };
  const items: Item[] = [];
  for (const r of reminders) {
    if (r.done || !hasTime(r)) continue;
    const due = dueMs(r);
    if (now - due > 24 * 60 * MIN || due - now > 15 * MIN) continue; // only the last 24 h and the next 15 min
    const st = fuStatus(r, now, calls);
    const base = `${r.id}:${r.dueDate}T${(r.dueTime || '').slice(0, 5)}:`;
    const mine = r.rep === me;
    if (mine && (st.k === 'soon' || st.k === 'due')) {
      items.push({ r, key: base + st.k, kind: st.k === 'due' ? 'Call now' : `Reminder · in ${Math.ceil((due - now) / MIN)} min`, tone: st.k === 'due' ? '#E8590C' : '#E0A100', cta: 'Open & call' });
    } else if (st.k === 'missed' && mine) {
      items.push({ r, key: base + 'missed', kind: 'You missed this follow-up', tone: '#A32D2D', cta: 'Call now' });
    } else if (st.k === 'missed' && team) {
      items.push({ r, key: base + 'missed-team', kind: `Missed by ${r.rep || 'unassigned'} · ${fmtDur(st.lateMin || 0)} late`, tone: '#A32D2D', cta: 'Reassign' });
    }
  }
  const visible = items.filter(i => !gone.has(i.key)).sort((a, b) => dueMs(a.r) - dueMs(b.r));
  if (!visible.length) return null;

  const snooze = (r: Reminder) => {
    const next = withDueDeliberate(r, snoozeTarget(r, now));
    setReminders(reminders.map(x => x.id === r.id ? next : x));
    dismiss(`${next.id}:${next.dueDate}T${next.dueTime}:soon`); // stay quiet until it's actually due
    logHistory(r.id, `Snoozed 15 min (pop-up) · ${fmtClock(dueMs(r))} → ${fmtClock(dueMs(next))}`);
    showToast('Snoozed 15 min', 'ok');
  };

  return (
    <div className="ac2-toasts" aria-live="polite">
      {visible.slice(0, 3).map(({ r, key, kind, tone, cta }) => {
        const f = firms.find(x => x.id === r.firmId);
        const contact = r.contact || f?.contacts?.find(c => c.isPrimary)?.name || f?.contact_name || '';
        const phone = f?.contacts?.find(c => c.isPrimary)?.phone || f?.phone || f?.main_phone || '';
        return (
          <div key={key} role="status" className="ac2-toast" style={{ borderTopColor: tone }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div className="k" style={{ color: tone }}>{kind}</div>
                <div className="t">{[contact, r.firmName || f?.name || r.title].filter(Boolean).join(' · ')}</div>
                <div className="s">Due {whenLabel(r, now)} · {r.rep || '—'}{phone ? ' · ' + phone : ''}</div>
                {(r.notes || r.title) && <div className="r">{r.notes || r.title}</div>}
              </div>
              <button className="x" aria-label="Dismiss" onClick={() => { dismiss(key); bump(n => n + 1); }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="ac2-btn primary" onClick={() => onOpenFirm(r.firmId || null)}>{cta}</button>
              <button className="ac2-btn" onClick={() => snooze(r)}>Snooze 15 min</button>
            </div>
          </div>
        );
      })}
      {visible.length > 3 && (
        <button className="ac2-toast-more" onClick={() => onOpenFirm(null, 'missed')}>
          + {visible.length - 3} more follow-up alert{visible.length - 3 > 1 ? 's' : ''} → open All Calls (new)
        </button>
      )}
    </div>
  );
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  declare props: { children: React.ReactNode };
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('FollowUpAlerts crashed (CRM unaffected):', err); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function FollowUpAlerts(props: Props) {
  return <Boundary><Alerts {...props} /></Boundary>;
}
