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
      server:   s.evira_server   || '10.10.10.241',
      database: s.evira_database || 'EVIRA',
      user:     s.evira_user     || 'webservices',
      password: s.evira_password || 'Aa123456',
      port:     parseInt(s.evira_port || '1433', 10),
    };
  } catch (e) {
    return {
      server: '10.10.10.241', database: 'EVIRA',
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
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
  };
}

async function getPool() {
  const settings = getSettings();
  const configStr = JSON.stringify(settings);
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
    return { success: true, message: 'EVIRA bağlantısı başarılı' };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    if (testPool) { try { await testPool.close(); } catch (_) {} }
  }
}

function resetPool() {
  pool = null;
  poolConfig = null;
}

module.exports = { query, testConnection, resetPool, sql };
