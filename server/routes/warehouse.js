const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');
const { getDb } = require('../db/schema');
const { normTr } = require('../utils/searchUtils');
const { authenticate } = require('../middleware/auth');
const { refreshExcelQueries } = require('../utils/excelRefresh');
const tiger3 = require('../utils/tiger3');
const evira = require('../utils/evira');

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

// TIGER3'ten stok verisi çek ve DB'ye yaz
async function syncFromTIGER3() {
  const rows = await tiger3.query(`
    SELECT KOD, TANIM, GEBZE_STOK, E_TICARET_STOK, SHOWROOM_STOK,
           BIRIM_FIYAT, GEBZE_TUTAR, E_TICARET_TUTAR, SHOWROOM_TUTAR, KART_TIPI
    FROM AA_KUMULATIF_STOK_RAPORU_123_BURAK_TD
  `);

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM warehouse_stock').run();
    const stmt = db.prepare(`
      INSERT INTO warehouse_stock (stok_kodu, stok_adi, gebze_stok, eticaret_stok, showroom_stok,
        birim_fiyat, gebze_tutar, eticaret_tutar, showroom_tutar, kart_tipi, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
    let count = 0;
    for (const r of rows) {
      const kod = String(r.KOD || '').trim();
      if (!kod) continue;
      stmt.run(
        kod,
        String(r.TANIM || '').trim(),
        Math.round((+r.GEBZE_STOK || 0) * 100) / 100,
        Math.round((+r.E_TICARET_STOK || 0) * 100) / 100,
        Math.round((+r.SHOWROOM_STOK || 0) * 100) / 100,
        Math.round((+r.BIRIM_FIYAT || 0) * 100) / 100,
        Math.round((+r.GEBZE_TUTAR || 0) * 100) / 100,
        Math.round((+r.E_TICARET_TUTAR || 0) * 100) / 100,
        Math.round((+r.SHOWROOM_TUTAR || 0) * 100) / 100,
        String(r.KART_TIPI || '').trim()
      );
      count++;
    }
    db.prepare(
      "INSERT INTO warehouse_sync_log (row_count, status, message) VALUES (?, 'success', ?)"
    ).run(count, `TIGER3'ten ${count} ürün senkronize edildi`);
    return count;
  });
  const count = tx();

  // EVIRA'dan STOK_ADI2 + son hareket bilgilerini çek
  try {
    const [acRows, hareketRows] = await Promise.all([
      evira.query(`SELECT STOK_KODU, STOK_ADI2 FROM STOKKARTI WHERE STOK_ADI2 IS NOT NULL AND STOK_ADI2 <> ''`),
      evira.query(`
        SELECT STOK_KODU, TARIH, PROJE_KODU, AMBAR_ADI FROM (
          SELECT
            SK.STOK_KODU,
            CONVERT(VARCHAR(10), SF.TARIH, 120)                                                          AS TARIH,
            ISNULL((SELECT P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF = SF.PROJE_REF), '')             AS PROJE_KODU,
            ISNULL((SELECT A.AMBAR_ADI  FROM AMBAR  A WHERE A.AMBAR_KODU = SH.AMBAR_KODU), SH.AMBAR_KODU) AS AMBAR_ADI,
            ROW_NUMBER() OVER (PARTITION BY SK.STOK_KODU ORDER BY SF.TARIH DESC, SF.FIS_NO DESC)        AS RN
          FROM STOKKARTI SK
          JOIN STOKHAREKETLERI SH ON SH.STOK_REF = SK.STOK_REF
          JOIN STOKFISLERI     SF ON SF.FB_REF    = SH.FB_REF
        ) T WHERE RN = 1
      `)
    ]);
    const acMap  = new Map(acRows.map(r => [String(r.STOK_KODU||'').trim(), String(r.STOK_ADI2||'').trim()]));
    const harMap = new Map(hareketRows.map(r => [String(r.STOK_KODU||'').trim(), {
      tarih: String(r.TARIH||'').trim(),
      yer:   (String(r.PROJE_KODU||'').trim() || String(r.AMBAR_ADI||'').trim()) || null
    }]));
    const updateStmt = db.prepare(`
      UPDATE warehouse_stock
      SET aciklama2 = COALESCE(?, aciklama2),
          son_hareket = COALESCE(?, son_hareket),
          son_hareket_yer = COALESCE(?, son_hareket_yer)
      WHERE stok_kodu = ?
    `);
    const allKodlar = new Set([...acMap.keys(), ...harMap.keys()]);
    const batchTx = db.transaction(() => {
      for (const kod of allKodlar) {
        if (!kod) continue;
        const har = harMap.get(kod) || {};
        updateStmt.run(acMap.get(kod)||null, har.tarih||null, har.yer||null, kod);
      }
    });
    batchTx();
  } catch (e) {
    console.warn('Depo sync: EVIRA verileri çekilemedi:', e.message);
  }

  return count;
}

// POST /api/warehouse/sync — Önce TIGER3, başarısız olursa Excel fallback
router.post('/sync', async (req, res) => {
  try {
    let count, source;
    try {
      count = await syncFromTIGER3();
      source = 'tiger3';
    } catch (tiger3Err) {
      console.warn('Depo: TIGER3 bağlanamadı, Excel fallback:', tiger3Err.message);
      if (req.body?.refreshExcel) {
        await refreshExcelQueries(EXCEL_PATH);
      }
      count = syncFromExcel();
      source = 'excel';
    }
    const lastSync = getDb().prepare(
      "SELECT synced_at FROM warehouse_sync_log ORDER BY id DESC LIMIT 1"
    ).get();
    res.json({
      success: true,
      count,
      source,
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
  // kart_tipi comma-separated destekler: "KARAVAN,EKİPMAN"
  const kartTipiArr = kart_tipi ? kart_tipi.split(',').map(s => s.trim()).filter(Boolean) : [];
  const dbCount = db.prepare('SELECT COUNT(*) as c FROM warehouse_stock').get().c;

  if (dbCount === 0) {
    let rows = getExcelStockRows();
    if (search) {
      const ns = normTr(search);
      rows = rows.filter(r => normTr(r.stok_kodu).includes(ns) || normTr(r.stok_adi).includes(ns));
    }
    if (kartTipiArr.length > 0) rows = rows.filter(r => kartTipiArr.includes(r.kart_tipi));
    if (depo === 'gebze') rows = rows.filter(r => (r.gebze_stok || 0) > 0);
    else if (depo === 'eticaret') rows = rows.filter(r => (r.eticaret_stok || 0) > 0);
    else if (depo === 'showroom') rows = rows.filter(r => (r.showroom_stok || 0) > 0);

    const allowedSort = ['stok_kodu', 'stok_adi', 'gebze_stok', 'eticaret_stok', 'showroom_stok', 'birim_fiyat', 'gebze_tutar', 'eticaret_tutar', 'showroom_tutar', 'kart_tipi', 'son_hareket'];
    const sortCol = allowedSort.includes(sort) ? sort : 'stok_kodu';
    const sortDir = order === 'desc' ? -1 : 1;
    rows.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'number' || typeof bv === 'number') return (Number(av || 0) - Number(bv || 0)) * sortDir;
      return String(av || '').localeCompare(String(bv || ''), 'tr') * sortDir;
    });

    // evira son_hareket merge
    try {
      const eviraRows = db.prepare('SELECT stok_kodu, MAX(son_hareket) as son_hareket FROM evira_stock_cache GROUP BY stok_kodu').all();
      const eviraMap = new Map(eviraRows.map(r => [r.stok_kodu, r.son_hareket]));
      rows.forEach(r => { r.son_hareket = eviraMap.get(r.stok_kodu) || null; });
    } catch (_) {}

    const total = rows.length;
    const offset = (Math.max(1, +page) - 1) * +limit;
    return res.json({ rows: rows.slice(offset, offset + (+limit)), total, page: +page, limit: +limit, source: 'excel-fallback' });
  }

  let where = '1=1';
  const params = [];

  if (search) {
    const ns = normTr(search);
    where += ' AND (norm(w.stok_kodu) LIKE ? OR norm(w.stok_adi) LIKE ?)';
    params.push(`%${ns}%`, `%${ns}%`);
  }

  if (kartTipiArr.length === 1) {
    where += ' AND w.kart_tipi = ?';
    params.push(kartTipiArr[0]);
  } else if (kartTipiArr.length > 1) {
    where += ` AND w.kart_tipi IN (${kartTipiArr.map(() => '?').join(',')})`;
    params.push(...kartTipiArr);
  }

  // Sadece belirli depoda stok olanları göster
  if (depo === 'gebze') where += ' AND w.gebze_stok > 0';
  else if (depo === 'eticaret') where += ' AND w.eticaret_stok > 0';
  else if (depo === 'showroom') where += ' AND w.showroom_stok > 0';

  // Toplam sayı
  const totalRow = db.prepare(`SELECT COUNT(*) as c FROM warehouse_stock w WHERE ${where}`).get(...params);
  const total = totalRow.c;

  // Allowlist sort — son_hareket subquery alias ile sort edilir
  const allowedSort = ['stok_kodu', 'stok_adi', 'gebze_stok', 'eticaret_stok', 'showroom_stok', 'birim_fiyat', 'gebze_tutar', 'eticaret_tutar', 'showroom_tutar', 'kart_tipi', 'son_hareket'];
  const sortCol = allowedSort.includes(sort) ? sort : 'stok_kodu';
  const sortColExpr = sortCol === 'son_hareket' ? 'son_hareket' : `w.${sortCol}`;
  const sortDir = order === 'desc' ? 'DESC' : 'ASC';

  const offset = (Math.max(1, +page) - 1) * +limit;
  const rows = db.prepare(`
    SELECT w.*
    FROM warehouse_stock w
    WHERE ${where}
    ORDER BY ${sortColExpr} ${sortDir} LIMIT ? OFFSET ?
  `).all(...params, +limit, offset);

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

// POST /api/warehouse/sync-evira — STOK_ADI2 + son hareket (tarih, proje/ambar) güncelle
router.post('/sync-evira', async (req, res) => {
  try {
    const db = getDb();

    // 1) STOK_ADI2 (Açıklama 2)
    const [acRows, hareketRows] = await Promise.all([
      evira.query(`SELECT STOK_KODU, STOK_ADI2 FROM STOKKARTI WHERE STOK_ADI2 IS NOT NULL AND STOK_ADI2 <> ''`),
      evira.query(`
        SELECT STOK_KODU, TARIH, PROJE_KODU, AMBAR_ADI FROM (
          SELECT
            SK.STOK_KODU,
            CONVERT(VARCHAR(10), SF.TARIH, 120)                                                        AS TARIH,
            ISNULL((SELECT P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF = SF.PROJE_REF), '')           AS PROJE_KODU,
            ISNULL((SELECT A.AMBAR_ADI  FROM AMBAR  A WHERE A.AMBAR_KODU = SH.AMBAR_KODU), SH.AMBAR_KODU) AS AMBAR_ADI,
            ROW_NUMBER() OVER (PARTITION BY SK.STOK_KODU ORDER BY SF.TARIH DESC, SF.FIS_NO DESC)      AS RN
          FROM STOKKARTI SK
          JOIN STOKHAREKETLERI SH ON SH.STOK_REF = SK.STOK_REF
          JOIN STOKFISLERI     SF ON SF.FB_REF    = SH.FB_REF
        ) T WHERE RN = 1
      `)
    ]);

    const updateStmt = db.prepare(`
      UPDATE warehouse_stock
      SET aciklama2 = COALESCE(?, aciklama2),
          son_hareket = COALESCE(?, son_hareket),
          son_hareket_yer = COALESCE(?, son_hareket_yer)
      WHERE stok_kodu = ?
    `);

    // İndeksle
    const acMap = new Map();
    for (const r of acRows) {
      const v = String(r.STOK_ADI2 || '').trim();
      if (v) acMap.set(String(r.STOK_KODU || '').trim(), v);
    }
    const harMap = new Map();
    for (const r of hareketRows) {
      const proje = String(r.PROJE_KODU || '').trim();
      const ambar = String(r.AMBAR_ADI  || '').trim();
      harMap.set(String(r.STOK_KODU || '').trim(), {
        tarih: String(r.TARIH || '').trim(),
        yer:   proje || ambar || null,
      });
    }

    const allKodlar = new Set([...acMap.keys(), ...harMap.keys()]);
    const tx = db.transaction(() => {
      let count = 0;
      for (const kod of allKodlar) {
        if (!kod) continue;
        const ac  = acMap.get(kod)  || null;
        const har = harMap.get(kod) || {};
        const result = updateStmt.run(ac, har.tarih || null, har.yer || null, kod);
        if (result.changes > 0) count++;
      }
      return count;
    });

    const updated = tx();
    res.json({
      success: true,
      updated,
      aciklama_count: acMap.size,
      hareket_count:  harMap.size,
      message: `${updated} ürün güncellendi (${acMap.size} açıklama, ${harMap.size} son hareket)`
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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

// GET /api/warehouse/detail/:stok_kodu — Ürün detay: resim + alımlar + çıkışlar + transferler
router.get('/detail/:stok_kodu', async (req, res) => {
  const { stok_kodu } = req.params;
  if (!stok_kodu) return res.status(400).json({ error: 'stok_kodu gerekli' });

  const db = getDb();
  const local = db.prepare('SELECT aciklama2 FROM warehouse_stock WHERE stok_kodu = ?').get(stok_kodu);

  let aciklama2 = local?.aciklama2 || null;
  let resimBase64 = null;
  let resimMime = 'image/jpeg';
  let alimlar = [];
  let cikislar = [];
  let transferler = [];
  const errors = [];

  // STOK_ADI2 + MARKA (EVIRA)
  try {
    const acRows = await evira.query(
      `SELECT TOP 1 SK.STOK_ADI2, ISNULL(M.MARKA_ADI, '') AS MARKA_ADI
       FROM STOKKARTI SK
       LEFT JOIN MARKA M ON M.MARKA_REF = SK.MARKA_REF
       WHERE SK.STOK_KODU = @kod`,
      { kod: { type: evira.sql.NVarChar(50), value: stok_kodu } }
    );
    if (acRows.length > 0) {
      const stokAdi2 = String(acRows[0].STOK_ADI2 || '').trim();
      const marka    = String(acRows[0].MARKA_ADI  || '').trim();
      aciklama2 = [marka, stokAdi2].filter(Boolean).join(' — ') || aciklama2;
    }
  } catch (e) {
    errors.push('aciklama2: ' + e.message);
  }

  // RESIM (Tiger3)
  try {
    const resimRows = await tiger3.query(
      `SELECT TOP 1 FD.LDATA
       FROM LG_123_FIRMDOC FD
       JOIN LG_123_ITEMS I ON I.LOGICALREF = FD.INFOREF
       WHERE FD.INFOTYP = 20 AND FD.LDATA IS NOT NULL AND I.CODE = @kod
       ORDER BY FD.DOCNR`,
      { kod: { type: tiger3.sql.VarChar(50), value: stok_kodu } }
    );
    if (resimRows.length > 0 && resimRows[0].LDATA) {
      const buf = resimRows[0].LDATA;
      if (Buffer.isBuffer(buf) && buf.length > 0) {
        resimBase64 = buf.toString('base64');
        const b0 = buf[0], b1 = buf[1];
        if (b0 === 0xFF && b1 === 0xD8) resimMime = 'image/jpeg';
        else if (b0 === 0x89 && b1 === 0x50) resimMime = 'image/png';
        else if (b0 === 0x42 && b1 === 0x4D) resimMime = 'image/bmp';
        else if (b0 === 0x47 && b1 === 0x49) resimMime = 'image/gif';
        else resimMime = 'image/jpeg';
      }
    }
  } catch (e) {
    errors.push('resim: ' + e.message);
  }

  // ALIMLAR: Tiger3 satın alma siparişleri (döviz bilgisiyle)
  try {
    alimlar = await tiger3.query(
      `SELECT TOP 60
        CONVERT(VARCHAR(10), F.DATE_, 120)                                        AS TARIH,
        F.FICHENO                                                                  AS FISNO,
        ISNULL(C.DEFINITION_, '')                                                  AS CARI_UNVANI,
        ISNULL(L.PRICE, 0)                                                         AS FIYAT,
        ISNULL(L.AMOUNT, 0)                                                        AS MIKTAR,
        ISNULL(L.SHIPPEDAMOUNT, 0)                                                 AS TALINAN,
        ISNULL(L.TOTAL, 0)                                                         AS TUTAR,
        CASE ISNULL(F.TRCURR, 0) WHEN 1 THEN 'USD' WHEN 2 THEN 'EUR' ELSE 'TRY' END AS DOVIZ,
        ISNULL(F.TRRATE, 1)                                                        AS KUR
      FROM LG_123_01_ORFICHE F
      JOIN LG_123_CLCARD     C ON C.LOGICALREF    = F.CLIENTREF
      JOIN LG_123_01_ORFLINE L ON L.ORDFICHEREF   = F.LOGICALREF
      JOIN LG_123_ITEMS      S ON S.LOGICALREF    = L.STOCKREF
      WHERE F.TRCODE = 2
        AND L.LINETYPE = 0
        AND S.CODE = @kod
        AND F.CANCELLED = 0
      ORDER BY F.DATE_ DESC, F.FICHENO DESC`,
      { kod: { type: tiger3.sql.VarChar(50), value: stok_kodu } }
    );
  } catch (e) {
    errors.push('alimlar: ' + e.message);
  }

  // CIKISLAR: SQLite ciro_cache — Tiger3 satışları
  try {
    cikislar = db.prepare(`
      SELECT tarih, fatura_no, cari_adi, miktar, fiyat, tutar, islem_dovizi, is_emri_no
      FROM ciro_cache
      WHERE stok_kodu = ?
      ORDER BY tarih DESC
      LIMIT 100
    `).all(stok_kodu);
  } catch (e) {
    errors.push('cikislar: ' + e.message);
  }

  // TRANSFERLER: EVIRA — sadece transfer hareketleri (FIS_GCD=2)
  try {
    transferler = await evira.query(
      `SELECT TOP 100
        CONVERT(VARCHAR(10), SF.TARIH, 120)                                                              AS TARIH,
        SF.FIS_NO,
        ISNULL((SELECT P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF=SF.PROJE_REF), '')                   AS PROJE_KODU,
        ISNULL((SELECT A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU=SH.AMBAR_KODU), SH.AMBAR_KODU)       AS AMBAR,
        ISNULL((SELECT A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU=SH.HEDEF_AMBAR), SH.HEDEF_AMBAR)     AS HEDEF_AMBAR,
        SUM(SH.MIKTAR)                                                                                    AS MIKTAR,
        ISNULL((SELECT SB.BIRIM FROM STOKBIRIM SB WHERE SB.BIRIM_REF=SH.ANABIRIM_REF), '')               AS BIRIM
      FROM STOKKARTI SK
      JOIN STOKHAREKETLERI SH ON SH.STOK_REF = SK.STOK_REF
      JOIN STOKFISLERI     SF ON SF.FB_REF    = SH.FB_REF
      WHERE SK.STOK_KODU = @kod
        AND SF.FIS_GCD = '2'
      GROUP BY SF.TARIH, SF.FIS_NO, SH.AMBAR_KODU, SH.HEDEF_AMBAR,
               SH.ANABIRIM_REF, SH.TAKIP_NO, SH.STOK_REF, SF.SAAT, SF.SB_REF, SH.SB_REF, SF.BELGE_NO, SF.PROJE_REF
      ORDER BY SF.TARIH DESC`,
      { kod: { type: evira.sql.NVarChar(50), value: stok_kodu } }
    );
  } catch (e) {
    errors.push('transferler: ' + e.message);
  }

  // ÖZET: alım istatistikleri
  const oneYearAgoStr = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const sonYilAlimlar = alimlar.filter(a => (a.TARIH || '') >= oneYearAgoStr);
  const tlFiyatlar = alimlar
    .filter(a => (a.FIYAT || 0) > 0)
    .map(a => a.DOVIZ === 'TRY' ? a.FIYAT : a.FIYAT * (a.KUR || 1));
  const ozet = {
    son_yil_siparis: sonYilAlimlar.length,
    son_yil_miktar:  Math.round(sonYilAlimlar.reduce((s, a) => s + (a.MIKTAR || 0), 0) * 100) / 100,
    toplam_siparis:  alimlar.length,
    ort_fiyat_tl:    tlFiyatlar.length > 0
      ? Math.round(tlFiyatlar.reduce((s, f) => s + f, 0) / tlFiyatlar.length * 100) / 100
      : 0,
  };

  res.json({ aciklama2, resimBase64, resimMime, alimlar, cikislar, transferler, ozet, errors });
});

module.exports = router;
module.exports.syncFromTIGER3 = syncFromTIGER3;
