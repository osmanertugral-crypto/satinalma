const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');
const { normTr } = require('../utils/searchUtils');

const router = express.Router();
router.use(authenticate);

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'gecici', 'KIRILIN VE BOZULAN ÜRÜN TUTANAK LSİTESİ.xlsx');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) cb(null, true);
    else cb(new Error('Sadece .xls ve .xlsx dosyalari desteklenir.')); 
  },
});

function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

function hashRow(row) {
  return normTr([
    row.report_date,
    row.product_code,
    row.product_name,
    row.problem,
    row.quantity,
    row.problem_source,
    row.reported_by,
    row.approved_by,
    row.resolution,
    row.purchase_action,
    row.total_cost,
  ].join('|'));
}

function classify(row) {
  const problemText = normTr(`${row.problem} ${row.resolution}`);
  const sourceText = normTr(`${row.problem_source} ${row.purchase_action}`);

  const isLost = problemText.includes('KAYIP');
  const isGuarantee = sourceText.includes('TEDARIKCI') || sourceText.includes('GARANTI') || sourceText.includes('DEGISTIR');
  const isUserError = sourceText.includes('PERSONEL') || sourceText.includes('KULLANICI') || problemText.includes('YANLIS');
  const isBroken = problemText.includes('KIRIK') || problemText.includes('BOZUK') || problemText.includes('ARIZA') || problemText.includes('YANMA') || problemText.includes('CIZIK');

  return {
    lost: isLost,
    guarantee: isGuarantee,
    userError: isUserError,
    productSource: !isUserError,
    broken: isBroken,
  };
}

function parseWorksheetRows(ws, sourceFile) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) return [];

  const header = rows[0].map(h => normalizeHeader(h));
  const idx = {
    date: header.findIndex(h => h === 'tarih'),
    productCode: header.findIndex(h => h === 'urun kodu'),
    productName: header.findIndex(h => h === 'urun'),
    problem: header.findIndex(h => h === 'problem'),
    quantity: header.findIndex(h => h === 'adet'),
    problemSource: header.findIndex(h => h === 'problem kaynagi'),
    reportedBy: header.findIndex(h => h === 'problemi bildiren'),
    approvedBy: header.findIndex(h => h === 'problemi onaylayan'),
    resolution: header.findIndex(h => h === 'problem cozumu'),
    purchaseAction: header.findIndex(h => h === 'satin alma'),
    totalCost: header.findIndex(h => h.includes('toplam maliyet')),
  };

  const required = [idx.date, idx.productCode, idx.productName, idx.problem, idx.quantity, idx.totalCost];
  if (required.some(i => i < 0)) {
    throw new Error('Excel basliklari beklenen formatta degil.');
  }

  const parsed = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const productCode = String(r[idx.productCode] || '').trim();
    const productName = String(r[idx.productName] || '').trim();
    if (!productCode && !productName) continue;

    const d = parseExcelDate(r[idx.date]);
    const row = {
      report_date: d ? d.toISOString().slice(0, 10) : null,
      product_code: productCode,
      product_name: productName,
      problem: String(r[idx.problem] || '').trim(),
      quantity: toNumber(r[idx.quantity]),
      problem_source: idx.problemSource >= 0 ? String(r[idx.problemSource] || '').trim() : '',
      reported_by: idx.reportedBy >= 0 ? String(r[idx.reportedBy] || '').trim() : '',
      approved_by: idx.approvedBy >= 0 ? String(r[idx.approvedBy] || '').trim() : '',
      resolution: idx.resolution >= 0 ? String(r[idx.resolution] || '').trim() : '',
      purchase_action: idx.purchaseAction >= 0 ? String(r[idx.purchaseAction] || '').trim() : '',
      total_cost: toNumber(r[idx.totalCost]),
      source_file: sourceFile,
    };

    if (!row.report_date) continue;
    parsed.push(row);
  }

  return parsed;
}

function parseWorkbookRows(wb, sourceFile) {
  const all = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    try {
      const rows = parseWorksheetRows(ws, `${sourceFile}#${sheetName}`);
      all.push(...rows);
    } catch {
      // Header farkli olan sheetleri atla, digerlerini islemeye devam et.
    }
  }
  return all;
}

function smartMatch(row, query) {
  const nq = normTr(query || '');
  if (!nq) return true;
  const tokens = nq.split(/\s+/).filter(Boolean);
  const text = normTr([
    row.product_code,
    row.product_name,
    row.problem,
    row.problem_source,
    row.reported_by,
    row.approved_by,
    row.resolution,
    row.purchase_action,
    row.report_date,
  ].join(' '));

  return tokens.every(token => {
    if (/^20\d{2}$/.test(token)) return String(row.report_date || '').startsWith(token);
    if (/^(\d{1,2})[./-](\d{4})$/.test(token)) {
      const m = token.match(/^(\d{1,2})[./-](\d{4})$/);
      const mm = String(Number(m[1])).padStart(2, '0');
      const yy = m[2];
      return String(row.report_date || '').startsWith(`${yy}-${mm}`);
    }
    if (token === 'GARANTI') return text.includes('GARANTI') || text.includes('TEDARIKCI') || text.includes('DEGISTIR');
    if (token === 'KAYIP') return text.includes('KAYIP');
    if (token === 'KULLANICI') return text.includes('KULLANICI') || text.includes('PERSONEL') || text.includes('YANLIS');
    if (token === 'URETIM') return text.includes('URETIM');
    return text.includes(token);
  });
}

function importRowsToDb(rows) {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO damage_reports (
      id, report_date, product_code, product_name, problem, quantity,
      problem_source, reported_by, approved_by, resolution,
      purchase_action, total_cost, source_file, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((items) => {
    let inserted = 0;
    for (const row of items) {
      const hash = hashRow(row);
      const info = insert.run(
        uuidv4(),
        row.report_date,
        row.product_code,
        row.product_name,
        row.problem,
        row.quantity,
        row.problem_source,
        row.reported_by,
        row.approved_by,
        row.resolution,
        row.purchase_action,
        row.total_cost,
        row.source_file,
        hash
      );
      if (info.changes > 0) inserted += 1;
    }
    return inserted;
  });

  return tx(rows);
}

function autoSyncDefaultFileIfNeeded() {
  if (!fs.existsSync(DEFAULT_FILE)) return;

  const wb = XLSX.readFile(DEFAULT_FILE, { cellDates: true });
  const rows = parseWorkbookRows(wb, path.basename(DEFAULT_FILE));
  importRowsToDb(rows);
}

function toMonthNumber(dateText) {
  const m = Number(String(dateText || '').slice(5, 7));
  return m >= 1 && m <= 12 ? m : null;
}

router.get('/', (req, res) => {
  autoSyncDefaultFileIfNeeded();
  const db = getDb();

  const {
    start_year,
    start_month,
    end_year,
    end_month,
    q,
    problem_source,
    reported_by,
    approved_by,
    purchase_action,
    min_cost,
    max_cost,
  } = req.query;

  let query = 'SELECT * FROM damage_reports WHERE 1=1';
  const params = [];

  const sy = start_year ? Number(start_year) : null;
  const sm = start_month ? Number(start_month) : null;
  const ey = end_year ? Number(end_year) : null;
  const em = end_month ? Number(end_month) : null;

  if (sy && sm && sm >= 1 && sm <= 12) {
    const fromDate = `${sy}-${String(sm).padStart(2, '0')}-01`;
    query += ' AND report_date >= ?';
    params.push(fromDate);
  } else if (sy) {
    const fromDate = `${sy}-01-01`;
    query += ' AND report_date >= ?';
    params.push(fromDate);
  }

  if (ey && em && em >= 1 && em <= 12) {
    const endDate = new Date(ey, em, 0).toISOString().slice(0, 10);
    query += ' AND report_date <= ?';
    params.push(endDate);
  } else if (ey) {
    const endDate = `${ey}-12-31`;
    query += ' AND report_date <= ?';
    params.push(endDate);
  }
  if (problem_source) { query += ' AND norm(problem_source) LIKE ?'; params.push(`%${normTr(problem_source)}%`); }
  if (reported_by) { query += ' AND norm(reported_by) LIKE ?'; params.push(`%${normTr(reported_by)}%`); }
  if (approved_by) { query += ' AND norm(approved_by) LIKE ?'; params.push(`%${normTr(approved_by)}%`); }
  if (purchase_action) { query += ' AND norm(purchase_action) LIKE ?'; params.push(`%${normTr(purchase_action)}%`); }
  if (min_cost != null && min_cost !== '') { query += ' AND total_cost >= ?'; params.push(Number(min_cost)); }
  if (max_cost != null && max_cost !== '') { query += ' AND total_cost <= ?'; params.push(Number(max_cost)); }
  query += ' ORDER BY report_date DESC, product_code ASC';
  let rows = db.prepare(query).all(...params);
  if (q) rows = rows.filter(row => smartMatch(row, q));
  const allRowsForOptions = db.prepare('SELECT report_date FROM damage_reports WHERE report_date IS NOT NULL').all();
  const allYears = [...new Set(allRowsForOptions.map(r => Number(String(r.report_date).slice(0, 4))).filter(Boolean))].sort((a, b) => b - a);
  const yearMonths = {};
  for (const y of allYears) yearMonths[String(y)] = [];
  for (const r of allRowsForOptions) {
    const y = String(r.report_date || '').slice(0, 4);
    const m = toMonthNumber(r.report_date);
    if (!y || !m) continue;
    if (!yearMonths[y]) yearMonths[y] = [];
    if (!yearMonths[y].includes(m)) yearMonths[y].push(m);
  }
  Object.keys(yearMonths).forEach(y => yearMonths[y].sort((a, b) => a - b));

  const summary = {
    totalRecords: rows.length,
    totalCost: 0,
    totalQty: 0,
    guaranteeCost: 0,
    brokenCost: 0,
    lostCost: 0,
    userErrorCost: 0,
    productSourceCost: 0,
  };

  const groupedBySource = {};
  const groupedByAction = {};

  for (const row of rows) {
    const c = Number(row.total_cost || 0);
    const qn = Number(row.quantity || 0);
    summary.totalCost += c;
    summary.totalQty += qn;

    const cls = classify(row);
    if (cls.guarantee) summary.guaranteeCost += c;
    if (cls.broken) summary.brokenCost += c;
    if (cls.lost) summary.lostCost += c;
    if (cls.userError) summary.userErrorCost += c;
    if (cls.productSource) summary.productSourceCost += c;

    const src = row.problem_source || 'Belirsiz';
    if (!groupedBySource[src]) groupedBySource[src] = { label: src, totalCost: 0, count: 0 };
    groupedBySource[src].totalCost += c;
    groupedBySource[src].count += 1;

    const action = row.purchase_action || 'Belirsiz';
    if (!groupedByAction[action]) groupedByAction[action] = { label: action, totalCost: 0, count: 0 };
    groupedByAction[action].totalCost += c;
    groupedByAction[action].count += 1;
  }

  if (allYears.length === 0 && fs.existsSync(DEFAULT_FILE)) {
    try {
      const wb = XLSX.readFile(DEFAULT_FILE, { cellDates: true });
      for (const s of wb.SheetNames) {
        const y = Number(String(s).trim());
        if (Number.isFinite(y) && y > 2000 && y < 2100 && !allYears.includes(y)) allYears.push(y);
      }
      allYears.sort((a, b) => b - a);
    } catch {}
  }

  const filterOptions = {
    sources: [...new Set(rows.map(r => r.problem_source).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'tr')),
    reporters: [...new Set(rows.map(r => r.reported_by).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'tr')),
    approvers: [...new Set(rows.map(r => r.approved_by).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'tr')),
    actions: [...new Set(rows.map(r => r.purchase_action).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'tr')),
    years: allYears,
    yearMonths,
  };

  res.json({
    summary,
    groupedBySource: Object.values(groupedBySource).sort((a, b) => b.totalCost - a.totalCost),
    groupedByAction: Object.values(groupedByAction).sort((a, b) => b.totalCost - a.totalCost),
    rows,
    filterOptions,
  });
});

router.post('/import', authenticate, authorize('admin', 'user'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya secilmedi.' });

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const rows = parseWorkbookRows(wb, req.file.originalname);
    const inserted = importRowsToDb(rows);
    res.json({ success: true, inserted, parsed: rows.length, message: `${inserted} kayit sisteme aktarıldı.` });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Excel islenemedi.' });
  }
});

module.exports = router;
