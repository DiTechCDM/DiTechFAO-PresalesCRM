import { Router } from 'express';
import pool from '../db.js';

const router = Router();

/* ───── GET /api/audit — paginated audit log ───── */

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const action = req.query.action || '';
    const userId = req.query.userId || '';

    let where = '1=1';
    const params = [];

    if (action) { where += ' AND a.action LIKE ?'; params.push(`%${action}%`); }
    if (userId) { where += ' AND a.user_id = ?'; params.push(userId); }

    const [rows] = await pool.query(
      `SELECT a.* FROM audit_log a WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [countResult] = await pool.query(
      `SELECT COUNT(*) AS total FROM audit_log a WHERE ${where}`,
      params
    );

    res.json({ logs: rows, total: countResult[0].total });
  } catch (err) {
    console.error('GET /audit', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
