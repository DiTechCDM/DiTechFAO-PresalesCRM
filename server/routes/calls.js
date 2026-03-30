import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool from '../db.js';

const router = Router();

function mapCall(row) {
  return {
    id: row.id,
    rep: row.rep_name || '',
    firm: row.firm_name || '',
    firmId: row.firm_id || '',
    contact: row.contact_name || '',
    type: row.type,
    oc: row.outcome,
    stage: row.stage_at_time || '',
    notes: row.notes || '',
    fu: row.follow_up_date || '',
    mtgDate: row.meeting_date || '',
    ts: row.logged_at ? row.logged_at.replace(' ', 'T') + (row.logged_at.includes('T') ? '' : 'Z') : '',
  };
}

async function repId(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM reps WHERE name=?', [name]);
  return rows.length ? rows[0].id : null;
}

/* ───── GET all calls ───── */

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM calls ORDER BY logged_at DESC');
    res.json(rows.map(mapCall));
  } catch (err) {
    console.error('GET /calls', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── POST create call ───── */

router.post('/', async (req, res) => {
  try {
    const c = req.body;
    const id = c.id || uuid();
    const rid = await repId(c.rep);

    // Parse ts — may be ISO string; store as DATETIME
    let loggedAt = c.ts || new Date().toISOString();
    // Convert ISO → MySQL-friendly datetime
    loggedAt = loggedAt.replace('T', ' ').replace('Z', '').split('.')[0];

    await pool.query(
      `INSERT INTO calls
        (id,rep_id,firm_id,firm_name,contact_name,rep_name,type,outcome,
         stage_at_time,notes,follow_up_date,meeting_date,logged_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, rid, c.firmId||null, c.firm||null, c.contact||null, c.rep||null,
       c.type||'call', c.oc, c.stage||null, c.notes||null,
       c.fu||null, c.mtgDate||null, loggedAt]
    );

    // Update firm touched fields
    if (c.firmId) {
      const sets = ['last_contact=CURDATE()'];
      const params = [];
      if (c.stage) { sets.push('stage=?'); params.push(c.stage); }
      if (c.fu)    { sets.push('follow_up=?'); params.push(c.fu); }
      params.push(c.firmId);
      await pool.query(`UPDATE firms SET ${sets.join(',')} WHERE id=?`, params);
    }

    res.json({ id });
  } catch (err) {
    console.error('POST /calls', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── PUT update call ───── */

router.put('/:id', async (req, res) => {
  try {
    const c = req.body;
    const rid = await repId(c.rep);

    await pool.query(
      `UPDATE calls SET rep_id=?,firm_id=?,firm_name=?,contact_name=?,rep_name=?,
        type=?,outcome=?,stage_at_time=?,notes=?,follow_up_date=?,meeting_date=?
       WHERE id=?`,
      [rid, c.firmId||null, c.firm||null, c.contact||null, c.rep||null,
       c.type||'call', c.oc, c.stage||null, c.notes||null,
       c.fu||null, c.mtgDate||null, req.params.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /calls/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── DELETE call ───── */

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM calls WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /calls/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
