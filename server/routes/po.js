const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function getNextPoNumber(db) {
  const year = new Date().getFullYear();
  const last = db.prepare(`SELECT po_number FROM purchase_orders WHERE po_number LIKE 'PO-${year}-%' ORDER BY po_number DESC LIMIT 1`).get();
  const seq = last ? parseInt(last.po_number.split('-')[2]) + 1 : 1;
  return `PO-${year}-${String(seq).padStart(4, '0')}`;
}

// GET /api/po
router.get('/', (req, res) => {
  const db = getDb();
  const { status, supplier_id } = req.query;
  let query = `SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE 1=1`;
  const params = [];
  if (status) { query += ' AND po.status = ?'; params.push(status); }
  if (supplier_id) { query += ' AND po.supplier_id = ?'; params.push(supplier_id); }
  query += ' ORDER BY po.created_at DESC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/po/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const po = db.prepare(`SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`).get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Sipariş bulunamadı' });
  const items = db.prepare(`
    SELECT poi.*, p.name as product_name, p.code as product_code, p.unit
    FROM po_items poi JOIN products p ON p.id = poi.product_id WHERE poi.po_id = ?
  `).all(req.params.id);
  const docs = db.prepare(`SELECT * FROM documents WHERE entity_type='po' AND entity_id=?`).all(req.params.id);
  res.json({ ...po, items, documents: docs });
});

// POST /api/po
router.post('/', authorize('admin', 'user'), (req, res) => {
  const { supplier_id, order_date, expected_date, currency, notes, items } = req.body;
  if (!supplier_id || !order_date || !items || items.length === 0) {
    return res.status(400).json({ error: 'Tedarikçi, tarih ve en az bir kalem gerekli' });
  }
  const db = getDb();
  const id = uuidv4();
  const po_number = getNextPoNumber(db);
  const total = items.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.unit_price)), 0);

  const insertPo = db.prepare(`INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, expected_date, currency, total_amount, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT INTO po_items (id, po_id, product_id, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?, ?)`);

  db.transaction(() => {
    insertPo.run(id, po_number, supplier_id, order_date, expected_date || null, currency || 'TRY', total, notes || null, req.user.id);
    for (const item of items) {
      insertItem.run(uuidv4(), id, item.product_id, parseFloat(item.quantity), parseFloat(item.unit_price), item.notes || null);
    }
  })();

  res.status(201).json({ id, po_number });
});

// PUT /api/po/:id/status
router.put('/:id/status', authorize('admin', 'user'), (req, res) => {
  const { status, delivery_date } = req.body;
  const db = getDb();
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Bulunamadı' });

  db.prepare(`UPDATE purchase_orders SET status=?, delivery_date=?, updated_at=datetime('now') WHERE id=?`)
    .run(status, delivery_date || null, req.params.id);

  // Teslim alındı → envanter güncelle
  if (status === 'delivered') {
    const items = db.prepare('SELECT * FROM po_items WHERE po_id = ?').all(req.params.id);
    const updateInv = db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE product_id = ?');
    const insertTx = db.prepare('INSERT INTO inventory_transactions (id, product_id, type, quantity, reference, created_by) VALUES (?, ?, ?, ?, ?, ?)');
    db.transaction(() => {
      for (const item of items) {
        updateInv.run(item.quantity, item.product_id);
        insertTx.run(uuidv4(), item.product_id, 'in', item.quantity, po.po_number, req.user.id);
      }
    })();
  }

  res.json({ message: 'Durum güncellendi' });
});

// DELETE /api/po/:id
router.delete('/:id', authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Sipariş silindi' });
});

module.exports = router;
