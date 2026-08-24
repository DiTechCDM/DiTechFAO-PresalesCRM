import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool, { logAudit, auditCtx, nowIST } from '../db.js';

/* ─────────────────────────────────────────────────────────────
   Work Queue — dismissal log
   Standalone table, standalone route. Does not read, write, or
   alter anything in firms/calls/reminders. See
   work-queue-logic-spec.md §6.2 for why this table exists: a
   firm should leave the work queue only when it is explicitly
   refused, its commitment is fulfilled, or a user dismisses it —
   never just because the next call happened to hit a gatekeeper.
   ───────────────────────────────────────────────────────────── */

const router = Router();

// Safety net so this feature works even if the .sql files below
// haven't been re-run yet — mirrors nothing else in this app on
// purpose, since it is the only additive table the app creates
// itself rather than via the schema file.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_queue_actions (
        id              CHAR(36)     NOT NULL DEFAULT (UUID()),
        firm_id         CHAR(36)     NOT NULL,
        firm_name       VARCHAR(200) NULL,
        reason          VARCHAR(50)  NOT NULL DEFAULT 'Other',
        notes           TEXT         NULL,
        closed_by_id    CHAR(36)     NULL,
        closed_by_name  VARCHAR(100) NULL,
        closed_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_wqa_firm      (firm_id),
        INDEX idx_wqa_closed_at (closed_at)
      ) ENGINE=InnoDB
    `);
  } catch (err) {
    console.error('work_queue_actions table check failed:', err.message);
  }
})();

function mapAction(row) {
  return {
    id: row.id,
    firmId: row.firm_id,
    firmName: row.firm_name || '',
    reason: row.reason,
    notes: row.notes || '',
    closedBy: row.closed_by_name || '',
    closedAt: row.closed_at ? row.closed_at.replace(' ', 'T') + (row.closed_at.includes('T') ? '' : '+05:30') : '',
  };
}

/* ───── GET all dismissals ───── */

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM work_queue_actions ORDER BY closed_at DESC');
    res.json(rows.map(mapAction));
  } catch (err) {
    console.error('GET /work-queue', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── POST dismiss a firm's card ───── */

router.post('/', async (req, res) => {
  try {
    const b = req.body;
    if (!b.firmId) return res.status(400).json({ error: 'firmId is required' });
    const id = uuid();
    const closedAt = nowIST();

    await pool.query(
      `INSERT INTO work_queue_actions (id, firm_id, firm_name, reason, notes, closed_by_id, closed_by_name, closed_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, b.firmId, b.firmName || null, b.reason || 'Other', b.notes || null,
       req.user?.id || null, req.user?.name || null, closedAt]
    );

    logAudit({ ...auditCtx(req), action: 'workqueue.dismissed', tableName: 'work_queue_actions', recordId: id, recordName: b.firmName || b.firmId, newValue: { reason: b.reason, notes: b.notes } });
    res.json({ id });
  } catch (err) {
    console.error('POST /work-queue', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── DELETE a dismissal (reopen the card) ───── */

router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT firm_name FROM work_queue_actions WHERE id=?', [req.params.id]);
    await pool.query('DELETE FROM work_queue_actions WHERE id=?', [req.params.id]);
    logAudit({ ...auditCtx(req), action: 'workqueue.reopened', tableName: 'work_queue_actions', recordId: req.params.id, recordName: rows[0]?.firm_name });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /work-queue/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
