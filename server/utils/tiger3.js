const sql = require('mssql');

let pool = null;
let poolConfig = null;

function getSettings() {
  try {
    const { getDb } = require('../db/schema');
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM db_settings').all();
    const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
    return {
      server:   s.tiger3_server   || '10.10.10.241',
      database: s.tiger3_database || 'TIGER3',
      user:     s.tiger3_user     || 'webservices',
      password: s.tiger3_password || 'Aa123456',
      port:     parseInt(s.tiger3_port || '1433', 10),
    };
  } catch (e) {
    return {
      server: '10.10.10.241', database: 'TIGER3',
      user: 'webservices', password: 'Aa123456', port: 1433,
    };
  }
}

function buildConfig(settings) {
  return {
    server:   settings.server,
    database: settings.database,
    user:     settings.user,
    password: settings.password,
    port:     settings.port || 1433,
    options: {
      encrypt:                false,
      trustServerCertificate: true,
      enableArithAbort:       true,
    },
    connectionTimeout: 15000,
    requestTimeout:    60000,
    pool: {
      max: 5, min: 0, idleTimeoutMillis: 30000,
    },
  };
}

async function getPool() {
  const settings = getSettings();
  const configStr = JSON.stringify(settings);

  // Ayarlar değiştiyse mevcut havuzu kapat
  if (pool && poolConfig !== configStr) {
    try { await pool.close(); } catch (_) {}
    pool = null;
  }

  if (pool && !pool.connected) {
    pool = null;
  }
  if (!pool) {
    pool = await new sql.ConnectionPool(buildConfig(settings)).connect();
    poolConfig = configStr;
  }
  return pool;
}

async function query(sqlText, params = {}) {
  try {
    const p = await getPool();
    const request = p.request();
    for (const [name, { type, value }] of Object.entries(params)) {
      request.input(name, type, value);
    }
    const result = await request.query(sqlText);
    return result.recordset;
  } catch (err) {
    resetPool();
    throw err;
  }
}

async function testConnection(customSettings = null) {
  const settings = customSettings || getSettings();
  let testPool = null;
  try {
    testPool = await new sql.ConnectionPool(buildConfig(settings)).connect();
    await testPool.request().query('SELECT 1 AS ok');
    return { success: true, message: 'Bağlantı başarılı' };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    if (testPool) {
      try { await testPool.close(); } catch (_) {}
    }
  }
}

async function closePool() {
  if (pool) {
    try { await pool.close(); } catch (_) {}
    pool = null;
    poolConfig = null;
  }
}

// Ayarlar değiştiğinde havuzu sıfırla
function resetPool() {
  pool = null;
  poolConfig = null;
}

module.exports = { getPool, query, testConnection, closePool, resetPool, sql };
