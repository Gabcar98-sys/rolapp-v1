import { Router } from 'express';
import { createHash } from 'crypto';
import db from '../db/index.js';

const router = Router();

// Es red local — PIN con hash SHA-256, sin JWT (decisión heredada de la v0).
function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

function publicUser(row) {
  return { id: row.id, username: row.username, role: row.role };
}

// POST /api/auth/register  { username, pin, role }
router.post('/register', (req, res) => {
  const { username, pin, role } = req.body ?? {};
  if (!username || !pin || !role) {
    return res.status(400).json({ error: 'username, pin y role son obligatorios' });
  }
  if (role !== 'dm' && role !== 'player') {
    return res.status(400).json({ error: 'role debe ser "dm" o "player"' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'El usuario ya existe' });
  }

  const info = db
    .prepare('INSERT INTO users (username, pin_hash, role) VALUES (?, ?, ?)')
    .run(username, hashPin(pin), role);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

// POST /api/auth/login  { username, pin }
router.post('/login', (req, res) => {
  const { username, pin } = req.body ?? {};
  if (!username || !pin) {
    return res.status(400).json({ error: 'username y pin son obligatorios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || user.pin_hash !== hashPin(pin)) {
    return res.status(401).json({ error: 'Usuario o PIN incorrecto' });
  }

  res.json({ user: publicUser(user) });
});

export default router;
