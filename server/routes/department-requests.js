const express = require('express');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const MANAGER_EMAIL   = process.env.SATINALMA_MUDUR_EMAIL   || 'osman.ertugral@restar.com.tr';
const ASSISTANT_EMAIL = process.env.SATINALMA_YARDIMCI_EMAIL || 'umit.gafur@restar.com.tr';
const GM_EMAIL        = process.env.GENEL_MUDUR_EMAIL        || '';

const REQUEST_DEPARTMENTS = ['İK','Muhasebe','Finans','İdari İşler','Teknik','Satış','Üretim','Diğer'];

const STATUS_LABELS = {
  waiting_manager:        'SA Müdürü Bekliyor',
  forwarded_gm:           'GM Onayı Bekleniyor',
  forwarded_dept:         'Departman Kontrolü',
  waiting_clarification:  'Açıklama Bekleniyor',
  approved:               'Onaylandı',
  task_assigned:          'Göreve Atandı',
  in_progress:            'Devam Ediyor',
  completed:              'Tamamlandı',
  rejected:               'Reddedildi',
};

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function createRequestNumber() {
  const now = new Date();
  const d = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('');
  return `TR-${d}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function writeLog(db, { requestId, userId, userName, action, fromStatus, toStatus, note, forwardedTo }) {
  db.prepare(`
    INSERT INTO request_logs (id, request_id, user_id, user_name, action, from_status, to_status, note, forwarded_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(uuidv4(), requestId, userId||null, userName||null, action, fromStatus||null, toStatus||null, note||null, forwardedTo||null);
}

function createTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
}

async function sendMail({ to, subject, html }) {
  if (!to) return;
  const t = createTransporter();
  if (!t) { console.log(`[EMAIL-SKIP] ${to} | ${subject}`); return; }
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html });
    console.log(`[EMAIL-OK] ${to}`);
  } catch (e) { console.error(`[EMAIL-ERR] ${to}:`, e.message); }
}

function buildHtml(req, headline) {
  const urun = req.item_type === 'stoklu'
    ? `${req.product_code || ''} — ${req.product_name || ''}`
    : (req.non_stock_item_name || '—');
  const rows = [
    ['Talep No',   req.request_number],
    ['Departman',  req.department],
    ['Ürün',       urun],
    ['Miktar',     `${req.quantity} ${req.unit||'adet'}`],
    req.project_code ? ['İş Emri', req.project_code] : null,
    req.usage_location ? ['Açıklama', req.usage_location] : null,
    ['Talep Eden', req.requester_name || '—'],
    ['Tarih',      new Date(req.created_at).toLocaleString('tr-TR')],
  ].filter(Boolean);
  return `<div style="font-family:Arial,sans-serif;max-width:580px">
    <h2 style="color:#1e40af">${headline}</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${rows.map(([k,v]) => `<tr><td style="padding:6px 8px;font-weight:bold;background:#f1f5f9;width:35%">${k}</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${v}</td></tr>`).join('')}
    </table>
    <p style="margin-top:14px;font-size:11px;color:#94a3b8">Restar Satınalma Sistemi — otomatik bildirim</p>
  </div>`;
}

// ── GET /stats ─────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const byStatus  = db.prepare(`SELECT status, COUNT(*) as count FROM department_requests GROUP BY status ORDER BY count DESC`).all();
    const byDept    = db.prepare(`SELECT department, COUNT(*) as count FROM department_requests GROUP BY department ORDER BY count DESC`).all();
    const byMonth   = db.prepare(`SELECT substr(created_at,1,7) as month, COUNT(*) as count FROM department_requests GROUP BY month ORDER BY month DESC LIMIT 12`).all();
    const totals    = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('waiting_manager','forwarded_gm','forwarded_dept','waiting_clarification') THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'rejected'  THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN status IN ('task_assigned','in_progress') THEN 1 ELSE 0 END) as inprogress
      FROM department_requests
    `).get();
    const avgHours  = db.prepare(`
      SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) as avg_hours
      FROM department_requests WHERE status IN ('approved','completed')
    `).get();
    res.json({ byStatus, byDept, byMonth, totals, avgHours: avgHours?.avg_hours || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /tasks ─────────────────────────────────────────────────────────────────
router.get('/tasks', (req, res) => {
  try {
    const db = getDb();
    let q = `
      SELECT t.*, dr.department, dr.item_type, dr.product_code, dr.product_name,
             dr.non_stock_item_name, dr.quantity, dr.unit, dr.project_code,
             u.name AS requester_name
      FROM request_tasks t
      LEFT JOIN department_requests dr ON t.request_id = dr.id
      LEFT JOIN users u ON dr.created_by = u.id
    `;
    const params = [];
    if (req.user.role !== 'admin') {
      q += ' WHERE t.assigned_to = ?';
      params.push(req.user.id);
    }
    q += ' ORDER BY t.assigned_at DESC';
    const tasks = db.prepare(q).all(...params);
    res.json({ tasks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /tasks/:id ───────────────────────────────────────────────────────────
router.patch('/tasks/:id', (req, res) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM request_tasks WHERE id = ?').get(req.params.id);
    if (!task) return res.status(404).json({ error: 'Görev bulunamadı.' });
    if (req.user.role !== 'admin' && task.assigned_to !== req.user.id)
      return res.status(403).json({ error: 'Yetkiniz yok.' });

    const { status, note } = req.body;
    const completedAt = status === 'completed' ? new Date().toISOString() : task.completed_at;
    db.prepare(`UPDATE request_tasks SET status=?, note=COALESCE(?,note), completed_at=?, completed_note=? WHERE id=?`)
      .run(status, note||null, completedAt, status==='completed'?(note||null):task.completed_note, req.params.id);

    // Ana talebi de güncelle
    const drStatus = status === 'completed' ? 'completed' : (status === 'in_progress' ? 'in_progress' : null);
    if (drStatus) {
      db.prepare(`UPDATE department_requests SET status=?, updated_at=datetime('now') WHERE id=?`)
        .run(drStatus, task.request_id);
      writeLog(db, { requestId: task.request_id, userId: req.user.id, userName: req.user.name,
        action: `task_${status}`, fromStatus: task.status === 'in_progress' ? 'in_progress' : 'task_assigned',
        toStatus: drStatus, note });
    }
    res.json({ task: db.prepare('SELECT * FROM request_tasks WHERE id = ?').get(req.params.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /:id/logs ──────────────────────────────────────────────────────────────
router.get('/:id/logs', (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM request_logs WHERE request_id = ? ORDER BY created_at ASC').all(req.params.id);
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status, own } = req.query;
    let q = `SELECT dr.*, u.name AS requester_name, u.email AS requester_email, a.name AS assignee_name
             FROM department_requests dr
             LEFT JOIN users u ON dr.created_by = u.id
             LEFT JOIN users a ON dr.assigned_to = a.id`;
    const params = [], where = [];
    if (req.user.role !== 'admin' || own === 'true') {
      where.push('dr.created_by = ?'); params.push(req.user.id);
    }
    if (status) { where.push('dr.status = ?'); params.push(status); }
    if (where.length) q += ' WHERE ' + where.join(' AND ');
    q += ' ORDER BY dr.created_at DESC';
    const requests = db.prepare(q).all(...params);
    res.json({ requests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST / ────────────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { department, item_type, product_id, product_code, product_name,
            non_stock_item_name, quantity, unit, project_id, project_code,
            project_name, usage_location, details } = req.body;

    if (!department || !REQUEST_DEPARTMENTS.includes(department))
      return res.status(400).json({ error: 'Geçerli bir departman seçin.' });
    if (!['stoklu','stok-disi'].includes(item_type))
      return res.status(400).json({ error: 'Geçerli bir talep tipi seçin.' });
    if (item_type === 'stoklu' && !product_id && !product_code)
      return res.status(400).json({ error: 'Stoklu talep için ürün seçmelisiniz.' });
    if (item_type === 'stok-disi' && !non_stock_item_name)
      return res.status(400).json({ error: 'Stok dışı talep için ürün adı girin.' });
    if (!quantity || Number(quantity) <= 0)
      return res.status(400).json({ error: 'Geçerli bir miktar girin.' });

    const id = uuidv4();
    const requestNumber = createRequestNumber();
    db.prepare(`
      INSERT INTO department_requests
        (id, request_number, created_by, department, item_type, product_id, product_code,
         product_name, non_stock_item_name, quantity, unit, project_id, project_code,
         project_name, usage_location, details, status, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'waiting_manager',datetime('now'),datetime('now'))
    `).run(id, requestNumber, req.user.id, department, item_type,
           product_id||null, product_code||null, product_name||null, non_stock_item_name||null,
           quantity, unit||'adet', project_id||null, project_code||null, project_name||null,
           usage_location||null, details||null);

    const created = db.prepare(`SELECT dr.*, u.name AS requester_name FROM department_requests dr LEFT JOIN users u ON dr.created_by = u.id WHERE dr.id = ?`).get(id);

    writeLog(db, { requestId: id, userId: req.user.id, userName: req.user.name,
      action: 'created', fromStatus: null, toStatus: 'waiting_manager' });

    sendMail({
      to: MANAGER_EMAIL,
      subject: `[Yeni Talep] ${requestNumber} — ${department}`,
      html: buildHtml(created, 'Yeni Satınalma Talebi — Onayınızı Bekliyor'),
    }).catch(console.error);

    res.status(201).json({ request: created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /:id/status ─────────────────────────────────────────────────────────
router.patch('/:id/status', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { action, note, forwardedTo, assignedTo, dueDate } = req.body;

    const request = db.prepare(`SELECT dr.*, u.name AS requester_name, u.email AS requester_email FROM department_requests dr LEFT JOIN users u ON dr.created_by = u.id WHERE dr.id = ?`).get(id);
    if (!request) return res.status(404).json({ error: 'Talep bulunamadı.' });

    const isAdmin = req.user.role === 'admin';
    const isOwner = request.created_by === req.user.id;

    // provide_clarification: sadece talep sahibi veya admin
    if (action === 'provide_clarification') {
      if (!isOwner && !isAdmin)
        return res.status(403).json({ error: 'Sadece talep sahibi cevaplayabilir.' });
      if (request.status !== 'waiting_clarification')
        return res.status(400).json({ error: 'Talep açıklama beklemiyor.' });
    } else if (!isAdmin) {
      return res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
    }

    const fromStatus = request.status;
    let toStatus = fromStatus;

    switch (action) {

      case 'manager_approve': {
        const allowed = ['waiting_manager','forwarded_dept','waiting_clarification','forwarded_gm'];
        if (!allowed.includes(fromStatus))
          return res.status(400).json({ error: 'Bu adımda doğrudan onay yapılamaz.' });
        toStatus = 'approved';
        db.prepare(`UPDATE department_requests SET status='approved', manager_approved_by=?, manager_approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
          .run(req.user.id, id);
        sendMail({ to: request.requester_email,
          subject: `[Onaylandı] ${request.request_number}`,
          html: buildHtml(request, 'Talebiniz Onaylandı') }).catch(console.error);
        break;
      }

      case 'forward_gm': {
        if (fromStatus !== 'waiting_manager')
          return res.status(400).json({ error: 'Sadece SA Müdürü bekleyen talepler GM\'e iletilebilir.' });
        const gmEmail = forwardedTo || GM_EMAIL;
        if (!gmEmail) return res.status(400).json({ error: 'GM e-posta adresi gerekli.' });
        toStatus = 'forwarded_gm';
        db.prepare(`UPDATE department_requests SET status='forwarded_gm', forwarded_to=?, forwarded_note=?, updated_at=datetime('now') WHERE id=?`)
          .run(gmEmail, note||null, id);
        sendMail({ to: gmEmail,
          subject: `[GM Onayı Gerekiyor] ${request.request_number} — ${request.department}`,
          html: buildHtml(request, `Genel Müdür Onayına Sunuluyor${note ? ` — Not: ${note}` : ''}`) }).catch(console.error);
        break;
      }

      case 'gm_approve': {
        if (fromStatus !== 'forwarded_gm')
          return res.status(400).json({ error: 'Talep GM onayında değil.' });
        toStatus = 'approved';
        db.prepare(`UPDATE department_requests SET status='approved', gm_approved_by=?, gm_approved_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
          .run(req.user.id, id);
        break;
      }

      case 'forward_dept': {
        if (fromStatus !== 'waiting_manager')
          return res.status(400).json({ error: 'Sadece SA Müdürü bekleyen talepler departmana iletilebilir.' });
        if (!forwardedTo) return res.status(400).json({ error: 'Departman yöneticisi e-postası gerekli.' });
        toStatus = 'forwarded_dept';
        db.prepare(`UPDATE department_requests SET status='forwarded_dept', forwarded_to=?, forwarded_note=?, updated_at=datetime('now') WHERE id=?`)
          .run(forwardedTo, note||null, id);
        sendMail({ to: forwardedTo,
          subject: `[Kontrol Gerekiyor] ${request.request_number} — ${request.department}`,
          html: buildHtml(request, `Departman Kontrolüne Gönderildi${note ? ` — Not: ${note}` : ''}`) }).catch(console.error);
        break;
      }

      case 'dept_confirm': {
        if (fromStatus !== 'forwarded_dept')
          return res.status(400).json({ error: 'Talep departman kontrolünde değil.' });
        toStatus = 'waiting_manager';
        db.prepare(`UPDATE department_requests SET status='waiting_manager', updated_at=datetime('now') WHERE id=?`).run(id);
        break;
      }

      case 'request_clarification': {
        if (!['waiting_manager','forwarded_dept'].includes(fromStatus))
          return res.status(400).json({ error: 'Bu adımda açıklama talep edilemez.' });
        if (!note) return res.status(400).json({ error: 'Açıklama sorusu yazın.' });
        toStatus = 'waiting_clarification';
        db.prepare(`UPDATE department_requests SET status='waiting_clarification', clarification_question=?, updated_at=datetime('now') WHERE id=?`)
          .run(note, id);
        sendMail({ to: request.requester_email,
          subject: `[Açıklama Gerekiyor] ${request.request_number}`,
          html: `<div style="font-family:Arial,sans-serif"><h3>Talebiniz için açıklama bekleniyor</h3><p><strong>Soru:</strong> ${note}</p>${buildHtml(request,'')}</div>`,
        }).catch(console.error);
        break;
      }

      case 'provide_clarification': {
        if (!note) return res.status(400).json({ error: 'Açıklama boş olamaz.' });
        toStatus = 'waiting_manager';
        db.prepare(`UPDATE department_requests SET status='waiting_manager', clarification_answer=?, updated_at=datetime('now') WHERE id=?`)
          .run(note, id);
        sendMail({ to: MANAGER_EMAIL,
          subject: `[Açıklama Geldi] ${request.request_number} — ${request.department}`,
          html: `<div style="font-family:Arial,sans-serif"><h3>Açıklama Geldi</h3><p><strong>Soru:</strong> ${request.clarification_question}</p><p><strong>Cevap:</strong> ${note}</p>${buildHtml(request,'')}</div>`,
        }).catch(console.error);
        break;
      }

      case 'assign_task': {
        if (fromStatus !== 'approved')
          return res.status(400).json({ error: 'Sadece onaylanan talepler için görev atanabilir.' });
        const assignee = assignedTo ? db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(assignedTo) : null;
        const taskId = uuidv4();
        db.prepare(`INSERT INTO request_tasks (id, request_id, request_number, assigned_to, assigned_to_name, assigned_by, assigned_by_name, due_date, note, status, assigned_at)
                    VALUES (?,?,?,?,?,?,?,?,?,'pending',datetime('now'))`)
          .run(taskId, id, request.request_number, assignedTo||null, assignee?.name||null,
               req.user.id, req.user.name, dueDate||null, note||null);
        toStatus = 'task_assigned';
        db.prepare(`UPDATE department_requests SET status='task_assigned', assigned_to=?, updated_at=datetime('now') WHERE id=?`)
          .run(assignedTo||null, id);
        if (assignee) {
          sendMail({ to: assignee.email,
            subject: `[Yeni Görev] ${request.request_number} — ${request.department}`,
            html: buildHtml(request, `Size Atanan Görev${dueDate ? ` — Son: ${dueDate}` : ''}${note ? ` — Not: ${note}` : ''}`),
          }).catch(console.error);
        }
        break;
      }

      case 'reject': {
        if (['completed','rejected'].includes(fromStatus))
          return res.status(400).json({ error: 'Bu talep zaten sonuçlandırıldı.' });
        toStatus = 'rejected';
        db.prepare(`UPDATE department_requests SET status='rejected', updated_at=datetime('now') WHERE id=?`).run(id);
        sendMail({ to: request.requester_email,
          subject: `[Reddedildi] ${request.request_number}`,
          html: `<div style="font-family:Arial,sans-serif"><h3 style="color:#dc2626">Talebiniz Reddedildi</h3>${note?`<p><strong>Gerekçe:</strong> ${note}</p>`:''} ${buildHtml(request,'')}</div>`,
        }).catch(console.error);
        break;
      }

      default:
        return res.status(400).json({ error: 'Geçersiz işlem.' });
    }

    writeLog(db, { requestId: id, userId: req.user.id, userName: req.user.name,
      action, fromStatus, toStatus, note, forwardedTo });

    const updated = db.prepare(`SELECT dr.*, u.name AS requester_name, u.email AS requester_email, a.name AS assignee_name FROM department_requests dr LEFT JOIN users u ON dr.created_by = u.id LEFT JOIN users a ON dr.assigned_to = a.id WHERE dr.id = ?`).get(id);
    res.json({ request: updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
