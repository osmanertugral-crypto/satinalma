const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

const EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'SATINALMA - STOK RAPORU.xlsx');
const SHEET_NAME = 'AA_KUMULATIF_STOK_RAPORU_123_BU';

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
router.post('/sync', (req, res) => {
  try {
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
    // Log error
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

  let where = '1=1';
  const params = [];

  if (search) {
    where += ' AND (stok_kodu LIKE ? OR stok_adi LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
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
  const types = db.prepare('SELECT DISTINCT kart_tipi FROM warehouse_stock WHERE kart_tipi IS NOT NULL AND kart_tipi != "" ORDER BY kart_tipi').all();
  res.json(types.map(t => t.kart_tipi));
});

module.exports = router;
