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

const DEFAULT_PROJECT_FILE = path.join(__dirname, '..', '..', 'gecici', 'Jandarma Genel Komutanlığı 15 Adet Jemus  Aracı Fiyat Teklifi.xlsx');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) cb(null, true);
    else cb(new Error('Sadece .xls/.xlsx dosyalari desteklenir.'));
  }
});

function parseExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const d = new Date(Math.round((value - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeCell(v) {
  return String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMetaValue(rows, label) {
  const target = normalizeCell(label);
  for (const row of rows) {
    if (normalizeCell(row[0]) === target) return row[2] ?? '';
  }
  return '';
}

function findRowIndex(rows, label) {
  const target = normalizeCell(label);
  return rows.findIndex((row) => normalizeCell(row[0]) === target);
}

function findTotal(rows, currencyLabel) {
  const target = normalizeCell(currencyLabel);
  for (const row of rows) {
    if (normalizeCell(row[10]) === target) return toNum(row[11]);
  }
  return 0;
}

function parseItems(rows, sourceFile, sheetName) {
  const headerIndex = rows.findIndex((row) => normalizeCell(row[0]) === 'kategori' && normalizeCell(row[10]) === 'birim fiyat');
  if (headerIndex < 0) return [];

  const items = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const firstTwelve = row.slice(0, 12);
    const hasData = firstTwelve.some((value) => String(value || '').trim() !== '');
    if (!hasData) continue;

    const totalCurrency = normalizeCell(row[10]);
    if (totalCurrency === 'tl' || totalCurrency === 'euro' || totalCurrency === 'eur' || totalCurrency === 'usd' || totalCurrency === 'dolar') {
      break;
    }

    items.push({
      sort_order: items.length + 1,
      category: String(row[0] || '').trim(),
      product_name: String(row[1] || '').trim(),
      description: String(row[2] || '').trim(),
      brand: String(row[3] || '').trim(),
      image_ref: String(row[4] || '').trim(),
      product_note: String(row[5] || '').trim(),
      size_info: String(row[6] || '').trim(),
      unit: String(row[7] || '').trim(),
      purchase_note: String(row[8] || '').trim(),
      termin: String(row[9] || '').trim(),
      unit_price: toNum(row[10]),
      total_price: toNum(row[11]),
      row_hash: normTr([sourceFile, sheetName, index, row[0], row[1], row[10], row[11]].join('|')),
    });
  }

  return items;
}

function parseWorkbookOffers(workbook, sourceFile) {
  const parsed = [];
  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) continue;

    const project_name = String(findMetaValue(rows, 'PROJE') || '').trim() || sheetName;
    const institution = String(findMetaValue(rows, 'KURUM / FİRMA') || '').trim();
    const offer_type = String(findMetaValue(rows, 'TEKLİF TÜRÜ') || '').trim();
    const country = String(findMetaValue(rows, 'ÜLKE') || '').trim();
    const superstructure = String(findMetaValue(rows, 'ÜSTYAPI') || '').trim();
    const vehicle = String(findMetaValue(rows, 'ARAÇ') || '').trim();
    const color = String(findMetaValue(rows, 'RENK') || '').trim();
    const quantity = toNum(findMetaValue(rows, 'ADET'));
    const created_date = parseExcelDate(findMetaValue(rows, 'OLUŞTURULAN TARİH'));
    const offer_due_date = parseExcelDate(findMetaValue(rows, 'TEKLİF VERİLECEK TARİH'));
    const customerNoteRow = findRowIndex(rows, 'MÜŞTERİ ÖZEL NOTU');
    const purchaseNoteRow = findRowIndex(rows, 'SATIN ALMA ÖZEL NOTU');
    const customer_note = customerNoteRow >= 0 ? String((rows[customerNoteRow] || [])[1] || '').trim() : '';
    const purchase_note = purchaseNoteRow >= 0 ? String((rows[purchaseNoteRow] || [])[1] || '').trim() : '';

    const usd_rate = toNum((rows[10] || [])[9]);
    const eur_rate = toNum((rows[10] || [])[10]);
    const quoted_tl = findTotal(rows, 'TL');
    const quoted_eur = findTotal(rows, 'Euro');
    const quoted_usd = usd_rate > 0 ? quoted_tl / usd_rate : 0;
    const items = parseItems(rows, sourceFile, sheetName);

    const row_hash = normTr([sourceFile, sheetName, project_name, institution, quantity, quoted_tl, created_date].join('|'));

    parsed.push({
      project_name,
      institution,
      sheet_name: sheetName,
      offer_type,
      country,
      superstructure,
      vehicle,
      color,
      quantity,
      created_date,
      offer_due_date,
      usd_rate,
      eur_rate,
      quoted_tl,
      quoted_eur,
      quoted_usd,
      customer_note,
      purchase_note,
      source_file: sourceFile,
      row_hash,
      items,
    });
  }
  return parsed;
}

function upsertOffers(rows) {
  const db = getDb();
  const findExisting = db.prepare('SELECT id FROM project_offers WHERE row_hash = ?');
  const insertOffer = db.prepare(`
    INSERT INTO project_offers (
      id, project_name, institution, sheet_name, offer_type, country, superstructure, vehicle, color, quantity,
      created_date, offer_due_date, usd_rate, eur_rate, quoted_tl, quoted_eur, quoted_usd,
      customer_note, purchase_note, source_file, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateOffer = db.prepare(`
    UPDATE project_offers
    SET project_name = ?, institution = ?, sheet_name = ?, offer_type = ?, country = ?, superstructure = ?, vehicle = ?,
        color = ?, quantity = ?, created_date = ?, offer_due_date = ?, usd_rate = ?, eur_rate = ?, quoted_tl = ?,
        quoted_eur = ?, quoted_usd = ?, customer_note = ?, purchase_note = ?, source_file = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  const deleteItems = db.prepare('DELETE FROM project_offer_items WHERE project_offer_id = ?');
  const insertItem = db.prepare(`
    INSERT INTO project_offer_items (
      id, project_offer_id, sort_order, category, product_name, description, brand, image_ref,
      product_note, size_info, unit, purchase_note, termin, unit_price, total_price,
      actual_unit_price, actual_total_price, actual_approved, actual_note, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((offers) => {
    let inserted = 0;
    let updated = 0;
    let itemCount = 0;

    for (const offer of offers) {
      const existing = findExisting.get(offer.row_hash);
      const offerId = existing?.id || uuidv4();

      if (existing) {
        updateOffer.run(
          offer.project_name,
          offer.institution,
          offer.sheet_name,
          offer.offer_type,
          offer.country,
          offer.superstructure,
          offer.vehicle,
          offer.color,
          offer.quantity,
          offer.created_date,
          offer.offer_due_date,
          offer.usd_rate,
          offer.eur_rate,
          offer.quoted_tl,
          offer.quoted_eur,
          offer.quoted_usd,
          offer.customer_note,
          offer.purchase_note,
          offer.source_file,
          offerId
        );
        updated += 1;
      } else {
        insertOffer.run(
          offerId,
          offer.project_name,
          offer.institution,
          offer.sheet_name,
          offer.offer_type,
          offer.country,
          offer.superstructure,
          offer.vehicle,
          offer.color,
          offer.quantity,
          offer.created_date,
          offer.offer_due_date,
          offer.usd_rate,
          offer.eur_rate,
          offer.quoted_tl,
          offer.quoted_eur,
          offer.quoted_usd,
          offer.customer_note,
          offer.purchase_note,
          offer.source_file,
          offer.row_hash
        );
        inserted += 1;
      }

      deleteItems.run(offerId);
      for (const item of offer.items) {
        insertItem.run(
          uuidv4(),
          offerId,
          item.sort_order,
          item.category,
          item.product_name,
          item.description,
          item.brand,
          item.image_ref,
          item.product_note,
          item.size_info,
          item.unit,
          item.purchase_note,
          item.termin,
          item.unit_price,
          item.total_price,
          item.actual_unit_price || 0,
          item.actual_total_price || 0,
          item.actual_approved ? 1 : 0,
          item.actual_note || '',
          item.row_hash
        );
        itemCount += 1;
      }

      recalculateOfferFinancials(db, offerId);
    }

    return { inserted, updated, itemCount };
  });

  return tx(rows);
}

function autoImportDefaultFileIfNeeded() {
  if (!fs.existsSync(DEFAULT_PROJECT_FILE)) return;
  const db = getDb();
  const offerCount = db.prepare('SELECT COUNT(*) AS c FROM project_offers').get().c;
  const itemCount = db.prepare('SELECT COUNT(*) AS c FROM project_offer_items').get().c;
  if (offerCount > 0 && itemCount > 0) return;
  const workbook = XLSX.readFile(DEFAULT_PROJECT_FILE, { cellDates: true });
  const rows = parseWorkbookOffers(workbook, path.basename(DEFAULT_PROJECT_FILE));
  upsertOffers(rows);
}

function getProjectById(db, id) {
  return db.prepare('SELECT * FROM project_offers WHERE id = ?').get(id);
}

function recalculateOfferFinancials(db, offerId) {
  const offer = getProjectById(db, offerId);
  if (!offer) return;

  const totals = db.prepare('SELECT COALESCE(SUM(total_price), 0) AS total_tl FROM project_offer_items WHERE project_offer_id = ?').get(offerId);
  const quotedTl = Number(totals?.total_tl || 0);
  const usdRate = Number(offer.usd_rate || 0);
  const eurRate = Number(offer.eur_rate || 0);
  const quotedUsd = usdRate > 0 ? quotedTl / usdRate : 0;
  const quotedEur = eurRate > 0 ? quotedTl / eurRate : 0;

  db.prepare(`
    UPDATE project_offers
    SET quoted_tl = ?, quoted_usd = ?, quoted_eur = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(quotedTl, quotedUsd, quotedEur, offerId);
}

router.get('/', (req, res) => {
  autoImportDefaultFileIfNeeded();
  const db = getDb();
  const { search, status, year } = req.query;

  let query = `
    SELECT p.*, (
      SELECT COUNT(*) FROM project_offer_items i WHERE i.project_offer_id = p.id
    ) AS item_count
    FROM project_offers p
    WHERE 1 = 1
  `;
  const params = [];

  if (status) {
    query += ' AND p.status = ?';
    params.push(status);
  }
  if (year) {
    query += ' AND substr(COALESCE(p.created_date, p.offer_due_date, p.created_at), 1, 4) = ?';
    params.push(String(year));
  }
  if (search) {
    const q = `%${normTr(search)}%`;
    query += ' AND (norm(p.project_name) LIKE ? OR norm(p.institution) LIKE ? OR norm(p.sheet_name) LIKE ? OR norm(p.vehicle) LIKE ?)';
    params.push(q, q, q, q);
  }

  query += ' ORDER BY COALESCE(p.created_date, p.offer_due_date, p.created_at) DESC';
  const rows = db.prepare(query).all(...params);

  const summary = {
    total: rows.length,
    offered: rows.filter((row) => row.status === 'offered').length,
    won: rows.filter((row) => row.status === 'won').length,
    lost: rows.filter((row) => row.status === 'lost').length,
    cancelled: rows.filter((row) => row.status === 'cancelled').length,
    quotedTlTotal: rows.reduce((sum, row) => sum + Number(row.quoted_tl || 0), 0),
    preCostTlTotal: rows.reduce((sum, row) => sum + Number(row.pre_cost_tl || 0), 0),
    realizedCostTlTotal: rows.reduce((sum, row) => sum + Number(row.realized_cost_tl || 0), 0),
    realizedRevenueTlTotal: rows.reduce((sum, row) => sum + Number(row.realized_revenue_tl || 0), 0),
  };

  const years = [...new Set(
    db.prepare('SELECT substr(COALESCE(created_date, offer_due_date, created_at), 1, 4) AS year FROM project_offers').all().map((row) => Number(row.year)).filter(Boolean)
  )].sort((a, b) => b - a);

  res.json({ rows, summary, years });
});

router.get('/:id', (req, res) => {
  autoImportDefaultFileIfNeeded();
  const db = getDb();
  const offer = getProjectById(db, req.params.id);
  if (!offer) return res.status(404).json({ error: 'Proje bulunamadi.' });

  const items = db.prepare('SELECT * FROM project_offer_items WHERE project_offer_id = ? ORDER BY sort_order, created_at').all(req.params.id);
  const plannedTotal = items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const actualTotal = items.reduce((sum, item) => sum + Number(item.actual_total_price || 0), 0);
  const approvedActualTotal = items.reduce((sum, item) => sum + (Number(item.actual_approved || 0) ? Number(item.actual_total_price || 0) : 0), 0);
  const approvedCount = items.reduce((sum, item) => sum + (Number(item.actual_approved || 0) ? 1 : 0), 0);
  res.json({
    offer,
    items,
    summary: {
      itemCount: items.length,
      itemTotal: plannedTotal,
      actualItemTotal: actualTotal,
      approvedActualTotal,
      approvedCount,
      varianceTotal: actualTotal - plannedTotal,
      margin: Number(offer.realized_revenue_tl || 0) - Number(offer.realized_cost_tl || 0),
      preCostDiff: Number(offer.realized_cost_tl || 0) - Number(offer.pre_cost_tl || 0),
    }
  });
});

router.post('/import', authorize('admin', 'user'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya secilmedi.' });

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const rows = parseWorkbookOffers(workbook, req.file.originalname);
    const result = upsertOffers(rows);
    res.json({
      success: true,
      parsed: rows.length,
      inserted: result.inserted,
      updated: result.updated,
      itemCount: result.itemCount,
      message: `${result.inserted} yeni proje, ${result.updated} guncel proje ve ${result.itemCount} kalem isledi.`
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Excel islenemedi.' });
  }
});

router.patch('/:id', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  const offer = getProjectById(db, req.params.id);
  if (!offer) return res.status(404).json({ error: 'Kayit bulunamadi.' });

  const allowedStatus = new Set(['offered', 'won', 'lost', 'pending']);
  const textFields = new Set(['project_name', 'institution', 'sheet_name', 'offer_type', 'country', 'superstructure', 'vehicle', 'color', 'result_note', 'customer_note', 'purchase_note']);
  const numberFields = new Set(['quantity', 'usd_rate', 'eur_rate', 'quoted_tl', 'quoted_eur', 'quoted_usd', 'pre_cost_tl', 'realized_cost_tl', 'realized_revenue_tl']);
  const dateFields = new Set(['created_date', 'offer_due_date']);
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(req.body || {})) {
    if (key === 'status') {
      if (!allowedStatus.has(value)) continue;
      updates.push('status = ?');
      values.push(value);
      continue;
    }
    if (textFields.has(key)) {
      updates.push(`${key} = ?`);
      values.push(value == null ? '' : String(value));
      continue;
    }
    if (numberFields.has(key)) {
      updates.push(`${key} = ?`);
      values.push(Number(value || 0));
      continue;
    }
    if (dateFields.has(key)) {
      updates.push(`${key} = ?`);
      values.push(value || null);
    }
  }

  if (updates.length === 0) return res.json({ success: true, unchanged: true });

  values.push(req.params.id);
  db.prepare(`UPDATE project_offers SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...values);

  const hasManualTotals = ['quoted_tl', 'quoted_eur', 'quoted_usd'].some((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
  if (!hasManualTotals) {
    recalculateOfferFinancials(db, req.params.id);
  }

  res.json({ success: true });
});

router.post('/:id/items', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  const offer = getProjectById(db, req.params.id);
  if (!offer) return res.status(404).json({ error: 'Proje bulunamadi.' });

  const payload = req.body || {};
  const nextSort = Number(payload.sort_order || db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS nextSort FROM project_offer_items WHERE project_offer_id = ?').get(req.params.id).nextSort || 1);
  const itemId = uuidv4();

  db.prepare(`
    INSERT INTO project_offer_items (
      id, project_offer_id, sort_order, category, product_name, description, brand, image_ref,
      product_note, size_info, unit, purchase_note, termin, unit_price, total_price,
      actual_unit_price, actual_total_price, actual_approved, actual_note, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    req.params.id,
    nextSort,
    String(payload.category || ''),
    String(payload.product_name || ''),
    String(payload.description || ''),
    String(payload.brand || ''),
    String(payload.image_ref || ''),
    String(payload.product_note || ''),
    String(payload.size_info || ''),
    String(payload.unit || ''),
    String(payload.purchase_note || ''),
    String(payload.termin || ''),
    Number(payload.unit_price || 0),
    Number(payload.total_price || 0),
    Number(payload.actual_unit_price || 0),
    Number(payload.actual_total_price || 0),
    Number(payload.actual_approved ? 1 : 0),
    String(payload.actual_note || ''),
    uuidv4()
  );

  recalculateOfferFinancials(db, req.params.id);

  res.status(201).json({ success: true, id: itemId });
});

router.patch('/:id/items/:itemId', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM project_offer_items WHERE id = ? AND project_offer_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Kalem bulunamadi.' });

  const textFields = new Set(['category', 'product_name', 'description', 'brand', 'image_ref', 'product_note', 'size_info', 'unit', 'purchase_note', 'termin', 'actual_note']);
  const numberFields = new Set(['sort_order', 'unit_price', 'total_price', 'actual_unit_price', 'actual_total_price', 'actual_approved']);
  const updates = [];
  const values = [];

  for (const [key, value] of Object.entries(req.body || {})) {
    if (textFields.has(key)) {
      updates.push(`${key} = ?`);
      values.push(value == null ? '' : String(value));
    } else if (numberFields.has(key)) {
      updates.push(`${key} = ?`);
      values.push(Number(value || 0));
    }
  }

  if (updates.length === 0) return res.json({ success: true, unchanged: true });

  values.push(req.params.itemId, req.params.id);
  db.prepare(`
    UPDATE project_offer_items
    SET ${updates.join(', ')}, updated_at = datetime('now')
    WHERE id = ? AND project_offer_id = ?
  `).run(...values);

  recalculateOfferFinancials(db, req.params.id);

  res.json({ success: true });
});

router.delete('/:id/items/:itemId', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM project_offer_items WHERE id = ? AND project_offer_id = ?').run(req.params.itemId, req.params.id);
  recalculateOfferFinancials(db, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  const offer = getProjectById(db, req.params.id);
  if (!offer) return res.status(404).json({ error: 'Proje bulunamadi.' });
  db.prepare('DELETE FROM project_offers WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
