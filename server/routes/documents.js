const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Desteklenmeyen dosya türü'));
  }
});

// GET /api/documents?entity_type=&entity_id=
router.get('/', (req, res) => {
  const db = getDb();
  const { entity_type, entity_id } = req.query;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type ve entity_id gerekli' });
  const docs = db.prepare(`SELECT d.*, u.name as uploaded_by_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.entity_type=? AND d.entity_id=? ORDER BY d.created_at DESC`).all(entity_type, entity_id);
  res.json(docs);
});

// POST /api/documents
router.post('/', authorize('admin', 'user'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenemedi' });
  const { entity_type, entity_id } = req.body;
  if (!entity_type || !entity_id) return res.status(400).json({ error: 'entity_type ve entity_id gerekli' });

  const id = uuidv4();
  const db = getDb();
  db.prepare('INSERT INTO documents (id, entity_type, entity_id, filename, original_name, mimetype, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, entity_type, entity_id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id);

  res.status(201).json({ id, original_name: req.file.originalname, filename: req.file.filename });
});

// GET /api/documents/:id/download
router.get('/:id/download', (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Dosya bulunamadı' });
  const filePath = path.join(UPLOAD_DIR, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya diskte bulunamadı' });
  res.download(filePath, doc.original_name);
});

// DELETE /api/documents/:id
router.delete('/:id', authorize('admin', 'user'), (req, res) => {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Bulunamadı' });
  const filePath = path.join(UPLOAD_DIR, doc.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ message: 'Dosya silindi' });
});

module.exports = router;
