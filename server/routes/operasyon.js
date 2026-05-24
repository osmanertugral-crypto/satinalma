const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const XLSX = require('xlsx');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const EXCEL_PATH = path.join(__dirname, '../../Tabloalarım/Operasyonlar.xlsx');

// Excel'den SQLite'a aktar
function importFromExcel(db) {
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  db.prepare("DELETE FROM operasyon_items WHERE source = 'excel'").run();

  const insert = db.prepare(`
    INSERT INTO operasyon_items
    (id, product, product_package, operation, duration, duration_unit,
     material, material_code, material_name, is_important,
     quantity, unit, production_quantity, production_quantity_unit,
     color, concept, half_product, is_important_material,
     equipments, standard_features, half_products,
     role, relevant_staff, total_staff, source, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'excel',datetime('now'),datetime('now'))
  `);

  const run = db.transaction((rows) => {
    for (const r of rows) {
      const material = String(r.Material || '');
      const dashIdx = material.indexOf(' - ');
      const materialCode = dashIdx > -1 ? material.substring(0, dashIdx).trim() : material;
      const materialName = dashIdx > -1 ? material.substring(dashIdx + 3).trim() : '';

      insert.run(
        uuidv4(),
        String(r.Product || ''),
        String(r['Product Package'] || ''),
        String(r.Operation || ''),
        Number(r.Duration) || 0,
        String(r['Duration Unit'] || 'minute'),
        material,
        materialCode,
        materialName,
        String(r['Is Important'] || 'No'),
        Number(r.Quantity) || 0,
        String(r.Unit || 'adet'),
        Number(r['Production Quantity']) || 0,
        String(r['Production Quantity Unit'] || 'adet'),
        String(r.Color || ''),
        String(r.Concept || ''),
        String(r['Half Product'] || ''),
        String(r['Is Important Material'] || 'No'),
        String(r.Equipments || ''),
        String(r['Standard Features'] || ''),
        String(r['Half Products'] || ''),
        String(r.Role || ''),
        String(r['Relevant Staff'] || ''),
        Number(r['Total Staff']) || 0
      );
    }
  });

  run(rows);
  return rows.length;
}

// İlk açılışta import (tablo boşsa)
try {
  const db = getDb();
  const count = db.prepare("SELECT COUNT(*) as c FROM operasyon_items WHERE source='excel'").get();
  if (count.c === 0) importFromExcel(db);
} catch (e) {
  console.error('[Operasyon] İlk import hatası:', e.message);
}

// ── GET /api/operasyon/meta — filtre seçenekleri ───────────────────────────
router.get('/meta', (req, res) => {
  const db = getDb();

  // Ürün → paket ağacı
  const pairs = db.prepare(
    "SELECT DISTINCT product, product_package FROM operasyon_items WHERE product!='' AND product_package!='' ORDER BY product, product_package"
  ).all();
  const productTree = [];
  const seen = {};
  for (const r of pairs) {
    if (!seen[r.product]) {
      seen[r.product] = { product: r.product, packages: [] };
      productTree.push(seen[r.product]);
    }
    seen[r.product].packages.push(r.product_package);
  }

  const operations = db.prepare("SELECT DISTINCT operation FROM operasyon_items WHERE operation!='' ORDER BY operation").all().map(r => r.operation);
  const roles      = db.prepare("SELECT DISTINCT role FROM operasyon_items WHERE role!='' ORDER BY role").all().map(r => r.role);
  const colors     = db.prepare("SELECT DISTINCT color FROM operasyon_items WHERE color!='' ORDER BY color").all().map(r => r.color);
  const concepts   = db.prepare("SELECT DISTINCT concept FROM operasyon_items WHERE concept!='' ORDER BY concept").all().map(r => r.concept);
  const equipments = db.prepare("SELECT DISTINCT equipments FROM operasyon_items WHERE equipments!='' ORDER BY equipments").all().map(r => r.equipments);
  res.json({ productTree, operations, roles, colors, concepts, equipments });
});

// ── GET /api/operasyon — liste (filtreli) ──────────────────────────────────
router.get('/', (req, res) => {
  const db = getDb();
  const { product, package: pkg, operation, role, color, concept, equipment, search } = req.query;

  let where = [];
  const params = [];

  if (product)   { where.push('product = ?');         params.push(product); }
  if (pkg)       { where.push('product_package = ?');  params.push(pkg); }
  if (operation) { where.push('operation = ?');        params.push(operation); }
  if (role)      { where.push('role = ?');             params.push(role); }
  if (color)     { where.push('color = ?');            params.push(color); }
  if (concept)   { where.push('concept = ?');          params.push(concept); }
  if (equipment) { where.push('equipments = ?');       params.push(equipment); }
  if (search)    {
    where.push('(operation LIKE ? OR material_name LIKE ? OR material_code LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }

  const sql = `SELECT * FROM operasyon_items${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY product, product_package, operation, id`;
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// ── POST /api/operasyon — yeni satır ──────────────────────────────────────
router.post('/', (req, res) => {
  const db = getDb();
  const id = uuidv4();
  const {
    product = '', product_package = '', operation = '',
    duration = 0, duration_unit = 'minute',
    material = '', material_code = '', material_name = '',
    is_important = 'No', quantity = 0, unit = 'adet',
    production_quantity = 0, production_quantity_unit = 'adet',
    color = '', concept = '', half_product = '', is_important_material = 'No',
    equipments = '', standard_features = '', half_products = '',
    role = '', relevant_staff = '', total_staff = 0, notes = ''
  } = req.body;

  db.prepare(`
    INSERT INTO operasyon_items
    (id,product,product_package,operation,duration,duration_unit,
     material,material_code,material_name,is_important,
     quantity,unit,production_quantity,production_quantity_unit,
     color,concept,half_product,is_important_material,
     equipments,standard_features,half_products,
     role,relevant_staff,total_staff,notes,source,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'manual',datetime('now'),datetime('now'))
  `).run(
    id, product, product_package, operation, Number(duration), duration_unit,
    material, material_code, material_name, is_important,
    Number(quantity), unit, Number(production_quantity), production_quantity_unit,
    color, concept, half_product, is_important_material,
    equipments, standard_features, half_products,
    role, relevant_staff, Number(total_staff), notes
  );

  res.json({ id });
});

// ── PUT /api/operasyon/:id — güncelle ─────────────────────────────────────
router.put('/:id', (req, res) => {
  const db = getDb();
  const {
    product, product_package, operation,
    duration, duration_unit,
    material, material_code, material_name,
    is_important, quantity, unit,
    production_quantity, production_quantity_unit,
    color, concept, half_product, is_important_material,
    equipments, standard_features, half_products,
    role, relevant_staff, total_staff, notes
  } = req.body;

  db.prepare(`
    UPDATE operasyon_items SET
      product=?, product_package=?, operation=?,
      duration=?, duration_unit=?,
      material=?, material_code=?, material_name=?,
      is_important=?, quantity=?, unit=?,
      production_quantity=?, production_quantity_unit=?,
      color=?, concept=?, half_product=?, is_important_material=?,
      equipments=?, standard_features=?, half_products=?,
      role=?, relevant_staff=?, total_staff=?, notes=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(
    product, product_package, operation,
    Number(duration), duration_unit,
    material, material_code, material_name,
    is_important, Number(quantity), unit,
    Number(production_quantity), production_quantity_unit,
    color, concept, half_product, is_important_material,
    equipments, standard_features, half_products,
    role, relevant_staff, Number(total_staff), notes || '',
    req.params.id
  );

  res.json({ ok: true });
});

// ── DELETE /api/operasyon/:id ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM operasyon_items WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── POST /api/operasyon/sync-excel — Excel'den yenile ─────────────────────
router.post('/sync-excel', (req, res) => {
  try {
    const db = getDb();
    const count = importFromExcel(db);
    res.json({ ok: true, count });
  } catch (e) {
    console.error('[Operasyon] Excel sync hatası:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
