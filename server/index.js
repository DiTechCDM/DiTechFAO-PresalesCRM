import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server/ dir first (local dev), then project root
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import pool from './db.js';
import { verifyToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import firmRoutes from './routes/firms.js';
import callRoutes from './routes/calls.js';
import reminderRoutes from './routes/reminders.js';
import adminRoutes from './routes/admin.js';
import auditRoutes from './routes/audit.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Public
app.use('/api/auth', authRoutes);

// Protected
app.use('/api/firms', verifyToken, firmRoutes);
app.use('/api/calls', verifyToken, callRoutes);
app.use('/api/reminders', verifyToken, reminderRoutes);
app.use('/api/admin', verifyToken, adminRoutes);
app.use('/api/audit', verifyToken, auditRoutes);

// Health check — also tests DB + audit insert
app.get('/api/health', async (_req, res) => {
  const status = { ok: true, db: false, audit: false, env: { DB_HOST: process.env.DB_HOST, DB_NAME: process.env.DB_NAME, DB_USER: process.env.DB_USER } };
  try {
    const [r] = await pool.query('SELECT 1 AS ping');
    status.db = r[0]?.ping === 1;
  } catch (e) { status.db = false; status.dbError = e.message; }
  try {
    await pool.query(
      `INSERT INTO audit_log (user_name, user_role, action, table_name, record_name) VALUES (?,?,?,?,?)`,
      ['system', 'system', 'health.check', 'audit_log', 'Health check test']
    );
    status.audit = true;
  } catch (e) { status.audit = false; status.auditError = e.message; }
  res.json(status);
});

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DiTech FAO API running on http://localhost:${PORT}`));
