const express = require('express');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { authenticate } = require('../middleware/auth');

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
      // Önce Excel Power Query sorgularını yenile, sonra oku
      await refreshExcelQueries();
      ciroCache.mtimeMs = 0; // Önbelleği geçersiz kıl
    }
    const data = readCiroExcel(force);
    res.json(data);
  } catch (err) {
    console.error('Ciro raporu hatası:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
