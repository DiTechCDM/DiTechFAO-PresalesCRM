import bcrypt from 'bcryptjs';
import pool from './db.js';

async function seed() {
  console.log('Hashing passwords and updating seed users …');

  const users = [
    { id: 'usr-admin',    password: 'admin123' },
    { id: 'usr-diksha',   password: 'diksha123' },
    { id: 'usr-sadichha', password: 'sadichha123' },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    const [result] = await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, u.id]);
    console.log(`  ${u.id} → ${result.affectedRows ? 'updated' : 'not found (run the SQL schema first)'}`);
  }

  console.log('Seed complete.');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
