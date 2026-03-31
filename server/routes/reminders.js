import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool, { logAudit, auditCtx } from '../db.js';

const router = Router();

function mapReminder(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    firmId: row.firm_id || '',
    firmName: row.firm_name || '',
    contact: row.contact_name || '',
    dueDate: row.due_date || '',
    dueTime: row.due_time || '',
    notes: row.notes || '',
    rep: row.rep_name || '',
    done: row.done === 1 || row.done === '1' || row.done === true,
    createdAt: row.created_at ? row.created_at.replace(' ', 'T') + (row.created_at.includes('T') ? '' : 'Z') : '',
    createdFrom: row.created_from || 'manual',
  };
}

async function repId(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM reps WHERE name=?', [name]);
  return rows.length ? rows[0].id : null;
}

/* ───── GET all reminders ───── */

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT rem.*, r.name AS rep_name, f.name AS firm_name, fc.name AS contact_name
       FROM reminders rem
       LEFT JOIN reps r ON r.id = rem.rep_id
       LEFT JOIN firms f ON f.id = rem.firm_id
       LEFT JOIN firm_contacts fc ON fc.id = rem.firm_contact_id
       ORDER BY rem.due_date ASC`
    );
    res.json(rows.map(mapReminder));
  } catch (err) {
    console.error('GET /reminders', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── POST create reminder ───── */

router.post('/', async (req, res) => {
  try {
    const r = req.body;
    const id = r.id || uuid();
    const rid = await repId(r.rep);

    let createdAt = r.createdAt || new Date().toISOString();
    createdAt = createdAt.replace('T', ' ').replace('Z', '').split('.')[0];

    await pool.query(
      `INSERT INTO reminders
        (id,rep_id,firm_id,type,title,notes,due_date,due_time,done,created_from,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, rid, r.firmId||null, r.type||'follow-up', r.title, r.notes||null,
       r.dueDate, r.dueTime||null, r.done ? 1 : 0, r.createdFrom||'manual', createdAt]
    );

    logAudit({ ...auditCtx(req), action: 'reminder.created', tableName: 'reminders', recordId: id, recordName: r.title });
    res.json({ id });
  } catch (err) {
    console.error('POST /reminders', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── PUT update reminder ───── */

router.put('/:id', async (req, res) => {
  try {
    const r = req.body;
    const rid = await repId(r.rep);

    await pool.query(
      `UPDATE reminders SET rep_id=?,firm_id=?,type=?,title=?,notes=?,
        due_date=?,due_time=?,done=?,updated_at=NOW()
       WHERE id=?`,
      [rid, r.firmId||null, r.type, r.title, r.notes||null,
       r.dueDate, r.dueTime||null, r.done ? 1 : 0, req.params.id]
    );

    logAudit({ ...auditCtx(req), action: 'reminder.updated', tableName: 'reminders', recordId: req.params.id, recordName: r.title });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /reminders/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── PUT toggle done ───── */

router.put('/:id/toggle', async (req, res) => {
  try {
    await pool.query(
      `UPDATE reminders SET done = IF(done=0,1,0),
        done_at = IF(done=0,NOW(),NULL), updated_at=NOW()
       WHERE id=?`,
      [req.params.id]
    );
    logAudit({ ...auditCtx(req), action: 'reminder.toggled', tableName: 'reminders', recordId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /reminders/:id/toggle', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── DELETE reminder ───── */

router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT title FROM reminders WHERE id=?', [req.params.id]);
    await pool.query('DELETE FROM reminders WHERE id=?', [req.params.id]);
    logAudit({ ...auditCtx(req), action: 'reminder.deleted', tableName: 'reminders', recordId: req.params.id, recordName: rows[0]?.title });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /reminders/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
