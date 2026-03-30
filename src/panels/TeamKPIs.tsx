import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store';
import { OC_LABELS, OC_COLORS, TODAY, MONTH_START, NOW } from '../lib/utils';

type Period = 'today' | 'week' | 'month' | 'custom';

function getPeriodRange(period: Period, customFrom: string, customTo: string) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const now = new Date();
  const today = fmt(now);

  if (period === 'today') return { from: today, to: today, label: 'Today', mtgLabel: 'Today' };
  if (period === 'week') {
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay()+6)%7));
    return { from: fmt(mon), to: today, label: 'This week', mtgLabel: 'This week' };
  }
  if (period === 'month') return { from: MONTH_START, to: today, label: 'This month', mtgLabel: 'This month' };
  if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo, label: `${customFrom} → ${customTo}`, mtgLabel: 'Period' };
  return { from: today, to: today, label: 'Today', mtgLabel: 'Today' };
}

export default function TeamKPIs() {
  const { calls, admin, scopeCalls, getActiveFYKpi } = useAppContext();
  const kpi = getActiveFYKpi();
  const allCalls = scopeCalls(calls);
  const reps = admin.reps?.filter(r => r.status === 'Active') || [];

  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const range = getPeriodRange(period, customFrom, customTo);

  // Scale targets to period
  const workDays = period === 'today' ? 1 : period === 'week' ? 5 : NOW.getDate();
  const callTarget = (period === 'today'
    ? kpi.calls_day
    : period === 'week' ? kpi.calls_day * 5
    : kpi.calls_day * workDays);
  const mtgTarget = period === 'today'
    ? Math.ceil(kpi.meetings_month / 22)
    : period === 'week' ? Math.ceil(kpi.meetings_month / 4.3)
    : kpi.meetings_month;

  const periodCalls = useMemo(() =>
    allCalls.filter(c => { const d = c.ts.split('T')[0]; return d >= range.from && d <= range.to; }),
    [allCalls, range.from, range.to]
  );

  const totalC = periodCalls.filter(c=>c.type==='call'||c.type==='followup').length;
  const totalM = periodCalls.filter(c=>c.oc==='mtg').length;
  const totalL = periodCalls.filter(c=>c.type==='linkedin').length;
  const totalEntries = periodCalls.length;

  const repData = reps.map(r => {
    const rc = periodCalls.filter(c => c.rep === r.name);
    const rCallTarget = period === 'today' ? (r.calls || kpi.calls_day)
      : period === 'week' ? (r.calls || kpi.calls_day) * 5
      : (r.calls || kpi.calls_day) * workDays;
    const rMtgTarget = period === 'today' ? Math.ceil((r.mtg || kpi.meetings_month) / 22)
      : period === 'week' ? Math.ceil((r.mtg || kpi.meetings_month) / 4.3)
      : (r.mtg || kpi.meetings_month);
    const nC = rc.filter(c=>c.type==='call'||c.type==='followup').length;
    const nL = rc.filter(c=>c.type==='linkedin').length;
    const nM = rc.filter(c=>c.oc==='mtg').length;
    const pct = Math.min(100, Math.round(nC / (rCallTarget||1) * 100));
    return { ...r, nC, nL, nM, pct, rCallTarget: Math.round(rCallTarget), rMtgTarget: Math.round(rMtgTarget) };
  }).sort((a,b) => b.nC - a.nC);

  const ocCounts: Record<string,number> = {};
  periodCalls.forEach(c => { ocCounts[c.oc] = (ocCounts[c.oc]||0)+1; });
  const ocTotal = periodCalls.length || 1;

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header + period filter */}
      <div className="page-hd">
        <div>
          <div className="page-title">Team KPIs</div>
          <div className="page-sub">Live performance · {range.label} · {reps.length} active rep{reps.length!==1?'s':''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button key={p.key} className={`dr-btn ${period===p.key?'on':''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)} className="date-inp" />
              <span style={{fontSize:11,color:'var(--t2)'}}>to</span>
              <input type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)} className="date-inp" />
            </>
          )}
        </div>
      </div>

      {/* 4 summary stat chips */}
      <div className="sg sg4" style={{ marginBottom: 14 }}>
        {[
          { l: 'Total entries', v: totalEntries, s: `${reps.length} reps`, c: 'var(--text)' },
          { l: 'Calls made', v: totalC, s: `Team target: ${Math.round(callTarget * reps.length)}`, c: 'var(--text)' },
          { l: 'Meetings set', v: totalM, s: range.mtgLabel, c: '#1D9E75' },
          { l: 'LinkedIn msgs', v: totalL, s: range.mtgLabel, c: '#7F77DD' },
        ].map(s => (
          <div key={s.l} className="sc">
            <div className="sl">{s.l}</div>
            <div className="sv" style={{ color: s.c }}>{s.v}</div>
            <div className="ss">{s.s}</div>
          </div>
        ))}
      </div>

      {/* Main grid — fills remaining height */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, flex: 1, minHeight: 0, alignItems: 'start' }}>

        {/* LEFT: Leaderboard */}
        <div className="card" style={{ margin: 0 }}>
          <div className="card-hd">
            <div>
              <div className="card-title">Leaderboard — {range.label.toLowerCase()}</div>
              <div className="card-sub">vs individual call targets</div>
            </div>
          </div>
          {reps.length === 0 ? (
            <div style={{ color: 'var(--t3)', fontSize: 12 }}>No active reps. Go to Admin → Rep config.</div>
          ) : repData.map((d, i) => {
            const bc = d.pct>=100?'#1D9E75':d.pct>=60?'#EF9F27':'#E24B4A';
            const rankCl = i===0?'gold':i===1?'silver':'bronze';
            const pctM = Math.min(100, Math.round(d.nM / (d.rMtgTarget||1) * 100));
            return (
              <div key={d.id} className="lb-row">
                <div className={`lb-rank ${rankCl}`}>{i+1}</div>
                <div className="lb-av" style={{ background: `${d.col}22`, color: d.col }}>{d.init}</div>
                <div className="lb-name" style={{ minWidth: 70 }}>{d.name}</div>
                <div className="lb-stats" style={{ flex: 1, gap: 8 }}>
                  {/* Mini stat blocks */}
                  <div className="lb-stat">
                    <div className="lsv">{d.nC}</div>
                    <div className="lsl">calls</div>
                  </div>
                  <div className="lb-stat">
                    <div className="lsv" style={{ color: '#7F77DD' }}>{d.nL}</div>
                    <div className="lsl">LI</div>
                  </div>
                  <div className="lb-stat">
                    <div className="lsv" style={{ color: d.nM > 0 ? '#1D9E75' : 'var(--text)' }}>{d.nM}</div>
                    <div className="lsl">mtgs</div>
                  </div>
                  {/* Calls progress */}
                  <div style={{ flex: 1, minWidth: 60 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>
                      <span>Calls</span><span style={{ color: bc, fontWeight: 600 }}>{d.pct}%</span>
                    </div>
                    <div className="mpb" style={{ height: 5 }}>
                      <div className="mpf" style={{ width: `${d.pct}%`, background: bc }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>{d.nC} / {d.rCallTarget}</div>
                  </div>
                  {/* Meetings progress */}
                  <div style={{ flex: 1, minWidth: 60 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginBottom: 2 }}>
                      <span>Mtgs</span><span style={{ color: pctM>=100?'#1D9E75':pctM>=60?'#EF9F27':'#E24B4A', fontWeight: 600 }}>{pctM}%</span>
                    </div>
                    <div className="mpb" style={{ height: 5 }}>
                      <div className="mpf" style={{ width: `${pctM}%`, background: pctM>=100?'#1D9E75':pctM>=60?'#EF9F27':'#E24B4A' }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>{d.nM} / {d.rMtgTarget}</div>
                  </div>
                  <span className={`hit-badge ${d.pct>=100?'hit-yes':d.pct>=60?'hit-warn':'hit-no'}`}>
                    {d.pct>=100?'✓ Hit':d.pct>=60?'On track':'Behind'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT: Outcome split + Meetings progress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Outcome split */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-hd">
              <div className="card-title">Outcome split — {range.label.toLowerCase()}</div>
            </div>
            {Object.keys(OC_LABELS).filter(k => ocCounts[k]).length === 0 ? (
              <div style={{ color: 'var(--t3)', fontSize: 12 }}>No calls in this period</div>
            ) : Object.keys(OC_LABELS).filter(k => ocCounts[k]).map(k => {
              const n = ocCounts[k]||0;
              const pct = Math.round(n / ocTotal * 100);
              return (
                <div key={k} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12 }}>{OC_LABELS[k]}</span>
                    <span style={{ fontSize: 12, color: 'var(--t2)' }}>{n} · {pct}%</span>
                  </div>
                  <div className="mpb">
                    <div className="mpf" style={{ width: `${pct}%`, background: OC_COLORS[k] }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Meetings progress — per rep, period-aware */}
          <div className="card" style={{ margin: 0 }}>
            <div className="card-hd">
              <div className="card-title">Meetings — {range.label.toLowerCase()} · per rep</div>
            </div>
            {reps.length === 0 ? (
              <div style={{ color: 'var(--t3)', fontSize: 12 }}>No active reps</div>
            ) : repData.map(r => {
              const pct = Math.min(100, Math.round(r.nM / (r.rMtgTarget||1) * 100));
              const col = pct>=100?'#1D9E75':pct>=60?'#EF9F27':'#E24B4A';
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                  <div className="lb-av" style={{ background: `${r.col}22`, color: r.col, width: 28, height: 28, fontSize: 10 }}>{r.init}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{r.name}</span>
                      <span style={{ fontSize: 12, color: 'var(--t2)' }}>{r.nM} / {r.rMtgTarget}</span>
                    </div>
                    <div className="mpb">
                      <div className="mpf" style={{ width: `${pct}%`, background: col }} />
                    </div>
                  </div>
                  <span className={`hit-badge ${pct>=100?'hit-yes':pct>=60?'hit-warn':'hit-no'}`}>{pct}%</span>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
