/* ════════════════════════════════════════════════════════════════
   Follow-ups API — used only by the new All Calls page (/all-calls)
   and the follow-up pop-ups.

   Reads/writes two columns added by
   migrations/2026-11-25-all-calls-v2.sql:
     reminders.history   (JSON text log)
     firms.good_lead     (0/1)

   If the migration has not been run yet, GET /meta answers
   { migrated:false } instead of failing, so the page still works
   (just without history and the good-lead flag).
   ════════════════════════════════════════════════════════════════ */
import { Router } from 'express';
import pool, { logAudit, auditCtx, nowIST } from '../db.js';

const router = Router();

const isMissingColumn = (err) => err && (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054);

function parseHistory(txt) {
  if (!txt) return [];
  try { const v = JSON.parse(txt); return Array.isArray(v) ? v : []; } catch { return []; }
}

/* ───── GET meta: reminder history + good-lead firm ids ───── */
router.get('/meta', async (_req, res) => {
  try {
    const [rems] = await pool.query('SELECT id, history FROM reminders WHERE history IS NOT NULL');
    const [firms] = await pool.query('SELECT id FROM firms WHERE good_lead = 1');
    const history = {};
    for (const r of rems) history[r.id] = parseHistory(r.history);
    res.json({ migrated: true, history, goodLeads: firms.map(f => f.id) });
  } catch (err) {
    if (isMissingColumn(err)) return res.json({ migrated: false, history: {}, goodLeads: [] });
    console.error('GET /followups/meta', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── POST append one history entry to a reminder ─────
   Body: { text }. "by" and "at" are set by the server.
   Done in a transaction with a row lock so two people acting at
   once cannot overwrite each other's entries. */
router.post('/reminders/:id/history', async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'text required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT history, title FROM reminders WHERE id=? FOR UPDATE', [req.params.id]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Reminder not found' }); }
    const entry = { at: nowIST(), by: req.user?.name || 'Unknown', text };
    const list = parseHistory(rows[0].history);
    list.push(entry);
    await conn.query('UPDATE reminders SET history=? WHERE id=?', [JSON.stringify(list.slice(-100)), req.params.id]);
    await conn.commit();
    logAudit({ ...auditCtx(req), action: 'reminder.history', tableName: 'reminders', recordId: req.params.id, recordName: rows[0].title, newValue: entry });
    res.json(entry);
  } catch (err) {
    await conn.rollback().catch(() => {});
    if (isMissingColumn(err)) return res.status(409).json({ error: 'Run migrations/2026-11-25-all-calls-v2.sql first' });
    console.error('POST /followups/reminders/:id/history', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
});

/* ───── PUT good-lead flag on a firm ───── Body: { value: boolean } */
router.put('/firms/:id/good-lead', async (req, res) => {
  try {
    const v = req.body?.value ? 1 : 0;
    const [r] = await pool.query('UPDATE firms SET good_lead=? WHERE id=?', [v, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Firm not found' });
    logAudit({ ...auditCtx(req), action: v ? 'firm.good_lead.on' : 'firm.good_lead.off', tableName: 'firms', recordId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    if (isMissingColumn(err)) return res.status(409).json({ error: 'Run migrations/2026-11-25-all-calls-v2.sql first' });
    console.error('PUT /followups/firms/:id/good-lead', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
