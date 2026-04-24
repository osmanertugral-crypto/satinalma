const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const REQUEST_DEPARTMENTS = [
  'İK',
  'Muhasebe',
  'Finans',
  'İdari İşler',
  'Teknik',
  'Satış',
  'Üretim',
  'Diğer'
];

const WORKFLOW = {
  'İK': { managerRequired: false, nextStatus: 'waiting_gm' },
  'Satış': { managerRequired: false, nextStatus: 'waiting_gm' },
  'Muhasebe': { managerRequired: true, nextStatus: 'waiting_manager' },
  'Finans': { managerRequired: true, nextStatus: 'waiting_manager' },
  'İdari İşler': { managerRequired: true, nextStatus: 'waiting_manager' },
  'Teknik': { managerRequired: true, nextStatus: 'waiting_manager' },
  'Üretim': { managerRequired: true, nextStatus: 'waiting_manager' },
  'Diğer': { managerRequired: true, nextStatus: 'waiting_manager' }
};

function createRequestNumber() {
  const now = new Date();
  const datePart = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `TR-${datePart}-${random}`;
}

function getStatusLabel(status) {
  switch (status) {
    case 'draft': return 'Taslak';
    case 'waiting_manager': return 'Yönetici Onayı Bekleniyor';
    case 'waiting_gm': return 'Genel Müdür Onayı Bekleniyor';
    case 'approved': return 'Onaylandı';
    case 'rejected': return 'Reddedildi';
    default: return status;
  }
}

function sendProcurementNotice(request) {
  const recipient = request.procurement_email || 'satinalma@company.local';
  console.log(`Departman talebi bildirimi gönderildi: ${request.request_number} -> ${recipient}`);
  console.log(`Konu: Yeni departman talebi ${request.department}`);
  console.log(`Açıklama: ${request.details || request.non_stock_item_name || request.product_name}`);
}

router.get('/', (req, res) => {
  try {
    const db = getDb();
    let query = `SELECT dr.*, u.name AS requester_name FROM department_requests dr LEFT JOIN users u ON dr.created_by = u.id`;
    const params = [];
    if (req.user.role !== 'admin') {
      query += ' WHERE dr.created_by = ?';
      params.push(req.user.id);
    }
    query += ' ORDER BY dr.created_at DESC';
    const requests = db.prepare(query).all(...params);
    res.json({ requests });
  } catch (err) {
    console.error('Department requests list error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      department,
      item_type,
      product_id,
      product_code,
      product_name,
      non_stock_item_name,
      quantity,
      unit,
      project_id,
      project_code,
      project_name,
      usage_location,
      details,
      procurement_email
    } = req.body;

    if (!department || !REQUEST_DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: 'Geçerli bir departman seçin.' });
    }
    if (!item_type || !['stoklu', 'stok-disi'].includes(item_type)) {
      return res.status(400).json({ error: 'Geçerli bir talep tipi seçin.' });
    }
    if (item_type === 'stoklu' && (!product_id && !product_code)) {
      return res.status(400).json({ error: 'Stoklu talep için ürün seçmelisiniz.' });
    }
    if (item_type === 'stok-disi' && !non_stock_item_name) {
      return res.status(400).json({ error: 'Stok dışı talep için ürün adı girin.' });
    }
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'Geçerli bir miktar girin.' });
    }
    const workflow = WORKFLOW[department] || { managerRequired: true, nextStatus: 'waiting_manager' };
    const status = workflow.managerRequired ? 'waiting_manager' : 'waiting_gm';
    const requestNumber = createRequestNumber();

    const insert = db.prepare(`
      INSERT INTO department_requests (
        id, request_number, created_by, department, item_type, product_id, product_code,
        product_name, non_stock_item_name, quantity, unit, project_id, project_code, project_name,
        usage_location, details, procurement_email, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const id = uuidv4();
    insert.run(
      id,
      requestNumber,
      req.user.id,
      department,
      item_type,
      product_id || null,
      product_code || null,
      product_name || null,
      non_stock_item_name || null,
      quantity,
      unit || 'adet',
      project_id || null,
      project_code || null,
      project_name || null,
      usage_location || null,
      details || null,
      procurement_email || null,
      status
    );

    const createdRequest = db.prepare('SELECT dr.*, u.name AS requester_name FROM department_requests dr LEFT JOIN users u ON dr.created_by = u.id WHERE dr.id = ?').get(id);
    sendProcurementNotice(createdRequest);
    res.status(201).json({ request: createdRequest });
  } catch (err) {
    console.error('Department request create error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { action } = req.body;
    const request = db.prepare('SELECT * FROM department_requests WHERE id = ?').get(id);
    if (!request) return res.status(404).json({ error: 'Talep bulunamadı.' });

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Bu işlemi gerçekleştirme yetkiniz yok.' });
    }

    const now = new Date().toISOString();
    let update;
    switch (action) {
      case 'manager_approve':
        if (request.status !== 'waiting_manager') {
          return res.status(400).json({ error: 'Talep şu anda yönetici onayı beklemiyor.' });
        }
        update = db.prepare(`
          UPDATE department_requests SET status = 'waiting_gm', manager_approved_by = ?, manager_approved_at = ?, updated_at = datetime('now') WHERE id = ?
        `);
        update.run(req.user.id, now, id);
        break;
      case 'gm_approve':
        if (request.status !== 'waiting_gm') {
          return res.status(400).json({ error: 'Talep şu anda genel müdür onayı beklemiyor.' });
        }
        update = db.prepare(`
          UPDATE department_requests SET status = 'approved', gm_approved_by = ?, gm_approved_at = ?, updated_at = datetime('now') WHERE id = ?
        `);
        update.run(req.user.id, now, id);
        break;
      case 'reject':
        if (!['waiting_manager', 'waiting_gm'].includes(request.status)) {
          return res.status(400).json({ error: 'Sadece bekleyen talepler reddedilebilir.' });
        }
        update = db.prepare(`
          UPDATE department_requests SET status = 'rejected', updated_at = datetime('now') WHERE id = ?
        `);
        update.run(id);
        break;
      default:
        return res.status(400).json({ error: 'Geçersiz işlem.' });
    }

    const updatedRequest = db.prepare('SELECT dr.*, u.name AS requester_name FROM department_requests dr LEFT JOIN users u ON dr.created_by = u.id WHERE dr.id = ?').get(id);
    res.json({ request: updatedRequest });
  } catch (err) {
    console.error('Department request status update error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
