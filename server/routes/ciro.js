const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../db/schema');
const tiger3 = require('../utils/tiger3');

const REFRESH_SCRIPT = path.join(__dirname, '..', 'refresh-ciro-excel.ps1');

// PowerShell ile Excel Power Query sorgularını yeniler ve dosyayı kaydeder
function refreshExcelQueries() {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', REFRESH_SCRIPT, CIRO_EXCEL_PATH],
      { timeout: 180000 }, // 3 dakika
      (err, stdout, stderr) => {
        if (err) {
          console.error('Excel yenileme hatası:', stderr || err.message);
          reject(new Error('Excel sorguları yenilenemedi: ' + (stderr || err.message)));
        } else {
          console.log('Excel yenilendi:', stdout.trim());
          resolve();
        }
      }
    );
  });
}

const router = express.Router();
router.use(authenticate);

const CIRO_EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'CİRO RAPORU_10.10.2025.xlsx');
const RESTAR_PIVOT_SHEET = 'RESTAR PİVOT (SATIŞ ÖZET)';

const AY_ADLARI = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

let ciroCache = { mtimeMs: 0, data: null };

// TIGER3'ten ciro verisi çek ve SQLite cache'e yaz
async function syncFromTIGER3() {
  const db = getDb();
  db.prepare('DELETE FROM ciro_cache').run();

  const stmt = db.prepare(`
    INSERT INTO ciro_cache
      (firma, yil, ay, tarih, fatura_no, stok_kodu, cari_adi, stok_adi,
       miktar, fiyat, kdv, tutar, tutar_usd, tutar_eur,
       tur, fis_turu, is_emri_no, is_emri_adi, islem_dovizi)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let total = 0;
  const tx = db.transaction((rows, firma) => {
    for (const r of rows) {
      stmt.run(
        firma,
        +r.YIL || null,
        +r.AY || null,
        r.TARIH ? String(r.TARIH).substring(0, 10) : null,
        String(r.FATURA_NO || '').trim(),
        String(r.STOK_KODU || '').trim(),
        String(r.CARI_ADI || '').trim(),
        String(r.STOK_ADI || '').trim(),
        +r.MIKTAR || 0,
        +r.FIYAT || 0,
        +r.KDV || 0,
        +r.TUTAR || 0,
        +r.TUTAR_USD || 0,
        +r.TUTAR_EUR || 0,
        String(r.TUR || '').trim(),
        String(r.FIS_TURU || '').trim(),
        String(r.IS_EMRI_N0 || '').trim(),
        String(r.IS_EMRI_ADI || '').trim(),
        String(r.ISLEM_DOVIZI || '').trim()
      );
      total++;
    }
  });

  const [restarRows, retechRows] = await Promise.all([
    tiger3.query('SELECT * FROM AA_SATIS_123_10032025_ONR_TEST'),
    tiger3.query('SELECT * FROM AA_SATIS_223_ONR_TEST'),
  ]);
  tx(restarRows, 'RESTAR');
  tx(retechRows, 'RETECH');

  ciroCache = { mtimeMs: 0, data: null }; // İn-memory cache geçersiz kıl
  return total;
}

// SQLite cache'den pivot oluştur
function buildPivotFromCache(firma = 'RESTAR') {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM ciro_cache WHERE firma = ?').get(firma).c;
  if (count === 0) return null;

  const agg = db.prepare(`
    SELECT tur as kategori, yil, ay, ROUND(SUM(tutar), 2) as toplam
    FROM ciro_cache
    WHERE firma = ? AND yil IS NOT NULL AND ay IS NOT NULL AND tur != ''
    GROUP BY tur, yil, ay
    ORDER BY yil, ay
  `).all(firma);

  const yearMonths = [...new Set(agg.map(r => `${r.yil}|${r.ay}`))].sort();
  const categories = new Map();

  for (const row of agg) {
    const key = `${row.yil}|${row.ay}`;
    if (!categories.has(row.kategori)) categories.set(row.kategori, {});
    categories.get(row.kategori)[key] = (categories.get(row.kategori)[key] || 0) + row.toplam;
  }

  const years = [...new Set(agg.map(r => r.yil))].sort();
  const columns = [];

  for (const yr of years) {
    const yrMonths = agg.filter(r => r.yil === yr).map(r => r.ay);
    const uniqueMonths = [...new Set(yrMonths)].sort((a, b) => a - b);
    for (const mo of uniqueMonths) {
      columns.push({ label: `${AY_ADLARI[mo]} ${yr}`, type: 'month', year: yr, month: mo });
    }
    columns.push({ label: `Toplam ${yr}`, type: 'yearTotal', year: yr, month: null });
  }
  columns.push({ label: 'Genel Toplam', type: 'grandTotal', year: null, month: null });

  const cats = [...categories.entries()].map(([name, vals]) => {
    const values = {};
    for (const yr of years) {
      let yrSum = 0;
      const yrMonths = columns.filter(c => c.type === 'month' && c.year === yr);
      for (const col of yrMonths) {
        const v = vals[`${col.year}|${col.month}`] || 0;
        values[col.label] = v;
        yrSum += v;
      }
      values[`Toplam ${yr}`] = Math.round(yrSum * 100) / 100;
    }
    let grandSum = 0;
    for (const yr of years) grandSum += values[`Toplam ${yr}`] || 0;
    values['Genel Toplam'] = Math.round(grandSum * 100) / 100;
    return { name, values, isGrandTotal: false };
  });

  // Grand total row
  const grandVals = {};
  columns.forEach(col => {
    grandVals[col.label] = Math.round(cats.reduce((s, c) => s + (c.values[col.label] || 0), 0) * 100) / 100;
  });
  cats.push({ name: 'GENEL TOPLAM', values: grandVals, isGrandTotal: true });

  const lastSynced = db.prepare('SELECT synced_at FROM ciro_cache ORDER BY id DESC LIMIT 1').get();
  return {
    pivot: { columns: columns.map(({ label, type, year, month }) => ({ label, type, year, month })), categories: cats },
    lastUpdated: lastSynced?.synced_at || new Date().toISOString(),
    source: 'tiger3',
  };
}

/**
 * Excel Türkçe pivot yapısını parse eder.
 * Row 0: ["Sum of TUTAR", "Sütun Etiketleri", ...]
 * Row 1: [null, 2026, null, ..., "Toplam 2026", "Genel Toplam"]  <- yıl satırı
 * Row 2: ["Satır Etiketleri", 1, 2, 3, ...]                      <- ay satırı
 * Row 3+: kategori verileri
 */
function parsePivotSheet(rawRows) {
  if (!rawRows || rawRows.length < 3) return null;

  // "Satır Etiketleri" olan satırı bul
  let headerRowIdx = -1;
  for (let i = 0; i < rawRows.length; i++) {
    const cell = String(rawRows[i][0] || '').trim();
    if (cell === 'Satır Etiketleri' || cell === 'Row Labels') {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx < 1) return null;

  const yearRow = rawRows[headerRowIdx - 1];
  const monthRow = rawRows[headerRowIdx];
  const maxCols = Math.max(yearRow.length, monthRow.length);

  const cols = [];
  let currentYear = null;

  for (let c = 1; c < maxCols; c++) {
    const yr = yearRow[c];
    const mo = monthRow[c];
    const yrStr = String(yr || '').trim();

    if (typeof yr === 'number') currentYear = yr;

    if (yrStr === 'Genel Toplam' || yrStr.toLowerCase() === 'grand total') {
      cols.push({ idx: c, type: 'grandTotal', label: 'Genel Toplam', year: null, month: null });
    } else if (yrStr !== '' && (yrStr.toLowerCase().startsWith('toplam') || yrStr.toLowerCase().includes('total'))) {
      cols.push({ idx: c, type: 'yearTotal', label: yrStr, year: currentYear, month: null });
    } else if (typeof mo === 'number' && mo >= 1 && mo <= 12) {
      cols.push({ idx: c, type: 'month', label: `${AY_ADLARI[mo]} ${currentYear}`, year: currentYear, month: mo });
    }
  }

  if (cols.length === 0) return null;

  const categories = [];
  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const rawLabel = String(row[0] || '').trim();
    if (!rawLabel) continue;

    const isGrandTotal = rawLabel === 'Genel Toplam' || rawLabel.toLowerCase() === 'grand total';
    const name = isGrandTotal ? 'GENEL TOPLAM'
      : (rawLabel === '(boş)' || rawLabel === '(blank)') ? 'Belirtilmemiş'
      : rawLabel;

    const values = {};
    cols.forEach(col => {
      const v = row[col.idx];
      values[col.label] = typeof v === 'number' ? v : 0;
    });

    categories.push({ name, values, isGrandTotal });
  }

  return {
    columns: cols.map(({ label, type, year, month }) => ({ label, type, year, month })),
    categories
  };
}

function readCiroExcel(force = false) {
  let stat;
  try {
    stat = fs.statSync(CIRO_EXCEL_PATH);
  } catch {
    throw new Error('Excel dosyası bulunamadı: gecici/CİRO RAPORU_10.10.2025.xlsx');
  }

  if (!force && ciroCache.data && stat.mtimeMs === ciroCache.mtimeMs) {
    return ciroCache.data;
  }

  const wb = XLSX.readFile(CIRO_EXCEL_PATH, { cellDates: false });
  const sheet = wb.Sheets[RESTAR_PIVOT_SHEET];

  if (!sheet) {
    throw new Error(`"${RESTAR_PIVOT_SHEET}" sheet bulunamadı.`);
  }

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const parsed = parsePivotSheet(raw);

  if (!parsed) {
    throw new Error('Pivot yapısı okunamadı. "Satır Etiketleri" başlığı bulunamadı.');
  }

  const result = {
    pivot: parsed,
    lastUpdated: new Date().toISOString(),
    fileModifiedAt: new Date(stat.mtimeMs).toISOString()
  };

  ciroCache = { mtimeMs: stat.mtimeMs, data: result };
  return result;
}

router.get('/raporu', async (req, res) => {
  try {
    const force = req.query.force === 'true';

    if (force) {
      // Önce TIGER3'ten güncelle, başarısız olursa Excel'i yenile
      try {
        await syncFromTIGER3();
        const data = buildPivotFromCache('RESTAR');
        if (data) return res.json(data);
      } catch (tiger3Err) {
        console.warn('Ciro: TIGER3 bağlanamadı, Excel fallback:', tiger3Err.message);
        await refreshExcelQueries();
        ciroCache.mtimeMs = 0;
      }
    }

    // Cache'den pivot dene
    const cached = buildPivotFromCache('RESTAR');
    if (cached) return res.json(cached);

    // Excel fallback
    const data = readCiroExcel(force);
    res.json(data);
  } catch (err) {
    console.error('Ciro raporu hatası:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.syncFromTIGER3 = syncFromTIGER3;
