import React, { useState, useMemo } from 'react';
import { useAppContext } from '../store';
import { fmtGBP, fmtDate, inFY, inQ, getFYQuarters, STAGE_COLS, TODAY, MONTH_START, NOW } from '../lib/utils';
import { FinancialYear } from '../types';

type Period = 'fy' | 'quarter' | 'month' | 'custom';

export default function FunnelRevenue() {
  const { firms, setFirms, calls, admin, scopeFirms, scopeCalls, getActiveFYKpi, showToast } = useAppContext();

  const [selFYId, setSelFYId] = useState(admin.active_fy);
  const [period, setPeriod] = useState<Period>('fy');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const fys = (admin.financial_years || []) as FinancialYear[];
  const fy: FinancialYear = fys.find(f => f.id === selFYId) || fys[0] || {
    id: 'default', label: 'Default', start_year: 2026, status: 'active', locked: false, kpi: admin.kpi
  };
  const kpi = fy.kpi || admin.kpi;
  const yr = fy.start_year || 2026;

  const scopedFirms = scopeFirms(firms);
  const allCalls = scopeCalls(calls);

  // Current quarter boundaries
  const quarters = getFYQuarters(yr);
  const currentQ = quarters.find(q => TODAY >= q.start && TODAY <= q.end) || quarters[0];

  // Period range for revenue/wins filtering
  const periodRange = useMemo(() => {
    if (period === 'fy') return { from: `${yr}-04-01`, to: `${yr+1}-03-31`, label: fy.label };
    if (period === 'quarter') return { from: currentQ.start, to: currentQ.end, label: currentQ.label };
    if (period === 'month') return { from: MONTH_START, to: TODAY, label: 'This month' };
    if (period === 'custom' && customFrom && customTo) return { from: customFrom, to: customTo, label: `${customFrom} → ${customTo}` };
    return { from: `${yr}-04-01`, to: `${yr+1}-03-31`, label: fy.label };
  }, [period, yr, currentQ, customFrom, customTo, fy.label]);

  // Funnel counts — always show live pipeline (not period-filtered, pipeline is current state)
  const stages = ['Lead','Suspect','Proposal','Win','Lost'];
  const counts: Record<string,number> = {};
  stages.forEach(s => { counts[s] = scopedFirms.filter(f => f.stage === s).length; });
  const active = scopedFirms.length - (counts.Lost||0);

  // Wins — filtered by period (use added_date OR last_contact)
  const periodWins = useMemo(() =>
    scopedFirms.filter(f => {
      if (f.stage !== 'Win') return false;
      const dateToCheck = f.last_contact || f.added_date || '';
      if (!dateToCheck) return true; // no date = include
      return dateToCheck >= periodRange.from && dateToCheck <= periodRange.to;
    }),
    [scopedFirms, periodRange]
  );

  const totalRev = periodWins.reduce((s, f) => s + (f.win_amount||0), 0);
  const fteWins = periodWins.filter(f => f.pricing_model === 'FTE');
  const paygWins = periodWins.filter(f => f.pricing_model === 'PAYG');

  // All wins in FY for quarterly table (always FY-scoped)
  const fyWins = scopedFirms.filter(f => f.stage === 'Win' && (!f.last_contact || inFY(f.last_contact + 'T00:00:00', yr)));

  const avgCallsToWin = (() => {
    if (!fyWins.length) return '—';
    const tots = fyWins.map(f => allCalls.filter(c => c.firmId === f.id).length);
    const a = tots.reduce((x,y) => x+y, 0) / tots.length;
    return a > 0 ? a.toFixed(1) : '—';
  })();

  const funnelStages = [
    { s:'Lead',     l:'Leads',     c:STAGE_COLS.Lead,     t:null },
    { s:'Suspect',  l:'Suspects',  c:STAGE_COLS.Suspect,  t:kpi.qual_rate },
    { s:'Proposal', l:'Proposals', c:STAGE_COLS.Proposal, t:kpi.engage_rate },
    { s:'Win',      l:'Wins',      c:STAGE_COLS.Win,      t:kpi.close_rate },
  ];
  const maxCount = Math.max(...funnelStages.map(fs => counts[fs.s]||0), 1);
  const qLeads = [kpi.q1_leads||120, kpi.q2_leads||240, kpi.q3_leads||240, kpi.q4_leads||240];

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'fy',      label: 'Full FY'       },
    { key: 'quarter', label: `${currentQ.q} (${currentQ.label})` },
    { key: 'month',   label: 'This month'    },
    { key: 'custom',  label: 'Custom'        },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Header */}
      <div className="page-hd">
        <div>
          <div className="page-title">Funnel & Revenue</div>
          <div className="page-sub">{fy.label} · Showing wins for: {periodRange.label}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* FY selector */}
          <select value={selFYId} onChange={e => setSelFYId(e.target.value)} style={{ padding: '5px 9px', border: '.5px solid var(--border2)', borderRadius: 'var(--r)', fontSize: 12, background: '#fff', outline: 'none', fontWeight: 500 }}>
            {fys.map(f => <option key={f.id} value={f.id}>{f.label}{f.id === admin.active_fy ? ' (active)' : ''}</option>)}
          </select>
          {/* Period filter */}
          {PERIODS.map(p => (
            <button key={p.key} className={`dr-btn ${period === p.key ? 'on' : ''}`} onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="date-inp" />
              <span style={{ fontSize: 11, color: 'var(--t2)' }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="date-inp" />
            </>
          )}
        </div>
      </div>

      {/* 5 summary chips */}
      <div className="sg sg5" style={{ marginBottom: 14 }}>
        <div className="sc"><div className="sl">Total in DB</div><div className="sv">{scopedFirms.length}</div><div className="ss">{counts.Lost||0} lost</div></div>
        <div className="sc"><div className="sl">Suspects</div><div className="sv">{counts.Suspect||0}</div><div className="ss">Qualified</div></div>
        <div className="sc"><div className="sl">Proposals</div><div className="sv" style={{color:'#7F77DD'}}>{counts.Proposal||0}</div><div className="ss">Closest to close</div></div>
        <div className="sc"><div className="sl">Wins ({periodRange.label})</div><div className="sv" style={{color:'#1D9E75'}}>{periodWins.length}</div><div className="ss">{fmtGBP(totalRev)}</div></div>
        <div className="sc"><div className="sl">Avg calls to win</div><div className="sv">{avgCallsToWin}</div><div className="ss">Calls before closing</div></div>
      </div>

      {/* Main 2-col layout */}
      <div className="two" style={{ gap: 12, alignItems: 'start', flex: 1, minHeight: 0 }}>

        {/* LEFT: Funnel + Conversion */}
        <div>
          {/* Pipeline funnel — always live */}
          <div className="card">
            <div className="card-hd">
              <div>
                <div className="card-title">Live pipeline funnel</div>
                <div className="card-sub">Current stage of all firms — not period-filtered</div>
              </div>
            </div>
            {funnelStages.map((fs, i) => {
              const n = counts[fs.s]||0;
              const w = Math.max(40, Math.round(n / maxCount * 100));
              const prev = i > 0 ? counts[funnelStages[i-1].s]||1 : n;
              const conv = i > 0 && prev > 0 ? Math.round(n / prev * 100) : 100;
              const onTgt = fs.t ? conv >= fs.t : true;
              return (
                <div key={fs.s} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1, maxWidth: 320 }}>
                    <div style={{ height: 36, width: `${w}%`, borderRadius: 6, background: `${fs.c}20`, border: `1.5px solid ${fs.c}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', minWidth: 80 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: fs.c }}>{fs.l}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: fs.c }}>{n}</span>
                    </div>
                  </div>
                  <div style={{ width: 130, textAlign: 'right' }}>
                    {i > 0 ? <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: onTgt ? '#1D9E75' : '#E24B4A' }}>{conv}% conv.</div>
                      <div style={{ fontSize: 11, color: 'var(--t2)' }}>Target: {fs.t}% {onTgt ? '✓' : '↓'}</div>
                    </> : <div style={{ fontSize: 12, color: 'var(--t2)' }}>entry point</div>}
                  </div>
                </div>
              );
            })}
            {counts.Lost > 0 && (
              <div style={{ padding: '8px 12px', borderRadius: 'var(--r)', background: 'var(--rl)', border: '.5px solid #F7C1C1', display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>Disqualified / Lost</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)' }}>{counts.Lost}</span>
              </div>
            )}
          </div>

          {/* Conversion rates */}
          <div className="card">
            <div className="card-hd"><div className="card-title">Conversion — actual vs target</div></div>
            {[
              { l: 'Lead → Suspect',     a: counts.Suspect&&counts.Lead?(counts.Suspect/counts.Lead*100).toFixed(1):'0',   t: kpi.qual_rate },
              { l: 'Suspect → Proposal', a: counts.Proposal&&counts.Suspect?(counts.Proposal/counts.Suspect*100).toFixed(1):'0', t: kpi.engage_rate },
              { l: 'Proposal → Win',     a: periodWins.length&&counts.Proposal?(periodWins.length/counts.Proposal*100).toFixed(1):'0', t: kpi.close_rate },
              { l: 'Overall (Lead→Win)', a: periodWins.length&&active?(periodWins.length/active*100).toFixed(1):'0', t: 6 },
            ].map(c => {
              const on = parseFloat(c.a) >= c.t;
              const col = on ? '#1D9E75' : '#E24B4A';
              const pct = Math.min(100, Math.round(parseFloat(c.a) / (c.t||1) * 100));
              return (
                <div key={c.l} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '.5px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{c.l}</div>
                    <div className="mpb" style={{ width: 140, marginTop: 4 }}><div className="mpf" style={{ width: `${pct}%`, background: col }} /></div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: col }}>{c.a}%</div>
                    <div style={{ fontSize: 11, color: 'var(--t2)' }}>target {c.t}%</div>
                  </div>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 5, background: on ? 'var(--gl)' : 'var(--rl)', color: col, marginLeft: 8 }}>{on ? '✓' : '↓'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Revenue + Quarterly */}
        <div>
          {/* Revenue summary — period-filtered */}
          <div className="card">
            <div className="card-hd">
              <div>
                <div className="card-title">Wins & revenue</div>
                <div className="card-sub">Filtered by: {periodRange.label}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { l: 'FTE revenue',   v: fteWins.reduce((s,f)=>s+(f.win_amount||0),0),  n: fteWins.length,  c: '#1D9E75' },
                { l: 'PAYG revenue',  v: paygWins.reduce((s,f)=>s+(f.win_amount||0),0), n: paygWins.length, c: '#7F77DD' },
                { l: 'Total revenue', v: totalRev, n: periodWins.length, c: 'var(--brand)' },
              ].map(x => (
                <div key={x.l} style={{ background: 'var(--s2)', borderRadius: 'var(--r)', padding: '10px 12px', border: '.5px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--t2)', marginBottom: 3 }}>{x.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: x.c }}>{fmtGBP(x.v)}</div>
                  <div style={{ fontSize: 11, color: 'var(--t3)' }}>{x.n} win{x.n !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
            {periodWins.length === 0 && (
              <div className="alert info" style={{ fontSize: 12 }}>No wins recorded in {periodRange.label}. Check firm stages or adjust the period filter above.</div>
            )}
          </div>

          {/* Quarterly targets — always FY-scoped */}
          <div className="card">
            <div className="card-hd"><div className="card-title">Quarterly targets vs actuals ({fy.label})</div></div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--brand-light)' }}>
                  {['Quarter','Target leads','Actual wins','Revenue'].map(h => (
                    <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--brand)', borderBottom: '.5px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quarters.map((q, i) => {
                  const qW = fyWins.filter(f => f.last_contact && inQ(f.last_contact + 'T00:00:00', q));
                  const qRev = qW.reduce((s, f) => s + (f.win_amount||0), 0);
                  const isCur = TODAY >= q.start && TODAY <= q.end;
                  const isPast = q.end < TODAY;
                  return (
                    <tr key={q.q} style={{ background: isCur ? '#f0f0fa' : isPast ? '#fafafa' : '' }}>
                      <td style={{ padding: '7px 8px', fontWeight: 500 }}>
                        {q.label}
                        {isCur && <span style={{ fontSize: 10, marginLeft: 5, padding: '1px 5px', borderRadius: 4, background: 'var(--brand-light)', color: 'var(--brand)' }}>current</span>}
                      </td>
                      <td style={{ padding: '7px 8px' }}>{qLeads[i]}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 600, color: qW.length > 0 ? '#1D9E75' : 'var(--t3)' }}>{isPast||isCur ? qW.length : '—'}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 600, color: '#7F77DD' }}>{isPast||isCur ? fmtGBP(qRev) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Win records — period-filtered, editable amounts */}
          <div className="card">
            <div className="card-hd">
              <div>
                <div className="card-title">Win records — {periodRange.label}</div>
                <div className="card-sub">Click any amount to edit it directly</div>
              </div>
            </div>
            <div className="tw"><div className="tscroll" style={{ maxHeight: 300 }}>
              <table>
                <thead><tr><th>Firm</th><th>City</th><th>Rep</th><th>Model</th><th>Win date</th><th>Amount (£)</th></tr></thead>
                <tbody>
                  {periodWins.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: 'var(--t3)', fontStyle: 'italic' }}>
                      No wins in {periodRange.label} — try Full FY or a wider range
                    </td></tr>
                  ) : periodWins.map(f => (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{f.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--t2)' }}>{f.city||'—'}</td>
                      <td style={{ fontSize: 12, color: 'var(--t2)' }}>{f.assigned_to||'—'}</td>
                      <td><span className="spill">{f.pricing_model||'—'}</span></td>
                      <td style={{ fontSize: 12, color: 'var(--t2)' }}>{fmtDate(f.last_contact)}</td>
                      <td>
                        <div className="amount-inline">
                          <span className="pfx">£</span>
                          <input
                            type="number" defaultValue={f.win_amount||0} min={0} step={100}
                            onBlur={e => {
                              const v = parseFloat(e.target.value)||0;
                              setFirms(firms.map(x => x.id === f.id ? { ...x, win_amount: v } : x));
                              showToast(`${f.name} updated to ${fmtGBP(v)}`, 'ok');
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
