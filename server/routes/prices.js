const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/prices?product_id=&supplier_id=
router.get('/', (req, res) => {
  const db = getDb();
  const { product_id, supplier_id } = req.query;
  let query = `SELECT ph.*, s.name as supplier_name, p.name as product_name, p.unit
    FROM price_history ph
    JOIN suppliers s ON s.id = ph.supplier_id
    JOIN products p ON p.id = ph.product_id WHERE 1=1`;
  const params = [];
  if (product_id) { query += ' AND ph.product_id = ?'; params.push(product_id); }
  if (supplier_id) { query += ' AND ph.supplier_id = ?'; params.push(supplier_id); }
  query += ' ORDER BY ph.price_date DESC';
  res.json(db.prepare(query).all(...params));
});

// POST /api/prices
router.post('/', authorize('admin', 'user'), (req, res) => {
  const { supplier_id, product_id, price, currency, price_date, notes } = req.body;
  if (!supplier_id || !product_id || !price || !price_date) {
    return res.status(400).json({ error: 'Tedarikçi, ürün, fiyat ve tarih gerekli' });
  }
  const id = uuidv4();
  const db = getDb();
  db.prepare('INSERT INTO price_history (id, supplier_id, product_id, price, currency, price_date, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, supplier_id, product_id, parseFloat(price), currency || 'TRY', price_date, notes || null, req.user.id);

  // Fiyat artış uyarısı kontrolü
  checkPriceAlerts(db, product_id, supplier_id, parseFloat(price));

  res.status(201).json(db.prepare('SELECT * FROM price_history WHERE id = ?').get(id));
});

// DELETE /api/prices/:id
router.delete('/:id', authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM price_history WHERE id = ?').run(req.params.id);
  res.json({ message: 'Silindi' });
});

// GET /api/prices/alerts
router.get('/alerts', (req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT pa.*, p.name as product_name, p.code as product_code
    FROM price_alerts pa JOIN products p ON p.id = pa.product_id WHERE pa.active = 1
  `).all());
});

// POST /api/prices/alerts
router.post('/alerts', authorize('admin', 'user'), (req, res) => {
  const { product_id, threshold_percent } = req.body;
  if (!product_id || !threshold_percent) return res.status(400).json({ error: 'Ürün ve eşik yüzdesi gerekli' });
  const id = uuidv4();
  const db = getDb();
  db.prepare('INSERT INTO price_alerts (id, product_id, threshold_percent, created_by) VALUES (?, ?, ?, ?)').run(id, product_id, parseFloat(threshold_percent), req.user.id);
  res.status(201).json({ id, product_id, threshold_percent });
});

// DELETE /api/prices/alerts/:id
router.delete('/alerts/:id', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM price_alerts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Uyarı silindi' });
});

// GET /api/prices/triggered-alerts  — İhlal eden fiyat hareketleri
router.get('/triggered-alerts', (req, res) => {
  const db = getDb();
  const alerts = db.prepare(`
    SELECT pa.*, p.name as product_name, p.code as product_code
    FROM price_alerts pa JOIN products p ON p.id = pa.product_id WHERE pa.active = 1
  `).all();

  const results = [];
  for (const alert of alerts) {
    const rows = db.prepare(`
      SELECT price, price_date, supplier_id FROM price_history
      WHERE product_id = ? ORDER BY price_date DESC LIMIT 2
    `).all(alert.product_id);
    if (rows.length === 2) {
      const latest = rows[0];
      const prev = rows[1];
      if (prev.price > 0) {
        const change = ((latest.price - prev.price) / prev.price) * 100;
        if (change >= alert.threshold_percent) {
          const supplier = db.prepare('SELECT name FROM suppliers WHERE id = ?').get(latest.supplier_id);
          results.push({
            ...alert,
            latest_price: latest.price,
            prev_price: prev.price,
            change_percent: Math.round(change * 100) / 100,
            price_date: latest.price_date,
            supplier_name: supplier ? supplier.name : '-'
          });
        }
      }
    }
  }
  res.json(results);
});

function checkPriceAlerts(db, product_id, supplier_id, newPrice) {
  // Sadece loglama amaçlı — frontend /triggered-alerts endpoint'i kullanıyor
}

module.exports = router;
