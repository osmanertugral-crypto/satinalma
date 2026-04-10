const express = require('express');
const ExcelJS = require('exceljs');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// GET /api/reports/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const totalSuppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers WHERE active=1').get().c;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE active=1').get().c;
  const activePo = db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE status NOT IN ('delivered','cancelled')").get().c;
  const openRfq = db.prepare("SELECT COUNT(*) as c FROM quotations WHERE status='open'").get().c;
  const lowStock = db.prepare('SELECT COUNT(*) as c FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.quantity <= p.min_stock_level AND p.active=1').get().c;

  const recentPo = db.prepare(`SELECT po.po_number, po.status, po.total_amount, po.order_date, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id ORDER BY po.created_at DESC LIMIT 5`).all();

  // Kritik stok — min_stock_level > 0 olan envanterde eşiğe yakın veya altında olanlar
  const criticalStock = db.prepare(`
    SELECT p.code, p.name, p.unit, i.quantity, p.min_stock_level,
      ROUND((i.quantity * 100.0) / NULLIF(p.min_stock_level, 0), 0) as stock_pct
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    WHERE p.active = 1 AND p.min_stock_level > 0
    ORDER BY (i.quantity / NULLIF(p.min_stock_level, 0)) ASC
    LIMIT 10
  `).all();

  // Fiyat artış uyarıları
  const alerts = db.prepare(`SELECT pa.*, p.name as product_name, p.code FROM price_alerts pa JOIN products p ON p.id=pa.product_id WHERE pa.active=1`).all();
  const triggeredAlerts = [];
  for (const alert of alerts) {
    const rows = db.prepare('SELECT price, price_date FROM price_history WHERE product_id = ? ORDER BY price_date DESC LIMIT 2').all(alert.product_id);
    if (rows.length === 2 && rows[1].price > 0) {
      const change = ((rows[0].price - rows[1].price) / rows[1].price) * 100;
      if (change >= alert.threshold_percent) {
        triggeredAlerts.push({ ...alert, change_percent: Math.round(change * 100) / 100, latest_price: rows[0].price });
      }
    }
  }

  // En fazla fiyat artışı olan ürünler (son 2 fiyat kaydından hesapla, top 10)
  const allPriceProducts = db.prepare(`
    SELECT DISTINCT product_id FROM price_history
  `).all();
  const topPriceIncreases = [];
  for (const { product_id } of allPriceProducts) {
    const rows = db.prepare('SELECT ph.price, ph.price_date, s.name as supplier_name FROM price_history ph JOIN suppliers s ON s.id=ph.supplier_id WHERE ph.product_id=? ORDER BY ph.price_date DESC LIMIT 2').all(product_id);
    if (rows.length === 2 && rows[1].price > 0) {
      const change = ((rows[0].price - rows[1].price) / rows[1].price) * 100;
      if (change > 0) {
        const prod = db.prepare('SELECT name, code FROM products WHERE id=?').get(product_id);
        if (prod) topPriceIncreases.push({ product_id, name: prod.name, code: prod.code, change_percent: Math.round(change * 100) / 100, latest_price: rows[0].price, prev_price: rows[1].price, supplier_name: rows[0].supplier_name, price_date: rows[0].price_date });
      }
    }
  }
  topPriceIncreases.sort((a, b) => b.change_percent - a.change_percent);
  const topPriceIncreasesSliced = topPriceIncreases.slice(0, 10);

  // Aktif PO özeti (durum bazında)
  const poByStatus = db.prepare(`SELECT status, COUNT(*) as count, SUM(total_amount) as total FROM purchase_orders WHERE status NOT IN ('cancelled') GROUP BY status`).all();

  // Son ödemeler (finance varsa)
  let financeOzet = null;

  res.json({ totalSuppliers, totalProducts, activePo, openRfq, lowStock, recentPo, triggeredAlerts, criticalStock, topPriceIncreases: topPriceIncreasesSliced, poByStatus });
});

// GET /api/reports/price-trend?product_id=&supplier_id=
router.get('/price-trend', (req, res) => {
  const db = getDb();
  const { product_id, supplier_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id gerekli' });
  let query = `SELECT ph.price_date, ph.price, ph.currency, s.name as supplier_name
    FROM price_history ph JOIN suppliers s ON s.id=ph.supplier_id WHERE ph.product_id=?`;
  const params = [product_id];
  if (supplier_id) { query += ' AND ph.supplier_id=?'; params.push(supplier_id); }
  query += ' ORDER BY ph.price_date ASC';
  res.json(db.prepare(query).all(...params));
});

// GET /api/reports/export/suppliers  — Excel
router.get('/export/suppliers', async (req, res) => {
  const db = getDb();
  const suppliers = db.prepare('SELECT * FROM suppliers WHERE active=1 ORDER BY name').all();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Tedarikçiler');
  ws.columns = [
    { header: 'Ad', key: 'name', width: 30 },
    { header: 'İletişim', key: 'contact_name', width: 20 },
    { header: 'E-posta', key: 'email', width: 25 },
    { header: 'Telefon', key: 'phone', width: 15 },
    { header: 'Şehir', key: 'city', width: 15 },
    { header: 'Vergi No', key: 'tax_number', width: 15 },
    { header: 'Ödeme Koşulları', key: 'payment_terms', width: 20 },
  ];
  ws.getRow(1).font = { bold: true };
  suppliers.forEach(s => ws.addRow(s));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=tedarikciler.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/reports/export/prices?product_id=
router.get('/export/prices', async (req, res) => {
  const db = getDb();
  const { product_id } = req.query;
  let query = `SELECT ph.price_date, p.code, p.name as product_name, s.name as supplier_name, ph.price, ph.currency
    FROM price_history ph JOIN products p ON p.id=ph.product_id JOIN suppliers s ON s.id=ph.supplier_id`;
  if (product_id) query += ` WHERE ph.product_id='${product_id}'`;
  query += ' ORDER BY ph.price_date DESC';
  const rows = db.prepare(query).all();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fiyat Geçmişi');
  ws.columns = [
    { header: 'Tarih', key: 'price_date', width: 15 },
    { header: 'Ürün Kodu', key: 'code', width: 12 },
    { header: 'Ürün Adı', key: 'product_name', width: 30 },
    { header: 'Tedarikçi', key: 'supplier_name', width: 25 },
    { header: 'Fiyat', key: 'price', width: 12 },
    { header: 'Para Birimi', key: 'currency', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=fiyat-gecmisi.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

// GET /api/reports/export/po
router.get('/export/po', async (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT po.po_number, s.name as supplier_name, po.status, po.order_date, po.expected_date, po.delivery_date, po.total_amount, po.currency FROM purchase_orders po JOIN suppliers s ON s.id=po.supplier_id ORDER BY po.created_at DESC`).all();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Siparişler');
  ws.columns = [
    { header: 'PO No', key: 'po_number', width: 15 },
    { header: 'Tedarikçi', key: 'supplier_name', width: 25 },
    { header: 'Durum', key: 'status', width: 15 },
    { header: 'Sipariş Tarihi', key: 'order_date', width: 15 },
    { header: 'Beklenen Tarih', key: 'expected_date', width: 15 },
    { header: 'Teslim Tarihi', key: 'delivery_date', width: 15 },
    { header: 'Toplam', key: 'total_amount', width: 15 },
    { header: 'Para Birimi', key: 'currency', width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach(r => ws.addRow(r));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=siparisler.xlsx');
  await wb.xlsx.write(res);
  res.end();
});

// ========================================================================
// FİYAT ANALİZİ API'LERİ
// ========================================================================

// Aylık kategori bazlı satınalma toplamları (15 aylık özet)
// GET /api/reports/monthly-summary
router.get('/monthly-summary', (req, res) => {
  const db = getDb();

  // Hammadde alt gruplarını ana gruba map'leyen yardımcı
  const RAW_MATERIAL_GROUPS = new Set([
    'HAMMADDE', 'HIRDAVAT', 'KARAVAN EKIPMAN', 'MEKANIK', '3D-BASKI', 'BEDELSIZ',
    'CADIR', 'CADIR', 'DOSEME', 'DÖŞEME', 'ELEKTRIK', 'KARAVAN', 'KIMYASAL',
    'MOBILYA', 'YEDEK PARCA'
  ]);

  function normalizeText(v) {
    return String(v || '').trim().toUpperCase()
      .replace(/İ/g,'I').replace(/ı/g,'I').replace(/Ş/g,'S').replace(/ş/g,'S')
      .replace(/Ğ/g,'G').replace(/ğ/g,'G').replace(/Ü/g,'U').replace(/ü/g,'U')
      .replace(/Ö/g,'O').replace(/ö/g,'O').replace(/Ç/g,'C').replace(/ç/g,'C');
  }

  function mapCategory(groupName) {
    const g = normalizeText(groupName);
    if (!g || g === 'GENEL') return 'DIGER';
    if (RAW_MATERIAL_GROUPS.has(g)) return 'HAMMADDE';
    if (g === 'ETICARET' || g === 'E-TICARET') return 'E-TICARET';
    if (g === 'ARGE' || g === 'AR-GE') return 'ARGE';
    if (g === 'NUMUNE') return 'NUMUNE';
    if (g === 'MARKETING' || g === 'PAZARLAMA') return 'MARKETING';
    if (g === 'UYKU KAPSULU') return 'UYKU KAPSULU';
    if (g === 'KABIN') return 'KABIN';
    return 'DIGER';
  }

  // PO kalemlerinden aylık toplamları çek
  const rows = db.prepare(`
    SELECT
      po.order_date,
      c.name as category_name,
      SUM(pi.quantity * pi.unit_price) as total
    FROM po_items pi
    JOIN purchase_orders po ON po.id = pi.po_id
    JOIN products p ON p.id = pi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    GROUP BY substr(po.order_date, 1, 7), c.name
    ORDER BY po.order_date ASC
  `).all();

  // Aylık toplamları hesapla
  const monthlyData = {};
  const categorySet = new Set();

  for (const row of rows) {
    const monthKey = row.order_date ? row.order_date.slice(0, 7) : null; // YYYY-MM
    if (!monthKey) continue;

    const cat = mapCategory(row.category_name);
    categorySet.add(cat);

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { month: monthKey, GENEL_TOPLAM: 0 };
    }
    monthlyData[monthKey][cat] = (monthlyData[monthKey][cat] || 0) + row.total;
    monthlyData[monthKey].GENEL_TOPLAM += row.total;
  }

  // Sıralı dizi olarak dön
  const months = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  const categories = ['HAMMADDE', 'E-TICARET', 'ARGE', 'NUMUNE', 'MARKETING', 'UYKU KAPSULU', 'KABIN', 'DIGER']
    .filter(c => categorySet.has(c));

  res.json({ months, categories });
});

// Ürün bazlı fiyat analizi
// GET /api/reports/product-price-analysis?category=&search=
router.get('/product-price-analysis', (req, res) => {
  const db = getDb();
  const { category, search } = req.query;

  // Tüm fiyat geçmişini ürün+tarih bazlı çek
  let query = `
    SELECT
      p.id as product_id,
      p.code,
      p.name as product_name,
      c.name as category_name,
      ph.price,
      ph.price_date,
      ph.currency
    FROM price_history ph
    JOIN products p ON p.id = ph.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ' AND (p.code LIKE ? OR p.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY p.code, ph.price_date ASC';

  const rows = db.prepare(query).all(...params);

  // Ürün bazlı gruplama
  const productMap = {};
  for (const row of rows) {
    if (!productMap[row.product_id]) {
      productMap[row.product_id] = {
        product_id: row.product_id,
        code: row.code,
        name: row.product_name,
        category: row.category_name || 'Genel',
        prices: []
      };
    }
    productMap[row.product_id].prices.push({
      date: row.price_date,
      price: row.price,
      currency: row.currency
    });
  }

  // Analiz hesapla
  const RAW_MATERIAL_GROUPS = new Set([
    'HAMMADDE', 'HIRDAVAT', 'KARAVAN EKIPMAN', 'MEKANIK', '3D-BASKI', 'BEDELSIZ',
    'CADIR', 'CADIR', 'DOSEME', 'DÖŞEME', 'ELEKTRIK', 'KARAVAN', 'KIMYASAL',
    'MOBILYA', 'YEDEK PARCA'
  ]);

  function normalizeText(v) {
    return String(v || '').trim().toUpperCase()
      .replace(/İ/g,'I').replace(/ı/g,'I').replace(/Ş/g,'S').replace(/ş/g,'S')
      .replace(/Ğ/g,'G').replace(/ğ/g,'G').replace(/Ü/g,'U').replace(/ü/g,'U')
      .replace(/Ö/g,'O').replace(/ö/g,'O').replace(/Ç/g,'C').replace(/ç/g,'C');
  }

  function mapCategory(groupName) {
    const g = normalizeText(groupName);
    if (!g || g === 'GENEL') return 'DIGER';
    if (RAW_MATERIAL_GROUPS.has(g)) return 'HAMMADDE';
    if (g === 'ETICARET' || g === 'E-TICARET') return 'E-TICARET';
    if (g === 'ARGE' || g === 'AR-GE') return 'ARGE';
    if (g === 'NUMUNE') return 'NUMUNE';
    if (g === 'MARKETING' || g === 'PAZARLAMA') return 'MARKETING';
    if (g === 'UYKU KAPSULU') return 'UYKU KAPSULU';
    if (g === 'KABIN') return 'KABIN';
    return 'DIGER';
  }

  const results = Object.values(productMap).map(p => {
    const prices = p.prices;
    const anaGrup = mapCategory(p.category);

    if (category && anaGrup !== category) return null;

    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const avgPrice = prices.reduce((s, x) => s + x.price, 0) / prices.length;

    // Son 3 aylık fiyatlar (Ocak-Mart 2026)
    const recent = prices.filter(x => x.date >= '2026-01');
    const recentAvg = recent.length > 0 ? recent.reduce((s, x) => s + x.price, 0) / recent.length : null;

    // Eki/Kas/Ara 2025
    const q4_2025 = prices.filter(x => x.date >= '2025-10' && x.date < '2026-01');
    const q4Avg = q4_2025.length > 0 ? q4_2025.reduce((s, x) => s + x.price, 0) / q4_2025.length : null;

    // Artış yüzdeleri
    const overallChange = firstPrice.price > 0
      ? ((lastPrice.price - firstPrice.price) / firstPrice.price) * 100 : null;

    const q4ToRecentChange = (q4Avg && recentAvg && q4Avg > 0)
      ? ((recentAvg - q4Avg) / q4Avg) * 100 : null;

    // Aylık fiyat trendi (grafik için)
    const monthlyPrices = {};
    for (const pr of prices) {
      const mk = pr.date.slice(0, 7);
      if (!monthlyPrices[mk]) monthlyPrices[mk] = [];
      monthlyPrices[mk].push(pr.price);
    }
    const trend = Object.entries(monthlyPrices)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, pArr]) => ({
        month,
        avgPrice: Math.round((pArr.reduce((s, v) => s + v, 0) / pArr.length) * 100) / 100,
        minPrice: Math.min(...pArr),
        maxPrice: Math.max(...pArr),
        count: pArr.length
      }));

    return {
      product_id: p.product_id,
      code: p.code,
      name: p.name,
      category: p.category,
      anaGrup,
      firstDate: firstPrice.date,
      firstPrice: firstPrice.price,
      lastDate: lastPrice.date,
      lastPrice: lastPrice.price,
      avgPrice: Math.round(avgPrice * 100) / 100,
      priceCount: prices.length,
      overallChange: overallChange !== null ? Math.round(overallChange * 100) / 100 : null,
      q4Avg: q4Avg ? Math.round(q4Avg * 100) / 100 : null,
      recentAvg: recentAvg ? Math.round(recentAvg * 100) / 100 : null,
      q4ToRecentChange: q4ToRecentChange !== null ? Math.round(q4ToRecentChange * 100) / 100 : null,
      trend
    };
  }).filter(Boolean);

  // Sıralama: ana grup → kod
  const GRUP_ORDER = ['HAMMADDE', 'E-TICARET', 'ARGE', 'NUMUNE', 'MARKETING', 'UYKU KAPSULU', 'KABIN', 'DIGER'];
  results.sort((a, b) => {
    const ao = GRUP_ORDER.indexOf(a.anaGrup);
    const bo = GRUP_ORDER.indexOf(b.anaGrup);
    if (ao !== bo) return ao - bo;
    return a.code.localeCompare(b.code);
  });

  res.json(results);
});

module.exports = router;
