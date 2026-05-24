const express = require('express');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

function canEdit(req) {
  if (req.user.role === 'admin') return true;
  const db = getDb();
  const user = db.prepare('SELECT extra_permissions FROM users WHERE id = ?').get(req.user.id);
  if (!user) return false;
  const perms = user.extra_permissions ? JSON.parse(user.extra_permissions) : [];
  return perms.includes('kritik_stok_duzenle');
}

// GET /api/kritik-stok — işaretli ürünlerin tüm listesi (ürün adı ve stok verisiyle zenginleştirilmiş)
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      ksi.stok_kodu,
      ksi.kritik_esik_manuel,
      ksi.uyari_esik_manuel,
      ksi.hedef_stok,
      ksi.aciklama,
      ksi.isaretleme_tarihi,
      ksi.guncelleme_tarihi,
      COALESCE(ws.stok_adi, '') AS stok_adi,
      COALESCE(ws.gebze_stok, 0) + COALESCE(ws.eticaret_stok, 0) + COALESCE(ws.showroom_stok, 0) AS mevcut_stok,
      COALESCE(ws.kart_tipi, '') AS kart_tipi,
      COALESCE(ws.gebze_stok, 0) AS gebze_stok,
      COALESCE(ws.eticaret_stok, 0) AS eticaret_stok,
      COALESCE(ws.showroom_stok, 0) AS showroom_stok,
      COALESCE(ws.birim_fiyat, 0) AS birim_fiyat
    FROM kritik_stok_isaretli ksi
    LEFT JOIN warehouse_stock ws ON ws.stok_kodu = ksi.stok_kodu
    ORDER BY ksi.stok_kodu
  `).all();
  res.json(rows);
});

// POST /api/kritik-stok/isaretle — bir ürünü işaretle
router.post('/isaretle', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  const { stok_kodu } = req.body;
  if (!stok_kodu) return res.status(400).json({ error: 'stok_kodu gerekli' });
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO kritik_stok_isaretli (stok_kodu, isaretleyen_id, isaretleme_tarihi, guncelleme_tarihi)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `).run(stok_kodu, req.user.id);
  res.json({ ok: true });
});

// DELETE /api/kritik-stok/:stok_kodu — işareti kaldır
router.delete('/:stok_kodu', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  const db = getDb();
  db.prepare('DELETE FROM kritik_stok_isaretli WHERE stok_kodu = ?').run(
    decodeURIComponent(req.params.stok_kodu)
  );
  res.json({ ok: true });
});

// POST /api/kritik-stok/toplu-kaldir — birden fazla ürünün işaretini aynı anda kaldır
router.post('/toplu-kaldir', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  const { stok_kodlari } = req.body;
  if (!Array.isArray(stok_kodlari) || stok_kodlari.length === 0) {
    return res.status(400).json({ error: 'stok_kodlari dizisi gerekli' });
  }
  const db = getDb();
  const del = db.prepare('DELETE FROM kritik_stok_isaretli WHERE stok_kodu = ?');
  const delMany = db.transaction((kodlar) => {
    for (const kod of kodlar) del.run(kod);
  });
  delMany(stok_kodlari);
  res.json({ ok: true, silinen: stok_kodlari.length });
});

// POST /api/kritik-stok/toplu-isaretle — birden fazla ürünü aynı anda işaretle
router.post('/toplu-isaretle', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  const { stok_kodlari } = req.body;
  if (!Array.isArray(stok_kodlari) || stok_kodlari.length === 0) {
    return res.status(400).json({ error: 'stok_kodlari dizisi gerekli' });
  }
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO kritik_stok_isaretli (stok_kodu, isaretleyen_id, isaretleme_tarihi, guncelleme_tarihi)
    VALUES (?, ?, datetime('now'), datetime('now'))
  `);
  const insertMany = db.transaction((kodlar) => {
    for (const kod of kodlar) insert.run(kod, req.user.id);
  });
  insertMany(stok_kodlari);
  res.json({ ok: true, eklenen: stok_kodlari.length });
});

// PUT /api/kritik-stok/:stok_kodu/ayarlar — eşik ve not ayarlarını güncelle
router.put('/:stok_kodu/ayarlar', (req, res) => {
  if (!canEdit(req)) return res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
  const { kritik_esik_manuel, uyari_esik_manuel, hedef_stok, aciklama } = req.body;
  const db = getDb();
  const stok_kodu = decodeURIComponent(req.params.stok_kodu);
  const existing = db.prepare('SELECT stok_kodu FROM kritik_stok_isaretli WHERE stok_kodu = ?').get(stok_kodu);
  if (!existing) return res.status(404).json({ error: 'Ürün işaretli listesinde bulunamadı' });
  db.prepare(`
    UPDATE kritik_stok_isaretli
    SET kritik_esik_manuel = ?, uyari_esik_manuel = ?, hedef_stok = ?,
        aciklama = ?, guncelleme_tarihi = datetime('now')
    WHERE stok_kodu = ?
  `).run(
    kritik_esik_manuel != null ? Number(kritik_esik_manuel) : null,
    uyari_esik_manuel != null ? Number(uyari_esik_manuel) : null,
    hedef_stok != null ? Number(hedef_stok) : null,
    aciklama ?? null,
    stok_kodu
  );
  res.json({ ok: true });
});

module.exports = router;
