const Database = require('better-sqlite3');
const path = require('path');
const { normTr } = require('../utils/searchUtils');

const DB_PATH = path.join(__dirname, '..', 'satinalma.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Türkçe karaktere duyarsız arama için norm() fonksiyonu
    db.function('norm', { deterministic: true }, normTr);
  }
  return db;
}

function initDb() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user','viewer')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES categories(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_name TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'Türkiye',
      tax_number TEXT,
      tax_office TEXT,
      payment_terms TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT REFERENCES categories(id),
      unit TEXT NOT NULL DEFAULT 'adet',
      min_stock_level REAL DEFAULT 0,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS supplier_products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      lead_time_days INTEGER DEFAULT 0,
      is_preferred INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(supplier_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'TRY',
      price_date TEXT NOT NULL,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      threshold_percent REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      po_number TEXT UNIQUE NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      status TEXT NOT NULL DEFAULT 'draft',
      order_date TEXT NOT NULL,
      expected_date TEXT,
      delivery_date TEXT,
      currency TEXT NOT NULL DEFAULT 'TRY',
      total_amount REAL DEFAULT 0,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS po_items (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS quotations (
      id TEXT PRIMARY KEY,
      rfq_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
      deadline TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quotation_suppliers (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      UNIQUE(quotation_id, supplier_id)
    );

    CREATE TABLE IF NOT EXISTS quotation_items (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS quotation_responses (
      id TEXT PRIMARY KEY,
      quotation_id TEXT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      product_id TEXT NOT NULL REFERENCES products(id),
      unit_price REAL,
      currency TEXT DEFAULT 'TRY',
      lead_time_days INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(quotation_id, supplier_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT UNIQUE NOT NULL REFERENCES products(id),
      quantity REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      type TEXT NOT NULL CHECK (type IN ('in','out','adjustment')),
      quantity REAL NOT NULL,
      reference TEXT,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('supplier','product','po','quotation')),
      entity_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mimetype TEXT,
      size INTEGER,
      uploaded_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outlook_connections (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outlook_oauth_states (
      state TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outlook_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      sender TEXT,
      received_at TEXT,
      web_link TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
      completed_at TEXT,
      last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, message_id)
    );

    CREATE TABLE IF NOT EXISTS department_requests (
      id TEXT PRIMARY KEY,
      request_number TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      department TEXT NOT NULL,
      item_type TEXT NOT NULL CHECK (item_type IN ('stoklu','stok-disi')),
      product_id TEXT REFERENCES products(id),
      product_code TEXT,
      product_name TEXT,
      non_stock_item_name TEXT,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'adet',
      project_id TEXT REFERENCES projects(id),
      project_code TEXT,
      project_name TEXT,
      usage_location TEXT,
      details TEXT,
      procurement_email TEXT,
      status TEXT NOT NULL DEFAULT 'waiting_manager' CHECK (status IN ('draft','waiting_manager','waiting_gm','approved','rejected')),
      manager_approved_by TEXT REFERENCES users(id),
      manager_approved_at TEXT,
      gm_approved_by TEXT REFERENCES users(id),
      gm_approved_at TEXT,
      procurement_notified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Varsayılan admin kullanıcı oluştur (eğer yoksa)
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  const existing = database.prepare('SELECT id FROM users WHERE email = ?').get('admin@satinalma.com');
  if (!existing) {
    const hash = bcrypt.hashSync('admin123', 10);
    database.prepare(
      'INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), 'Admin', 'admin@satinalma.com', hash, 'admin');
    console.log('Varsayılan admin oluşturuldu: admin@satinalma.com / admin123');
  }

  // Sonradan eklenen sütunlar (idempotent)
  try { database.exec('ALTER TABLE suppliers ADD COLUMN external_code TEXT'); } catch(e) {}
  try { database.exec('ALTER TABLE users ADD COLUMN allowed_pages TEXT DEFAULT NULL'); } catch(e) {}
  try { database.exec('ALTER TABLE suppliers ADD COLUMN rating INTEGER DEFAULT NULL'); } catch(e) {}
  try { database.exec('ALTER TABLE po_items ADD COLUMN received_quantity REAL DEFAULT 0'); } catch(e) {}
  try { database.exec('ALTER TABLE po_items ADD COLUMN received_date TEXT'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offers ADD COLUMN color TEXT'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offers ADD COLUMN customer_note TEXT'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offers ADD COLUMN purchase_note TEXT'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offer_items ADD COLUMN actual_unit_price REAL DEFAULT 0'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offer_items ADD COLUMN actual_total_price REAL DEFAULT 0'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offer_items ADD COLUMN actual_approved INTEGER DEFAULT 0'); } catch(e) {}
  try { database.exec('ALTER TABLE project_offer_items ADD COLUMN actual_note TEXT'); } catch(e) {}

  // Eski durum normalize: artik cancelled kullanilmiyor, pending'e cek
  try { database.exec("UPDATE project_offers SET status = 'pending' WHERE status = 'cancelled'"); } catch(e) {}

  // Canlı depo stok tablosu (Excel'den senkronize)
  database.exec(`
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stok_kodu TEXT NOT NULL,
      stok_adi TEXT NOT NULL,
      gebze_stok REAL NOT NULL DEFAULT 0,
      eticaret_stok REAL NOT NULL DEFAULT 0,
      showroom_stok REAL NOT NULL DEFAULT 0,
      birim_fiyat REAL NOT NULL DEFAULT 0,
      gebze_tutar REAL NOT NULL DEFAULT 0,
      eticaret_tutar REAL NOT NULL DEFAULT 0,
      showroom_tutar REAL NOT NULL DEFAULT 0,
      kart_tipi TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS warehouse_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      message TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS damage_reports (
      id TEXT PRIMARY KEY,
      report_date TEXT NOT NULL,
      product_code TEXT,
      product_name TEXT,
      problem TEXT,
      quantity REAL DEFAULT 0,
      problem_source TEXT,
      reported_by TEXT,
      approved_by TEXT,
      resolution TEXT,
      purchase_action TEXT,
      total_cost REAL DEFAULT 0,
      source_file TEXT,
      row_hash TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_offers (
      id TEXT PRIMARY KEY,
      project_name TEXT,
      institution TEXT,
      sheet_name TEXT,
      offer_type TEXT,
      country TEXT,
      superstructure TEXT,
      vehicle TEXT,
      color TEXT,
      quantity REAL DEFAULT 0,
      created_date TEXT,
      offer_due_date TEXT,
      usd_rate REAL,
      eur_rate REAL,
      quoted_tl REAL DEFAULT 0,
      quoted_eur REAL DEFAULT 0,
      quoted_usd REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','won','lost','cancelled','pending')),
      pre_cost_tl REAL DEFAULT 0,
      realized_cost_tl REAL DEFAULT 0,
      realized_revenue_tl REAL DEFAULT 0,
      result_note TEXT,
      customer_note TEXT,
      purchase_note TEXT,
      source_file TEXT,
      row_hash TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS project_offer_items (
      id TEXT PRIMARY KEY,
      project_offer_id TEXT NOT NULL REFERENCES project_offers(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      product_name TEXT,
      description TEXT,
      brand TEXT,
      image_ref TEXT,
      product_note TEXT,
      size_info TEXT,
      unit TEXT,
      purchase_note TEXT,
      termin TEXT,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      actual_unit_price REAL DEFAULT 0,
      actual_total_price REAL DEFAULT 0,
      actual_approved INTEGER DEFAULT 0,
      actual_note TEXT,
      row_hash TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // stok_kodu tekil index (varsa atla)
  try { database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouse_stok_kodu ON warehouse_stock(stok_kodu)'); } catch(e) {}

  // Malzeme ihtiyaç cache tablosu
  database.exec(`
    CREATE TABLE IF NOT EXISTS malzeme_ihtiyac_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proje_kodu TEXT,
      karavan_adi TEXT,
      alt_kod_tur TEXT,
      alt_kod TEXT,
      alt_adi TEXT,
      miktar REAL DEFAULT 0,
      birim TEXT,
      projelere_cikislar REAL DEFAULT 0,
      elde_kalan REAL DEFAULT 0,
      uretim_depo REAL DEFAULT 0,
      acik_satinalma_siparisleri REAL DEFAULT 0,
      satinalma REAL DEFAULT 0,
      birim_fiyatlar REAL DEFAULT 0,
      son_satinalma_cari TEXT,
      tutar REAL DEFAULT 0,
      alt_stok_grup_kodu TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS malzeme_ihtiyac_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      row_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      message TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Ciro cache tabloları
  database.exec(`
    CREATE TABLE IF NOT EXISTS ciro_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firma TEXT NOT NULL,
      yil INTEGER,
      ay INTEGER,
      tarih TEXT,
      fatura_no TEXT,
      stok_kodu TEXT,
      cari_adi TEXT,
      stok_adi TEXT,
      miktar REAL DEFAULT 0,
      fiyat REAL DEFAULT 0,
      kdv REAL DEFAULT 0,
      tutar REAL DEFAULT 0,
      tutar_usd REAL DEFAULT 0,
      tutar_eur REAL DEFAULT 0,
      tur TEXT,
      fis_turu TEXT,
      is_emri_no TEXT,
      is_emri_adi TEXT,
      islem_dovizi TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finance_ekstre_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      definition_ TEXT,
      sign INTEGER DEFAULT 0,
      borc REAL DEFAULT 0,
      alacak REAL DEFAULT 0,
      indate TEXT,
      duedate TEXT,
      vadesuresi INTEGER DEFAULT 0,
      islem_dovizi TEXT,
      islem_doviz_tutari REAL DEFAULT 0,
      typ TEXT,
      fis_no TEXT,
      belge_no TEXT,
      satir_aciklamasi TEXT,
      cari_tur TEXT,
      logicalref INTEGER,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Tiger3 satınalma geçmişi ve fiyat analizi cache tabloları
  database.exec(`
    CREATE TABLE IF NOT EXISTS tiger_purchase_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tarih TEXT,
      fis_no TEXT,
      malzeme_kodu TEXT,
      malzeme_adi TEXT,
      tedarikci TEXT,
      miktar REAL DEFAULT 0,
      bekleyen REAL DEFAULT 0,
      iade INTEGER DEFAULT 0,
      birim_fiyat REAL DEFAULT 0,
      net_tutar REAL DEFAULT 0,
      fatura_tutar REAL DEFAULT 0,
      para_birimi TEXT DEFAULT 'TRY',
      firma TEXT DEFAULT 'LG_123',
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tiger_price_analysis (
      malzeme_kodu TEXT PRIMARY KEY,
      malzeme_adi TEXT,
      stok_grup TEXT,
      toplam_miktar REAL DEFAULT 0,
      adet INTEGER DEFAULT 0,
      ilk_tarih TEXT,
      ilk_fiyat REAL,
      son_tarih TEXT,
      son_fiyat REAL,
      ort_fiyat REAL,
      q4_ort REAL,
      recent_ort REAL,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tiger_reports_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      message TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  try { database.exec('CREATE INDEX IF NOT EXISTS idx_tph_tarih ON tiger_purchase_history(tarih)'); } catch(e) {}
  try { database.exec('CREATE INDEX IF NOT EXISTS idx_tph_kod ON tiger_purchase_history(malzeme_kodu)'); } catch(e) {}

  // EVIRA depo stok cache tabloları
  database.exec(`
    CREATE TABLE IF NOT EXISTS evira_stock_cache (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ambar_kodu TEXT,
      ambar_adi  TEXT,
      stok_kodu  TEXT,
      stok_adi   TEXT,
      birim      TEXT,
      miktar     REAL DEFAULT 0,
      synced_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS evira_sync_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      row_count INTEGER NOT NULL DEFAULT 0,
      status    TEXT NOT NULL DEFAULT 'success',
      message   TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  try { database.exec('CREATE INDEX IF NOT EXISTS idx_esc_stok ON evira_stock_cache(stok_kodu)'); } catch(e) {}
  try { database.exec('CREATE INDEX IF NOT EXISTS idx_esc_ambar ON evira_stock_cache(ambar_kodu)'); } catch(e) {}

  // TIGER3 bağlantı ve zamanlayıcı ayarları
  database.exec(`
    CREATE TABLE IF NOT EXISTS db_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Varsayılan TIGER3 bağlantı ayarlarını ekle (zaten varsa atla)
  const defaultSettings = [
    ['tiger3_server',   '10.10.10.241'],
    ['tiger3_database', 'TIGER3'],
    ['tiger3_user',     'webservices'],
    ['tiger3_password', 'Aa123456'],
    ['tiger3_port',     '1433'],
    ['evira_server',   '10.10.10.241'],
    ['evira_database', 'EVIRA'],
    ['evira_user',     'webservices'],
    ['evira_password', 'Aa123456'],
    ['evira_port',     '1433'],
    ['auto_refresh_enabled',  '0'],
    ['auto_refresh_interval', '60'],
    ['last_refresh_at',     ''],
    ['last_refresh_status', ''],
  ];
  const upsertSetting = database.prepare(
    'INSERT OR IGNORE INTO db_settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of defaultSettings) {
    upsertSetting.run(key, value);
  }

  // allowed_pages sütununu users tablosuna ekle (varsa atla)
  try { database.exec('ALTER TABLE users ADD COLUMN allowed_pages TEXT'); } catch(e) {}
  // external_code sütununu suppliers tablosuna ekle (varsa atla)
  try { database.exec('ALTER TABLE suppliers ADD COLUMN external_code TEXT'); } catch(e) {}
  // rating sütununu suppliers tablosuna ekle (varsa atla)
  try { database.exec('ALTER TABLE suppliers ADD COLUMN rating INTEGER DEFAULT 0'); } catch(e) {}

  console.log('Veritabanı başlatıldı.');
}

function calculatePoStatus(db, poId) {
  // po_items'e göre status hesapla
  // Açık: Hiç ürün gelmemişse
  // Bekleyen: Bazı ürünler gelmişse
  // Kapanan: Tüm ürünler gelmişse
  
  const items = db.prepare(`
    SELECT SUM(quantity) as total_qty, SUM(COALESCE(received_quantity, 0)) as received_qty
    FROM po_items WHERE po_id = ?
  `).get(poId);
  
  if (!items || items.total_qty === 0) return 'draft';
  
  if (items.received_qty === 0) return 'açık';
  if (items.received_qty < items.total_qty) return 'bekleyen';
  return 'kapanan';
}

module.exports = { getDb, initDb, calculatePoStatus };
