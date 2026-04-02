import mysql from 'mysql2/promise';

// NOTE: dotenv is loaded in index.js BEFORE this module is imported.
// process.env.DB_* will be populated either by dotenv (local) or Hostinger env vars (production).

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'ditech',
  database: process.env.DB_NAME || 'ditech_fao',
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+05:30',
  dateStrings: true,
});

// Test DB connection at startup
pool.getConnection()
  .then(conn => { console.log('✓ MySQL connected to', process.env.DB_NAME); conn.release(); })
  .catch(err => console.error('✗ MySQL connection FAILED:', err.message, '| Host:', process.env.DB_HOST, '| DB:', process.env.DB_NAME, '| User:', process.env.DB_USER));

/** Get current datetime in IST format for MySQL (YYYY-MM-DD HH:MM:SS) */
export function nowIST() {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' });
}

/** Get current date in IST format (YYYY-MM-DD) */
export function todayIST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
}

/** Log an action to the audit_log table */
export async function logAudit({ userId, userName, userRole, action, tableName, recordId, recordName, oldValue, newValue, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, user_name, user_role, action, table_name, record_id, record_name, old_value, new_value, ip_address, user_agent, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [userId || null, userName || null, userRole || null, action,
       tableName || null, recordId || null, recordName || null,
       oldValue ? JSON.stringify(oldValue) : null,
       newValue ? JSON.stringify(newValue) : null,
       ip || null, userAgent || null, nowIST()]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

/** Extract audit context from an authenticated request */
export function auditCtx(req) {
  return {
    userId: req.user?.id,
    userName: req.user?.name || 'Unknown',
    userRole: req.user?.role,
    ip: req.headers?.['x-forwarded-for'] || req.ip,
    userAgent: req.headers?.['user-agent'],
  };
}

export default pool;
