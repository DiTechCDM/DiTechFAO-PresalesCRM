export function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4); }
export function esc(s: any) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const IST = 'Asia/Kolkata';
export function fmtDate(d?: string) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: IST }); }
export function fmtTime(ts: string) { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IST }); }
export function fmtFull(ts: string) { return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: IST }); }
export function fmtGBP(n?: number) { return '£' + (n || 0).toLocaleString(); }
export const TODAY = new Date().toLocaleDateString('sv-SE', { timeZone: IST });
export const NOW = new Date();
export const MONTH_START = TODAY.slice(0, 8) + '01';

export const OC_LABELS: Record<string, string> = { mtg: 'Meeting set', cb: 'Callback', in: 'Interested', na: 'No answer', gk: 'Gatekeeper', ni: 'Not interested', vm: 'Voicemail' };
export const OC_COLORS: Record<string, string> = { mtg: '#1D9E75', cb: '#EF9F27', in: '#378ADD', na: '#888780', gk: '#85B7EB', ni: '#A32D2D', vm: '#7F77DD' };
export const OC_BADGE: Record<string, string> = { mtg: 'b-win', cb: 'b-suspect', in: 'b-lead', na: 'b-none', gk: 'b-lead', ni: 'b-lost', vm: 'b-proposal' };
export const TYPE_LBL: Record<string, string> = { call: 'Cold call', followup: 'Follow-up', linkedin: 'LinkedIn', email: 'Email', meeting: 'Meeting' };
export const STAGE_COLS: Record<string, string> = { Lead: '#185FA5', Suspect: '#854F0B', Proposal: '#3C3489', Win: '#1D9E75', Lost: '#A32D2D' };
export const STAGE_BG: Record<string, string> = { Lead: 'b-lead', Suspect: 'b-suspect', Proposal: 'b-proposal', Win: 'b-win', Lost: 'b-lost' };
export const SDC: Record<string, string> = { Lead: 'sd-lead', Suspect: 'sd-suspect', Proposal: 'sd-proposal', Win: 'sd-win', Lost: 'sd-lost' };

export function getFYRange(yr: number) { return { start: `${yr}-04-01`, end: `${yr + 1}-03-31` }; }
export function inFY(ts: string, yr: number) { const d = ts.split('T')[0]; const r = getFYRange(yr); return d >= r.start && d <= r.end; }
export function getFYQuarters(yr: number) {
  return [
    { q: 'Q1', label: `Apr–Jun ${yr}`, start: `${yr}-04-01`, end: `${yr}-06-30` },
    { q: 'Q2', label: `Jul–Sep ${yr}`, start: `${yr}-07-01`, end: `${yr}-09-30` },
    { q: 'Q3', label: `Oct–Dec ${yr}`, start: `${yr}-10-01`, end: `${yr}-12-31` },
    { q: 'Q4', label: `Jan–Mar ${yr + 1}`, start: `${yr + 1}-01-01`, end: `${yr + 1}-03-31` },
  ];
}
export function inQ(ts: string, q: { start: string; end: string }) { const d = ts.split('T')[0]; return d >= q.start && d <= q.end; }
