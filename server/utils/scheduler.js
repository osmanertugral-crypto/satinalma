const cron = require('node-cron');
const { getDb } = require('../db/schema');

let task = null;
let running = false;

function getSetting(key) {
  try {
    const db = getDb();
    const row = db.prepare('SELECT value FROM db_settings WHERE key = ?').get(key);
    return row ? row.value : null;
  } catch (_) {
    return null;
  }
}

function setSetting(key, value) {
  try {
    const db = getDb();
    db.prepare(
      'INSERT OR REPLACE INTO db_settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))'
    ).run(key, value);
  } catch (_) {}
}

async function syncReports() {
  try {
    const { syncPurchaseHistory, syncPriceAnalysis } = require('../routes/reports');
    await syncPurchaseHistory();
    console.log('[Scheduler] Satınalma geçmişi güncellendi');
    await syncPriceAnalysis();
    console.log('[Scheduler] Fiyat analizi güncellendi');
  } catch (err) {
    console.error('[Scheduler] Rapor sync hatası:', err.message);
    throw err;
  }
}

async function syncSuppliers() {
  try {
    const { syncSuppliersFromTIGER3 } = require('../routes/suppliers');
    await syncSuppliersFromTIGER3();
    console.log('[Scheduler] Tedarikçiler güncellendi');
  } catch (err) {
    console.error('[Scheduler] Tedarikçi sync hatası:', err.message);
    throw err;
  }
}

async function syncPurchaseOrders() {
  try {
    const { syncPurchaseOrdersFromTIGER3 } = require('../routes/po');
    await syncPurchaseOrdersFromTIGER3();
    console.log('[Scheduler] Siparişler güncellendi');
  } catch (err) {
    console.error('[Scheduler] Sipariş sync hatası:', err.message);
    throw err;
  }
}

async function syncWarehouse() {
  try {
    const { syncFromTIGER3 } = require('../routes/warehouse');
    await syncFromTIGER3();
    console.log('[Scheduler] Depo stok güncellendi');
  } catch (err) {
    console.error('[Scheduler] Depo sync hatası:', err.message);
    throw err;
  }
}

async function syncMalzemeIhtiyac() {
  try {
    const { syncFromTIGER3 } = require('../routes/malzeme-ihtiyac');
    await syncFromTIGER3();
    console.log('[Scheduler] Malzeme ihtiyaç güncellendi');
  } catch (err) {
    console.error('[Scheduler] Malzeme ihtiyaç sync hatası:', err.message);
    throw err;
  }
}

async function syncCiro() {
  try {
    const { syncFromTIGER3 } = require('../routes/ciro');
    if (syncFromTIGER3) await syncFromTIGER3();
    console.log('[Scheduler] Ciro raporu güncellendi');
  } catch (err) {
    console.error('[Scheduler] Ciro sync hatası:', err.message);
    // Hata olsa bile devam et
  }
}

async function syncFinance() {
  try {
    const { syncFromTIGER3 } = require('../routes/finance');
    if (syncFromTIGER3) await syncFromTIGER3();
    console.log('[Scheduler] Finans güncellendi');
  } catch (err) {
    console.error('[Scheduler] Finans sync hatası:', err.message);
  }
}

async function syncProducts() {
  try {
    const { syncProductsFromTIGER3 } = require('../routes/products');
    const result = await syncProductsFromTIGER3();
    console.log(`[Scheduler] Ürünler güncellendi: ${result.total} ürün`);
  } catch (err) {
    console.error('[Scheduler] Ürün sync hatası:', err.message);
    throw err;
  }
}

async function syncEvira() {
  try {
    const evira = require('../utils/evira');
    const { getDb } = require('../db/schema');
    const db = getDb();
    const rows = await evira.query(`
      SELECT AMBAR_KODU, AMBAR_ADI, STOK_KODU, STOK_ADI, BIRIM, MIKTAR
      FROM dbo.DEPO_STOK_RAPORU_TUM_DEPOLAR
      WHERE MIKTAR > 0
    `);
    const insert = db.prepare(`
      INSERT INTO evira_stock_cache (ambar_kodu, ambar_adi, stok_kodu, stok_adi, birim, miktar)
      VALUES (@AMBAR_KODU, @AMBAR_ADI, @STOK_KODU, @STOK_ADI, @BIRIM, @MIKTAR)
    `);
    db.prepare('DELETE FROM evira_stock_cache').run();
    db.transaction(rs => { for (const r of rs) insert.run(r); })(rows);
    db.prepare(`INSERT INTO evira_sync_log (row_count, status, message) VALUES (?, 'success', ?)`).run(rows.length, `${rows.length} satır güncellendi`);
    console.log(`[Scheduler] EVIRA envanter güncellendi: ${rows.length} satır`);
  } catch (err) {
    console.error('[Scheduler] EVIRA sync hatası:', err.message);
    throw err;
  }
}

async function syncAll() {
  if (running) {
    console.log('[Scheduler] Güncelleme zaten çalışıyor, atlandı');
    return;
  }
  running = true;
  const startTime = new Date().toISOString();
  console.log('[Scheduler] Tüm veriler güncelleniyor...', startTime);

  const errors = [];
  try {
    await syncProducts();
  } catch (e) { errors.push('Ürünler: ' + e.message); }

  try {
    await syncSuppliers();
  } catch (e) { errors.push('Tedarikçiler: ' + e.message); }

  try {
    await syncReports();
  } catch (e) { errors.push('Raporlar: ' + e.message); }

  try {
    await syncPurchaseOrders();
  } catch (e) { errors.push('Siparişler: ' + e.message); }

  try {
    await syncWarehouse();
  } catch (e) { errors.push('Depo: ' + e.message); }

  try {
    await syncMalzemeIhtiyac();
  } catch (e) { errors.push('Malzeme İhtiyaç: ' + e.message); }

  try {
    await syncCiro();
  } catch (e) { errors.push('Ciro: ' + e.message); }

  try {
    await syncFinance();
  } catch (e) { errors.push('Finans: ' + e.message); }

  try {
    await syncEvira();
  } catch (e) { errors.push('EVIRA: ' + e.message); }

  const status = errors.length === 0
    ? 'Başarılı'
    : 'Kısmi hata: ' + errors.join(', ');

  setSetting('last_refresh_at', new Date().toISOString());
  setSetting('last_refresh_status', status);
  running = false;
  console.log('[Scheduler] Güncelleme tamamlandı:', status);
}

function buildCronExpression(intervalMinutes) {
  const mins = parseInt(intervalMinutes, 10) || 60;
  if (mins < 60) return `*/${mins} * * * *`;
  const hours = Math.floor(mins / 60);
  return `0 */${hours} * * *`;
}

function start() {
  const enabled  = getSetting('auto_refresh_enabled');
  const interval = getSetting('auto_refresh_interval') || '60';

  if (task) {
    task.stop();
    task = null;
  }

  if (enabled !== '1') {
    console.log('[Scheduler] Otomatik güncelleme devre dışı');
    return;
  }

  const expr = buildCronExpression(interval);
  console.log(`[Scheduler] Başlatıldı: her ${interval} dakikada bir (${expr})`);

  task = cron.schedule(expr, () => {
    syncAll().catch(err => console.error('[Scheduler] Hata:', err));
  });
}

function stop() {
  if (task) {
    task.stop();
    task = null;
    console.log('[Scheduler] Durduruldu');
  }
}

function restart() {
  stop();
  start();
}

function isRunning() {
  return running;
}

module.exports = { start, stop, restart, syncAll, isRunning };
