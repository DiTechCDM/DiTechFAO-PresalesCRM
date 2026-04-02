import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import pool, { logAudit, auditCtx, todayIST } from '../db.js';

const router = Router();

/* ───── helpers ───── */

function mapFirm(row, contacts = []) {
  const primary = contacts.find(c => c.is_primary) || contacts[0];
  return {
    id: row.id,
    name: row.name,
    ch_number: row.ch_number || '',
    city: row.city || '',
    region: row.region || '',
    size: row.size || '',
    staff_count: row.staff_count ? String(row.staff_count) : '',
    contact_name: primary?.name || '',
    contact_title: primary?.title || '',
    phone: primary?.phone || '',
    email: primary?.email || '',
    main_phone: row.main_phone || '',
    software: row.software || '',
    source: row.source || '',
    stage: row.stage,
    assigned_to: row.rep_name || '',
    notes: row.notes || '',
    website: row.website || '',
    win_amount: parseFloat(row.win_amount) || 0,
    linkedin: row.linkedin || '',
    contact_li: primary?.linkedin || '',
    pricing_model: row.pricing_model || '',
    service_interest: row.service_interest || '',
    last_contact: row.last_contact || '',
    follow_up: row.follow_up || '',
    added_date: row.added_at ? row.added_at.split(' ')[0] : '',
    added_by: row.added_by || '',
    contacts: contacts.map(c => ({
      id: c.id,
      name: c.name,
      title: c.title || '',
      phone: c.phone || '',
      email: c.email || '',
      linkedin: c.linkedin || '',
      notes: c.notes || '',
      isPrimary: !!c.is_primary,
    })),
  };
}

async function repId(name) {
  if (!name) return null;
  const [rows] = await pool.query('SELECT id FROM reps WHERE name = ?', [name]);
  return rows.length ? rows[0].id : null;
}

/* ───── GET all firms ───── */

router.get('/', async (_req, res) => {
  try {
    const [firms] = await pool.query(
      `SELECT f.*, r.name AS rep_name
       FROM firms f LEFT JOIN reps r ON r.id = f.assigned_rep_id
       ORDER BY f.added_at DESC`
    );
    const [contacts] = await pool.query(
      'SELECT * FROM firm_contacts ORDER BY is_primary DESC, created_at ASC'
    );
    const cMap = {};
    for (const c of contacts) { (cMap[c.firm_id] ||= []).push(c); }
    res.json(firms.map(f => mapFirm(f, cMap[f.id] || [])));
  } catch (err) {
    console.error('GET /firms', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── POST create firm ───── */

router.post('/', async (req, res) => {
  try {
    const f = req.body;
    const id = f.id || uuid();
    const rid = await repId(f.assigned_to);

    await pool.query(
      `INSERT INTO firms
        (id,name,ch_number,city,region,size,staff_count,website,linkedin,main_phone,
         software,source,stage,assigned_rep_id,pricing_model,service_interest,
         win_amount,last_contact,follow_up,notes,added_by,added_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, f.name, f.ch_number||null, f.city||null, f.region||null, f.size||null,
       f.staff_count ? parseInt(f.staff_count) : null, f.website||null, f.linkedin||null,
       f.main_phone||null, f.software||null, f.source||null, f.stage||'Lead', rid,
       f.pricing_model||null, f.service_interest||null, f.win_amount||0,
       f.last_contact||null, f.follow_up||null, f.notes||null, f.added_by||null,
       f.added_date || todayIST()]
    );

    // contacts
    const contacts = f.contacts?.length
      ? f.contacts
      : f.contact_name
        ? [{ name: f.contact_name, title: f.contact_title, phone: f.phone, email: f.email, linkedin: f.contact_li, isPrimary: true }]
        : [];

    for (const c of contacts) {
      await pool.query(
        `INSERT INTO firm_contacts (id,firm_id,name,title,phone,email,linkedin,notes,is_primary)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [c.id||uuid(), id, c.name, c.title||null, c.phone||null, c.email||null,
         c.linkedin||null, c.notes||null, c.isPrimary ? 1 : 0]
      );
    }

    logAudit({ ...auditCtx(req), action: 'firm.created', tableName: 'firms', recordId: id, recordName: f.name, newValue: { name: f.name, stage: f.stage, assigned_to: f.assigned_to } });
    res.json({ id });
  } catch (err) {
    console.error('POST /firms', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── PUT update firm ───── */

router.put('/:id', async (req, res) => {
  try {
    const f = req.body;
    const { id } = req.params;
    const rid = await repId(f.assigned_to);

    await pool.query(
      `UPDATE firms SET name=?,ch_number=?,city=?,region=?,size=?,staff_count=?,
        website=?,linkedin=?,main_phone=?,software=?,source=?,stage=?,
        assigned_rep_id=?,pricing_model=?,service_interest=?,win_amount=?,
        last_contact=?,follow_up=?,notes=?,updated_at=NOW()
       WHERE id=?`,
      [f.name, f.ch_number||null, f.city||null, f.region||null, f.size||null,
       f.staff_count ? parseInt(f.staff_count) : null, f.website||null, f.linkedin||null,
       f.main_phone||null, f.software||null, f.source||null, f.stage||'Lead', rid,
       f.pricing_model||null, f.service_interest||null, f.win_amount||0,
       f.last_contact||null, f.follow_up||null, f.notes||null, id]
    );

    // Replace contacts
    if (f.contacts) {
      await pool.query('DELETE FROM firm_contacts WHERE firm_id=?', [id]);
      for (const c of f.contacts) {
        await pool.query(
          `INSERT INTO firm_contacts (id,firm_id,name,title,phone,email,linkedin,notes,is_primary)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [c.id||uuid(), id, c.name, c.title||null, c.phone||null, c.email||null,
           c.linkedin||null, c.notes||null, c.isPrimary ? 1 : 0]
        );
      }
    }

    logAudit({ ...auditCtx(req), action: 'firm.updated', tableName: 'firms', recordId: id, recordName: f.name, newValue: { name: f.name, stage: f.stage, assigned_to: f.assigned_to } });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /firms/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── DELETE single firm ───── */

router.delete('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT name FROM firms WHERE id=?', [req.params.id]);
    await pool.query('DELETE FROM firms WHERE id=?', [req.params.id]);
    logAudit({ ...auditCtx(req), action: 'firm.deleted', tableName: 'firms', recordId: req.params.id, recordName: rows[0]?.name });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /firms/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── POST bulk delete ───── */

router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.json({ ok: true });
    await pool.query('DELETE FROM firms WHERE id IN (?)', [ids]);
    logAudit({ ...auditCtx(req), action: 'firm.bulk_deleted', tableName: 'firms', recordName: `${ids.length} firms deleted` });
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /firms/bulk-delete', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ───── PUT quick-stage ───── */

router.put('/:id/stage', async (req, res) => {
  try {
    await pool.query('UPDATE firms SET stage=?, updated_at=NOW() WHERE id=?', [req.body.stage, req.params.id]);
    logAudit({ ...auditCtx(req), action: 'firm.stage_changed', tableName: 'firms', recordId: req.params.id, newValue: { stage: req.body.stage } });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

/* ───── POST bulk-stage ───── */

router.post('/bulk-stage', async (req, res) => {
  try {
    const { ids, stage } = req.body;
    if (!ids?.length) return res.json({ ok: true });
    await pool.query('UPDATE firms SET stage=?, updated_at=NOW() WHERE id IN (?)', [stage, ids]);
    logAudit({ ...auditCtx(req), action: 'firm.bulk_stage', tableName: 'firms', recordName: `${ids.length} firms → ${stage}` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

/* ───── POST bulk-assign ───── */

router.post('/bulk-assign', async (req, res) => {
  try {
    const { ids, assigned_to } = req.body;
    if (!ids?.length) return res.json({ ok: true });
    const rid = await repId(assigned_to);
    await pool.query('UPDATE firms SET assigned_rep_id=?, updated_at=NOW() WHERE id IN (?)', [rid, ids]);
    logAudit({ ...auditCtx(req), action: 'firm.bulk_assign', tableName: 'firms', recordName: `${ids.length} firms → ${assigned_to}` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

export default router;
