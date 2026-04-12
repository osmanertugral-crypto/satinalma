const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');
const { normTr } = require('../utils/searchUtils');
const { getExcelProducts, getExcelProductById, getExcelProductStats } = require('../utils/excelPurchaseFallback');

const router = express.Router();
router.use(authenticate);

// --- KATEGORİLER ---
router.get('/categories', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY name').all());
});

router.post('/categories', authorize('admin', 'user'), (req, res) => {
  const { name, parent_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Kategori adı gerekli' });
  const id = uuidv4();
  const db = getDb();
  db.prepare('INSERT INTO categories (id, name, parent_id) VALUES (?, ?, ?)').run(id, name, parent_id || null);
  res.status(201).json({ id, name, parent_id: parent_id || null });
});

router.put('/categories/:id', authorize('admin', 'user'), (req, res) => {
  const { name, parent_id } = req.body;
  const db = getDb();
  db.prepare('UPDATE categories SET name = ?, parent_id = ? WHERE id = ?').run(name, parent_id || null, req.params.id);
  res.json({ message: 'Güncellendi' });
});

router.delete('/categories/:id', authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Silindi' });
});

// --- ÜRÜNLER ---
router.get('/', (req, res) => {
  const db = getDb();
  const { search, category_id, active } = req.query;
  let query = `SELECT p.*, c.name as category_name,
    ROUND(COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0), 2) as stock,
    ROUND(COALESCE(ws.gebze_stok, 0), 2) as gebze_stok,
    ROUND(COALESCE(ws.eticaret_stok, 0), 2) as eticaret_stok,
    ROUND(COALESCE(ws.showroom_stok, 0), 2) as showroom_stok,
    last_po.unit_price as last_price,
    last_po.currency as last_currency,
    last_po.order_date as last_order_date,
    last_po.po_id as last_po_id,
    last_po.po_number as last_po_number
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN warehouse_stock ws ON ws.stok_kodu = p.code
    LEFT JOIN (
      SELECT poi.product_id, poi.unit_price, po.currency, po.order_date, po.id as po_id, po.po_number,
        ROW_NUMBER() OVER (PARTITION BY poi.product_id ORDER BY po.order_date DESC, po.created_at DESC) as rn
      FROM po_items poi
      JOIN purchase_orders po ON po.id = poi.po_id
      WHERE po.status != 'cancelled'
    ) last_po ON last_po.product_id = p.id AND last_po.rn = 1
    WHERE 1=1`;
  const params = [];
  if (search) { const ns = normTr(search); query += ' AND (norm(p.name) LIKE ? OR norm(p.code) LIKE ?)'; params.push(`%${ns}%`, `%${ns}%`); }
  if (category_id) { query += ' AND p.category_id = ?'; params.push(category_id); }
  if (active !== undefined) { query += ' AND p.active = ?'; params.push(active === 'true' ? 1 : 0); }
  query += ' ORDER BY p.name';
  const rows = db.prepare(query).all(...params);
  if (rows.length > 0) return res.json(rows);
  return res.json(getExcelProducts({ search }));
});

// --- ÜRÜN İSTATİSTİKLERİ ---
router.get('/stats/charts', (req, res) => {
  const db = getDb();
  const { year } = req.query;
  const filterYear = year ? parseInt(year) : new Date().getFullYear();
  const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  if (productCount === 0) {
    return res.json(getExcelProductStats(filterYear));
  }

  // 1) Devir hızı en yüksek ürünler (toplam sipariş miktarı / ortalama stok)
  // Sipariş miktarı yüksek + stok düşük = devir hızı yüksek
  const turnover = db.prepare(`
    SELECT p.id, p.code, p.name, p.unit,
      COALESCE(SUM(poi.quantity), 0) as toplam_miktar,
      COUNT(DISTINCT po.id) as siparis_sayisi,
      ROUND(COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0), 2) as mevcut_stok,
      CASE 
        WHEN (COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0)) > 0 
        THEN ROUND(COALESCE(SUM(poi.quantity), 0) / (COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0)), 2)
        ELSE COALESCE(SUM(poi.quantity), 0)
      END as devir_hizi
    FROM products p
    JOIN po_items poi ON poi.product_id = p.id
    JOIN purchase_orders po ON po.id = poi.po_id AND po.status != 'cancelled'
    LEFT JOIN warehouse_stock ws ON ws.stok_kodu = p.code
    WHERE strftime('%Y', po.order_date) = ?
    GROUP BY p.id
    HAVING toplam_miktar > 0
    ORDER BY devir_hizi DESC
    LIMIT 15
  `).all(String(filterYear));

  // 2) Kategoriye göre dağılım (toplam tutar)
  const categoryDist = db.prepare(`
    SELECT COALESCE(c.name, 'Kategorisiz') as category,
      COUNT(DISTINCT p.id) as urun_sayisi,
      COALESCE(SUM(poi.quantity * poi.unit_price), 0) as toplam_tutar
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN po_items poi ON poi.product_id = p.id
    LEFT JOIN purchase_orders po ON po.id = poi.po_id AND po.status != 'cancelled' AND strftime('%Y', po.order_date) = ?
    GROUP BY COALESCE(c.name, 'Kategorisiz')
    HAVING urun_sayisi > 0
    ORDER BY toplam_tutar DESC
  `).all(String(filterYear));

  // 3) Aylık satınalma miktar ve tutar
  const monthly = db.prepare(`
    SELECT 
      CAST(strftime('%m', po.order_date) AS INTEGER) as month,
      COUNT(DISTINCT poi.product_id) as urun_cesidi,
      ROUND(SUM(poi.quantity * poi.unit_price), 2) as toplam_tutar,
      ROUND(SUM(poi.quantity), 2) as toplam_miktar
    FROM po_items poi
    JOIN purchase_orders po ON po.id = poi.po_id AND po.status != 'cancelled'
    WHERE strftime('%Y', po.order_date) = ?
    GROUP BY strftime('%m', po.order_date)
    ORDER BY month
  `).all(String(filterYear));

  // 4) Stok durumu özeti
  const stockSummary = db.prepare(`
    SELECT 
      COUNT(*) as toplam_urun,
      SUM(CASE WHEN ROUND(COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0), 2) <= p.min_stock_level THEN 1 ELSE 0 END) as kritik_stok,
      SUM(CASE WHEN ROUND(COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0), 2) = 0 THEN 1 ELSE 0 END) as stoksuz,
      SUM(CASE WHEN ROUND(COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0), 2) > p.min_stock_level THEN 1 ELSE 0 END) as yeterli_stok
    FROM products p
    LEFT JOIN warehouse_stock ws ON ws.stok_kodu = p.code
    WHERE p.active = 1
  `).get();

  // 5) En çok sipariş edilen ürünler (tutara göre)
  const topByAmount = db.prepare(`
    SELECT p.id, p.code, p.name,
      ROUND(SUM(poi.quantity * poi.unit_price), 2) as toplam_tutar,
      ROUND(SUM(poi.quantity), 2) as toplam_miktar,
      COUNT(DISTINCT po.id) as siparis_sayisi
    FROM products p
    JOIN po_items poi ON poi.product_id = p.id
    JOIN purchase_orders po ON po.id = poi.po_id AND po.status != 'cancelled'
    WHERE strftime('%Y', po.order_date) = ?
    GROUP BY p.id
    ORDER BY toplam_tutar DESC
    LIMIT 10
  `).all(String(filterYear));

  // 6) Fiyat değişim trendi (son 12 ayda en çok fiyat değişen ürünler)
  const priceChanges = db.prepare(`
    SELECT p.id, p.code, p.name,
      MIN(poi.unit_price) as min_fiyat,
      MAX(poi.unit_price) as max_fiyat,
      ROUND((MAX(poi.unit_price) - MIN(poi.unit_price)) / NULLIF(MIN(poi.unit_price), 0) * 100, 1) as degisim_yuzde,
      COUNT(DISTINCT poi.unit_price) as farkli_fiyat_sayisi
    FROM products p
    JOIN po_items poi ON poi.product_id = p.id
    JOIN purchase_orders po ON po.id = poi.po_id AND po.status != 'cancelled'
    WHERE strftime('%Y', po.order_date) = ?
    GROUP BY p.id
    HAVING farkli_fiyat_sayisi > 1
    ORDER BY degisim_yuzde DESC
    LIMIT 10
  `).all(String(filterYear));

  res.json({ turnover, categoryDist, monthly, stockSummary, topByAmount, priceChanges });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare(`
    SELECT p.*, c.name as category_name,
    ROUND(COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0), 2) as stock
    FROM products p LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN warehouse_stock ws ON ws.stok_kodu = p.code
    WHERE p.id = ?
  `).get(req.params.id);
  if (!product) {
    const fallback = getExcelProductById(req.params.id);
    if (!fallback) return res.status(404).json({ error: 'Ürün bulunamadı' });
    return res.json({ ...fallback, suppliers: [], prices: [] });
  }

  const suppliers = db.prepare(`
    SELECT sp.*, s.name as supplier_name, s.email as supplier_email
    FROM supplier_products sp JOIN suppliers s ON s.id = sp.supplier_id WHERE sp.product_id = ?
  `).all(req.params.id);

  const prices = db.prepare(`
    SELECT ph.*, s.name as supplier_name
    FROM price_history ph JOIN suppliers s ON s.id = ph.supplier_id
    WHERE ph.product_id = ? ORDER BY ph.price_date DESC LIMIT 50
  `).all(req.params.id);

  res.json({ ...product, suppliers, prices });
});

router.post('/', authorize('admin', 'user'), (req, res) => {
  const { code, name, category_id, unit, min_stock_level, description } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Kod ve ad gerekli' });
  const id = uuidv4();
  const db = getDb();
  try {
    db.prepare('INSERT INTO products (id, code, name, category_id, unit, min_stock_level, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, code, name, category_id || null, unit || 'adet', min_stock_level || 0, description || null);
    // Envanter kaydı başlat
    db.prepare('INSERT INTO inventory (id, product_id, quantity) VALUES (?, ?, 0)').run(uuidv4(), id);
    res.status(201).json(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Bu ürün kodu zaten mevcut' });
    throw e;
  }
});

router.put('/:id', authorize('admin', 'user'), (req, res) => {
  const { code, name, category_id, unit, min_stock_level, description, active } = req.body;
  const db = getDb();
  db.prepare(`UPDATE products SET code=?, name=?, category_id=?, unit=?, min_stock_level=?, description=?, active=?, updated_at=datetime('now') WHERE id=?`)
    .run(code, name, category_id || null, unit || 'adet', min_stock_level || 0, description || null, active !== undefined ? (active ? 1 : 0) : 1, req.params.id);
  res.json(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'Ürün silindi' });
});

module.exports = router;
