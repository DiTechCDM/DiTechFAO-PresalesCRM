import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool, { logAudit } from '../db.js';

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [rows] = await pool.query(
      `SELECT u.*, r.name AS rep_name
       FROM users u LEFT JOIN reps r ON r.id = u.linked_rep_id
       WHERE u.email = ?`,
      [email.trim().toLowerCase()]
    );
    if (!rows.length) return res.status(401).json({ error: 'No account found for that email' });

    const user = rows[0];
    if (user.status !== 'active') return res.status(403).json({ error: 'Account suspended — contact admin' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password' });

    // Resolve permissions: per-user override or role default
    let perms = {};
    if (user.perms) {
      perms = typeof user.perms === 'string' ? JSON.parse(user.perms) : user.perms;
    } else {
      const [rp] = await pool.query(
        "SELECT value FROM admin_settings WHERE category='role_perm' AND key_name=?",
        [user.role]
      );
      if (rp.length) perms = JSON.parse(rp[0].value);
    }

    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });

    // Audit: login
    logAudit({
      userId: user.id, userName: user.name, userRole: user.role,
      action: 'user.login', tableName: 'users', recordId: user.id, recordName: user.name,
      ip: req.headers['x-forwarded-for'] || req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        linkedRep: user.rep_name || '',
        perms,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
