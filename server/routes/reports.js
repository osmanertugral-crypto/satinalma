const express = require('express');
const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const { normTr } = require('../utils/searchUtils');
const tiger3 = require('../utils/tiger3');

const router = express.Router();
router.use(authenticate);

// ── Kategori normalizasyonu (üst seviye gruplama) ────────────────────────────
const RAW_MATERIAL_GROUPS_SET = new Set([
  'HAMMADDE', 'HIRDAVAT', 'KARAVAN EKIPMAN', 'MEKANIK', '3D-BASKI', 'BEDELSIZ',
  'CADIR', 'DOSEME', 'DÖŞEME', 'ELEKTRIK', 'KARAVAN', 'KIMYASAL',
  'MOBILYA', 'YEDEK PARCA',
]);

function normalizeText(v) {
  return String(v || '').trim().toUpperCase()
    .replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/Ş/g, 'S').replace(/ş/g, 'S')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'G').replace(/Ü/g, 'U').replace(/ü/g, 'U')
    .replace(/Ö/g, 'O').replace(/ö/g, 'O').replace(/Ç/g, 'C').replace(/ç/g, 'C');
}

function mapCategory(groupName) {
  const g = normalizeText(groupName);
  if (!g || g === 'GENEL') return 'DIGER';
  if (RAW_MATERIAL_GROUPS_SET.has(g)) return 'HAMMADDE';
  if (g === 'ETICARET' || g === 'E-TICARET') return 'E-TICARET';
  if (g === 'ARGE' || g === 'AR-GE') return 'ARGE';
  if (g === 'NUMUNE') return 'NUMUNE';
  if (g === 'MARKETING' || g === 'PAZARLAMA') return 'MARKETING';
  if (g === 'UYKU KAPSULU') return 'UYKU KAPSULU';
  if (g === 'KABIN') return 'KABIN';
  return 'DIGER';
}

// ── Tiger3 purchase history sync ─────────────────────────────────────────────
async function syncPurchaseHistory() {
  const db = getDb();

  const lg123Rows = await tiger3.query(`
    SELECT
      CONVERT(VARCHAR(10), F.DATE_, 120)        AS tarih,
      F.FICHENO                                  AS fis_no,
      ISNULL(C.DEFINITION_, '')                  AS tedarikci,
      S.CODE                                     AS malzeme_kodu,
      ISNULL(S.NAME, '')                         AS malzeme_adi,
      ISNULL(L.AMOUNT, 0)                        AS miktar,
      ISNULL(L.AMOUNT - L.SHIPPEDAMOUNT, 0)      AS bekleyen,
      0                                          AS iade,
      ISNULL(L.PRICE, 0)                         AS birim_fiyat,
      ISNULL(L.TOTAL, 0)                         AS net_tutar,
      ISNULL(FT.fatura_tutar, 0)                 AS fatura_tutar,
      CASE ISNULL(F.TRCURR, 0)
        WHEN 1 THEN 'USD' WHEN 2 THEN 'EUR' ELSE 'TRY'
      END                                        AS para_birimi,
      'LG_123'                                   AS firma
    FROM LG_123_01_ORFLINE L
    JOIN LG_123_01_ORFICHE F  ON F.LOGICALREF = L.ORDFICHEREF
    JOIN LG_123_ITEMS       S  ON S.LOGICALREF = L.STOCKREF
    JOIN LG_123_CLCARD      C  ON C.LOGICALREF = F.CLIENTREF
    LEFT JOIN (
      SELECT ORDTRANSREF, SUM(LINENET) AS fatura_tutar
      FROM LG_123_01_STLINE
      WHERE ORDTRANSREF > 0
      GROUP BY ORDTRANSREF
    ) FT ON FT.ORDTRANSREF = L.LOGICALREF
    WHERE L.TRCODE = 2 AND L.CANCELLED = 0 AND L.AMOUNT > 0
  `);

  const lg001Rows = await tiger3.query(`
    SELECT
      CONVERT(VARCHAR(10), L.DATE_, 120)  AS tarih,
      ISNULL(SF.FICHENO, '')              AS fis_no,
      ISNULL(C.DEFINITION_, '')           AS tedarikci,
      S.CODE                              AS malzeme_kodu,
      ISNULL(S.NAME, '')                  AS malzeme_adi,
      ISNULL(L.AMOUNT, 0)                 AS miktar,
      0                                   AS bekleyen,
      0                                   AS iade,
      ISNULL(L.PRICE, 0)                  AS birim_fiyat,
      ISNULL(L.LINENET, 0)                AS net_tutar,
      ISNULL(L.LINENET, 0)                AS fatura_tutar,
      CASE ISNULL(SF.TRCURR, 0)
        WHEN 1 THEN 'USD' WHEN 2 THEN 'EUR' ELSE 'TRY'
      END                                 AS para_birimi,
      'LG_001'                            AS firma
    FROM LG_001_01_STLINE L
    JOIN LG_001_ITEMS  S  ON S.LOGICALREF = L.STOCKREF
    JOIN LG_001_CLCARD C  ON C.LOGICALREF = L.CLIENTREF
    LEFT JOIN LG_001_01_STFICHE SF ON SF.LOGICALREF = L.STFICHEREF
    WHERE L.TRCODE = 1 AND L.CANCELLED = 0 AND L.LINETYPE = 0
      AND L.AMOUNT > 0
  `);

  const allRows = [...lg123Rows, ...lg001Rows];

  const insert = db.prepare(`
    INSERT INTO tiger_purchase_history
      (tarih, fis_no, malzeme_kodu, malzeme_adi, tedarikci,
       miktar, bekleyen, iade, birim_fiyat, net_tutar, fatura_tutar,
       para_birimi, firma)
    VALUES
      (@tarih, @fis_no, @malzeme_kodu, @malzeme_adi, @tedarikci,
       @miktar, @bekleyen, @iade, @birim_fiyat, @net_tutar, @fatura_tutar,
       @para_birimi, @firma)
  `);

  db.prepare('DELETE FROM tiger_purchase_history').run();
  const insertMany = db.transaction(rows => { for (const r of rows) insert.run(r); });
  insertMany(allRows);

  db.prepare(`
    INSERT INTO tiger_reports_sync_log (type, row_count, status, message)
    VALUES ('purchase_history', ?, 'success', ?)
  `).run(allRows.length, `LG_123: ${lg123Rows.length}, LG_001: ${lg001Rows.length}`);

  return allRows.length;
}

// ── Tiger3 price analysis sync ───────────────────────────────────────────────
async function syncPriceAnalysis() {
  const db = getDb();

  const rows = await tiger3.query(`
    WITH lines AS (
      SELECT
        S.CODE        AS stok_kodu,
        S.NAME        AS stok_adi,
        S.STGRPCODE   AS stok_grup,
        L.AMOUNT      AS miktar,
        L.PRICE       AS fiyat,
        F.DATE_       AS tarih,
        YEAR(F.DATE_) AS yil,
        MONTH(F.DATE_) AS ay,
        ROW_NUMBER() OVER (PARTITION BY S.CODE ORDER BY F.DATE_ ASC,  L.LOGICALREF ASC)  AS rn_asc,
        ROW_NUMBER() OVER (PARTITION BY S.CODE ORDER BY F.DATE_ DESC, L.LOGICALREF DESC) AS rn_desc
      FROM LG_123_01_ORFLINE L
      JOIN LG_123_01_ORFICHE F ON F.LOGICALREF = L.ORDFICHEREF
      JOIN LG_123_ITEMS       S ON S.LOGICALREF = L.STOCKREF
      WHERE L.TRCODE = 2 AND L.CANCELLED = 0 AND L.PRICE > 0 AND L.AMOUNT > 0
    )
    SELECT
      stok_kodu,
      MAX(stok_adi)                                                        AS malzeme_adi,
      MAX(stok_grup)                                                       AS stok_grup,
      SUM(miktar)                                                          AS toplam_miktar,
      COUNT(*)                                                             AS adet,
      CONVERT(VARCHAR(10), MIN(tarih), 120)                                AS ilk_tarih,
      MAX(CASE WHEN rn_asc  = 1 THEN fiyat ELSE NULL END)                  AS ilk_fiyat,
      CONVERT(VARCHAR(10), MAX(tarih), 120)                                AS son_tarih,
      MAX(CASE WHEN rn_desc = 1 THEN fiyat ELSE NULL END)                  AS son_fiyat,
      AVG(fiyat)                                                           AS ort_fiyat,
      AVG(CASE WHEN yil=2024 AND ay IN (10,11,12) THEN fiyat ELSE NULL END) AS q4_ort,
      AVG(CASE WHEN yil=2026 AND ay IN (1,2,3)    THEN fiyat ELSE NULL END) AS recent_ort
    FROM lines
    GROUP BY stok_kodu
  `);

  const upsert = db.prepare(`
    INSERT OR REPLACE INTO tiger_price_analysis
      (malzeme_kodu, malzeme_adi, stok_grup, toplam_miktar, adet,
       ilk_tarih, ilk_fiyat, son_tarih, son_fiyat, ort_fiyat, q4_ort, recent_ort)
    VALUES
      (@stok_kodu, @malzeme_adi, @stok_grup, @toplam_miktar, @adet,
       @ilk_tarih, @ilk_fiyat, @son_tarih, @son_fiyat, @ort_fiyat, @q4_ort, @recent_ort)
  `);

  db.prepare('DELETE FROM tiger_price_analysis').run();
  const upsertMany = db.transaction(rs => { for (const r of rs) upsert.run(r); });
  upsertMany(rows);

  db.prepare(`
    INSERT INTO tiger_reports_sync_log (type, row_count, status, message)
    VALUES ('price_analysis', ?, 'success', ?)
  `).run(rows.length, `${rows.length} malzeme fiyat analizi güncellendi`);

  return rows.length;
}

// ── Cache-first okuma fonksiyonları ──────────────────────────────────────────
function getPurchaseRows() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM tiger_purchase_history WHERE iade = 0').get().c;
  if (count > 0) {
    return db.prepare(`
      SELECT
        tarih          AS date_str,
        fis_no         AS fisNo,
        malzeme_kodu   AS code,
        malzeme_adi    AS name,
        tedarikci      AS supplier,
        miktar         AS qty,
        bekleyen       AS waitingQty,
        birim_fiyat    AS price,
        net_tutar      AS amount,
        COALESCE(NULLIF(fatura_tutar, 0), net_tutar) AS invoiceAmount,
        para_birimi    AS currency,
        substr(tarih, 1, 7) AS monthKey
      FROM tiger_purchase_history
      WHERE iade = 0 AND tarih IS NOT NULL
    `).all().map(r => ({ ...r, date: new Date(r.date_str) }));
  }
  return getPurchaseRowsFromExcel();
}

function getProductAnalysisRows() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM tiger_price_analysis').get().c;
  if (count > 0) {
    return db.prepare('SELECT * FROM tiger_price_analysis').all().map(item => {
      const firstPrice = item.ilk_fiyat;
      const lastPrice  = item.son_fiyat;
      const firstDate  = item.ilk_tarih ? new Date(item.ilk_tarih) : null;
      const lastDate   = item.son_tarih ? new Date(item.son_tarih)  : null;
      const overallChange = firstPrice && lastPrice && firstPrice > 0
        ? Math.round(((lastPrice - firstPrice) / firstPrice) * 10000) / 100 : null;
      const q4ToRecentChange = item.q4_ort && item.recent_ort && item.q4_ort > 0
        ? Math.round(((item.recent_ort - item.q4_ort) / item.q4_ort) * 10000) / 100 : null;

      const trend = [];
      if (firstDate && firstPrice != null) trend.push({ month: firstDate.toISOString().slice(0, 7), avgPrice: firstPrice, minPrice: firstPrice, maxPrice: firstPrice, count: 1 });
      if (item.q4_ort   != null) trend.push({ month: '2024-Q4', avgPrice: item.q4_ort,    minPrice: item.q4_ort,    maxPrice: item.q4_ort,    count: 1 });
      if (item.recent_ort != null) trend.push({ month: '2026-01', avgPrice: item.recent_ort, minPrice: item.recent_ort, maxPrice: item.recent_ort, count: 1 });
      if (lastDate && lastPrice != null) {
        const lm = lastDate.toISOString().slice(0, 7);
        if (!trend.some(t => t.month === lm && t.avgPrice === lastPrice))
          trend.push({ month: lm, avgPrice: lastPrice, minPrice: lastPrice, maxPrice: lastPrice, count: 1 });
      }

      return {
        product_id: item.malzeme_kodu,
        code:       item.malzeme_kodu,
        name:       item.malzeme_adi || '',
        category:   item.stok_grup   || 'Genel',
        anaGrup:    mapCategory(item.stok_grup),
        firstDate:  firstDate ? firstDate.toISOString().slice(0, 10) : null,
        firstPrice,
        lastDate:   lastDate  ? lastDate.toISOString().slice(0, 10)  : null,
        lastPrice,
        avgPrice:   item.ort_fiyat,
        priceCount: item.adet || 0,
        totalQty:   item.toplam_miktar || 0,
        overallChange,
        q4Avg:            item.q4_ort,
        recentAvg:        item.recent_ort,
        q4ToRecentChange,
        firstToEkaChange: null,
        janToLastChange:  null,
        trend: trend.sort((a, b) => String(a.month).localeCompare(String(b.month))),
        _lastDateObj:  lastDate,
        _firstDateObj: firstDate,
      };
    });
  }
  return getProductAnalysisRowsFromExcel();
}

const PRODUCT_ANALYSIS_EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'Urun Fiyat Analiz.xlsx');
const PRODUCT_ANALYSIS_SHEET_NAME = 'URUN FIYAT ANALIZ';
let productAnalysisCache = { mtimeMs: 0, rows: [] };
const PURCHASE_SOURCE_EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'Ocak 2025-2026 Mart 30.xls');
let purchaseSourceCache = { mtimeMs: 0, rows: [] };
const WAREHOUSE_STOCK_EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'SATINALMA - STOK RAPORU.xlsx');
let warehouseStockCache = { mtimeMs: 0, count: 0 };

function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseNum(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/\./g, '').replace(',', '.').trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function normalizePercent(value) {
  const n = parseNum(value);
  if (n == null) return null;
  if (Math.abs(n) <= 1) return n * 100;
  return n;
}

function getProductAnalysisRowsFromExcel() {
  if (!fs.existsSync(PRODUCT_ANALYSIS_EXCEL_PATH)) return [];
  const stat = fs.statSync(PRODUCT_ANALYSIS_EXCEL_PATH);
  if (productAnalysisCache.rows.length > 0 && stat.mtimeMs === productAnalysisCache.mtimeMs) {
    return productAnalysisCache.rows;
  }

  const wb = XLSX.readFile(PRODUCT_ANALYSIS_EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets[PRODUCT_ANALYSIS_SHEET_NAME] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const parsed = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const code = String(r[2] || '').trim();
    if (!code) continue;
    if (String(r[0] || '').trim().startsWith('▶')) continue;

    const firstPrice = parseNum(r[7]);
    const lastPrice = parseNum(r[14]);
    const qty = parseNum(r[4]) || 0;
    const firstDate = parseExcelDate(r[6]);
    const lastDate = parseExcelDate(r[13]);

    let overallChange = null;
    if (firstPrice && lastPrice && firstPrice > 0) {
      overallChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    }

    const trend = [];
    if (firstDate && firstPrice != null) trend.push({ month: firstDate.toISOString().slice(0, 7), avgPrice: firstPrice, minPrice: firstPrice, maxPrice: firstPrice, count: 1 });
    const ekaMonthLabel = String(r[8] || '').trim();
    const ekaPrice = parseNum(r[9]);
    if (ekaPrice != null && ekaMonthLabel) trend.push({ month: ekaMonthLabel, avgPrice: ekaPrice, minPrice: ekaPrice, maxPrice: ekaPrice, count: 1 });
    const jan2026Price = parseNum(r[11]);
    if (jan2026Price != null) trend.push({ month: '2026-01', avgPrice: jan2026Price, minPrice: jan2026Price, maxPrice: jan2026Price, count: 1 });
    if (lastDate && lastPrice != null) trend.push({ month: lastDate.toISOString().slice(0, 7), avgPrice: lastPrice, minPrice: lastPrice, maxPrice: lastPrice, count: 1 });

    const dedupedTrend = [];
    const seen = new Set();
    for (const t of trend) {
      const key = `${t.month}-${t.avgPrice}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedupedTrend.push(t);
    }

    parsed.push({
      product_id: code,
      code,
      name: String(r[3] || '').trim(),
      category: String(r[1] || '').trim() || 'Genel',
      anaGrup: String(r[0] || '').trim() || 'DIGER',
      firstDate: firstDate ? firstDate.toISOString().slice(0, 10) : null,
      firstPrice,
      lastDate: lastDate ? lastDate.toISOString().slice(0, 10) : null,
      lastPrice,
      avgPrice: parseNum(r[5]),
      priceCount: parseNum(r[17]) || 0,
      totalQty: qty,
      overallChange: overallChange == null ? null : Math.round(overallChange * 100) / 100,
      q4Avg: parseNum(r[9]),
      recentAvg: parseNum(r[11]),
      q4ToRecentChange: normalizePercent(r[12]) == null ? null : Math.round(normalizePercent(r[12]) * 100) / 100,
      firstToEkaChange: normalizePercent(r[10]) == null ? null : Math.round(normalizePercent(r[10]) * 100) / 100,
      janToLastChange: normalizePercent(r[15]) == null ? null : Math.round(normalizePercent(r[15]) * 100) / 100,
      trend: dedupedTrend.sort((a, b) => String(a.month).localeCompare(String(b.month))),
      _lastDateObj: lastDate,
      _firstDateObj: firstDate,
    });
  }

  productAnalysisCache = { mtimeMs: stat.mtimeMs, rows: parsed };
  return parsed;
}

function getPurchaseRowsFromExcel() {
  if (!fs.existsSync(PURCHASE_SOURCE_EXCEL_PATH)) return [];
  const stat = fs.statSync(PURCHASE_SOURCE_EXCEL_PATH);
  if (purchaseSourceCache.rows.length > 0 && stat.mtimeMs === purchaseSourceCache.mtimeMs) {
    return purchaseSourceCache.rows;
  }

  const wb = XLSX.readFile(PURCHASE_SOURCE_EXCEL_PATH, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const parsed = [];
  for (let i = 1; i < raw.length; i += 1) {
    const r = raw[i] || [];
    const code = String(r[5] || '').trim();
    const name = String(r[6] || '').trim();
    if (!code) continue;

    const qty = parseNum(r[8]) || 0;
    const waitingQty = parseNum(r[11]) || 0;
    const returnQty = parseNum(r[12]) || 0;
    const price = parseNum(r[13]);
    const amount = parseNum(r[14]) || 0;
    const invoiceAmount = parseNum(r[16]) || amount;
    const supplier = String(r[4] || '').trim() || '-';
    const date = parseExcelDate(r[2]) || new Date(Number(r[0]) || 2000, (Number(r[1]) || 1) - 1, 1);
    if (!date) continue;
    if (returnQty > 0) continue;

    parsed.push({
      fisNo: String(r[3] || '').trim(),
      code,
      name,
      supplier,
      qty,
      waitingQty,
      price,
      amount,
      invoiceAmount,
      currency: String(r[19] || 'TRY').trim(),
      date,
      monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  purchaseSourceCache = { mtimeMs: stat.mtimeMs, rows: parsed };
  return parsed;
}

function getLowStockFromWarehouseExcel() {
  if (!fs.existsSync(WAREHOUSE_STOCK_EXCEL_PATH)) return 0;
  try {
    const stat = fs.statSync(WAREHOUSE_STOCK_EXCEL_PATH);
    if (stat.mtimeMs === warehouseStockCache.mtimeMs) return warehouseStockCache.count;
    const wb = XLSX.readFile(WAREHOUSE_STOCK_EXCEL_PATH, { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return 0;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    let count = 0;
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const gebze = parseNum(r[2]) || 0;
      const eticaret = parseNum(r[3]) || 0;
      const showroom = parseNum(r[4]) || 0;
      const total = gebze + eticaret + showroom;
      if (total <= 0) count += 1;
    }
    warehouseStockCache = { mtimeMs: stat.mtimeMs, count };
    return count;
  } catch {
    return 0;
  }
}

// GET /api/reports/dashboard
router.get('/dashboard', (req, res) => {
  const db = getDb();
  const allowedPeriods = new Set([1, 3, 6, 12]);
  const requestedPeriod = Number(req.query.period);
  const period = allowedPeriods.has(requestedPeriod) ? requestedPeriod : 6;
  const currentStartOffset = `-${period - 1} months`;
  const previousStartOffset = `-${(period * 2) - 1} months`;
  const currentStartExpr = `date('now', 'localtime', 'start of month', '${currentStartOffset}')`;
  const previousStartExpr = `date('now', 'localtime', 'start of month', '${previousStartOffset}')`;
  const previousEndExpr = currentStartExpr;
  const periodOrderDateWhere = `date(order_date) >= ${currentStartExpr}`;
  const periodCreatedAtWhere = `date(created_at) >= ${currentStartExpr}`;

  let totalSuppliers = db.prepare('SELECT COUNT(*) as c FROM suppliers WHERE active=1').get().c;
  let totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE active=1').get().c;
  let activePo = db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE status NOT IN ('kapanan','cancelled')").get().c;
  const openRfq = db.prepare("SELECT COUNT(*) as c FROM quotations WHERE status='open'").get().c;
  let lowStock = db.prepare('SELECT COUNT(*) as c FROM inventory i JOIN products p ON p.id=i.product_id WHERE i.quantity <= p.min_stock_level AND p.active=1').get().c;
  const overduePo = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
    FROM purchase_orders
    WHERE status NOT IN ('kapanan','cancelled')
      AND expected_date IS NOT NULL
      AND date(expected_date) < date('now')
  `).get();
  let openOrderSummary = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
    FROM purchase_orders
    WHERE status = 'açık'
  `).get();
  let openOrders = db.prepare(`
    SELECT
      po.id,
      po.po_number,
      po.order_date,
      po.total_amount,
      po.currency,
      s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.status = 'açık'
    ORDER BY po.order_date DESC
    LIMIT 50
  `).all();

  let excelFallback = null;

  // DB bossa dashboard kartlari icin excel fallback kullan.
  if (totalSuppliers === 0 && totalProducts === 0 && activePo === 0) {
    const excelRows = getPurchaseRows();
    const supplierSet = new Set();
    const productSet = new Set();
    const poMap = new Map();
    for (const r of excelRows) {
      if (r.supplier) supplierSet.add(r.supplier);
      if (r.code) productSet.add(r.code);
      const key = r.fisNo || `${r.supplier}-${r.date?.toISOString().slice(0, 10)}`;
      if (!poMap.has(key)) {
        poMap.set(key, {
          id: key,
          po_number: key,
          order_date: r.date ? r.date.toISOString().slice(0, 10) : null,
          total_amount: 0,
          currency: r.currency || 'TRY',
          supplier_name: r.supplier || '-',
          waitingQty: 0,
          totalQty: 0,
        });
      }
      const po = poMap.get(key);
      po.total_amount += Number(r.invoiceAmount || 0);
      po.waitingQty += Number(r.waitingQty || 0);
      po.totalQty += Number(r.qty || 0);
    }

    const allPo = [...poMap.values()];
    const openPo = allPo.filter(x => x.waitingQty > 0);
    totalSuppliers = supplierSet.size;
    totalProducts = productSet.size;
    activePo = allPo.length;
    openOrderSummary = {
      count: openPo.length,
      total: openPo.reduce((s, x) => s + Number(x.total_amount || 0), 0),
    };
    openOrders = openPo
      .sort((a, b) => String(b.order_date || '').localeCompare(String(a.order_date || '')))
      .slice(0, 50)
      .map(({ waitingQty, totalQty, ...rest }) => rest);

    excelFallback = { allPo, openPo };

    if (lowStock === 0) {
      lowStock = getLowStockFromWarehouseExcel();
    }
  }

  let recentPo = db.prepare(`
    SELECT po.po_number, po.status, po.total_amount, po.order_date, s.name as supplier_name
    FROM purchase_orders po
    JOIN suppliers s ON s.id=po.supplier_id
    WHERE ${periodOrderDateWhere}
    ORDER BY po.created_at DESC
    LIMIT 5
  `).all();

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

  // Fiyat artış uyarıları — tek sorguda
  const triggeredAlerts = db.prepare(`
    WITH ranked AS (
      SELECT product_id, price, price_date,
        ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY price_date DESC) AS rn
      FROM price_history
    ),
    latest AS (SELECT * FROM ranked WHERE rn = 1),
    prev   AS (SELECT * FROM ranked WHERE rn = 2)
    SELECT pa.*, p.name AS product_name, p.code,
      l.price AS latest_price,
      ROUND((l.price - prev.price) * 100.0 / prev.price, 2) AS change_percent
    FROM price_alerts pa
    JOIN products p ON p.id = pa.product_id
    JOIN latest l ON l.product_id = pa.product_id
    JOIN prev ON prev.product_id = pa.product_id
    WHERE pa.active = 1
      AND prev.price > 0
      AND ROUND((l.price - prev.price) * 100.0 / prev.price, 2) >= pa.threshold_percent
  `).all();

  // En fazla fiyat artışı olan ürünler — tek sorguda (window function)
  let topPriceIncreasesSliced = db.prepare(`
    WITH ranked AS (
      SELECT ph.product_id, ph.price, ph.price_date, s.name AS supplier_name,
        ROW_NUMBER() OVER (PARTITION BY ph.product_id ORDER BY ph.price_date DESC) AS rn
      FROM price_history ph
      JOIN suppliers s ON s.id = ph.supplier_id
    ),
    latest AS (SELECT * FROM ranked WHERE rn = 1),
    prev   AS (SELECT * FROM ranked WHERE rn = 2)
    SELECT l.product_id, p.name, p.code,
      l.price AS latest_price, prev.price AS prev_price,
      l.supplier_name, l.price_date,
      ROUND((l.price - prev.price) * 100.0 / prev.price, 2) AS change_percent
    FROM latest l
    JOIN prev ON prev.product_id = l.product_id
    JOIN products p ON p.id = l.product_id
    WHERE p.active = 1 AND prev.price > 0 AND l.price > prev.price
    ORDER BY change_percent DESC
    LIMIT 10
  `).all();

  if (!topPriceIncreasesSliced.length) {
    const excelPriceRows = getProductAnalysisRows();
    topPriceIncreasesSliced = excelPriceRows
      .filter(item => Number(item.overallChange || 0) > 0)
      .sort((a, b) => Number(b.overallChange || 0) - Number(a.overallChange || 0))
      .slice(0, 10)
      .map(item => ({
        product_id: item.product_id,
        name: item.name,
        code: item.code,
        change_percent: Number(item.overallChange || 0),
        latest_price: Number(item.lastPrice || 0),
        prev_price: Number(item.firstPrice || 0),
        supplier_name: '-',
        price_date: item.lastDate,
      }));
  }

  // Aktif PO özeti (durum bazında)
  let poByStatus = db.prepare(`
    SELECT status, COUNT(*) as count, SUM(total_amount) as total
    FROM purchase_orders
    WHERE status NOT IN ('cancelled') AND ${periodOrderDateWhere}
    GROUP BY status
  `).all();

  let monthSummary = {
    poCount: db.prepare(`SELECT COUNT(*) as c FROM purchase_orders WHERE ${periodOrderDateWhere}`).get().c,
    poTotal: db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as total FROM purchase_orders WHERE ${periodOrderDateWhere}`).get().total,
    newSuppliers: db.prepare(`SELECT COUNT(*) as c FROM suppliers WHERE ${periodCreatedAtWhere}`).get().c,
    newProducts: db.prepare(`SELECT COUNT(*) as c FROM products WHERE ${periodCreatedAtWhere}`).get().c,
    previousPoTotal: db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM purchase_orders
      WHERE date(order_date) >= ${previousStartExpr} AND date(order_date) < ${previousEndExpr}
    `).get().total,
  };

  monthSummary.poTotalChangePercent = monthSummary.previousPoTotal > 0
    ? Math.round(((monthSummary.poTotal - monthSummary.previousPoTotal) / monthSummary.previousPoTotal) * 10000) / 100
    : null;

  let monthlyPurchaseTrend = db.prepare(`
    SELECT month, po_count, total_amount FROM (
      SELECT
        substr(order_date, 1, 7) as month,
        COUNT(*) as po_count,
        COALESCE(SUM(total_amount), 0) as total_amount
      FROM purchase_orders
      WHERE order_date IS NOT NULL AND ${periodOrderDateWhere}
      GROUP BY substr(order_date, 1, 7)
      ORDER BY month DESC
      LIMIT ${period}
    ) trend
    ORDER BY month ASC
  `).all();

  let topSuppliers = db.prepare(`
    SELECT
      s.id,
      s.name,
      COUNT(po.id) as po_count,
      COALESCE(SUM(po.total_amount), 0) as total_amount,
      MAX(po.order_date) as last_order_date
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.status != 'cancelled' AND ${periodOrderDateWhere}
    GROUP BY s.id, s.name
    ORDER BY total_amount DESC, po_count DESC
    LIMIT 5
  `).all();

  let supplierPerformance = db.prepare(`
    SELECT
      s.id,
      s.name,
      COUNT(po.id) as total_orders,
      COALESCE(SUM(po.total_amount), 0) as total_amount,
      SUM(CASE WHEN po.status = 'kapanan' THEN 1 ELSE 0 END) as delivered_orders,
      SUM(CASE WHEN po.status = 'kapanan' AND po.delivery_date IS NOT NULL AND po.expected_date IS NOT NULL AND date(po.delivery_date) <= date(po.expected_date) THEN 1 ELSE 0 END) as on_time_deliveries,
      SUM(CASE WHEN po.status = 'kapanan' AND po.delivery_date IS NOT NULL AND po.expected_date IS NOT NULL AND date(po.delivery_date) > date(po.expected_date) THEN 1 ELSE 0 END) as late_deliveries,
      AVG(CASE WHEN po.status = 'kapanan' AND po.delivery_date IS NOT NULL AND po.expected_date IS NOT NULL AND date(po.delivery_date) > date(po.expected_date) THEN julianday(date(po.delivery_date)) - julianday(date(po.expected_date)) END) as avg_delay_days,
      MAX(CASE WHEN po.status = 'kapanan' AND po.delivery_date IS NOT NULL AND po.expected_date IS NOT NULL AND date(po.delivery_date) > date(po.expected_date) THEN julianday(date(po.delivery_date)) - julianday(date(po.expected_date)) END) as max_delay_days,
      SUM(CASE WHEN po.status NOT IN ('kapanan','cancelled') AND po.expected_date IS NOT NULL AND date(po.expected_date) < date('now') THEN 1 ELSE 0 END) as delayed_open_orders,
      MAX(po.order_date) as last_order_date
    FROM purchase_orders po
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.status != 'cancelled' AND ${periodOrderDateWhere}
    GROUP BY s.id, s.name
    HAVING COUNT(po.id) > 0
    ORDER BY total_amount DESC, total_orders DESC
    LIMIT 8
  `).all().map(item => {
    const deliveredOrders = Number(item.delivered_orders) || 0;
    const onTimeDeliveries = Number(item.on_time_deliveries) || 0;
    const lateDeliveries = Number(item.late_deliveries) || 0;
    const delayedOpenOrders = Number(item.delayed_open_orders) || 0;
    const avgDelayDays = item.avg_delay_days == null ? 0 : Math.round(Number(item.avg_delay_days) * 10) / 10;
    const maxDelayDays = item.max_delay_days == null ? 0 : Math.round(Number(item.max_delay_days) * 10) / 10;
    const onTimeRate = deliveredOrders > 0 ? Math.round((onTimeDeliveries / deliveredOrders) * 100) : null;
    const baseScore = deliveredOrders > 0 ? (onTimeDeliveries / deliveredOrders) * 100 : delayedOpenOrders > 0 ? 55 : null;
    const performanceScore = baseScore == null
      ? null
      : Math.max(0, Math.min(100, Math.round(baseScore - (avgDelayDays * 2.5) - (lateDeliveries * 3) - (delayedOpenOrders * 6))));
    return {
      ...item,
      onTimeRate,
      avgDelayDays,
      maxDelayDays,
      performanceScore,
    };
  }).sort((a, b) => (b.performanceScore ?? -1) - (a.performanceScore ?? -1)).slice(0, 5);

  let recentActivities = db.prepare(`
    SELECT * FROM (
      SELECT
        'po' as type,
        po.created_at as created_at,
        po.po_number as title,
        COALESCE(s.name, 'Bilinmeyen tedarikçi') as subtitle,
        'PO oluşturuldu' as action,
        po.status as status,
        po.total_amount as amount
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      WHERE date(po.order_date) >= ${currentStartExpr}

      UNION ALL

      SELECT
        'price' as type,
        ph.created_at as created_at,
        p.name as title,
        COALESCE(s.name, 'Bilinmeyen tedarikçi') as subtitle,
        'Yeni fiyat kaydı' as action,
        ph.currency as status,
        ph.price as amount
      FROM price_history ph
      LEFT JOIN products p ON p.id = ph.product_id
      LEFT JOIN suppliers s ON s.id = ph.supplier_id
      WHERE date(ph.created_at) >= ${currentStartExpr}

      UNION ALL

      SELECT
        'inventory' as type,
        it.created_at as created_at,
        p.name as title,
        COALESCE(it.reference, 'Manuel hareket') as subtitle,
        CASE it.type
          WHEN 'in' THEN 'Stok girişi'
          WHEN 'out' THEN 'Stok çıkışı'
          ELSE 'Stok düzeltmesi'
        END as action,
        it.type as status,
        it.quantity as amount
      FROM inventory_transactions it
      LEFT JOIN products p ON p.id = it.product_id
      WHERE date(it.created_at) >= ${currentStartExpr}

      UNION ALL

      SELECT
        'document' as type,
        d.created_at as created_at,
        d.original_name as title,
        d.entity_type as subtitle,
        'Belge yüklendi' as action,
        d.mimetype as status,
        d.size as amount
      FROM documents d
      WHERE date(d.created_at) >= ${currentStartExpr}
    ) activities
    ORDER BY datetime(created_at) DESC
    LIMIT 8
  `).all();

  if (excelFallback) {
    const { allPo, openPo } = excelFallback;
    const statusBuckets = {
      'açık': { status: 'açık', count: 0, total: 0 },
      bekleyen: { status: 'bekleyen', count: 0, total: 0 },
      kapanan: { status: 'kapanan', count: 0, total: 0 },
    };

    for (const po of allPo) {
      let st = 'bekleyen';
      if ((po.waitingQty || 0) <= 0) st = 'kapanan';
      else if ((po.totalQty || 0) > 0 && (po.waitingQty || 0) >= (po.totalQty || 0)) st = 'açık';
      statusBuckets[st].count += 1;
      statusBuckets[st].total += Number(po.total_amount || 0);
      po.status = st;
    }
    poByStatus = Object.values(statusBuckets);

    const supplierMap = new Map();
    for (const po of allPo) {
      const key = po.supplier_name || '-';
      if (!supplierMap.has(key)) {
        supplierMap.set(key, { id: key, name: key, po_count: 0, total_amount: 0, last_order_date: po.order_date || null });
      }
      const s = supplierMap.get(key);
      s.po_count += 1;
      s.total_amount += Number(po.total_amount || 0);
      if ((po.order_date || '') > (s.last_order_date || '')) s.last_order_date = po.order_date;
    }
    topSuppliers = [...supplierMap.values()]
      .sort((a, b) => Number(b.total_amount || 0) - Number(a.total_amount || 0))
      .slice(0, 5);

    recentPo = [...allPo]
      .sort((a, b) => String(b.order_date || '').localeCompare(String(a.order_date || '')))
      .slice(0, 5)
      .map(({ waitingQty, totalQty, ...rest }) => rest);

    const endDate = allPo.reduce((acc, p) => {
      const d = p.order_date ? new Date(p.order_date) : null;
      if (!d || Number.isNaN(d.getTime())) return acc;
      return !acc || d > acc ? d : acc;
    }, null);
    const startDate = endDate ? new Date(endDate) : null;
    if (startDate) startDate.setMonth(startDate.getMonth() - (period - 1));
    const inPeriodPo = startDate
      ? allPo.filter(p => {
        const d = p.order_date ? new Date(p.order_date) : null;
        if (!d || Number.isNaN(d.getTime())) return false;
        return d >= startDate && d <= endDate;
      })
      : allPo;

    const monthMap = new Map();
    for (const po of inPeriodPo) {
      const mk = String(po.order_date || '').slice(0, 7);
      if (!mk) continue;
      if (!monthMap.has(mk)) monthMap.set(mk, { month: mk, po_count: 0, total_amount: 0 });
      const m = monthMap.get(mk);
      m.po_count += 1;
      m.total_amount += Number(po.total_amount || 0);
    }
    monthlyPurchaseTrend = [...monthMap.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));

    monthSummary = {
      ...monthSummary,
      poCount: inPeriodPo.length,
      poTotal: inPeriodPo.reduce((s, p) => s + Number(p.total_amount || 0), 0),
      newSuppliers: 0,
      newProducts: 0,
      previousPoTotal: null,
      poTotalChangePercent: null,
    };

    supplierPerformance = topSuppliers.map(s => ({
      id: s.id,
      name: s.name,
      total_orders: s.po_count,
      total_amount: s.total_amount,
      delivered_orders: 0,
      onTimeRate: null,
      delayed_open_orders: 0,
      avgDelayDays: 0,
      maxDelayDays: 0,
      performanceScore: null,
      last_order_date: s.last_order_date,
    }));

    recentActivities = [];
  }

  // Son ödemeler (finance varsa)
  let financeOzet = null;

  const hasProjectsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_offers'").get();
  let projectSummary = {
    total: 0,
    won: 0,
    lost: 0,
    pending: 0,
    offered: 0,
    quotedTlTotal: 0,
    realizedRevenueTlTotal: 0,
    realizedCostTlTotal: 0,
  };
  let projectMonthlyTrend = [];

  if (hasProjectsTable) {
    projectSummary = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won,
        SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) as lost,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status='offered' THEN 1 ELSE 0 END) as offered,
        COALESCE(SUM(quoted_tl), 0) as quotedTlTotal,
        COALESCE(SUM(realized_revenue_tl), 0) as realizedRevenueTlTotal,
        COALESCE(SUM(realized_cost_tl), 0) as realizedCostTlTotal
      FROM project_offers
    `).get() || projectSummary;

    projectMonthlyTrend = db.prepare(`
      SELECT month, won, lost, offered FROM (
        SELECT
          substr(COALESCE(created_date, created_at), 1, 7) as month,
          SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) as won,
          SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) as lost,
          SUM(CASE WHEN status IN ('offered','pending') THEN 1 ELSE 0 END) as offered
        FROM project_offers
        WHERE COALESCE(created_date, created_at) IS NOT NULL
        GROUP BY substr(COALESCE(created_date, created_at), 1, 7)
        ORDER BY month DESC
        LIMIT 8
      ) x
      ORDER BY month ASC
    `).all();
  }

  res.json({
    totalSuppliers,
    totalProducts,
    activePo,
    openRfq,
    lowStock,
    overduePo,
    period,
    monthSummary,
    monthlyPurchaseTrend,
    recentPo,
    triggeredAlerts,
    criticalStock,
    topPriceIncreases: topPriceIncreasesSliced,
    poByStatus,
    topSuppliers,
    supplierPerformance,
    recentActivities,
    openOrderSummary,
    openOrders,
    projectSummary,
    projectMonthlyTrend,
  });
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
  const excelRows = getPurchaseRows();
  if (excelRows.length > 0) {
    const monthMap = new Map();
    for (const row of excelRows) {
      if (!monthMap.has(row.monthKey)) {
        monthMap.set(row.monthKey, { month: row.monthKey, GENEL_TOPLAM: 0, orderCount: 0, suppliers: new Set() });
      }
      const bucket = monthMap.get(row.monthKey);
      bucket.GENEL_TOPLAM += Number(row.invoiceAmount || 0);
      bucket.orderCount += 1;
      bucket.suppliers.add(row.supplier);
    }

    const monthTrend = [...monthMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(m => ({
        month: m.month,
        GENEL_TOPLAM: Math.round(m.GENEL_TOPLAM * 100) / 100,
        orderCount: m.orderCount,
        supplierCount: m.suppliers.size,
      }));

    const currentMonth = monthTrend[monthTrend.length - 1]?.month || null;
    const prevMonth = monthTrend.length > 1 ? monthTrend[monthTrend.length - 2].month : null;
    const currentRows = excelRows.filter(r => r.monthKey === currentMonth);

    const byCode = new Map();
    for (const r of excelRows) {
      if (!byCode.has(r.code)) byCode.set(r.code, []);
      byCode.get(r.code).push(r);
    }
    for (const list of byCode.values()) {
      list.sort((a, b) => a.date - b.date);
    }

    const comparisons = [];
    const usedCodes = new Set();
    const currentRowsSorted = [...currentRows].sort((a, b) => b.date - a.date);
    for (const current of currentRowsSorted) {
      if (usedCodes.has(current.code)) continue;
      usedCodes.add(current.code);
      const list = byCode.get(current.code) || [];
      const idx = list.findIndex(x => x.date.getTime() === current.date.getTime() && x.supplier === current.supplier && x.qty === current.qty);
      const prev = idx > 0 ? list[idx - 1] : null;
      const changePercent = prev && prev.price > 0 && current.price != null
        ? ((current.price - prev.price) / prev.price) * 100
        : null;

      comparisons.push({
        code: current.code,
        name: current.name,
        currentDate: current.date.toISOString().slice(0, 10),
        currentSupplier: current.supplier,
        currentPrice: current.price,
        currentQty: current.qty,
        previousDate: prev ? prev.date.toISOString().slice(0, 10) : null,
        previousSupplier: prev ? prev.supplier : null,
        previousPrice: prev ? prev.price : null,
        changePercent: changePercent == null ? null : Math.round(changePercent * 100) / 100,
      });
    }

    const comparable = comparisons.filter(x => x.changePercent != null);
    const currentMonthTotal = monthTrend.find(x => x.month === currentMonth)?.GENEL_TOPLAM || 0;
    const previousMonthTotal = monthTrend.find(x => x.month === prevMonth)?.GENEL_TOPLAM || 0;

    res.json({
      mode: 'excel-comparison',
      months: monthTrend.map(m => ({ month: m.month, GENEL_TOPLAM: m.GENEL_TOPLAM })),
      categories: ['GENEL_TOPLAM'],
      currentMonth,
      previousMonth: prevMonth,
      summary: {
        currentMonthTotal,
        previousMonthTotal,
        monthToMonthChangePercent: previousMonthTotal > 0 ? Math.round((((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100) * 100) / 100 : null,
        currentMonthOrderCount: currentRows.length,
        currentMonthSupplierCount: new Set(currentRows.map(r => r.supplier)).size,
        comparedProductCount: comparable.length,
      },
      monthTrend: monthTrend.slice(-12),
      comparisons,
      topIncreases: [...comparable].sort((a, b) => b.changePercent - a.changePercent).slice(0, 20),
      topDecreases: [...comparable].sort((a, b) => a.changePercent - b.changePercent).slice(0, 20),
    });
    return;
  }

  const db = getDb();

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
// GET /api/reports/product-price-analysis?category=&search=&period=3|6|12|all&year=&month=
router.get('/product-price-analysis', (req, res) => {
  const { category, search, period = 'all', year, month } = req.query;
  const periodMonths = period === '3' || period === '6' || period === '12' ? Number(period) : null;
  const selectedYear = year ? Number(year) : null;
  const selectedMonth = month ? Number(month) : null;
  const normalizedSearch = search ? normTr(search) : '';

  let rows = getProductAnalysisRows();

  const maxDate = rows.reduce((acc, row) => {
    const d = row._lastDateObj;
    if (!d) return acc;
    return !acc || d > acc ? d : acc;
  }, null);

  if (periodMonths && maxDate) {
    const from = new Date(maxDate);
    from.setMonth(from.getMonth() - periodMonths);
    rows = rows.filter(row => row._lastDateObj && row._lastDateObj >= from && row._lastDateObj <= maxDate);
  }

  if (selectedYear) {
    rows = rows.filter(row => row._lastDateObj && row._lastDateObj.getFullYear() === selectedYear);
  }
  if (selectedMonth && selectedMonth >= 1 && selectedMonth <= 12) {
    rows = rows.filter(row => row._lastDateObj && (row._lastDateObj.getMonth() + 1) === selectedMonth);
  }
  if (category) {
    rows = rows.filter(row => row.anaGrup === category);
  }
  if (normalizedSearch) {
    rows = rows.filter(row => normTr(`${row.code} ${row.name}`).includes(normalizedSearch));
  }

  const weightedBase = rows.reduce((sum, r) => sum + ((r.firstPrice || 0) * (r.totalQty || 0)), 0);
  const weightedLast = rows.reduce((sum, r) => sum + ((r.lastPrice || 0) * (r.totalQty || 0)), 0);
  const weightedIncreasePercent = weightedBase > 0 ? ((weightedLast - weightedBase) / weightedBase) * 100 : null;
  const validChanges = rows.filter(r => r.overallChange != null).map(r => r.overallChange);

  const summary = {
    totalProducts: rows.length,
    totalStockQty: rows.reduce((sum, r) => sum + (r.totalQty || 0), 0),
    avgIncreasePercent: validChanges.length > 0 ? validChanges.reduce((a, b) => a + b, 0) / validChanges.length : null,
    weightedIncreasePercent,
    period,
    year: selectedYear || null,
    month: selectedMonth || null,
  };

  const availableYears = [...new Set(getProductAnalysisRows().map(r => r._lastDateObj?.getFullYear()).filter(Boolean))].sort((a, b) => b - a);

  const data = rows
    .map(({ _lastDateObj, _firstDateObj, ...rest }) => rest)
    .sort((a, b) => {
      const ac = String(a.anaGrup || '');
      const bc = String(b.anaGrup || '');
      if (ac !== bc) return ac.localeCompare(bc, 'tr');
      return String(a.code || '').localeCompare(String(b.code || ''), 'tr');
    });

  res.json({ summary, availableYears, data });
});

// POST /api/reports/sync/purchase-history
router.post('/sync/purchase-history', async (req, res) => {
  try {
    const count = await syncPurchaseHistory();
    res.json({ success: true, count, message: `${count} satır yüklendi` });
  } catch (err) {
    const db = getDb();
    db.prepare(`INSERT INTO tiger_reports_sync_log (type, row_count, status, message) VALUES ('purchase_history', 0, 'error', ?)`).run(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/reports/sync/price-analysis
router.post('/sync/price-analysis', async (req, res) => {
  try {
    const count = await syncPriceAnalysis();
    res.json({ success: true, count, message: `${count} malzeme fiyat analizi güncellendi` });
  } catch (err) {
    const db = getDb();
    db.prepare(`INSERT INTO tiger_reports_sync_log (type, row_count, status, message) VALUES ('price_analysis', 0, 'error', ?)`).run(err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/sync/status
router.get('/sync/status', (req, res) => {
  const db = getDb();
  const purchaseCount = db.prepare('SELECT COUNT(*) AS c FROM tiger_purchase_history').get().c;
  const priceCount    = db.prepare('SELECT COUNT(*) AS c FROM tiger_price_analysis').get().c;
  const lastPurchase  = db.prepare(`SELECT synced_at, status, message FROM tiger_reports_sync_log WHERE type='purchase_history' ORDER BY id DESC LIMIT 1`).get();
  const lastPrice     = db.prepare(`SELECT synced_at, status, message FROM tiger_reports_sync_log WHERE type='price_analysis'    ORDER BY id DESC LIMIT 1`).get();
  res.json({
    purchase_history: { count: purchaseCount, last_sync: lastPurchase || null },
    price_analysis:   { count: priceCount,    last_sync: lastPrice    || null },
  });
});

module.exports = Object.assign(router, { syncPurchaseHistory, syncPriceAnalysis });
