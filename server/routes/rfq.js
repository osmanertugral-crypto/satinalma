const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function getNextRfqNumber(db) {
  const year = new Date().getFullYear();
  const last = db.prepare(`SELECT rfq_number FROM quotations WHERE rfq_number LIKE 'RFQ-${year}-%' ORDER BY rfq_number DESC LIMIT 1`).get();
  const seq = last ? parseInt(last.rfq_number.split('-')[2]) + 1 : 1;
  return `RFQ-${year}-${String(seq).padStart(4, '0')}`;
}

// GET /api/rfq
router.get('/', (req, res) => {
  const db = getDb();
  const rfqs = db.prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM quotation_suppliers qs WHERE qs.quotation_id = q.id) as supplier_count,
      (SELECT COUNT(*) FROM quotation_items qi WHERE qi.quotation_id = q.id) as item_count
    FROM quotations q
    ORDER BY q.created_at DESC
  `).all();
  res.json(rfqs);
});

// GET /api/rfq/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const rfq = db.prepare('SELECT * FROM quotations WHERE id = ?').get(req.params.id);
  if (!rfq) return res.status(404).json({ error: 'Bulunamadı' });

  const items = db.prepare(`SELECT qi.*, p.name as product_name, p.code, p.unit FROM quotation_items qi JOIN products p ON p.id = qi.product_id WHERE qi.quotation_id = ?`).all(req.params.id);
  const suppliers = db.prepare(`SELECT qs.*, s.name as supplier_name FROM quotation_suppliers qs JOIN suppliers s ON s.id = qs.supplier_id WHERE qs.quotation_id = ?`).all(req.params.id);
  const responses = db.prepare(`SELECT qr.*, s.name as supplier_name, p.name as product_name FROM quotation_responses qr JOIN suppliers s ON s.id = qr.supplier_id JOIN products p ON p.id = qr.product_id WHERE qr.quotation_id = ?`).all(req.params.id);

  res.json({ ...rfq, items, suppliers, responses });
});

// POST /api/rfq
router.post('/', authorize('admin', 'user'), (req, res) => {
  const { title, deadline, notes, supplier_ids, items } = req.body;
  if (!title || !supplier_ids?.length || !items?.length) {
    return res.status(400).json({ error: 'Başlık, tedarikçi ve kalemler gerekli' });
  }
  const db = getDb();
  const id = uuidv4();
  const rfq_number = getNextRfqNumber(db);

  db.transaction(() => {
    db.prepare('INSERT INTO quotations (id, rfq_number, title, deadline, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, rfq_number, title, deadline || null, notes || null, req.user.id);
    for (const sid of supplier_ids) {
      db.prepare('INSERT INTO quotation_suppliers (id, quotation_id, supplier_id) VALUES (?, ?, ?)').run(uuidv4(), id, sid);
    }
    for (const item of items) {
      db.prepare('INSERT INTO quotation_items (id, quotation_id, product_id, quantity, notes) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), id, item.product_id, item.quantity, item.notes || null);
    }
  })();

  res.status(201).json({ id, rfq_number });
});

// POST /api/rfq/:id/responses  — Teklif yanıtı gir
router.post('/:id/responses', authorize('admin', 'user'), (req, res) => {
  const { supplier_id, product_id, unit_price, currency, lead_time_days, notes } = req.body;
  if (!supplier_id || !product_id) return res.status(400).json({ error: 'Tedarikçi ve ürün gerekli' });
  const db = getDb();
  const id = uuidv4();
  try {
    db.prepare(`INSERT INTO quotation_responses (id, quotation_id, supplier_id, product_id, unit_price, currency, lead_time_days, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(quotation_id, supplier_id, product_id)
      DO UPDATE SET unit_price=excluded.unit_price, currency=excluded.currency, lead_time_days=excluded.lead_time_days, notes=excluded.notes`)
      .run(id, req.params.id, supplier_id, product_id, unit_price ? parseFloat(unit_price) : null, currency || 'TRY', lead_time_days || null, notes || null);
    res.status(201).json({ message: 'Yanıt kaydedildi' });
  } catch (e) { throw e; }
});

// PUT /api/rfq/:id/status
router.put('/:id/status', authorize('admin', 'user'), (req, res) => {
  const { status } = req.body;
  const db = getDb();
  db.prepare(`UPDATE quotations SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, req.params.id);
  res.json({ message: 'Güncellendi' });
});

module.exports = router;
