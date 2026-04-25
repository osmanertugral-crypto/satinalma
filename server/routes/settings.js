const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');
const { testConnection, resetPool } = require('../utils/tiger3');
const scheduler = require('../utils/scheduler');

router.use(authenticate);

// Ayarları oku (şifreyi maskele)
router.get('/db-connection', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM db_settings').all();
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({
    server:   s.tiger3_server   || '',
    database: s.tiger3_database || '',
    user:     s.tiger3_user     || '',
    password: s.tiger3_password ? '••••••••' : '',
    port:     s.tiger3_port     || '1433',
    hasPassword: !!(s.tiger3_password),
  });
});

// Ayarları güncelle (admin only)
router.put('/db-connection', authorize('admin'), (req, res) => {
  const { server, database, user, password, port } = req.body;
  const db = getDb();
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO db_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
  );
  if (server   !== undefined) upsert.run('tiger3_server',   server);
  if (database !== undefined) upsert.run('tiger3_database', database);
  if (user     !== undefined) upsert.run('tiger3_user',     user);
  if (password !== undefined && password !== '••••••••') upsert.run('tiger3_password', password);
  if (port     !== undefined) upsert.run('tiger3_port',     String(port));

  resetPool(); // Eski bağlantıyı sıfırla
  res.json({ success: true, message: 'Bağlantı ayarları güncellendi' });
});

// Bağlantıyı test et
router.post('/db-connection/test', authorize('admin'), async (req, res) => {
  const { server, database, user, password, port } = req.body;
  let settings = null;

  // Form'dan gelen değerler varsa onları kullan, yoksa kayıtlı ayarları kullan
  if (server && database && user) {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM db_settings').all();
    const saved = Object.fromEntries(rows.map(r => [r.key, r.value]));
    settings = {
      server:   server   || saved.tiger3_server,
      database: database || saved.tiger3_database,
      user:     user     || saved.tiger3_user,
      password: (password && password !== '••••••••') ? password : saved.tiger3_password,
      port:     parseInt(port || saved.tiger3_port || '1433', 10),
    };
  }

  const result = await testConnection(settings);
  res.json(result);
});

// Zamanlayıcı ayarlarını oku
router.get('/scheduler', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM db_settings').all();
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({
    enabled:          s.auto_refresh_enabled  === '1',
    interval:         parseInt(s.auto_refresh_interval || '60', 10),
    lastRefreshAt:    s.last_refresh_at     || null,
    lastRefreshStatus: s.last_refresh_status || null,
  });
});

// Zamanlayıcı ayarlarını güncelle (admin only)
router.put('/scheduler', authorize('admin'), (req, res) => {
  const { enabled, interval } = req.body;
  const db = getDb();
  const upsert = db.prepare(
    'INSERT OR REPLACE INTO db_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
  );
  if (enabled  !== undefined) upsert.run('auto_refresh_enabled',  enabled ? '1' : '0');
  if (interval !== undefined) upsert.run('auto_refresh_interval', String(interval));

  scheduler.restart();
  res.json({ success: true, message: 'Zamanlayıcı ayarları güncellendi' });
});

// Tüm veriyi manuel güncelle
router.post('/sync-now', authorize('admin'), async (req, res) => {
  try {
    // Async başlat ama hemen cevap ver
    scheduler.syncAll().catch(err => console.error('Manuel sync hatası:', err));
    res.json({ success: true, message: 'Güncelleme başlatıldı' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Son senkronizasyon durumunu getir
router.get('/sync-status', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT key, value FROM db_settings WHERE key IN (\'last_refresh_at\', \'last_refresh_status\', \'auto_refresh_enabled\', \'auto_refresh_interval\')'
  ).all();
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({
    lastRefreshAt:     s.last_refresh_at      || null,
    lastRefreshStatus: s.last_refresh_status  || null,
    enabled:           s.auto_refresh_enabled === '1',
    interval:          parseInt(s.auto_refresh_interval || '60', 10),
    isRunning:         scheduler.isRunning(),
  });
});

module.exports = router;
