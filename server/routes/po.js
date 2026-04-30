const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb, calculatePoStatus } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');
const { getExcelOrders, getExcelOrderById } = require('../utils/excelPurchaseFallback');
const tiger3 = require('../utils/tiger3');

const router = express.Router();
router.use(authenticate);

// ── Tiger3 sipariş sync ───────────────────────────────────────────────────────
async function syncPurchaseOrdersFromTIGER3() {
  const db = getDb();

  // Excel'deki "AA_SIPARIS_SATINALMA_RAPORU_YENI_123" kaynağıyla aynı veriyi
  // doğrudan Tiger3 tablolarından çek; TALINAN/BEKLEYEN ile gerçek durum hesabı yapılır.
  const lines = await tiger3.query(`
    SELECT
      YEAR(F.DATE_)                                    AS YIL,
      MONTH(F.DATE_)                                   AS AY,
      CONVERT(VARCHAR(10), F.DATE_, 120)               AS TARIH,
      F.FICHENO                                        AS FISNO,
      C.CODE                                           AS CARI_KODU,
      ISNULL(C.DEFINITION_, '')                        AS CARI_UNVANI,
      S.CODE                                           AS STOK_KODU,
      ISNULL(S.NAME, '')                               AS STOK_ADI,
      ISNULL(S.STGRPCODE, '')                          AS STOK_GRUP,
      ISNULL(L.AMOUNT, 0)                              AS MIKTAR,
      ISNULL(L.SHIPPEDAMOUNT, 0)                       AS TALINAN,
      ISNULL(L.AMOUNT - L.SHIPPEDAMOUNT, 0)            AS BEKLEYEN,
      ISNULL(L.PRICE, 0)                               AS FIYAT,
      ISNULL(L.TOTAL, 0)                               AS TUTAR,
      F.CANCELLED                                      AS SIPARIS_IPTAL,
      CASE ISNULL(F.TRCURR, 0)
        WHEN 1 THEN 'USD' WHEN 2 THEN 'EUR' ELSE 'TRY'
      END                                              AS DOVIZ
    FROM LG_123_01_ORFICHE F
    JOIN LG_123_CLCARD      C ON C.LOGICALREF = F.CLIENTREF
    JOIN LG_123_01_ORFLINE  L ON L.ORDFICHEREF = F.LOGICALREF
    JOIN LG_123_ITEMS        S ON S.LOGICALREF = L.STOCKREF
    WHERE F.TRCODE = 2
      AND L.LINETYPE = 0
      AND L.AMOUNT > 0
    ORDER BY F.DATE_ DESC, F.FICHENO
  `);

  // ── Sipariş başlıklarını satırlardan derle ──────────────────────────────────
  const orderMap = new Map(); // FISNO → { meta, lines[] }
  for (const r of lines) {
    if (!orderMap.has(r.FISNO)) {
      orderMap.set(r.FISNO, {
        fisno: r.FISNO,
        tarih: r.TARIH,
        cari_kodu: r.CARI_KODU,
        cari_unvani: r.CARI_UNVANI,
        doviz: r.DOVIZ,
        iptal: r.SIPARIS_IPTAL,
        lines: [],
        totalTutar: 0,
        totalMiktar: 0,
        totalTalinan: 0,
        totalBekleyen: 0,
      });
    }
    const ord = orderMap.get(r.FISNO);
    ord.lines.push(r);
    ord.totalTutar    += Number(r.TUTAR    || 0);
    ord.totalMiktar   += Number(r.MIKTAR   || 0);
    ord.totalTalinan  += Number(r.TALINAN  || 0);
    ord.totalBekleyen += Number(r.BEKLEYEN || 0);
  }

  // ── Durum hesaplama ─────────────────────────────────────────────────────────
  function calcStatus(ord) {
    if (ord.iptal === 1 || ord.iptal === true) return 'cancelled';
    if (ord.totalBekleyen <= 0 && ord.totalTalinan > 0) return 'kapanan';
    if (ord.totalTalinan > 0 && ord.totalBekleyen > 0) return 'bekleyen';
    return 'açık';
  }

  // ── Tiger3 kaynaklı eski verileri temizle (manuel PO-YYYY-NNNN korunur) ──────
  db.prepare("DELETE FROM po_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number NOT LIKE 'PO-%')").run();
  db.prepare("DELETE FROM purchase_orders WHERE po_number NOT LIKE 'PO-%'").run();

  // ── Tedarikçileri otomatik upsert et ────────────────────────────────────────
  // Tiger3'te olan ama local DB'de olmayan tedarikçiler de otomatik eklenir
  const checkSupplier  = db.prepare('SELECT id FROM suppliers WHERE external_code = ?');
  const insertSupplier = db.prepare(`
    INSERT INTO suppliers (id, name, external_code, active, created_at, updated_at)
    VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
  `);
  const updateSupplier = db.prepare(`
    UPDATE suppliers SET name = ?, updated_at = datetime('now') WHERE external_code = ?
  `);

  const uniqueSuppliers = new Map(
    [...orderMap.values()].map(o => [o.cari_kodu, o.cari_unvani])
  );
  db.transaction(() => {
    for (const [code, name] of uniqueSuppliers) {
      if (!code) continue;
      const existing = checkSupplier.get(code);
      if (existing) {
        updateSupplier.run(name, code);
      } else {
        insertSupplier.run(uuidv4(), name, code);
      }
    }
  })();

  const supplierMap = new Map(
    db.prepare('SELECT id, external_code FROM suppliers WHERE external_code IS NOT NULL').all()
      .map(r => [r.external_code, r.id])
  );

  // ── Ürünleri otomatik upsert et ─────────────────────────────────────────────
  const upsertProduct = db.prepare(`
    INSERT INTO products (id, code, name, unit, created_at, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(code) DO UPDATE
      SET name       = excluded.name,
          unit       = CASE WHEN excluded.unit != '' THEN excluded.unit ELSE products.unit END,
          updated_at = excluded.updated_at
  `);

  const uniqueProducts = new Map(
    lines.map(r => [r.STOK_KODU, { name: r.STOK_ADI }])
  );
  db.transaction(() => {
    for (const [code, info] of uniqueProducts) {
      if (!code) continue;
      upsertProduct.run(uuidv4(), code, info.name || code, 'adet');
    }
  })();

  const productMap = new Map(
    db.prepare('SELECT id, code FROM products').all().map(r => [r.code, r.id])
  );

  // ── Sipariş ve kalemleri kaydet ─────────────────────────────────────────────
  const insertPo = db.prepare(`
    INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, currency, total_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertItem = db.prepare(`
    INSERT INTO po_items (id, po_id, product_id, quantity, unit_price, received_quantity)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let poInserted = 0, poSkipped = 0, itemInserted = 0, itemSkipped = 0;
  const poIdMap = new Map();

  db.transaction(() => {
    for (const [fisno, ord] of orderMap) {
      const supplierId = supplierMap.get(ord.cari_kodu);
      if (!supplierId) { poSkipped++; continue; }
      const poId = uuidv4();
      insertPo.run(poId, fisno, supplierId, ord.tarih, ord.doviz, ord.totalTutar, calcStatus(ord));
      poIdMap.set(fisno, poId);
      poInserted++;
    }
  })();

  db.transaction(() => {
    for (const r of lines) {
      const poId = poIdMap.get(r.FISNO);
      if (!poId) { itemSkipped++; continue; }
      const productId = productMap.get(r.STOK_KODU);
      if (!productId) { itemSkipped++; continue; }
      insertItem.run(uuidv4(), poId, productId, r.MIKTAR, r.FIYAT, r.TALINAN);
      itemInserted++;
    }
  })();

  console.log(`[PO] Tiger3 sync: ${poInserted} sipariş (${poSkipped} atlandı) | ${itemInserted} kalem (${itemSkipped} atlandı)`);
  return { poInserted, poSkipped, itemInserted, itemSkipped };
}

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
  const sqlRows = db.prepare(query).all(...params);
  if (sqlRows.length > 0) return res.json(sqlRows);
  return res.json(getExcelOrders({ status, supplier_id }));
});

// GET /api/po/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const po = db.prepare(`SELECT po.*, s.name as supplier_name FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`).get(req.params.id);
  if (!po) {
    const excelPo = getExcelOrderById(req.params.id);
    if (!excelPo) return res.status(404).json({ error: 'Sipariş bulunamadı' });
    return res.json({ ...excelPo, documents: [] });
  }
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

  const insertPo = db.prepare(`INSERT INTO purchase_orders (id, po_number, supplier_id, order_date, expected_date, currency, total_amount, notes, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertItem = db.prepare(`INSERT INTO po_items (id, po_id, product_id, quantity, unit_price, notes) VALUES (?, ?, ?, ?, ?, ?)`);

  db.transaction(() => {
    insertPo.run(id, po_number, supplier_id, order_date, expected_date || null, currency || 'TRY', total, notes || null, 'açık', req.user.id);
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

  // Kapanan → envanter güncelle
  if (status === 'kapanan') {
    const items = db.prepare(`
      SELECT poi.*, poi.received_quantity FROM po_items poi WHERE poi.po_id = ?
    `).all(req.params.id);
    const updateInv = db.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = datetime(\'now\') WHERE product_id = ?');
    const insertTx = db.prepare('INSERT INTO inventory_transactions (id, product_id, type, quantity, reference, created_by) VALUES (?, ?, ?, ?, ?, ?)');
    db.transaction(() => {
      for (const item of items) {
        const addQty = item.received_quantity || item.quantity;
        updateInv.run(addQty, item.product_id);
        insertTx.run(uuidv4(), item.product_id, 'in', addQty, po.po_number, req.user.id);
      }
    })();
  }

  res.json({ message: 'Durum güncellendi' });
});

// POST /api/po/:id/receive-items - Teslim alınan ürünleri güncelle
router.post('/:id/receive-items', authorize('admin', 'user'), (req, res) => {
  const { items } = req.body; // [{ poi_id, received_quantity, received_date }, ...]
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'En az bir kalem gerekli' });
  }
  
  const db = getDb();
  const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(req.params.id);
  if (!po) return res.status(404).json({ error: 'Sipariş bulunamadı' });

  const updateItem = db.prepare(`
    UPDATE po_items SET received_quantity = ?, received_date = ? WHERE id = ?
  `);

  db.transaction(() => {
    for (const item of items) {
      updateItem.run(item.received_quantity || 0, item.received_date || null, item.poi_id);
    }
  })();

  // Yeni status hesapla
  const newStatus = calculatePoStatus(db, req.params.id);
  db.prepare('UPDATE purchase_orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(newStatus, req.params.id);

  res.json({ message: 'Teslim alınan ürünler güncellendi', status: newStatus });
});

// DELETE /api/po/:id
router.delete('/:id', authorize('admin'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Sipariş silindi' });
});

// POST /api/po/sync-tiger3
router.post('/sync-tiger3', authorize('admin'), async (req, res) => {
  try {
    const result = await syncPurchaseOrdersFromTIGER3();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = Object.assign(router, { syncPurchaseOrdersFromTIGER3 });
