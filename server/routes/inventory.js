const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'SATINALMA - STOK RAPORU.xlsx');
const SHEET_NAME = 'AA_KUMULATIF_STOK_RAPORU_123_BU';

// GET /api/inventory
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT i.*, p.name as product_name, p.code, p.unit, p.min_stock_level, c.name as category_name
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    ORDER BY p.name
  `).all();
  // Düşük stok uyarısı işaretle
  const result = rows.map(r => ({ ...r, low_stock: r.quantity <= r.min_stock_level }));
  res.json(result);
});

// GET /api/inventory/transactions
router.get('/transactions', (req, res) => {
  const db = getDb();
  const { product_id } = req.query;
  let query = `SELECT it.*, p.name as product_name, p.code, u.name as created_by_name
    FROM inventory_transactions it JOIN products p ON p.id = it.product_id
    LEFT JOIN users u ON u.id = it.created_by WHERE 1=1`;
  const params = [];
  if (product_id) { query += ' AND it.product_id = ?'; params.push(product_id); }
  query += ' ORDER BY it.created_at DESC LIMIT 200';
  res.json(db.prepare(query).all(...params));
});

// POST /api/inventory/transaction  — Manuel giriş/çıkış
router.post('/transaction', authorize('admin', 'user'), (req, res) => {
  const { product_id, type, quantity, reference, notes } = req.body;
  if (!product_id || !type || !quantity) return res.status(400).json({ error: 'Ürün, tip ve miktar gerekli' });

  const db = getDb();
  const id = uuidv4();
  const qty = parseFloat(quantity);

  const inv = db.prepare('SELECT * FROM inventory WHERE product_id = ?').get(product_id);
  if (!inv) return res.status(404).json({ error: 'Envanter kaydı bulunamadı' });

  const newQty = type === 'in' ? inv.quantity + qty
    : type === 'out' ? inv.quantity - qty
    : qty; // adjustment = mutlak miktar

  if (newQty < 0) return res.status(400).json({ error: 'Stok miktarı negatif olamaz' });

  db.transaction(() => {
    db.prepare(`UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE product_id = ?`).run(newQty, product_id);
    db.prepare('INSERT INTO inventory_transactions (id, product_id, type, quantity, reference, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, product_id, type, qty, reference || null, notes || null, req.user.id);
  })();

  res.status(201).json({ message: 'İşlem kaydedildi', new_quantity: newQty });
});

// POST /api/inventory/sync-excel — Excel'den stok adetlerini güncelle
router.post('/sync-excel', authorize('admin', 'user'), (req, res) => {
  try {
    if (!fs.existsSync(EXCEL_PATH)) {
      return res.status(404).json({ error: 'Excel dosyası bulunamadı' });
    }

    const wb = XLSX.readFile(EXCEL_PATH);
    if (!wb.SheetNames.includes(SHEET_NAME)) {
      return res.status(400).json({ error: `Sheet bulunamadı: ${SHEET_NAME}` });
    }

    const ws = wb.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (rows.length < 2) {
      return res.status(400).json({ error: 'Excel dosyası boş' });
    }

    const db = getDb();

    // Mevcut ürünleri code → id eşle
    const productMap = {};
    db.prepare('SELECT id, code FROM products').all().forEach(p => { productMap[p.code] = p.id; });

    let updated = 0, skipped = 0, created = 0;

    const updateInv = db.prepare(`UPDATE inventory SET quantity = ?, updated_at = datetime('now') WHERE product_id = ?`);
    const insertInv = db.prepare(`INSERT OR IGNORE INTO inventory (id, product_id, quantity) VALUES (?, ?, ?)`);

    db.transaction(() => {
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const kod = String(r[0] || '').trim();
        if (!kod) continue;

        const productId = productMap[kod];
        if (!productId) { skipped++; continue; }

        // Toplam stok = Gebze + E-Ticaret + Showroom
        const totalStock = (+r[2] || 0) + (+r[3] || 0) + (+r[4] || 0);

        const existing = db.prepare('SELECT product_id FROM inventory WHERE product_id = ?').get(productId);
        if (existing) {
          updateInv.run(totalStock, productId);
          updated++;
        } else {
          insertInv.run(uuidv4(), productId, totalStock);
          created++;
        }
      }
    })();

    res.json({
      success: true,
      message: `Stok güncelleme tamamlandı`,
      updated,
      created,
      skipped,
      total: rows.length - 1
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
