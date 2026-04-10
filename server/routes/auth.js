const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre gerekli' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email.toLowerCase().trim());
  if (!user) {
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'E-posta veya şifre hatalı' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  const allowedPages = user.allowed_pages ? JSON.parse(user.allowed_pages) : null;

  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, allowed_pages: allowedPages }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role, created_at, allowed_pages FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  res.json({
    ...user,
    allowed_pages: user.allowed_pages ? JSON.parse(user.allowed_pages) : null,
  });
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Geçerli şifre bilgileri girin (yeni şifre min. 6 karakter)' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Mevcut şifre hatalı' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Şifre değiştirildi' });
});

module.exports = router;
