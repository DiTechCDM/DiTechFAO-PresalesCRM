import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import pool, { logAudit, auditCtx } from '../db.js';

const router = Router();

function defaultKpi() {
  return {
    calls_day: 50, li_day: 10, mine_day: 25, meetings_month: 20,
    leads_month: 40, q1_leads: 120, q2_leads: 240, q3_leads: 240, q4_leads: 240,
    qual_rate: 40, engage_rate: 50, close_rate: 30, rev_fte: 2700, rev_payg: 4500,
  };
}

/* ═══════════════════════════════════════════════
   GET /api/admin — aggregated admin settings
   ═══════════════════════════════════════════════ */

router.get('/', async (_req, res) => {
  try {
    // Financial years + KPI
    const [fys] = await pool.query('SELECT * FROM financial_years ORDER BY start_year DESC');
    const [kpis] = await pool.query('SELECT * FROM kpi_targets WHERE rep_id IS NULL');

    const fyList = fys.map(fy => {
      const k = kpis.find(x => x.fy_id === fy.id);
      return {
        id: fy.id, label: fy.label, start_year: fy.start_year,
        status: fy.status, locked: fy.locked === 1 || fy.locked === '1',
        kpi: k ? {
          calls_day: k.calls_per_day, li_day: k.linkedin_per_day,
          mine_day: k.mine_per_day, meetings_month: k.meetings_month,
          leads_month: k.leads_month, q1_leads: k.q1_leads, q2_leads: k.q2_leads,
          q3_leads: k.q3_leads, q4_leads: k.q4_leads,
          qual_rate: k.qual_rate, engage_rate: k.engage_rate, close_rate: k.close_rate,
          rev_fte: k.rev_fte, rev_payg: k.rev_payg,
        } : defaultKpi(),
      };
    });
    const activeFY = fyList.find(f => f.status === 'active') || fyList[0];

    // Users
    const [users] = await pool.query(
      'SELECT u.*, r.name AS rep_name FROM users u LEFT JOIN reps r ON r.id = u.linked_rep_id ORDER BY u.created_at'
    );
    const [rpRows] = await pool.query("SELECT key_name,value FROM admin_settings WHERE category='role_perm'");
    const rolePerms = {};
    for (const rp of rpRows) rolePerms[rp.key_name] = JSON.parse(rp.value);

    const userList = users.map(u => ({
      id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
      linkedRep: u.rep_name || '',
      perms: u.perms
        ? (typeof u.perms === 'string' ? JSON.parse(u.perms) : u.perms)
        : (rolePerms[u.role] || {}),
    }));

    // Reps
    const [reps] = await pool.query('SELECT * FROM reps ORDER BY created_at');
    const repList = reps.map(r => ({
      id: r.id, name: r.name, init: r.initials, col: r.colour,
      mtg: r.meetings_month, calls: r.calls_per_day, mine: r.mine_per_day,
      li: r.linkedin_per_day, status: r.status,
    }));

    // Dropdowns
    const [ddRows] = await pool.query("SELECT key_name,value FROM admin_settings WHERE category='dropdown'");
    const dropdowns = {};
    for (const dd of ddRows) dropdowns[dd.key_name] = JSON.parse(dd.value);
    // Sync assigned_to with active reps
    dropdowns.assigned_to = reps.filter(r => r.status === 'Active').map(r => r.name);

    // General settings
    const [sRows] = await pool.query("SELECT key_name,value FROM admin_settings WHERE category='general'");
    const settings = {};
    for (const s of sRows) settings[s.key_name] = JSON.parse(s.value);

    res.json({
      active_fy: activeFY?.id || '',
      financial_years: fyList,
      kpi: activeFY?.kpi || defaultKpi(),
      users: userList,
      reps: repList,
      rolePerms,
      customFields: [],
      dropdowns,
      settings,
    });
  } catch (err) {
    console.error('GET /admin', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════ Users CRUD ═══════════ */

router.post('/users', async (req, res) => {
  try {
    const u = req.body;
    const id = u.id || uuid();
    const hash = await bcrypt.hash(u.password || 'changeme123', 10);
    let rid = null;
    if (u.linkedRep) {
      const [r] = await pool.query('SELECT id FROM reps WHERE name=?', [u.linkedRep]);
      if (r.length) rid = r[0].id;
    }
    await pool.query(
      `INSERT INTO users (id,name,email,password_hash,role,status,linked_rep_id,perms)
       VALUES (?,?,?,?,?,?,?,?)`,
      [id, u.name, u.email, hash, u.role||'rep', u.status||'active', rid,
       u.perms ? JSON.stringify(u.perms) : null]
    );
    logAudit({ ...auditCtx(req), action: 'user.created', tableName: 'users', recordId: id, recordName: u.name, newValue: { name: u.name, email: u.email, role: u.role } });
    res.json({ id });
  } catch (err) {
    console.error('POST /admin/users', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const u = req.body;
    let rid = null;
    if (u.linkedRep) {
      const [r] = await pool.query('SELECT id FROM reps WHERE name=?', [u.linkedRep]);
      if (r.length) rid = r[0].id;
    }
    const sets = ['name=?','email=?','role=?','status=?','linked_rep_id=?','perms=?'];
    const params = [u.name, u.email, u.role, u.status, rid, u.perms ? JSON.stringify(u.perms) : null];
    if (u.password) { sets.push('password_hash=?'); params.push(await bcrypt.hash(u.password, 10)); }
    params.push(req.params.id);
    await pool.query(`UPDATE users SET ${sets.join(',')} WHERE id=?`, params);
    logAudit({ ...auditCtx(req), action: 'user.updated', tableName: 'users', recordId: req.params.id, recordName: u.name, newValue: { name: u.name, email: u.email, role: u.role, status: u.status } });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/users/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT name FROM users WHERE id=?', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id=?', [req.params.id]);
    logAudit({ ...auditCtx(req), action: 'user.deleted', tableName: 'users', recordId: req.params.id, recordName: rows[0]?.name });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admin/users/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════ Reps CRUD ═══════════ */

router.post('/reps', async (req, res) => {
  try {
    const r = req.body;
    const id = r.id || uuid();
    await pool.query(
      `INSERT INTO reps (id,name,initials,colour,calls_per_day,meetings_month,linkedin_per_day,mine_per_day,status)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, r.name, r.init||r.name.substring(0,2).toUpperCase(), r.col||'#1D9E75',
       r.calls||50, r.mtg||20, r.li||10, r.mine||25, r.status||'Active']
    );
    logAudit({ ...auditCtx(req), action: 'rep.created', tableName: 'reps', recordId: id, recordName: r.name });
    res.json({ id });
  } catch (err) {
    console.error('POST /admin/reps', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/reps/:id', async (req, res) => {
  try {
    const r = req.body;
    await pool.query(
      `UPDATE reps SET name=?,initials=?,colour=?,calls_per_day=?,meetings_month=?,
        linkedin_per_day=?,mine_per_day=?,status=? WHERE id=?`,
      [r.name, r.init, r.col, r.calls, r.mtg, r.li, r.mine, r.status, req.params.id]
    );
    logAudit({ ...auditCtx(req), action: 'rep.updated', tableName: 'reps', recordId: req.params.id, recordName: r.name });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/reps/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/reps/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT name FROM reps WHERE id=?', [req.params.id]);
    await pool.query('DELETE FROM reps WHERE id=?', [req.params.id]);
    logAudit({ ...auditCtx(req), action: 'rep.deleted', tableName: 'reps', recordId: req.params.id, recordName: rows[0]?.name });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /admin/reps/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════ Financial Years ═══════════ */

router.post('/financial-years', async (req, res) => {
  try {
    const fy = req.body;
    const id = fy.id || uuid();
    await pool.query(
      'INSERT INTO financial_years (id,label,start_year,status,locked) VALUES (?,?,?,?,?)',
      [id, fy.label, fy.start_year, fy.status||'inactive', fy.locked ? 1 : 0]
    );
    const k = fy.kpi || defaultKpi();
    await pool.query(
      `INSERT INTO kpi_targets
        (id,rep_id,fy_id,calls_per_day,meetings_month,linkedin_per_day,mine_per_day,
         leads_month,qual_rate,engage_rate,close_rate,
         q1_leads,q2_leads,q3_leads,q4_leads,rev_fte,rev_payg)
       VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uuid(), id, k.calls_day, k.meetings_month, k.li_day, k.mine_day,
       k.leads_month, k.qual_rate, k.engage_rate, k.close_rate,
       k.q1_leads, k.q2_leads, k.q3_leads, k.q4_leads, k.rev_fte, k.rev_payg]
    );
    logAudit({ ...auditCtx(req), action: 'fy.created', tableName: 'financial_years', recordId: id, recordName: fy.label });
    res.json({ id });
  } catch (err) {
    console.error('POST /admin/financial-years', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/financial-years/:id', async (req, res) => {
  try {
    const fy = req.body;
    const { id } = req.params;
    await pool.query(
      'UPDATE financial_years SET label=?,start_year=?,status=?,locked=? WHERE id=?',
      [fy.label, fy.start_year, fy.status, fy.locked ? 1 : 0, id]
    );
    if (fy.kpi) {
      const k = fy.kpi;
      const [ex] = await pool.query('SELECT id FROM kpi_targets WHERE fy_id=? AND rep_id IS NULL', [id]);
      if (ex.length) {
        await pool.query(
          `UPDATE kpi_targets SET calls_per_day=?,meetings_month=?,linkedin_per_day=?,mine_per_day=?,
            leads_month=?,qual_rate=?,engage_rate=?,close_rate=?,
            q1_leads=?,q2_leads=?,q3_leads=?,q4_leads=?,rev_fte=?,rev_payg=?
           WHERE fy_id=? AND rep_id IS NULL`,
          [k.calls_day, k.meetings_month, k.li_day, k.mine_day,
           k.leads_month, k.qual_rate, k.engage_rate, k.close_rate,
           k.q1_leads, k.q2_leads, k.q3_leads, k.q4_leads, k.rev_fte, k.rev_payg, id]
        );
      } else {
        await pool.query(
          `INSERT INTO kpi_targets
            (id,rep_id,fy_id,calls_per_day,meetings_month,linkedin_per_day,mine_per_day,
             leads_month,qual_rate,engage_rate,close_rate,
             q1_leads,q2_leads,q3_leads,q4_leads,rev_fte,rev_payg)
           VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [uuid(), id, k.calls_day, k.meetings_month, k.li_day, k.mine_day,
           k.leads_month, k.qual_rate, k.engage_rate, k.close_rate,
           k.q1_leads, k.q2_leads, k.q3_leads, k.q4_leads, k.rev_fte, k.rev_payg]
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/financial-years/:id', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/financial-years/:id/activate', async (req, res) => {
  try {
    await pool.query("UPDATE financial_years SET status='inactive'");
    await pool.query("UPDATE financial_years SET status='active' WHERE id=?", [req.params.id]);
    logAudit({ ...auditCtx(req), action: 'fy.activated', tableName: 'financial_years', recordId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/financial-years/:id/activate', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════ Dropdowns ═══════════ */

router.put('/dropdowns', async (req, res) => {
  try {
    const { key, values } = req.body;
    const val = JSON.stringify(values);
    await pool.query(
      `INSERT INTO admin_settings (category,key_name,value) VALUES ('dropdown',?,?)
       ON DUPLICATE KEY UPDATE value=?`,
      [key, val, val]
    );
    logAudit({ ...auditCtx(req), action: 'dropdown.updated', tableName: 'admin_settings', recordName: key });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/dropdowns', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════ Role Permissions ═══════════ */

router.put('/role-perms', async (req, res) => {
  try {
    const { role, perms } = req.body;
    const val = JSON.stringify(perms);
    await pool.query(
      `INSERT INTO admin_settings (category,key_name,value) VALUES ('role_perm',?,?)
       ON DUPLICATE KEY UPDATE value=?`,
      [role, val, val]
    );
    logAudit({ ...auditCtx(req), action: 'role_perms.updated', tableName: 'admin_settings', recordName: role });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/role-perms', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════ General Settings ═══════════ */

router.put('/settings', async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      const val = JSON.stringify(value);
      await pool.query(
        `INSERT INTO admin_settings (category,key_name,value) VALUES ('general',?,?)
         ON DUPLICATE KEY UPDATE value=?`,
        [key, val, val]
      );
    }
    logAudit({ ...auditCtx(req), action: 'settings.updated', tableName: 'admin_settings', newValue: req.body });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /admin/settings', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
