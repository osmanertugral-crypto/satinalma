const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/users
router.get('/', authorize('admin'), (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, name, email, role, active, created_at, allowed_pages FROM users ORDER BY name').all();
  res.json(users.map(u => ({
    ...u,
    allowed_pages: u.allowed_pages ? JSON.parse(u.allowed_pages) : null,
  })));
});

// POST /api/users
router.post('/', authorize('admin'), (req, res) => {
  const bcrypt = require('bcryptjs');
  const { name, email, password, role, allowed_pages } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Tüm alanlar gerekli' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(400).json({ error: 'Bu e-posta zaten kayıtlı' });

  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 10);
  const pagesJson = allowed_pages && allowed_pages.length > 0 ? JSON.stringify(allowed_pages) : null;
  db.prepare('INSERT INTO users (id, name, email, password, role, allowed_pages) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, name, email.toLowerCase().trim(), hash, role, pagesJson
  );
  res.status(201).json({ id, name, email, role, active: 1, allowed_pages: allowed_pages || null });
});

// PUT /api/users/:id
router.put('/:id', authorize('admin'), (req, res) => {
  const { name, role, active, allowed_pages } = req.body;
  const db = getDb();
  const pagesJson = allowed_pages && allowed_pages.length > 0 ? JSON.stringify(allowed_pages) : null;
  db.prepare('UPDATE users SET name = ?, role = ?, active = ?, allowed_pages = ? WHERE id = ?').run(
    name, role, active ? 1 : 0, pagesJson, req.params.id
  );
  res.json({ message: 'Kullanıcı güncellendi' });
});

// PUT /api/users/:id/reset-password
router.put('/:id/reset-password', authorize('admin'), (req, res) => {
  const bcrypt = require('bcryptjs');
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Min. 6 karakter' });
  const hash = bcrypt.hashSync(newPassword, 10);
  const db = getDb();
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ message: 'Şifre sıfırlandı' });
});

// DELETE /api/users/:id
router.delete('/:id', authorize('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Kendinizi silemezsiniz' });
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Kullanıcı silindi' });
});

module.exports = router;
