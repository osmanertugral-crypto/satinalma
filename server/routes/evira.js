const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');
const evira = require('../utils/evira');

const router = express.Router();
router.use(authenticate);

// GET /api/evira/inventory
router.get('/inventory', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT ambar_kodu, ambar_adi, stok_kodu, stok_adi, birim, miktar
    FROM evira_stock_cache
    ORDER BY ambar_adi, stok_adi
  `).all();

  const lastSync = db.prepare(
    'SELECT synced_at, status, message FROM evira_sync_log ORDER BY id DESC LIMIT 1'
  ).get();

  const ambars = [...new Map(
    rows.map(r => [r.ambar_kodu, { ambar_kodu: r.ambar_kodu, ambar_adi: r.ambar_adi }])
  ).values()].sort((a, b) => (a.ambar_adi || '').localeCompare(b.ambar_adi || '', 'tr'));

  res.json({
    rows,
    ambars,
    total_count: rows.length,
    synced_at: lastSync?.synced_at || null,
    sync_status: lastSync?.status || null,
  });
});

// POST /api/evira/sync
router.post('/sync', authorize('admin', 'user'), async (req, res) => {
  const db = getDb();
  try {
    const rows = await evira.query(`
      SELECT AMBAR_KODU, AMBAR_ADI, STOK_KODU, STOK_ADI, BIRIM, MIKTAR
      FROM dbo.DEPO_STOK_RAPORU_TUM_DEPOLAR
      WHERE MIKTAR > 0
    `);

    const insert = db.prepare(`
      INSERT INTO evira_stock_cache (ambar_kodu, ambar_adi, stok_kodu, stok_adi, birim, miktar)
      VALUES (@AMBAR_KODU, @AMBAR_ADI, @STOK_KODU, @STOK_ADI, @BIRIM, @MIKTAR)
    `);

    db.prepare('DELETE FROM evira_stock_cache').run();
    db.transaction(rs => { for (const r of rs) insert.run(r); })(rows);

    db.prepare(
      `INSERT INTO evira_sync_log (row_count, status, message) VALUES (?, 'success', ?)`
    ).run(rows.length, `${rows.length} satır güncellendi`);

    res.json({ success: true, count: rows.length, message: `${rows.length} satır yüklendi` });
  } catch (err) {
    db.prepare(
      `INSERT INTO evira_sync_log (row_count, status, message) VALUES (0, 'error', ?)`
    ).run(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/evira/sync/status
router.get('/sync/status', (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM evira_stock_cache').get().c;
  const last  = db.prepare('SELECT * FROM evira_sync_log ORDER BY id DESC LIMIT 1').get();
  res.json({ count, last_sync: last || null });
});

// GET /api/evira/connection
router.get('/connection', authorize('admin'), (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM db_settings WHERE key LIKE ?').all('evira_%');
  const s = Object.fromEntries(rows.map(r => [r.key.replace('evira_', ''), r.value]));
  res.json({
    server:      s.server   || '10.10.10.241',
    database:    s.database || 'EVIRA',
    user:        s.user     || 'webservices',
    hasPassword: !!(s.password),
    port:        s.port     || '1433',
  });
});

// PUT /api/evira/connection
router.put('/connection', authorize('admin'), (req, res) => {
  const db = getDb();
  const { server, database, user, password, port } = req.body || {};
  const upsert = db.prepare('INSERT OR REPLACE INTO db_settings (key, value, updated_at) VALUES (?, ?, datetime("now"))');
  if (server)   upsert.run('evira_server',   server);
  if (database) upsert.run('evira_database', database);
  if (user)     upsert.run('evira_user',     user);
  if (password) upsert.run('evira_password', password);
  if (port)     upsert.run('evira_port',     String(port));
  evira.resetPool();
  res.json({ success: true });
});

// POST /api/evira/test-connection
router.post('/test-connection', authorize('admin'), async (req, res) => {
  const { server, database, user, password, port } = req.body || {};
  const custom = server ? { server, database, user, password, port: parseInt(port || '1433', 10) } : null;
  const result = await evira.testConnection(custom);
  if (custom && result.success) evira.resetPool();
  res.json(result);
});

// GET /api/evira/tables — EVIRA veritabanındaki tablo ve view listesi (keşif için)
router.get('/tables', authorize('admin'), async (req, res) => {
  try {
    const rows = await evira.query(`
      SELECT TABLE_NAME, TABLE_TYPE
      FROM INFORMATION_SCHEMA.TABLES
      ORDER BY TABLE_TYPE, TABLE_NAME
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
