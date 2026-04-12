const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');
const { normTr } = require('../utils/searchUtils');
const { getExcelSuppliers, getExcelSupplierStats, getExcelSupplierPanelDetail } = require('../utils/excelPurchaseFallback');

const router = express.Router();
router.use(authenticate);

// GET /api/suppliers
router.get('/', (req, res) => {
  const db = getDb();
  const { search, active, year, month } = req.query;
  const filterYear = year ? parseInt(year) : new Date().getFullYear();
  let dateFrom, dateTo;
  if (month) {
    const m = parseInt(month);
    dateFrom = `${filterYear}-${String(m).padStart(2, '0')}-01`;
    dateTo = m === 12 ? `${filterYear + 1}-01-01` : `${filterYear}-${String(m + 1).padStart(2, '0')}-01`;
  } else {
    dateFrom = `${filterYear}-01-01`;
    dateTo = `${filterYear + 1}-01-01`;
  }
  let query = `SELECT s.*,
    COALESCE(po_stats.period_total, 0) as year_total_amount,
    COALESCE(po_stats.order_count, 0) as order_count
    FROM suppliers s
    LEFT JOIN (
      SELECT supplier_id,
        SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END) as period_total,
        COUNT(CASE WHEN status != 'cancelled' THEN 1 END) as order_count
      FROM purchase_orders
      WHERE order_date >= '${dateFrom}' AND order_date < '${dateTo}'
      GROUP BY supplier_id
    ) po_stats ON po_stats.supplier_id = s.id
    WHERE 1=1`;
  const params = [];
  if (search) { const ns = normTr(search); query += ' AND (norm(s.name) LIKE ? OR norm(s.contact_name) LIKE ? OR s.email LIKE ?)'; params.push(`%${ns}%`, `%${ns}%`, `%${search}%`); }
  if (active !== undefined) { query += ' AND s.active = ?'; params.push(active === 'true' ? 1 : 0); }
  query += ' ORDER BY s.name';
  const sqlRows = db.prepare(query).all(...params);
  if (sqlRows.length > 0) {
    return res.json(sqlRows);
  }

  const filterMonth = month ? parseInt(month, 10) : null;
  const fallback = getExcelSuppliers({ search, active, year: filterYear, month: filterMonth });
  return res.json(fallback);
});

// GET /api/suppliers/:id/panel-detail
router.get('/:id/panel-detail', (req, res) => {
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (supplier) {
    const products = db.prepare(`
      SELECT sp.*, p.code, p.name, p.unit, c.name as category_name
      FROM supplier_products sp
      JOIN products p ON p.id = sp.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE sp.supplier_id = ?
      ORDER BY p.name
    `).all(req.params.id);

    const orders = db.prepare(`
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      WHERE po.supplier_id = ?
      ORDER BY po.order_date DESC
    `).all(req.params.id);

    return res.json({ ...supplier, products, orders });
  }

  const fallback = getExcelSupplierPanelDetail(req.params.id);
  if (!fallback) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  return res.json(fallback);
});

// GET /api/suppliers/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Tedarikçi bulunamadı' });
  
  const products = db.prepare(`
    SELECT sp.*, p.code, p.name, p.unit, c.name as category_name
    FROM supplier_products sp
    JOIN products p ON p.id = sp.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE sp.supplier_id = ?
    ORDER BY p.name
  `).all(req.params.id);

  res.json({ ...supplier, products });
});

// POST /api/suppliers
router.post('/', authorize('admin', 'user'), (req, res) => {
  const { name, contact_name, email, phone, address, city, country, tax_number, tax_office, payment_terms, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Tedarikçi adı gerekli' });
  const id = uuidv4();
  const db = getDb();
  db.prepare(`INSERT INTO suppliers (id, name, contact_name, email, phone, address, city, country, tax_number, tax_office, payment_terms, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, contact_name || null, email || null, phone || null, address || null, city || null, country || 'Türkiye', tax_number || null, tax_office || null, payment_terms || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id));
});

// PUT /api/suppliers/:id
router.put('/:id', authorize('admin', 'user'), (req, res) => {
  const { name, contact_name, email, phone, address, city, country, tax_number, tax_office, payment_terms, notes, active, rating } = req.body;
  const db = getDb();
  db.prepare(`UPDATE suppliers SET name=?, contact_name=?, email=?, phone=?, address=?, city=?, country=?, tax_number=?, tax_office=?, payment_terms=?, notes=?, active=?, rating=?, updated_at=datetime('now') WHERE id=?`
  ).run(name, contact_name || null, email || null, phone || null, address || null, city || null, country || 'Türkiye', tax_number || null, tax_office || null, payment_terms || null, notes || null, active !== undefined ? (active ? 1 : 0) : 1, rating || null, req.params.id);
  res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id));
});

// PATCH /api/suppliers/:id/rating
router.patch('/:id/rating', authorize('admin', 'user'), (req, res) => {
  const { rating } = req.body;
  const db = getDb();
  db.prepare("UPDATE suppliers SET rating = ?, updated_at = datetime('now') WHERE id = ?").run(rating || null, req.params.id);
  res.json({ ok: true });
});

// PATCH /api/suppliers/:id/toggle-active
router.patch('/:id/toggle-active', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  db.prepare("UPDATE suppliers SET active = CASE WHEN active = 1 THEN 0 ELSE 1 END, updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/suppliers/:id
router.delete('/:id', authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Tedarikçi silindi' });
});

// GET /api/suppliers/stats/charts — Grafik verileri
router.get('/stats/charts', (req, res) => {
  const db = getDb();
  const { year, month } = req.query;
  const filterYear = year ? parseInt(year) : new Date().getFullYear();
  const filterMonth = month ? parseInt(month) : null;
  const hasMonth = Number.isInteger(filterMonth) && filterMonth >= 1 && filterMonth <= 12;

  const timeWhere = hasMonth
    ? `strftime('%Y', order_date) = ? AND strftime('%m', order_date) = ?`
    : `strftime('%Y', order_date) = ?`;
  const timeParams = hasMonth
    ? [String(filterYear), String(filterMonth).padStart(2, '0')]
    : [String(filterYear)];

  const poAmountExpr = `COALESCE(po_items_total.toplam_tutar, po.total_amount, 0)`;

  // Aylık toplam tutar ve sipariş sayısı
  const monthly = db.prepare(`
    SELECT 
      CAST(strftime('%m', po.order_date) AS INTEGER) as month,
      SUM(CASE WHEN po.status != 'cancelled' THEN ${poAmountExpr} ELSE 0 END) as toplam_tutar,
      COUNT(CASE WHEN po.status != 'cancelled' THEN 1 END) as siparis_sayisi,
      COUNT(DISTINCT CASE WHEN po.status != 'cancelled' THEN po.supplier_id END) as tedarikci_sayisi
    FROM purchase_orders po
    LEFT JOIN (
      SELECT po_id, SUM(quantity * unit_price) as toplam_tutar
      FROM po_items
      GROUP BY po_id
    ) po_items_total ON po_items_total.po_id = po.id
    WHERE ${timeWhere.replace(/order_date/g, 'po.order_date')}
    GROUP BY strftime('%m', po.order_date)
    ORDER BY month
  `).all(...timeParams);

  // Top 10 tedarikçi (tutara göre)
  const topSuppliers = db.prepare(`
    SELECT s.name, s.id,
      SUM(CASE WHEN po.status != 'cancelled' THEN ${poAmountExpr} ELSE 0 END) as toplam_tutar,
      COUNT(CASE WHEN po.status != 'cancelled' THEN 1 END) as siparis_sayisi
    FROM purchase_orders po
    LEFT JOIN (
      SELECT po_id, SUM(quantity * unit_price) as toplam_tutar
      FROM po_items
      GROUP BY po_id
    ) po_items_total ON po_items_total.po_id = po.id
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE ${timeWhere.replace(/order_date/g, 'po.order_date')}
    GROUP BY po.supplier_id
    HAVING toplam_tutar > 0
    ORDER BY toplam_tutar DESC
    LIMIT 10
  `).all(...timeParams);

  // Durum dağılımı
  const statusDist = db.prepare(`
    SELECT po.status as status,
      COUNT(*) as sayi,
      SUM(${poAmountExpr}) as tutar
    FROM purchase_orders po
    LEFT JOIN (
      SELECT po_id, SUM(quantity * unit_price) as toplam_tutar
      FROM po_items
      GROUP BY po_id
    ) po_items_total ON po_items_total.po_id = po.id
    WHERE ${timeWhere.replace(/order_date/g, 'po.order_date')}
    GROUP BY po.status
  `).all(...timeParams);

  // Yıllık toplamlar
  const yearTotal = db.prepare(`
    SELECT 
      SUM(CASE WHEN po.status != 'cancelled' THEN ${poAmountExpr} ELSE 0 END) as toplam_tutar,
      COUNT(CASE WHEN po.status != 'cancelled' THEN 1 END) as toplam_siparis,
      COUNT(DISTINCT CASE WHEN po.status != 'cancelled' THEN po.supplier_id END) as aktif_tedarikci,
      COUNT(CASE WHEN po.status NOT IN ('kapanan', 'cancelled') THEN 1 END) as acik_siparis
    FROM purchase_orders po
    LEFT JOIN (
      SELECT po_id, SUM(quantity * unit_price) as toplam_tutar
      FROM po_items
      GROUP BY po_id
    ) po_items_total ON po_items_total.po_id = po.id
    WHERE ${timeWhere.replace(/order_date/g, 'po.order_date')}
  `).get(...timeParams);

  const sqlMonthly = monthly || [];
  const sqlTopSuppliers = topSuppliers || [];
  const sqlStatusDist = statusDist || [];
  const sqlYearTotal = yearTotal || { toplam_tutar: 0, toplam_siparis: 0, aktif_tedarikci: 0, acik_siparis: 0 };

  const hasSqlData =
    sqlMonthly.length > 0 ||
    sqlTopSuppliers.length > 0 ||
    (Number(sqlYearTotal.toplam_tutar) || 0) > 0 ||
    (Number(sqlYearTotal.toplam_siparis) || 0) > 0;

  if (!hasSqlData) {
    const fallback = getExcelSupplierStats({ year: filterYear, month: hasMonth ? filterMonth : null });
    return res.json({
      monthly: fallback.monthly,
      topSuppliers: fallback.topSuppliers,
      statusDist: fallback.statusDist,
      filter: { year: filterYear, month: hasMonth ? filterMonth : null },
      yearTotal: fallback.yearTotal,
    });
  }

  res.json({
    monthly: sqlMonthly,
    topSuppliers: sqlTopSuppliers,
    statusDist: sqlStatusDist,
    filter: { year: filterYear, month: hasMonth ? filterMonth : null },
    yearTotal: sqlYearTotal,
  });
});

// POST /api/suppliers/:id/products  — Ürün ilişkilendirme
router.post('/:id/products', authorize('admin', 'user'), (req, res) => {
  const { product_id, lead_time_days, is_preferred, notes } = req.body;
  if (!product_id) return res.status(400).json({ error: 'Ürün gerekli' });
  const id = uuidv4();
  const db = getDb();
  try {
    db.prepare('INSERT INTO supplier_products (id, supplier_id, product_id, lead_time_days, is_preferred, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, req.params.id, product_id, lead_time_days || 0, is_preferred ? 1 : 0, notes || null);
    res.status(201).json({ message: 'Ürün ilişkilendirildi' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Bu ürün zaten ekli' });
    throw e;
  }
});

// DELETE /api/suppliers/:id/products/:spId
router.delete('/:id/products/:spId', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM supplier_products WHERE id = ? AND supplier_id = ?').run(req.params.spId, req.params.id);
  res.json({ message: 'İlişki kaldırıldı' });
});

module.exports = router;
