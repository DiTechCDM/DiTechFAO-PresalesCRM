import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import { verifyToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import firmRoutes from './routes/firms.js';
import callRoutes from './routes/calls.js';
import reminderRoutes from './routes/reminders.js';
import adminRoutes from './routes/admin.js';

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

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`DiTech FAO API running on http://localhost:${PORT}`));
