const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');
const { getDb } = require('../db/schema');
const { normTr } = require('../utils/searchUtils');
const { authenticate } = require('../middleware/auth');
const { refreshExcelQueries } = require('../utils/excelRefresh');

router.use(authenticate);

const EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'SATINALMA - STOK RAPORU.xlsx');
const SHEET_NAME = 'AA_KUMULATIF_STOK_RAPORU_123_BU';

function getExcelStockRows() {
  const fs = require('fs');
  if (!fs.existsSync(EXCEL_PATH)) return [];
  const wb = XLSX.readFile(EXCEL_PATH);
  if (!wb.SheetNames.includes(SHEET_NAME)) return [];
  const ws = wb.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const kod = String(r[0] || '').trim();
    if (!kod) continue;
    out.push({
      stok_kodu: kod,
      stok_adi: String(r[1] || '').trim(),
      gebze_stok: Math.round((+r[2] || 0) * 100) / 100,
      eticaret_stok: Math.round((+r[3] || 0) * 100) / 100,
      showroom_stok: Math.round((+r[4] || 0) * 100) / 100,
      birim_fiyat: Math.round((+r[5] || 0) * 100) / 100,
      gebze_tutar: Math.round((+r[6] || 0) * 100) / 100,
      eticaret_tutar: Math.round((+r[7] || 0) * 100) / 100,
      showroom_tutar: Math.round((+r[8] || 0) * 100) / 100,
      kart_tipi: String(r[9] || '').trim(),
    });
  }
  return out;
}

// Excel'den oku ve DB'ye senkronize et
function syncFromExcel() {
  const fs = require('fs');
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error('Excel dosyası bulunamadı: ' + EXCEL_PATH);
  }

  const wb = XLSX.readFile(EXCEL_PATH);
  if (!wb.SheetNames.includes(SHEET_NAME)) {
    throw new Error('Sheet bulunamadı: ' + SHEET_NAME);
  }

  const ws = wb.Sheets[SHEET_NAME];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rows.length < 2) {
    throw new Error('Excel dosyası boş veya başlık satırı yok');
  }

  const db = getDb();

  // Mevcut veriyi temizle ve yeniden yükle (tam senkronizasyon)
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM warehouse_stock').run();

    const stmt = db.prepare(`
      INSERT INTO warehouse_stock (stok_kodu, stok_adi, gebze_stok, eticaret_stok, showroom_stok,
        birim_fiyat, gebze_tutar, eticaret_tutar, showroom_tutar, kart_tipi, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    let count = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const kod = String(r[0] || '').trim();
      if (!kod) continue;

      stmt.run(
        kod,
        String(r[1] || '').trim(),
        Math.round((+r[2] || 0) * 100) / 100,
        Math.round((+r[3] || 0) * 100) / 100,
        Math.round((+r[4] || 0) * 100) / 100,
        Math.round((+r[5] || 0) * 100) / 100,
        Math.round((+r[6] || 0) * 100) / 100,
        Math.round((+r[7] || 0) * 100) / 100,
        Math.round((+r[8] || 0) * 100) / 100,
        String(r[9] || '').trim()
      );
      count++;
    }

    // Sync log
    db.prepare(
      "INSERT INTO warehouse_sync_log (row_count, status, message) VALUES (?, 'success', ?)"
    ).run(count, `${count} ürün senkronize edildi`);

    return count;
  });

  return tx();
}

// POST /api/warehouse/sync — Excel'den veritabanını yenile
// refreshExcel=true gönderilirse önce SQL sorgularını çalıştırır
router.post('/sync', async (req, res) => {
  try {
    if (req.body?.refreshExcel) {
      console.log('Depo: SQL sorguları yenileniyor...');
      await refreshExcelQueries(EXCEL_PATH);
      console.log('Depo: Excel yenilendi, DB senkronizasyonu başlıyor...');
    }
    const count = syncFromExcel();
    const lastSync = getDb().prepare(
      "SELECT synced_at FROM warehouse_sync_log ORDER BY id DESC LIMIT 1"
    ).get();
    res.json({
      success: true,
      count,
      message: `${count} ürün başarıyla senkronize edildi`,
      lastSync: lastSync?.synced_at
    });
  } catch (e) {
    try {
      getDb().prepare(
        "INSERT INTO warehouse_sync_log (row_count, status, message) VALUES (0, 'error', ?)"
      ).run(e.message);
    } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

// GET /api/warehouse/status — Son senkronizasyon durumu
router.get('/status', (req, res) => {
  const db = getDb();
  const totalRows = db.prepare('SELECT COUNT(*) as c FROM warehouse_stock').get().c;
  if (totalRows === 0) {
    const excelRows = getExcelStockRows();
    return res.json({
      totalRows: excelRows.length,
      lastSync: null,
      recentLogs: [],
      source: 'excel-fallback'
    });
  }
  const lastSync = db.prepare(
    "SELECT * FROM warehouse_sync_log ORDER BY id DESC LIMIT 1"
  ).get();
  const recentLogs = db.prepare(
    "SELECT * FROM warehouse_sync_log ORDER BY id DESC LIMIT 10"
  ).all();

  res.json({
    totalRows,
    lastSync: lastSync || null,
    recentLogs
  });
});

// GET /api/warehouse/stock — Stok listesi (filtreleme + sayfalama)
router.get('/stock', (req, res) => {
  const db = getDb();
  const { search, kart_tipi, depo, page = 1, limit = 50, sort = 'stok_kodu', order = 'asc' } = req.query;
  const dbCount = db.prepare('SELECT COUNT(*) as c FROM warehouse_stock').get().c;

  if (dbCount === 0) {
    let rows = getExcelStockRows();
    if (search) {
      const ns = normTr(search);
      rows = rows.filter(r => normTr(r.stok_kodu).includes(ns) || normTr(r.stok_adi).includes(ns));
    }
    if (kart_tipi) rows = rows.filter(r => r.kart_tipi === kart_tipi);
    if (depo === 'gebze') rows = rows.filter(r => (r.gebze_stok || 0) > 0);
    else if (depo === 'eticaret') rows = rows.filter(r => (r.eticaret_stok || 0) > 0);
    else if (depo === 'showroom') rows = rows.filter(r => (r.showroom_stok || 0) > 0);

    const allowedSort = ['stok_kodu', 'stok_adi', 'gebze_stok', 'eticaret_stok', 'showroom_stok', 'birim_fiyat', 'gebze_tutar', 'eticaret_tutar', 'showroom_tutar', 'kart_tipi'];
    const sortCol = allowedSort.includes(sort) ? sort : 'stok_kodu';
    const sortDir = order === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'number' || typeof bv === 'number') return (Number(av || 0) - Number(bv || 0)) * sortDir;
      return String(av || '').localeCompare(String(bv || ''), 'tr') * sortDir;
    });

    const total = rows.length;
    const offset = (Math.max(1, +page) - 1) * +limit;
    return res.json({ rows: rows.slice(offset, offset + (+limit)), total, page: +page, limit: +limit, source: 'excel-fallback' });
  }

  let where = '1=1';
  const params = [];

  if (search) {
    const ns = normTr(search);
    where += ' AND (norm(stok_kodu) LIKE ? OR norm(stok_adi) LIKE ?)';
    params.push(`%${ns}%`, `%${ns}%`);
  }

  if (kart_tipi) {
    where += ' AND kart_tipi = ?';
    params.push(kart_tipi);
  }

  // Sadece belirli depoda stok olanları göster
  if (depo === 'gebze') where += ' AND gebze_stok > 0';
  else if (depo === 'eticaret') where += ' AND eticaret_stok > 0';
  else if (depo === 'showroom') where += ' AND showroom_stok > 0';

  // Toplam sayı
  const totalRow = db.prepare(`SELECT COUNT(*) as c FROM warehouse_stock WHERE ${where}`).get(...params);
  const total = totalRow.c;

  // Allowlist sort
  const allowedSort = ['stok_kodu', 'stok_adi', 'gebze_stok', 'eticaret_stok', 'showroom_stok', 'birim_fiyat', 'gebze_tutar', 'eticaret_tutar', 'showroom_tutar', 'kart_tipi'];
  const sortCol = allowedSort.includes(sort) ? sort : 'stok_kodu';
  const sortDir = order === 'desc' ? 'DESC' : 'ASC';

  const offset = (Math.max(1, +page) - 1) * +limit;
  const rows = db.prepare(
    `SELECT * FROM warehouse_stock WHERE ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`
  ).all(...params, +limit, offset);

  res.json({ rows, total, page: +page, limit: +limit });
});

// GET /api/warehouse/summary — Depo bazlı özet istatistikler
router.get('/summary', (req, res) => {
  const db = getDb();
  const dbCount = db.prepare('SELECT COUNT(*) as c FROM warehouse_stock').get().c;

  if (dbCount === 0) {
    const rows = getExcelStockRows();
    const totals = rows.reduce((acc, r) => {
      acc.urun_sayisi += 1;
      acc.gebze_adet += r.gebze_stok || 0;
      acc.eticaret_adet += r.eticaret_stok || 0;
      acc.showroom_adet += r.showroom_stok || 0;
      acc.gebze_tutar += r.gebze_tutar || 0;
      acc.eticaret_tutar += r.eticaret_tutar || 0;
      acc.showroom_tutar += r.showroom_tutar || 0;
      return acc;
    }, { urun_sayisi: 0, gebze_adet: 0, eticaret_adet: 0, showroom_adet: 0, gebze_tutar: 0, eticaret_tutar: 0, showroom_tutar: 0 });
    totals.toplam_tutar = totals.gebze_tutar + totals.eticaret_tutar + totals.showroom_tutar;
    totals.toplam_adet = totals.gebze_adet + totals.eticaret_adet + totals.showroom_adet;

    const grouped = new Map();
    for (const r of rows) {
      const key = r.kart_tipi || 'Belirsiz';
      if (!grouped.has(key)) grouped.set(key, { kart_tipi: key, urun_sayisi: 0, gebze_adet: 0, eticaret_adet: 0, showroom_adet: 0, gebze_tutar: 0, eticaret_tutar: 0, showroom_tutar: 0, toplam_tutar: 0 });
      const g = grouped.get(key);
      g.urun_sayisi += 1;
      g.gebze_adet += r.gebze_stok || 0;
      g.eticaret_adet += r.eticaret_stok || 0;
      g.showroom_adet += r.showroom_stok || 0;
      g.gebze_tutar += r.gebze_tutar || 0;
      g.eticaret_tutar += r.eticaret_tutar || 0;
      g.showroom_tutar += r.showroom_tutar || 0;
      g.toplam_tutar = g.gebze_tutar + g.eticaret_tutar + g.showroom_tutar;
    }

    return res.json({ totals, byType: Array.from(grouped.values()).sort((a, b) => b.toplam_tutar - a.toplam_tutar), lastSync: null, source: 'excel-fallback' });
  }

  // Genel toplamlar
  const totals = db.prepare(`
    SELECT
      COUNT(*) as urun_sayisi,
      ROUND(SUM(gebze_stok), 2) as gebze_adet,
      ROUND(SUM(eticaret_stok), 2) as eticaret_adet,
      ROUND(SUM(showroom_stok), 2) as showroom_adet,
      ROUND(SUM(gebze_tutar), 2) as gebze_tutar,
      ROUND(SUM(eticaret_tutar), 2) as eticaret_tutar,
      ROUND(SUM(showroom_tutar), 2) as showroom_tutar,
      ROUND(SUM(gebze_tutar + eticaret_tutar + showroom_tutar), 2) as toplam_tutar,
      ROUND(SUM(gebze_stok + eticaret_stok + showroom_stok), 2) as toplam_adet
    FROM warehouse_stock
  `).get();

  // Kart tipi bazlı özet
  const byType = db.prepare(`
    SELECT
      kart_tipi,
      COUNT(*) as urun_sayisi,
      ROUND(SUM(gebze_stok), 2) as gebze_adet,
      ROUND(SUM(eticaret_stok), 2) as eticaret_adet,
      ROUND(SUM(showroom_stok), 2) as showroom_adet,
      ROUND(SUM(gebze_tutar), 2) as gebze_tutar,
      ROUND(SUM(eticaret_tutar), 2) as eticaret_tutar,
      ROUND(SUM(showroom_tutar), 2) as showroom_tutar,
      ROUND(SUM(gebze_tutar + eticaret_tutar + showroom_tutar), 2) as toplam_tutar
    FROM warehouse_stock
    GROUP BY kart_tipi
    ORDER BY toplam_tutar DESC
  `).all();

  // Son sync
  const lastSync = db.prepare(
    "SELECT synced_at FROM warehouse_sync_log WHERE status='success' ORDER BY id DESC LIMIT 1"
  ).get();

  res.json({ totals, byType, lastSync: lastSync?.synced_at || null });
});

// GET /api/warehouse/kart-tipleri — Benzersiz kart tipleri
router.get('/kart-tipleri', (req, res) => {
  const db = getDb();
  const dbCount = db.prepare('SELECT COUNT(*) as c FROM warehouse_stock').get().c;
  if (dbCount === 0) {
    const rows = getExcelStockRows();
    const types = Array.from(new Set(rows.map(r => r.kart_tipi).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b), 'tr'));
    return res.json(types);
  }
  const types = db.prepare("SELECT DISTINCT kart_tipi FROM warehouse_stock WHERE kart_tipi IS NOT NULL AND kart_tipi != '' ORDER BY kart_tipi").all();
  res.json(types.map(t => t.kart_tipi));
});

module.exports = router;
