const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const PDFDocument = require('pdfkit');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');
const { getRates } = require('../utils/tcmb');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'svc');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Disk storage — proje dosya yüklemeleri için
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_DIR, req.params.id);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Memory storage — Excel import için
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── Excel Parser ─────────────────────────────────────────────────────────────

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
  const n = Number(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normCell(v) {
  return String(v || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
}

function findMetaValue(rows, label) {
  const target = normCell(label);
  for (const row of rows) {
    if (normCell(row[0]) === target) return row[2] ?? row[1] ?? '';
  }
  return '';
}

function parseSheetItems(rows, usdRate = 1, eurRate = 1) {
  const headerIdx = rows.findIndex(row =>
    normCell(row[0]) === 'kategori' &&
    (normCell(row[10]) === 'birim fiyat' || normCell(row[9]) === 'termin')
  );
  if (headerIdx < 0) return [];

  // 1. Geçiş: Döviz birimini tespit et (tablo sonundaki para birimi satırı veya sütun başlığı)
  let currency = 'tl';
  const priceHeader = normCell(String((rows[headerIdx] || [])[10] || ''));
  if (priceHeader.includes('usd') || priceHeader.includes('dolar')) currency = 'usd';
  else if (priceHeader.includes('eur') || priceHeader.includes('euro')) currency = 'eur';

  if (currency === 'tl') {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!row.slice(0, 12).some(c => String(c || '').trim())) continue;
      const cell = normCell(row[10]);
      if (cell === 'usd' || cell === 'dolar') { currency = 'usd'; break; }
      if (cell === 'eur' || cell === 'euro')  { currency = 'eur'; break; }
      if (cell === 'tl')                       { currency = 'tl';  break; }
    }
  }

  const multiplier = currency === 'usd' ? usdRate : currency === 'eur' ? eurRate : 1;

  // 2. Geçiş: Kalemleri oku, fiyatları TL'ye çevir
  const items = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (!row.slice(0, 12).some(c => String(c || '').trim())) continue;
    const totalCurrency = normCell(row[10]);
    if (['tl', 'euro', 'eur', 'usd', 'dolar'].includes(totalCurrency)) break;

    const unitPrice  = toNum(row[10]);
    const qty        = toNum(row[6]) || 1;
    const totalPrice = toNum(row[11]) || unitPrice * qty;

    items.push({
      sort_order:    items.length + 1,
      category:      String(row[0] || '').trim(),
      product_name:  String(row[1] || '').trim(),
      description:   String(row[2] || '').trim(),
      brand:         String(row[3] || '').trim(),
      tech_spec:     String(row[5] || '').trim(),
      size_info:     '',
      unit:          String(row[7] || 'adet').trim(),
      quantity:      qty,
      purchase_note: String(row[8] || '').trim(),
      termin:        String(row[9] || '').trim(),
      unit_price:    +(unitPrice  * multiplier).toFixed(4),
      total_price:   +(totalPrice * multiplier).toFixed(4),
    });
  }
  return items;
}

async function extractCoverImageFromXlsx(buffer, projectDir) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const mediaFiles = Object.keys(zip.files).filter(f =>
      /^xl\/media\/(image|img)\d+\.(png|jpg|jpeg|gif|bmp|webp)/i.test(f)
    );
    if (!mediaFiles.length) return null;

    const imgBuf = await zip.files[mediaFiles[0]].async('nodebuffer');
    const ext = path.extname(mediaFiles[0]).toLowerCase() || '.png';
    const coverName = `cover${ext}`;
    const coverPath = path.join(projectDir, coverName);
    fs.writeFileSync(coverPath, imgBuf);
    return coverName;
  } catch (e) {
    return null;
  }
}

// ─── Yardımcı fonksiyonlar ────────────────────────────────────────────────────

function getSvcRole(db, userId, userRole) {
  if (userRole === 'admin') return 'management';
  const user = db.prepare('SELECT svc_role FROM users WHERE id = ?').get(userId);
  return user?.svc_role || 'none';
}

// purchasing, manager, management fiyat görebilir
function canSeePrices(role) {
  return ['purchasing', 'manager', 'management'].includes(role);
}

// sadece manager ve management teklif fiyatını görebilir
function canSeeOffer(role) {
  return ['manager', 'management'].includes(role);
}

function addLog(db, projectId, userId, userName, action, oldStatus, newStatus, note) {
  db.prepare(`
    INSERT INTO svc_project_logs (id, project_id, user_id, user_name, action, old_status, new_status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), projectId, userId, userName, action, oldStatus || '', newStatus || '', note || '');
}

function recalcCostTotal(db, projectId) {
  const res = db.prepare(
    'SELECT COALESCE(SUM(total_price), 0) AS total FROM svc_project_items WHERE project_id = ?'
  ).get(projectId);
  db.prepare(
    "UPDATE svc_projects SET cost_total_tl = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(res.total, projectId);
}

function stripSensitive(row, svcRole) {
  if (canSeeOffer(svcRole)) return row;
  // Danışman: teklif fiyatını görür ama maliyet/marj detaylarını görmez
  if (svcRole === 'consultant') {
    const { sale_price_tl, margin_rate, notes_management, realized_revenue_tl,
            cost_total_tl, realized_cost_tl, usd_rate, eur_rate, notes_purchase, ...safe } = row;
    return safe; // offer_price_tl dahil
  }
  const { offer_price_tl, sale_price_tl, margin_rate, notes_management, realized_revenue_tl, ...rest } = row;
  if (canSeePrices(svcRole)) return rest;
  const { cost_total_tl, realized_cost_tl, usd_rate, eur_rate, notes_purchase, ...safe } = rest;
  return safe;
}

function stripItemPrices(item) {
  const { unit_price, total_price, actual_unit_price, actual_total_price, actual_approved, actual_note, purchase_note, ...rest } = item;
  return rest;
}

const STATUS_LABELS = {
  draft:              'Teklif Verilmedi',
  submitted:          'Teklif Verilmedi',
  reviewing:          'Teklif Verilmedi',
  costing:            'Teklif Verilmedi',
  offer_ready:        'Teklif Verilmedi',
  offered:            'Teklif Verildi',
  pending:            'Teklif Verildi',
  revision_requested: 'Teklif Verildi',
  won:                'Proje Alındı',
  lost:               'Proje Alınamadı',
};

const SVC_NOT_OFFERED_GROUP = ['draft', 'submitted', 'reviewing', 'costing', 'offer_ready'];
const SVC_OFFERED_GROUP     = ['offered', 'pending', 'revision_requested'];

// ─── GET / ── proje listesi ───────────────────────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const { search, status, year, group, country, division } = req.query;

  let q = `
    SELECT p.*,
      (SELECT COUNT(*) FROM svc_project_items WHERE project_id = p.id) AS item_count
    FROM svc_projects p WHERE 1=1
  `;
  const params = [];

  // Tek durum filtresi
  if (status) {
    q += ' AND p.status = ?'; params.push(status);
  } else if (group) {
    // Bileşik grup filtresi
    if (group === 'not_offered') {
      q += ` AND p.status IN (${SVC_NOT_OFFERED_GROUP.map(() => '?').join(',')})`;
      params.push(...SVC_NOT_OFFERED_GROUP);
    } else if (group === 'bekleyen') {
      q += ` AND p.status IN (${SVC_OFFERED_GROUP.map(() => '?').join(',')})`;
      params.push(...SVC_OFFERED_GROUP);
    } else if (group === 'teklif_verilenler') {
      q += ` AND p.status IN (${SVC_OFFERED_GROUP.map(() => '?').join(',')})`;
      q += ` AND p.id NOT IN (SELECT DISTINCT project_id FROM svc_project_logs WHERE action LIKE 'REVİZE TEKLİF%')`;
      params.push(...SVC_OFFERED_GROUP);
    } else if (group === 'revize') {
      q += ` AND p.id IN (SELECT DISTINCT project_id FROM svc_project_logs WHERE action LIKE 'REVİZE TEKLİF%')`;
    }
  }

  if (year)     { q += " AND substr(p.created_date, 1, 4) = ?"; params.push(year); }
  if (country)  { q += " AND p.country = ?"; params.push(country); }
  if (division) { q += " AND COALESCE(p.division, 'SVC') = ?"; params.push(division); }
  if (search) {
    const terms = search.trim().split(/\s+/).filter(Boolean);
    const fields = ['p.project_name', 'p.institution', 'p.consultant_name', 'p.vehicle', 'p.description', 'p.superstructure'];
    for (const term of terms) {
      const pat  = `%${term}%`;
      const patL = `%${term.toLowerCase()}%`;
      const conds = fields.flatMap(f => [`${f} LIKE ?`, `LOWER(${f}) LIKE ?`]).join(' OR ');
      q += ` AND (${conds})`;
      params.push(...fields.flatMap(() => [pat, patL]));
    }
  }

  // Danışmanlar yalnızca kendi projelerini görür
  if (svcRole === 'consultant') {
    q += ' AND p.consultant_id = ?';
    params.push(req.user.id);
  }

  q += ' ORDER BY p.created_date DESC, p.created_at DESC';
  const rows = db.prepare(q).all(...params);
  const filtered = rows.map(r => stripSensitive(r, svcRole));

  // Summary — danışman kendi projelerini, yönetim hepsini görür; bölüm filtresi uygulanır
  let allQ, allParams;
  if (svcRole === 'consultant') {
    allQ = division
      ? 'SELECT id, status, created_date FROM svc_projects WHERE consultant_id = ? AND COALESCE(division,\'SVC\') = ?'
      : 'SELECT id, status, created_date FROM svc_projects WHERE consultant_id = ?';
    allParams = division ? [req.user.id, division] : [req.user.id];
  } else {
    allQ = division
      ? 'SELECT id, status, created_date FROM svc_projects WHERE COALESCE(division,\'SVC\') = ?'
      : 'SELECT id, status, created_date FROM svc_projects';
    allParams = division ? [division] : [];
  }
  const allRows = db.prepare(allQ).all(...allParams);

  const notOfferedRows  = allRows.filter(r => SVC_NOT_OFFERED_GROUP.includes(r.status));
  const offeredGroupIds = new Set(allRows.filter(r => SVC_OFFERED_GROUP.includes(r.status)).map(r => r.id));

  // REVİZE TEKLİF logu olan projeler
  const revizeIdsRaw = db.prepare(
    "SELECT DISTINCT project_id FROM svc_project_logs WHERE action LIKE 'REVİZE TEKLİF%'"
  ).all().map(r => r.project_id);
  const revizeSet = new Set(revizeIdsRaw);
  const revizeCount = [...offeredGroupIds].filter(id => revizeSet.has(id)).length;

  const summary = {
    total:             allRows.length,
    not_offered:       notOfferedRows.length,
    not_offered_id:    notOfferedRows.length === 1 ? notOfferedRows[0].id : null,
    teklif_verilenler: offeredGroupIds.size - revizeCount,
    revize:            revizeCount,
    bekleyen:          offeredGroupIds.size,
    won:               allRows.filter(r => r.status === 'won').length,
    lost:              allRows.filter(r => r.status === 'lost').length,
  };

  const years = [...new Set(allRows.map(r => r.created_date?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);

  // Danışman listesi (dropdown için)
  const consultants = db.prepare(
    "SELECT id, name FROM users WHERE svc_role = 'consultant' ORDER BY name"
  ).all();

  res.json({ rows: filtered, summary, years, svcRole, consultants });
});

// ─── POST / ── yeni proje ─────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const body = req.body || {};

  const id = uuidv4();
  const consultantId = body.consultant_id || (svcRole === 'consultant' ? req.user.id : null);
  const consultantName = body.consultant_name || (svcRole === 'consultant' ? req.user.name : '');

  db.prepare(`
    INSERT INTO svc_projects (id, project_name, institution, description, vehicle, superstructure,
      quantity, country, division, consultant_id, consultant_name, created_by,
      usd_rate, eur_rate, created_date, offer_due_date, notes_consultant, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(
    id,
    String(body.project_name || '').trim(),
    String(body.institution || ''),
    String(body.description || ''),
    String(body.vehicle || ''),
    String(body.superstructure || ''),
    Number(body.quantity || 1),
    String(body.country || 'Yurtiçi'),
    String(body.division || 'SVC'),
    consultantId,
    consultantName,
    req.user.id,
    Number(body.usd_rate || 0),
    Number(body.eur_rate || 0),
    body.created_date || new Date().toISOString().slice(0, 10),
    body.offer_due_date || null,
    String(body.notes_consultant || ''),
  );

  addLog(db, id, req.user.id, req.user.name, 'Proje oluşturuldu', '', 'draft', '');
  res.status(201).json({ success: true, id });
});

// ─── GET /:id ── proje detayı ─────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const items = db.prepare('SELECT * FROM svc_project_items WHERE project_id = ? ORDER BY sort_order, created_at').all(req.params.id);
  const files = db.prepare('SELECT * FROM svc_project_files WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
  const logs = db.prepare('SELECT * FROM svc_project_logs WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);

  const filteredProject = stripSensitive(project, svcRole);
  const filteredItems = canSeePrices(svcRole) ? items : items.map(stripItemPrices);

  const summary = {
    itemCount: items.length,
    costTotal: items.reduce((s, i) => s + Number(i.total_price || 0), 0),
    actualTotal: items.reduce((s, i) => s + Number(i.actual_total_price || 0), 0),
    approvedCount: items.filter(i => Number(i.actual_approved)).length,
  };

  res.json({ project: filteredProject, items: filteredItems, files, logs, summary, svcRole });
});

// ─── PATCH /:id ── proje güncelle ────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const body = req.body || {};
  const updates = [];
  const vals = [];

  // Herkes düzenleyebilir
  const publicText = ['project_name', 'institution', 'description', 'vehicle', 'superstructure', 'country', 'division', 'consultant_name', 'notes_consultant', 'nihai_musteri', 'is_turu', 'offer_notes'];
  const publicNum = ['quantity'];
  const publicDate = ['created_date', 'offer_due_date', 'validity_date', 'teklif_tarihi'];

  // Satın alma ve üzeri
  const purchaseText = ['notes_purchase', 'notes_manager'];
  const purchaseNum = ['usd_rate', 'eur_rate'];

  // Sadece yönetim
  const mgmtText = ['notes_management', 'result_note'];
  const mgmtNum = ['margin_rate', 'sale_price_tl', 'offer_price_tl', 'realized_cost_tl', 'realized_revenue_tl'];
  const mgmtDate = ['offer_sent_date', 'decision_date'];

  for (const [k, v] of Object.entries(body)) {
    if (k === 'consultant_id') {
      updates.push('consultant_id = ?'); vals.push(v || null);
    } else if (publicText.includes(k)) {
      updates.push(`${k} = ?`); vals.push(String(v || ''));
    } else if (publicNum.includes(k)) {
      updates.push(`${k} = ?`); vals.push(Number(v || 0));
    } else if (publicDate.includes(k)) {
      updates.push(`${k} = ?`); vals.push(v || null);
    } else if (purchaseText.includes(k) && canSeePrices(svcRole)) {
      updates.push(`${k} = ?`); vals.push(String(v || ''));
    } else if (purchaseNum.includes(k) && canSeePrices(svcRole)) {
      updates.push(`${k} = ?`); vals.push(Number(v || 0));
    } else if (mgmtText.includes(k) && canSeeOffer(svcRole)) {
      updates.push(`${k} = ?`); vals.push(String(v || ''));
    } else if (mgmtNum.includes(k) && canSeeOffer(svcRole)) {
      updates.push(`${k} = ?`); vals.push(Number(v || 0));
    } else if (mgmtDate.includes(k) && canSeeOffer(svcRole)) {
      updates.push(`${k} = ?`); vals.push(v || null);
    }
  }

  if (updates.length === 0) return res.json({ success: true, unchanged: true });
  vals.push(req.params.id);
  db.prepare(`UPDATE svc_projects SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
  res.json({ success: true });
});

// ─── PATCH /:id/status ── durum değiştir ─────────────────────────────────────
router.patch('/:id/status', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const { status, note } = req.body || {};
  const allowed = Object.keys(STATUS_LABELS);
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Geçersiz durum.' });

  // Yetki kontrolü
  const restrictedStatuses = ['offer_ready', 'offered', 'won', 'lost', 'revision_requested'];
  if (restrictedStatuses.includes(status) && !canSeeOffer(svcRole)) {
    return res.status(403).json({ error: 'Bu duruma geçiş için yetkiniz yok.' });
  }
  if (status === 'costing' && !canSeePrices(svcRole) && svcRole !== 'manager') {
    return res.status(403).json({ error: 'Bu duruma geçiş için yetkiniz yok.' });
  }

  const oldStatus = project.status;
  db.prepare("UPDATE svc_projects SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  addLog(db, req.params.id, req.user.id, req.user.name,
    `Durum değiştirildi: ${STATUS_LABELS[oldStatus] || oldStatus} → ${STATUS_LABELS[status] || status}`,
    oldStatus, status, note || ''
  );

  // İş alındıysa karar tarihi kaydet
  if ((status === 'won' || status === 'lost') && !project.decision_date) {
    db.prepare("UPDATE svc_projects SET decision_date = date('now') WHERE id = ?").run(req.params.id);
  }
  // Teklif verildiyse gönderim tarihi kaydet, teklif fiyatını logla ve beklemeye al
  if (status === 'offered') {
    if (!project.offer_sent_date) {
      db.prepare("UPDATE svc_projects SET offer_sent_date = date('now') WHERE id = ?").run(req.params.id);
    }
    // Mevcut teklif fiyatı varsa Verilen Teklifler listesine ekle
    if (Number(project.offer_price_tl) > 0) {
      const priceLabel = Number(project.offer_price_tl).toLocaleString('tr-TR', { maximumFractionDigits: 0 });
      const marjLabel = Number(project.margin_rate) > 0 ? ` (Marj %${Number(project.margin_rate).toFixed(1)})` : '';
      const isRevize = oldStatus === 'revision_requested';
      const actionLabel = isRevize
        ? `REVİZE TEKLİF: ${priceLabel} ₺${marjLabel}`
        : `Teklif fiyatı onaylandı: ${priceLabel} ₺${marjLabel}`;
      addLog(db, req.params.id, req.user.id, req.user.name,
        actionLabel, oldStatus, 'pending', note || ''
      );
    }
    db.prepare("UPDATE svc_projects SET status = 'pending', updated_at = datetime('now') WHERE id = ?").run(req.params.id);
    addLog(db, req.params.id, req.user.id, req.user.name,
      'Teklif verildi, otomatik beklemeye alındı',
      'offered', 'pending', ''
    );
  }

  res.json({ success: true });
});

// ─── DELETE /:id ── proje sil ─────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  if (!canSeeOffer(svcRole) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Proje silme yetkisi yok.' });
  }
  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  // Dosyaları sil
  const dir = path.join(UPLOAD_DIR, req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  db.prepare('DELETE FROM svc_projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── POST /:id/items ── kalem ekle ────────────────────────────────────────────
router.post('/:id/items', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const project = db.prepare('SELECT id FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const body = req.body || {};
  const nextSort = (db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM svc_project_items WHERE project_id = ?'
  ).get(req.params.id)?.n) || 1;

  const itemId = uuidv4();
  const qty = Number(body.quantity || 1);
  const unitPrice = canSeePrices(svcRole) ? Number(body.unit_price || 0) : 0;
  const totalPrice = canSeePrices(svcRole) ? Number(body.total_price || (unitPrice * qty)) : 0;

  db.prepare(`
    INSERT INTO svc_project_items (
      id, project_id, sort_order, category, product_name, description, brand,
      size_info, unit, quantity, tech_spec, purchase_note, termin,
      unit_price, total_price, actual_unit_price, actual_total_price, actual_approved, actual_note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, '')
  `).run(
    itemId, req.params.id,
    Number(body.sort_order || nextSort),
    String(body.category || ''),
    String(body.product_name || ''),
    String(body.description || ''),
    String(body.brand || ''),
    String(body.size_info || ''),
    String(body.unit || 'adet'),
    qty,
    String(body.tech_spec || ''),
    String(body.purchase_note || ''),
    String(body.termin || ''),
    unitPrice,
    totalPrice,
  );

  recalcCostTotal(db, req.params.id);
  res.status(201).json({ success: true, id: itemId });
});

// ─── PATCH /:id/items/:itemId ── kalem güncelle ───────────────────────────────
router.patch('/:id/items/:itemId', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  const item = db.prepare('SELECT * FROM svc_project_items WHERE id = ? AND project_id = ?').get(req.params.itemId, req.params.id);
  if (!item) return res.status(404).json({ error: 'Kalem bulunamadı.' });

  const body = req.body || {};
  const updates = [];
  const vals = [];

  const publicText = ['category', 'product_name', 'description', 'brand', 'size_info', 'unit', 'tech_spec'];
  const publicNum = ['sort_order', 'quantity', 'include_in_offer'];
  const purchaseText = ['purchase_note', 'termin', 'actual_note'];
  const purchaseNum = ['unit_price', 'total_price', 'actual_unit_price', 'actual_total_price', 'actual_approved'];

  for (const [k, v] of Object.entries(body)) {
    if (publicText.includes(k)) {
      updates.push(`${k} = ?`); vals.push(String(v || ''));
    } else if (publicNum.includes(k)) {
      updates.push(`${k} = ?`); vals.push(Number(v || 0));
    } else if (purchaseText.includes(k) && canSeePrices(svcRole)) {
      updates.push(`${k} = ?`); vals.push(String(v || ''));
    } else if (purchaseNum.includes(k) && canSeePrices(svcRole)) {
      updates.push(`${k} = ?`); vals.push(Number(v || 0));
    }
  }

  if (updates.length === 0) return res.json({ success: true, unchanged: true });
  vals.push(req.params.itemId, req.params.id);
  db.prepare(`UPDATE svc_project_items SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? AND project_id = ?`).run(...vals);
  recalcCostTotal(db, req.params.id);
  res.json({ success: true });
});

// ─── DELETE /:id/items/:itemId ── kalem sil ───────────────────────────────────
router.delete('/:id/items/:itemId', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM svc_project_items WHERE id = ? AND project_id = ?').run(req.params.itemId, req.params.id);
  recalcCostTotal(db, req.params.id);
  res.json({ success: true });
});

// ─── POST /:id/files ── dosya yükle ──────────────────────────────────────────
router.post('/:id/files', fileUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya seçilmedi.' });
  const db = getDb();
  const project = db.prepare('SELECT id FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const fileType = (ext === '.xlsx' || ext === '.xls') ? 'excel'
    : (ext === '.pdf') ? 'pdf'
    : 'other';

  const fileId = uuidv4();
  db.prepare(`
    INSERT INTO svc_project_files (id, project_id, filename, original_name, file_type, mimetype, size, uploaded_by, uploaded_by_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fileId, req.params.id, req.file.filename, req.file.originalname, fileType, req.file.mimetype, req.file.size, req.user.id, req.user.name);

  res.status(201).json({ success: true, id: fileId });
});

// ─── GET /:id/files/:fileId/download ── dosya indir ──────────────────────────
router.get('/:id/files/:fileId/download', (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT * FROM svc_project_files WHERE id = ? AND project_id = ?').get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Dosya bulunamadı.' });

  const filePath = path.join(UPLOAD_DIR, req.params.id, file.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı.' });

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  res.sendFile(filePath);
});

// ─── DELETE /:id/files/:fileId ── dosya sil ───────────────────────────────────
router.delete('/:id/files/:fileId', (req, res) => {
  const db = getDb();
  const file = db.prepare('SELECT * FROM svc_project_files WHERE id = ? AND project_id = ?').get(req.params.fileId, req.params.id);
  if (!file) return res.status(404).json({ error: 'Dosya bulunamadı.' });

  const filePath = path.join(UPLOAD_DIR, req.params.id, file.filename);
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(e) {}

  db.prepare('DELETE FROM svc_project_files WHERE id = ?').run(req.params.fileId);
  res.json({ success: true });
});

// ─── GET /:id/logs ── tarihçe ─────────────────────────────────────────────────
router.get('/:id/logs', (req, res) => {
  const db = getDb();
  const logs = db.prepare('SELECT * FROM svc_project_logs WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json({ logs });
});

// ─── PATCH /:id/margin ── toplu marj uygula ───────────────────────────────────
router.patch('/:id/margin', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  if (!canSeeOffer(svcRole)) return res.status(403).json({ error: 'Yetersiz yetki.' });

  const { margin_rate, confirm, offer_price_tl: customOfferPrice } = req.body || {};
  const rate = Number(margin_rate || 0);
  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const costTotal = Number(project.cost_total_tl || 0);
  const salePrice = costTotal * (1 + rate / 100);
  const offerPrice = (customOfferPrice != null && customOfferPrice !== '') ? Number(customOfferPrice) : salePrice;

  if (confirm) {
    db.prepare("UPDATE svc_projects SET margin_rate = ?, sale_price_tl = ?, offer_price_tl = ?, updated_at = datetime('now') WHERE id = ?")
      .run(rate, salePrice, offerPrice, req.params.id);

    const priceLabel = offerPrice.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
    const marjLabel  = rate > 0 ? ` (Marj %${rate})` : '';
    const isRevize = project.status === 'revision_requested';
    const actionLabel = isRevize
      ? `REVİZE TEKLİF: ${priceLabel} ₺${marjLabel}`
      : `Teklif fiyatı onaylandı: ${priceLabel} ₺${marjLabel}`;
    addLog(db, req.params.id, req.user.id, req.user.name,
      actionLabel, project.status, 'pending', ''
    );

    // Proje kazanılmadıysa/kaybedilmediyse otomatik teklif verildi → beklemeye al
    if (!['won', 'lost'].includes(project.status)) {
      const oldStatus = project.status;
      db.prepare("UPDATE svc_projects SET status = 'offered', offer_sent_date = COALESCE(offer_sent_date, date('now')), updated_at = datetime('now') WHERE id = ?")
        .run(req.params.id);
      addLog(db, req.params.id, req.user.id, req.user.name,
        `Durum değiştirildi: ${STATUS_LABELS[oldStatus] || oldStatus} → Teklif Verildi`,
        oldStatus, 'offered', ''
      );
      db.prepare("UPDATE svc_projects SET status = 'pending', updated_at = datetime('now') WHERE id = ?")
        .run(req.params.id);
      addLog(db, req.params.id, req.user.id, req.user.name,
        'Teklif verildi, otomatik beklemeye alındı',
        'offered', 'pending', ''
      );
    }
  } else {
    db.prepare("UPDATE svc_projects SET margin_rate = ?, sale_price_tl = ?, updated_at = datetime('now') WHERE id = ?")
      .run(rate, salePrice, req.params.id);
  }

  res.json({ success: true, margin_rate: rate, sale_price_tl: salePrice, offer_price_tl: confirm ? offerPrice : Number(project.offer_price_tl || 0) });
});

// ─── PATCH /:id/consultant-offer ── danışman teklif fiyatı gönder ─────────────
router.patch('/:id/consultant-offer', (req, res) => {
  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  if (svcRole !== 'consultant') return res.status(403).json({ error: 'Sadece danışmanlar kullanabilir.' });

  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ? AND consultant_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı veya yetkiniz yok.' });

  const { offer_price_tl, include_in_offer, nihai_musteri, is_turu, teklif_tarihi, validity_date, offer_notes } = req.body || {};
  const offerPrice = Number(offer_price_tl || 0);

  if (include_in_offer && typeof include_in_offer === 'object') {
    const upd = db.prepare('UPDATE svc_project_items SET include_in_offer = ? WHERE id = ? AND project_id = ?');
    for (const [itemId, val] of Object.entries(include_in_offer)) {
      upd.run(val ? 1 : 0, Number(itemId), req.params.id);
    }
  }

  const notesJson = Array.isArray(offer_notes) ? JSON.stringify(offer_notes) : (offer_notes || '[]');

  db.prepare(`UPDATE svc_projects SET
    offer_price_tl = ?,
    nihai_musteri  = ?,
    is_turu        = ?,
    teklif_tarihi  = ?,
    validity_date  = ?,
    offer_notes    = ?,
    updated_at     = datetime('now')
    WHERE id = ?`)
    .run(offerPrice, nihai_musteri || '', is_turu || '', teklif_tarihi || '', validity_date || '', notesJson, req.params.id);

  const priceLabel = offerPrice.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  addLog(db, req.params.id, req.user.id, req.user.name,
    `Danışman teklifini iletti: ${priceLabel} ₺`,
    project.status, project.status, ''
  );

  res.json({ success: true, offer_price_tl: offerPrice });
});

// ─── Proforma/Teklif PDF yardımcı ── her iki endpoint ortak şablon ────────────
function buildSvcPdf(doc, project, items, { showPrices, teklifNo, teklifTarihi, gecerlilikTarihi, R, RB }) {
  const NAVY   = '#1A3A5C';
  const BLUE   = '#1A8FD8';
  const WHITE  = '#FFFFFF';
  const DARK   = '#1E293B';
  const MUTED  = '#64748B';
  const LIGHT  = '#F8FAFC';
  const BORDER = '#E2E8F0';
  const ROW_ALT = '#F1F5F9';
  const W = 595; const M = 40; const CW = W - M * 2;

  const offerTotal = Number(project.offer_price_tl) || 0;
  const costTotal  = Number(project.cost_total_tl)  || 0;
  const scaleFactor = costTotal > 0 && offerTotal > 0 ? offerTotal / costTotal : 1;

  function fmtTL(v) {
    return (Number(v)||0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
  }
  function trunc(text, max) {
    const s = String(text||''); return s.length > max ? s.slice(0, max-1)+'…' : s;
  }

  // Notlar (offer_notes JSON dizisi)
  let notes = [];
  try { notes = JSON.parse(project.offer_notes || '[]'); } catch {}
  if (!Array.isArray(notes)) notes = [];

  // ── HEADER ────────────────────────────────────────────────────────────────
  doc.rect(0, 0, W, 110).fill(NAVY);
  doc.rect(0, 108, W, 3).fill(BLUE);

  const logoPath = path.join(__dirname, '../../client/public/RESTAR.png');
  if (fs.existsSync(logoPath)) {
    try { doc.image(logoPath, M, 16, { height: 44, fit: [160, 44] }); } catch {}
  }

  doc.font(RB).fontSize(22).fillColor(WHITE).text('TEKLİF', 0, 20, { align: 'right', width: W - M });
  doc.font(R).fontSize(8).fillColor('#94A3B8')
    .text(`No: ${teklifNo}`, 0, 50, { align: 'right', width: W - M })
    .text(`Tarih: ${teklifTarihi}`, 0, 63, { align: 'right', width: W - M })
    .text(`Geçerlilik: ${gecerlilikTarihi}`, 0, 76, { align: 'right', width: W - M });

  let y = 122;

  // ── MÜŞTERİ & TEKLİF BİLGİLERİ ──────────────────────────────────────────
  // Sol: Müşteri Bilgileri
  const bW = (CW - 8) / 2;
  function infoBlock(x, title, rows) {
    doc.rect(x, y, bW, 84).fill(LIGHT).stroke(BORDER);
    doc.rect(x, y, 3, 84).fill(BLUE);
    doc.font(RB).fontSize(7).fillColor(BLUE).text(title, x + 10, y + 9);
    let ly = y + 22;
    rows.forEach(([lbl, val]) => {
      if (!val && val !== 0) return;
      doc.font(RB).fontSize(7.5).fillColor(MUTED).text(lbl + ':', x + 10, ly, { width: bW - 20 });
      doc.font(R).fontSize(8.5).fillColor(DARK).text(String(val), x + 10, ly + 10, { width: bW - 20 });
      ly += 22;
    });
  }

  infoBlock(M, 'MÜŞTERİ BİLGİLERİ', [
    ['Kurum / Firma', project.institution || '—'],
    ['Nihai Müşteri', project.nihai_musteri || null],
    ['İş Türü',       project.is_turu      || null],
  ]);
  infoBlock(M + bW + 8, 'TEKLİF BİLGİLERİ', [
    ['Teklif No',  teklifNo],
    ['Proje',      trunc(project.project_name || '—', 40)],
    ['Danışman',   project.consultant_name || null],
  ]);

  y += 96;

  // ── SELAMLAnma metni ─────────────────────────────────────────────────────
  doc.font(R).fontSize(9).fillColor(DARK)
    .text(`Sayın ${project.institution || 'Yetkili'},`, M, y, { width: CW });
  y += 13;
  doc.font(R).fontSize(9).fillColor(MUTED)
    .text('Talebiniz doğrultusunda aşağıdaki ürün/hizmetlere ait teklifimizi bilgilerinize sunarız.', M, y, { width: CW });
  y += 18;

  // ── TEKLİF ÜRÜNLERİ TABLOSU ──────────────────────────────────────────────
  doc.font(RB).fontSize(9).fillColor(NAVY).text('TEKLİF ÜRÜNLERİ', M, y);
  y += 14;

  // Sütun genişlikleri
  const nW  = 24;
  const qW  = 36;
  const unW = 32;
  const bpW = showPrices ? 70 : 0;
  const tpW = showPrices ? 72 : 0;
  const urW = CW - nW - qW - unW - bpW - tpW - 12;

  // Tablo başlığı
  doc.rect(M, y, CW, 20).fill(NAVY);
  let hx = M + 6; const hy = y + 6;
  function th(text, w, align = 'left') {
    doc.font(RB).fontSize(7.5).fillColor(WHITE).text(text, hx, hy, { width: w, align, lineBreak: false });
    hx += w + 2;
  }
  th('Sıra', nW, 'center');
  th('Ürün Adı / Açıklama', urW);
  th('Miktar', qW, 'center');
  th('Birim', unW, 'center');
  if (showPrices) { th('Birim Fiyat', bpW, 'right'); th('Toplam', tpW, 'right'); }
  y += 20;

  // Satırlar
  const ROW_H = 22;
  let grandTotal = 0;
  items.forEach((it, i) => {
    if (y + ROW_H > 780) {
      // Yeni sayfa — mini header
      doc.addPage({ size: 'A4', margin: 0 });
      doc.rect(0, 0, W, 28).fill(NAVY);
      doc.rect(0, 26, W, 2).fill(BLUE);
      doc.font(RB).fontSize(10).fillColor(WHITE).text('RESTAR', M, 8);
      doc.font(R).fontSize(8).fillColor('#94A3B8').text(`TEKLİF · ${teklifNo}`, 0, 10, { align: 'right', width: W - M });
      y = 38;
      // Başlık tekrar
      doc.rect(M, y, CW, 20).fill(NAVY);
      hx = M + 6;
      const hy2 = y + 6;
      const th2 = (text, w, align = 'left') => {
        doc.font(RB).fontSize(7.5).fillColor(WHITE).text(text, hx, hy2, { width: w, align, lineBreak: false });
        hx += w + 2;
      };
      th2('Sıra', nW, 'center'); th2('Ürün Adı / Açıklama', urW);
      th2('Miktar', qW, 'center'); th2('Birim', unW, 'center');
      if (showPrices) { th2('Birim Fiyat', bpW, 'right'); th2('Toplam', tpW, 'right'); }
      y += 20;
    }

    const rowBg = i % 2 === 0 ? WHITE : ROW_ALT;
    doc.rect(M, y, CW, ROW_H).fill(rowBg);
    doc.rect(M, y + ROW_H - 0.5, CW, 0.5).fill(BORDER);

    let rx = M + 6; const ry = y + 7;
    function td(text, w, align = 'left', color = DARK, bold = false) {
      doc.font(bold ? RB : R).fontSize(8).fillColor(color)
        .text(String(text || ''), rx, ry, { width: w, align, lineBreak: false });
      rx += w + 2;
    }

    const unitOffer  = showPrices ? Number(it.unit_price  || 0) * scaleFactor : 0;
    const totalOffer = showPrices ? Number(it.total_price || 0) * scaleFactor : 0;
    if (showPrices) grandTotal += totalOffer;

    const label = [it.product_name, it.brand, it.description].filter(Boolean).join(' — ');
    td(i + 1, nW, 'center', MUTED);
    td(trunc(label || '—', 55), urW, 'left', DARK, true);
    td(it.quantity || 1, qW, 'center', DARK);
    td(it.unit || 'adet', unW, 'center', MUTED);
    if (showPrices) {
      td(unitOffer > 0 ? fmtTL(unitOffer) : '', bpW, 'right', DARK);
      td(totalOffer > 0 ? fmtTL(totalOffer) : '', tpW, 'right', DARK, true);
    }
    y += ROW_H;
  });

  // Boş durum
  if (items.length === 0) {
    doc.rect(M, y, CW, 32).fill(LIGHT);
    doc.font(R).fontSize(9).fillColor(MUTED).text('Teklif kalemi bulunmamaktadır.', M, y + 10, { width: CW, align: 'center' });
    y += 32;
  }

  y += 8;

  // ── GENEL TOPLAM ──────────────────────────────────────────────────────────
  if (showPrices || offerTotal > 0) {
    const totalVal = showPrices ? grandTotal : offerTotal;
    const totalVat = totalVal * 0.20;
    // KDV hariç satır
    doc.rect(M, y, CW, 22).fill(LIGHT).stroke(BORDER);
    doc.font(R).fontSize(9).fillColor(MUTED).text('Ara Toplam (KDV Hariç):', M + 8, y + 6, { width: CW - 100 });
    doc.font(R).fontSize(9).fillColor(DARK).text(fmtTL(totalVal), 0, y + 6, { align: 'right', width: W - M - 4 });
    y += 22;
    doc.rect(M, y, CW, 22).fill(LIGHT).stroke(BORDER);
    doc.font(R).fontSize(9).fillColor(MUTED).text('KDV (%20):', M + 8, y + 6, { width: CW - 100 });
    doc.font(R).fontSize(9).fillColor(DARK).text(fmtTL(totalVat), 0, y + 6, { align: 'right', width: W - M - 4 });
    y += 22;
    doc.rect(M, y, CW, 28).fill(NAVY);
    doc.font(RB).fontSize(11).fillColor(WHITE).text('GENEL TOPLAM:', M + 8, y + 8, { width: CW - 100 });
    doc.font(RB).fontSize(12).fillColor('#93C5FD').text(fmtTL(totalVal + totalVat), 0, y + 7, { align: 'right', width: W - M - 4 });
    y += 36;
  }

  // ── NOTLAR ────────────────────────────────────────────────────────────────
  if (notes.length > 0) {
    y += 6;
    if (y + 14 + notes.length * 14 > 795) {
      doc.addPage({ size: 'A4', margin: 0 });
      doc.rect(0, 0, W, 28).fill(NAVY);
      doc.rect(0, 26, W, 2).fill(BLUE);
      y = 38;
    }
    doc.font(RB).fontSize(9).fillColor(NAVY).text('NOTLAR', M, y);
    y += 14;
    notes.forEach(note => {
      doc.font(R).fontSize(8.5).fillColor(DARK).text(`•  ${note}`, M + 6, y, { width: CW - 10 });
      y += 14;
    });
  }

  // ── SAYFA 2: SATIŞ KOŞULLARI ──────────────────────────────────────────────
  doc.addPage({ size: 'A4', margin: 0 });
  doc.rect(0, 0, W, 110).fill(NAVY);
  doc.rect(0, 108, W, 3).fill(BLUE);
  if (fs.existsSync(logoPath)) {
    try { doc.image(logoPath, M, 16, { height: 44, fit: [160, 44] }); } catch {}
  }
  doc.font(RB).fontSize(16).fillColor(WHITE).text('SATIŞ KOŞULLARI', 0, 30, { align: 'right', width: W - M });
  doc.font(R).fontSize(8.5).fillColor('#94A3B8').text(teklifNo, 0, 55, { align: 'right', width: W - M });

  let sy = 124;
  const conditions = [
    ['1. GEÇERLİLİK SÜRESİ', `Bu teklif ${teklifTarihi} tarihinden itibaren ${gecerlilikTarihi} tarihine kadar geçerlidir.`],
    ['2. FİYATLAR', 'Belirtilen fiyatlar KDV hariç olup geçerli yasal oran üzerinden KDV ayrıca uygulanacaktır. Tüm fiyatlar Türk Lirası (₺) cinsindendir.'],
    ['3. ÖDEME KOŞULLARI', 'Ödeme koşulları sipariş onayı sırasında taraflarca mutabık kalınan şekilde belirlenecektir.'],
    ['4. TESLİMAT', 'Teslimat süresi ve koşulları sipariş onayının ardından ayrıca taraflarca mutabık kalınacaktır.'],
    ['5. GARANTİ', 'Ürün ve hizmetlere ait garanti koşulları ilgili teknik şartname ve sözleşmede belirtilecektir.'],
    ['6. KAPSAM', 'Bu teklif yalnızca belirtilen ürün ve hizmetleri kapsamakta olup kapsam dışı talepler ayrıca fiyatlandırılacaktır.'],
    ['7. YETKİ VE İMZA', 'Bu teklif yetkili imza ile geçerli olup aksi belirtilmedikçe resmi sözleşme niteliği taşımamaktadır.'],
  ];

  conditions.forEach(([title, text]) => {
    if (sy > 750) return;
    doc.font(RB).fontSize(8.5).fillColor(NAVY).text(title, M, sy, { width: CW });
    sy += 14;
    doc.font(R).fontSize(8.5).fillColor(MUTED).text(text, M + 8, sy, { width: CW - 8 });
    sy += doc.heightOfString(text, { width: CW - 8, fontSize: 8.5 }) + 14;
  });

  // Alt bilgi — şirket adı + teklif kodu
  const footerY2 = 800;
  doc.rect(0, footerY2, W, 42).fill(NAVY);
  doc.rect(0, footerY2, W, 3).fill(BLUE);
  doc.font(RB).fontSize(11).fillColor(WHITE).text('RESTAR Automotive A.Ş.', M, footerY2 + 9);
  doc.font(R).fontSize(7.5).fillColor('#94A3B8').text('restarglobal.com', M, footerY2 + 24);
  doc.font(RB).fontSize(8).fillColor(BLUE).text(teklifNo, 0, footerY2 + 9, { align: 'right', width: W - M });
  doc.font(R).fontSize(7.5).fillColor('#94A3B8').text(teklifTarihi, 0, footerY2 + 24, { align: 'right', width: W - M });
}

// ─── GET /:id/proforma-pdf ── danışman proforma teklif PDF'i ──────────────────
router.get('/:id/proforma-pdf', (req, res) => {
  try {
    const db = getDb();
    const svcRole = getSvcRole(db, req.user.id, req.user.role);
    const isConsultant = svcRole === 'consultant';
    if (!isConsultant && !canSeeOffer(svcRole)) return res.status(403).json({ error: 'Yetersiz yetki.' });

    const project = isConsultant
      ? db.prepare('SELECT * FROM svc_projects WHERE id = ? AND consultant_id = ?').get(req.params.id, req.user.id)
      : db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

    const items = db.prepare(
      'SELECT * FROM svc_project_items WHERE project_id = ? AND (include_in_offer IS NULL OR include_in_offer = 1) ORDER BY sort_order'
    ).all(req.params.id);

    const FONT_REG  = 'C:\\Windows\\Fonts\\arial.ttf';
    const FONT_BOLD = 'C:\\Windows\\Fonts\\arialbd.ttf';
    const hasFont   = fs.existsSync(FONT_REG) && fs.existsSync(FONT_BOLD);

    const safeName = (project.project_name || 'Proforma').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s-]/g, '').trim();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(`RESTAR_SVC_Proforma_${safeName}.pdf`)}`);

    const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
      Title: `Proforma Teklif - ${project.project_name || project.id}`,
      Author: 'RESTAR Special Vehicle Conversions',
    }});
    doc.pipe(res);

    if (hasFont) { doc.registerFont('R', FONT_REG); doc.registerFont('RB', FONT_BOLD); }
    const FONT_R  = hasFont ? 'R'  : 'Helvetica';
    const FONT_RB = hasFont ? 'RB' : 'Helvetica-Bold';

    const year      = new Date().getFullYear();
    const teklifNo  = `PRF-${year}-${String(project.id).slice(0, 8).toUpperCase()}`;
    const today     = project.teklif_tarihi
      ? new Date(project.teklif_tarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const validity  = project.validity_date
      ? new Date(project.validity_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }); })();

    buildSvcPdf(doc, project, items, {
      showPrices: false,
      teklifNo,
      teklifTarihi: today,
      gecerlilikTarihi: validity,
      R: FONT_R,
      RB: FONT_RB,
    });

    doc.end();
  } catch (err) {
    console.error('[proforma-pdf]', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF oluşturulamadı.' });
  }
});

// ─── POST /import ── Excel'den proje oluştur ─────────────────────────────────
router.post('/import', importUpload.fields([
  { name: 'excel', maxCount: 1 },
  { name: 'spec',  maxCount: 5 },
]), async (req, res) => {
  const excelFile = req.files?.excel?.[0];
  if (!excelFile) return res.status(400).json({ error: 'Excel dosyası gerekli.' });

  const db = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);

  try {
    // Excel parse
    const workbook = XLSX.read(excelFile.buffer, { type: 'buffer', cellDates: true });
    const results = [];

    const activeTab = workbook.Workbook?.Bookviews?.[0]?.activeTab ?? 0;
    const activeSheetName = workbook.SheetNames[activeTab] || workbook.SheetNames[0];
    for (const sheetName of [activeSheetName]) {
      const ws = workbook.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) continue;

      const project_name   = String(findMetaValue(rows, 'PROJE') || '').trim() || sheetName;
      const institution    = String(findMetaValue(rows, 'KURUM / FİRMA') || '').trim();
      const superstructure = String(findMetaValue(rows, 'ÜSTYAPI') || '').trim();
      const vehicle        = String(findMetaValue(rows, 'ARAÇ') || '').trim();
      const country        = req.body.country || String(findMetaValue(rows, 'ÜLKE') || 'Yurtiçi').trim();
      const division       = req.body.division || 'SVC';
      const quantity       = toNum(findMetaValue(rows, 'ADET')) || 1;
      const created_date   = parseExcelDate(findMetaValue(rows, 'OLUŞTURULAN TARİH')) || new Date().toISOString().slice(0,10);
      const offer_due_date = parseExcelDate(findMetaValue(rows, 'TEKLİF VERİLECEK TARİH'));
      const usd_rate       = toNum((rows[9] || [])[9]);
      const eur_rate       = toNum((rows[9] || [])[10]);

      // Müşteri ve satın alma notları
      const custNoteRow = rows.findIndex(r => normCell(r[0]).includes('musteri') && normCell(r[0]).includes('ozel'));
      const purchNoteRow = rows.findIndex(r => normCell(r[0]).includes('satin alma') && normCell(r[0]).includes('ozel'));
      const notes_consultant = custNoteRow >= 0  ? String((rows[custNoteRow]  || [])[1] || '').trim() : '';
      const notes_purchase   = purchNoteRow >= 0 ? String((rows[purchNoteRow] || [])[1] || '').trim() : '';

      const rates = await getRates();
      const items = parseSheetItems(rows, rates.usd || 1, rates.eur || 1);
      const costTotal = items.reduce((s, i) => s + i.total_price, 0);

      let consultantId = svcRole === 'consultant' ? req.user.id : (req.body.consultant_id || null);
      let consultantName = '';
      if (svcRole === 'consultant') {
        consultantName = req.user.name;
      } else if (consultantId) {
        const cu = db.prepare('SELECT name FROM users WHERE id = ?').get(consultantId);
        consultantName = cu?.name || '';
      }

      const projectId = uuidv4();
      const projectDir = path.join(UPLOAD_DIR, projectId);
      if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

      // Cover image - Excel'den çıkar
      const coverImage = await extractCoverImageFromXlsx(excelFile.buffer, projectDir);

      db.prepare(`
        INSERT INTO svc_projects (
          id, project_name, institution, superstructure, vehicle, country, division, quantity,
          consultant_id, consultant_name, created_by,
          usd_rate, eur_rate, created_date, offer_due_date,
          cost_total_tl, notes_consultant, notes_purchase, cover_image, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
      `).run(
        projectId, project_name, institution, superstructure, vehicle, country, division, quantity,
        consultantId, consultantName, req.user.id,
        usd_rate, eur_rate, created_date, offer_due_date || null,
        costTotal, notes_consultant, notes_purchase, coverImage || null,
      );

      // Kalemleri ekle
      for (const item of items) {
        db.prepare(`
          INSERT INTO svc_project_items (
            id, project_id, sort_order, category, product_name, description, brand,
            size_info, unit, quantity, tech_spec, purchase_note, termin,
            unit_price, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(), projectId, item.sort_order, item.category, item.product_name,
          item.description, item.brand, item.size_info, item.unit, item.quantity,
          item.tech_spec, item.purchase_note, item.termin,
          canSeePrices(svcRole) ? item.unit_price : 0,
          canSeePrices(svcRole) ? item.total_price : 0,
        );
      }

      // Orijinal Excel dosyasını kaydet
      const excelSaveExt = path.extname(excelFile.originalname) || '.xlsx';
      const excelSaveName = `${uuidv4()}${excelSaveExt}`;
      fs.writeFileSync(path.join(projectDir, excelSaveName), excelFile.buffer);
      db.prepare(`
        INSERT INTO svc_project_files (id, project_id, filename, original_name, file_type, mimetype, size, uploaded_by, uploaded_by_name)
        VALUES (?, ?, ?, ?, 'excel', ?, ?, ?, ?)
      `).run(uuidv4(), projectId, excelSaveName, excelFile.originalname,
        excelFile.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        excelFile.size, req.user.id, req.user.name
      );

      // Şartname dosyaları
      for (const specFile of (req.files?.spec || [])) {
        const specExt = path.extname(specFile.originalname) || '.pdf';
        const specSaveName = `${uuidv4()}${specExt}`;
        fs.writeFileSync(path.join(projectDir, specSaveName), specFile.buffer);
        db.prepare(`
          INSERT INTO svc_project_files (id, project_id, filename, original_name, file_type, mimetype, size, uploaded_by, uploaded_by_name)
          VALUES (?, ?, ?, ?, 'spec', ?, ?, ?, ?)
        `).run(uuidv4(), projectId, specSaveName, specFile.originalname,
          specFile.mimetype || 'application/octet-stream',
          specFile.size, req.user.id, req.user.name
        );
      }

      addLog(db, projectId, req.user.id, req.user.name,
        `Excel'den oluşturuldu: ${excelFile.originalname}`, '', 'draft', `${items.length} kalem içe aktarıldı`
      );

      results.push({ id: projectId, project_name, itemCount: items.length, hasCover: !!coverImage });
    }

    if (results.length === 0) return res.status(400).json({ error: 'Excel dosyasında geçerli sayfa bulunamadı.' });
    res.json({ success: true, projects: results, firstId: results[0].id });
  } catch (err) {
    console.error('[SVC Import]', err);
    res.status(400).json({ error: err.message || 'Excel işlenemedi.' });
  }
});

// ─── GET /:id/cover ── kapak görseli ─────────────────────────────────────────
router.get('/:id/cover', (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT cover_image FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project?.cover_image) return res.status(404).end();

  const filePath = path.join(UPLOAD_DIR, req.params.id, project.cover_image);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const ext = path.extname(project.cover_image).toLowerCase();
  const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
  res.setHeader('Content-Type', mimeMap[ext] || 'image/png');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(filePath);
});

// ─── POST /:id/cover ── kapak görseli güncelle ────────────────────────────────
router.post('/:id/cover', importUpload.single('cover'), async (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT id, cover_image FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });
  if (!req.file) return res.status(400).json({ error: 'Dosya gerekli.' });

  const projectDir = path.join(UPLOAD_DIR, req.params.id);
  if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

  // Eski cover'ı sil
  if (project.cover_image) {
    const old = path.join(projectDir, project.cover_image);
    try { if (fs.existsSync(old)) fs.unlinkSync(old); } catch(e) {}
  }

  const ext = path.extname(req.file.originalname).toLowerCase() || '.png';
  const coverName = `cover${ext}`;
  fs.writeFileSync(path.join(projectDir, coverName), req.file.buffer);
  db.prepare("UPDATE svc_projects SET cover_image = ?, updated_at = datetime('now') WHERE id = ?").run(coverName, req.params.id);
  res.json({ success: true, cover_image: coverName });
});

// ─── GET /:id/teklif-pdf ── kurumsal teklif formu (aynı Proforma şablonu) ────
router.get('/:id/teklif-pdf', (req, res) => {
  try {
  const db  = getDb();
  const svcRole = getSvcRole(db, req.user.id, req.user.role);
  if (!canSeeOffer(svcRole)) return res.status(403).json({ error: 'Yetersiz yetki.' });

  const project = db.prepare('SELECT * FROM svc_projects WHERE id = ?').get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Proje bulunamadı.' });

  const items = db.prepare(
    'SELECT * FROM svc_project_items WHERE project_id = ? AND (include_in_offer IS NULL OR include_in_offer = 1) ORDER BY sort_order'
  ).all(req.params.id);

  const FONT_REG  = 'C:\\Windows\\Fonts\\arial.ttf';
  const FONT_BOLD = 'C:\\Windows\\Fonts\\arialbd.ttf';
  const hasFont   = fs.existsSync(FONT_REG) && fs.existsSync(FONT_BOLD);

  const safeName = (project.project_name || 'Teklif').replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s-]/g, '').trim();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`RESTAR_SVC_Teklif_${safeName}.pdf`)}`);

  const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
    Title:  `Teklif - ${project.project_name || project.id}`,
    Author: 'RESTAR Special Vehicle Conversions',
  }});
  doc.pipe(res);

  if (hasFont) { doc.registerFont('R', FONT_REG); doc.registerFont('RB', FONT_BOLD); }
  const FONT_R  = hasFont ? 'R'  : 'Helvetica';
  const FONT_RB = hasFont ? 'RB' : 'Helvetica-Bold';

  const year     = new Date().getFullYear();
  const teklifNo = `TKF-${year}-${String(project.id).slice(0, 8).toUpperCase()}`;
  const today    = project.teklif_tarihi
    ? new Date(project.teklif_tarihi).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const validity = project.validity_date
    ? new Date(project.validity_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }); })();

  const offerTotal = Number(project.offer_price_tl) || 0;

  buildSvcPdf(doc, project, items, {
    showPrices: offerTotal > 0,
    teklifNo,
    teklifTarihi: today,
    gecerlilikTarihi: validity,
    R: FONT_R,
    RB: FONT_RB,
  });

  doc.end();
  } catch (err) {
    console.error('PDF oluşturma hatası:', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF oluşturulamadı.' });
  }
});

// ─── GET /meta/users ── SVC kullanıcı listesi ──────────────────────────────────────
router.get('/meta/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(
    "SELECT id, name, svc_role FROM users WHERE active = 1 AND svc_role != 'none' ORDER BY name"
  ).all();
  res.json({ users });
});

module.exports = router;
