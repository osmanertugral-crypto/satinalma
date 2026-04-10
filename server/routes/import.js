const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xls', '.xlsx', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (allowed.some(t => file.originalname.endsWith('.xls') || file.originalname.endsWith('.xlsx'))) {
      cb(null, true);
    } else {
      cb(new Error('Sadece .xls ve .xlsx dosyaları desteklenir'));
    }
  }
});

// Excel seri tarih → YYYY-MM-DD
function serialToDateStr(serial) {
  if (!serial || typeof serial !== 'number') return new Date().toISOString().slice(0, 10);
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

const CURRENCY_MAP = { TL: 'TRY', US: 'USD', EU: 'EUR' };

// POST /api/import/purchase-report
// Zorunlu sütunlar: YIL, AY, TARIH, FISNO, CARI_KODU, CARI_UNVANI,
//   STOK_KODU, STOK_ADI, STOK_GRUP, MIKTAR, BIRIM, FIYAT, TUTAR,
//   SIPARIS_DOVIZ_TIPI, KAPALI
router.post('/purchase-report', authenticate, authorize('admin', 'user'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenmedi' });

  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (e) {
    return res.status(400).json({ error: 'Excel okunamadı: ' + e.message });
  }

  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rows.length < 2) return res.status(400).json({ error: 'Dosya boş veya başlık satırı yok' });

  // Sütun indeks haritası (büyük/küçük harften bağımsız)
  const COL = {};
  rows[0].forEach((h, i) => { COL[String(h).trim()] = i; });

  const required = ['FISNO', 'CARI_KODU', 'CARI_UNVANI', 'STOK_KODU', 'STOK_ADI',
    'MIKTAR', 'BIRIM', 'FIYAT', 'TUTAR', 'SIPARIS_DOVIZ_TIPI', 'TARIH'];
  const missing = required.filter(c => !(c in COL));
  if (missing.length > 0) {
    return res.status(400).json({ error: 'Eksik sütunlar: ' + missing.join(', ') });
  }

  const db = getDb();
  const stats = { categories: 0, suppliers: 0, products: 0, pos: 0, items: 0, prices: 0, skipped: 0 };

  // Önce mevcut verileri bellekte önbelleğe al
  const categoryMap = {}; // name → id
  const supplierMap = {}; // external_code → id
  const productMap = {};  // stok_kodu → id
  const poMap = {};       // po_number → id

  db.prepare('SELECT id, name FROM categories').all()
    .forEach(c => { categoryMap[c.name] = c.id; });
  db.prepare('SELECT id, external_code FROM suppliers WHERE external_code IS NOT NULL').all()
    .forEach(s => { supplierMap[s.external_code] = s.id; });
  db.prepare('SELECT id, code FROM products').all()
    .forEach(p => { productMap[p.code] = p.id; });

  // Önceden içe aktarılmış PO numaraları (tekrar import'u önlemek için)
  const importedPoNumbers = new Set();
  db.prepare("SELECT po_number FROM purchase_orders WHERE po_number LIKE 'IMP-%'").all()
    .forEach(p => { importedPoNumbers.add(p.po_number); });

  // Hazır sorgular
  const stmts = {
    insertCategory:  db.prepare('INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)'),
    getCategory:     db.prepare('SELECT id FROM categories WHERE name = ?'),
    insertSupplier:  db.prepare('INSERT INTO suppliers (id, name, external_code) VALUES (?, ?, ?)'),
    getSupplierByCode: db.prepare('SELECT id FROM suppliers WHERE external_code = ?'),
    insertProduct:   db.prepare('INSERT OR IGNORE INTO products (id, code, name, category_id, unit) VALUES (?, ?, ?, ?, ?)'),
    updateProduct:   db.prepare('UPDATE products SET name = ?, category_id = ? WHERE code = ?'),
    getProduct:      db.prepare('SELECT id FROM products WHERE code = ?'),
    insertSupProd:   db.prepare('INSERT OR IGNORE INTO supplier_products (id, supplier_id, product_id) VALUES (?, ?, ?)'),
    insertPrice:     db.prepare('INSERT INTO price_history (id, supplier_id, product_id, price, currency, price_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    insertPO:        db.prepare('INSERT OR IGNORE INTO purchase_orders (id, po_number, supplier_id, status, order_date, currency, total_amount, notes) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'),
    getPO:           db.prepare('SELECT id FROM purchase_orders WHERE po_number = ?'),
    insertPOItem:    db.prepare('INSERT INTO po_items (id, po_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)'),
    updatePOTotal:   db.prepare('UPDATE purchase_orders SET total_amount = total_amount + ? WHERE id = ?'),
  };

  const importTx = db.transaction(() => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      const stokKodu  = String(row[COL['STOK_KODU']] ?? '').trim();
      const cariKodu  = String(row[COL['CARI_KODU']] ?? '').trim();
      if (!stokKodu || !cariKodu) { stats.skipped++; continue; }

      const cariUnvani  = String(row[COL['CARI_UNVANI']] ?? '').trim();
      const stokAdi     = String(row[COL['STOK_ADI']]    ?? '').trim();
      const stokGrup    = String(row[COL['STOK_GRUP']]   ?? '').trim() || 'Genel';
      const fisNo       = String(row[COL['FISNO']]       ?? '').trim();
      const miktar      = parseFloat(row[COL['MIKTAR']])  || 0;
      const birim       = String(row[COL['BIRIM']]       ?? '').trim() || 'ADET';
      const fiyat       = parseFloat(row[COL['FIYAT']])  || 0;
      const tutar       = parseFloat(row[COL['TUTAR']])  || 0;
      const dovizTipi   = String(row[COL['SIPARIS_DOVIZ_TIPI']] ?? '').trim().toUpperCase();
      const currency    = CURRENCY_MAP[dovizTipi] || 'TRY';
      const tarih       = serialToDateStr(row[COL['TARIH']]);
      const yil         = row[COL['YIL']] || new Date(tarih).getFullYear();
      const kapali      = row[COL['KAPALI']];

      // 1. Kategori
      if (!categoryMap[stokGrup]) {
        const catId = uuidv4();
        stmts.insertCategory.run(catId, stokGrup);
        const existing = stmts.getCategory.get(stokGrup);
        categoryMap[stokGrup] = existing.id;
        if (existing.id === catId) stats.categories++;
      }
      const categoryId = categoryMap[stokGrup];

      // 2. Tedarikçi
      if (!supplierMap[cariKodu]) {
        const existing = stmts.getSupplierByCode.get(cariKodu);
        if (existing) {
          supplierMap[cariKodu] = existing.id;
        } else {
          const suppId = uuidv4();
          stmts.insertSupplier.run(suppId, cariUnvani, cariKodu);
          supplierMap[cariKodu] = suppId;
          stats.suppliers++;
        }
      }
      const supplierId = supplierMap[cariKodu];

      // 3. Ürün
      if (!productMap[stokKodu]) {
        const prodId = uuidv4();
        stmts.insertProduct.run(prodId, stokKodu, stokAdi, categoryId, birim);
        const existing = stmts.getProduct.get(stokKodu);
        productMap[stokKodu] = existing.id;
        if (existing.id === prodId) stats.products++;
        else stmts.updateProduct.run(stokAdi, categoryId, stokKodu); // güncelle
      }
      const productId = productMap[stokKodu];

      // 4. Tedarikçi-Ürün ilişkisi
      stmts.insertSupProd.run(uuidv4(), supplierId, productId);

      // İdempotency: Bu PO daha önce import edildiyse fiyat+kalem ekleme
      const cariKoduClean = cariKodu.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
      const poNumber = `IMP-${yil}-${fisNo}-${cariKoduClean}`;
      if (importedPoNumbers.has(poNumber)) {
        stats.skipped++;
        continue;
      }

      // 5. Fiyat geçmişi
      stmts.insertPrice.run(uuidv4(), supplierId, productId, fiyat, 'TRY', tarih,
        `İçe aktarıldı (Fiş: ${fisNo}, Kur: ${dovizTipi})`);
      stats.prices++;

      // 6. Satın alma emri (FISNO + CARI grubu)
      // (poNumber ve cariKoduClean yukarıda tanımlandı)
      if (!poMap[poNumber]) {
        const existing = stmts.getPO.get(poNumber);
        if (existing) {
          poMap[poNumber] = existing.id;
        } else {
          const poId = uuidv4();
          const poStatus = kapali == 1 ? 'delivered' : 'confirmed';
          stmts.insertPO.run(poId, poNumber, supplierId, poStatus, tarih, 'TRY',
            `Excel içe aktarma - Fiş No: ${fisNo}`);
          poMap[poNumber] = poId;
          stats.pos++;
        }
      }
      const poId = poMap[poNumber];

      // 7. PO kalemi
      stmts.insertPOItem.run(uuidv4(), poId, productId, miktar, fiyat);
      stats.items++;

      // 8. PO toplam güncelle
      stmts.updatePOTotal.run(tutar, poId);
    }
  });

  try {
    importTx();
  } catch (e) {
    return res.status(500).json({ error: 'İçe aktarma hatası: ' + e.message });
  }

  res.json({
    success: true,
    stats,
    message: `İçe aktarma tamamlandı: ${stats.suppliers} tedarikçi, ${stats.products} ürün, ${stats.pos} sipariş, ${stats.items} kalem, ${stats.prices} fiyat kaydı oluşturuldu.`
  });
});

module.exports = router;
