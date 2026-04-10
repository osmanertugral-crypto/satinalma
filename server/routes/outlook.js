const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE = 'https://login.microsoftonline.com';
const STATE_TTL_MINUTES = 15;

function getOAuthConfig() {
  return {
    tenantId: process.env.OUTLOOK_TENANT_ID || 'common',
    clientId: process.env.OUTLOOK_CLIENT_ID,
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
    redirectUri: process.env.OUTLOOK_REDIRECT_URI,
    successRedirect: process.env.OUTLOOK_REDIRECT_SUCCESS_URL || 'http://localhost:5173/outlook-tasks?connected=1',
    failRedirect: process.env.OUTLOOK_REDIRECT_FAIL_URL || 'http://localhost:5173/outlook-tasks?connected=0',
  };
}

function assertOAuthConfig() {
  const cfg = getOAuthConfig();
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    const err = new Error('Outlook OAuth ayarları eksik. OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_REDIRECT_URI gerekli.');
    err.statusCode = 500;
    throw err;
  }
  return cfg;
}

async function graphGet(accessToken, pathAndQuery) {
  const response = await fetch(`${GRAPH_BASE}${pathAndQuery}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Graph API çağrısı başarısız oldu');
    error.statusCode = response.status;
    error.graphError = data;
    throw error;
  }

  return data;
}

async function refreshAccessToken(row) {
  const cfg = assertOAuthConfig();
  const tokenEndpoint = `${AUTH_BASE}/${cfg.tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
    redirect_uri: cfg.redirectUri,
    scope: 'offline_access Mail.Read User.Read',
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error_description || data?.error || 'Token yenileme başarısız');
    error.statusCode = response.status;
    throw error;
  }

  const expiresIn = Number(data.expires_in || 3600);
  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

  const db = getDb();
  db.prepare(`
    UPDATE outlook_connections
    SET access_token = ?, refresh_token = ?, expires_at = ?, updated_at = datetime('now')
    WHERE user_id = ?
  `).run(data.access_token, data.refresh_token || row.refresh_token, expiresAt, row.user_id);

  return data.access_token;
}

async function getValidAccessToken(userId) {
  const db = getDb();
  const conn = db.prepare('SELECT * FROM outlook_connections WHERE user_id = ?').get(userId);
  if (!conn) {
    const err = new Error('Outlook hesabı bağlı değil');
    err.statusCode = 404;
    throw err;
  }

  if (conn.access_token && conn.expires_at && new Date(conn.expires_at) > new Date()) {
    return conn.access_token;
  }

  return refreshAccessToken(conn);
}

router.use(authenticate);

// GET /api/outlook/status
router.get('/status', (req, res) => {
  const db = getDb();
  const conn = db.prepare('SELECT user_id, updated_at FROM outlook_connections WHERE user_id = ?').get(req.user.id);
  res.json({ connected: !!conn, updated_at: conn?.updated_at || null });
});

// GET /api/outlook/connect-url
router.get('/connect-url', (req, res, next) => {
  try {
    const cfg = assertOAuthConfig();
    const state = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + STATE_TTL_MINUTES * 60 * 1000).toISOString();

    const db = getDb();
    db.prepare('INSERT INTO outlook_oauth_states (state, user_id, expires_at) VALUES (?, ?, ?)').run(state, req.user.id, expiresAt);

    const params = new URLSearchParams({
      client_id: cfg.clientId,
      response_type: 'code',
      redirect_uri: cfg.redirectUri,
      response_mode: 'query',
      scope: 'offline_access Mail.Read User.Read',
      state,
      prompt: 'select_account',
    });

    const authUrl = `${AUTH_BASE}/${cfg.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  } catch (err) {
    next(err);
  }
});

// GET /api/outlook/callback
router.get('/callback', async (req, res) => {
  const cfg = getOAuthConfig();
  const { code, state, error, error_description } = req.query;

  if (error) {
    const reason = encodeURIComponent(error_description || String(error));
    return res.redirect(`${cfg.failRedirect}&reason=${reason}`);
  }

  if (!code || !state) {
    return res.redirect(`${cfg.failRedirect}&reason=Eksik%20code%20veya%20state`);
  }

  const db = getDb();
  const stateRow = db.prepare('SELECT * FROM outlook_oauth_states WHERE state = ?').get(String(state));

  if (!stateRow || new Date(stateRow.expires_at) < new Date()) {
    db.prepare('DELETE FROM outlook_oauth_states WHERE state = ?').run(String(state));
    return res.redirect(`${cfg.failRedirect}&reason=State%20gecersiz%20veya%20suresi%20dolmus`);
  }

  try {
    const requiredCfg = assertOAuthConfig();
    const tokenEndpoint = `${AUTH_BASE}/${requiredCfg.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: requiredCfg.clientId,
      client_secret: requiredCfg.clientSecret,
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: requiredCfg.redirectUri,
      scope: 'offline_access Mail.Read User.Read',
    });

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      const reason = encodeURIComponent(tokenData?.error_description || tokenData?.error || 'Token alma başarısız');
      db.prepare('DELETE FROM outlook_oauth_states WHERE state = ?').run(String(state));
      return res.redirect(`${cfg.failRedirect}&reason=${reason}`);
    }

    const expiresIn = Number(tokenData.expires_in || 3600);
    const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

    db.prepare(`
      INSERT INTO outlook_connections (user_id, access_token, refresh_token, expires_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        updated_at = datetime('now')
    `).run(stateRow.user_id, tokenData.access_token, tokenData.refresh_token, expiresAt);

    db.prepare('DELETE FROM outlook_oauth_states WHERE state = ?').run(String(state));

    return res.redirect(cfg.successRedirect);
  } catch (e) {
    const reason = encodeURIComponent(e.message || 'Beklenmeyen hata');
    db.prepare('DELETE FROM outlook_oauth_states WHERE state = ?').run(String(state));
    return res.redirect(`${cfg.failRedirect}&reason=${reason}`);
  }
});

// POST /api/outlook/sync
router.post('/sync', async (req, res, next) => {
  try {
    const accessToken = await getValidAccessToken(req.user.id);

    const messages = await graphGet(
      accessToken,
      "/me/messages?$top=100&$filter=flag/flagStatus eq 'flagged'&$orderby=receivedDateTime desc&$select=id,subject,receivedDateTime,webLink,from"
    );

    const db = getDb();
    const nowIso = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO outlook_tasks (id, user_id, message_id, subject, sender, received_at, web_link, status, completed_at, last_synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, datetime('now'))
      ON CONFLICT(user_id, message_id) DO UPDATE SET
        subject = excluded.subject,
        sender = excluded.sender,
        received_at = excluded.received_at,
        web_link = excluded.web_link,
        last_synced_at = datetime('now')
    `);

    const tx = db.transaction((items) => {
      for (const m of items) {
        const sender = m?.from?.emailAddress?.name || m?.from?.emailAddress?.address || null;
        upsert.run(
          uuidv4(),
          req.user.id,
          m.id,
          m.subject || '(Konu yok)',
          sender,
          m.receivedDateTime || null,
          m.webLink || null
        );
      }
    });

    tx(messages.value || []);

    res.json({ synced: (messages.value || []).length, synced_at: nowIso });
  } catch (err) {
    next(err);
  }
});

// GET /api/outlook/tasks
router.get('/tasks', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      id,
      message_id,
      subject,
      sender,
      received_at,
      web_link,
      status,
      completed_at,
      last_synced_at,
      CASE
        WHEN status = 'done' AND completed_at IS NOT NULL THEN CAST((julianday(completed_at) - julianday(received_at)) AS INTEGER)
        ELSE CAST((julianday('now') - julianday(received_at)) AS INTEGER)
      END AS waiting_days
    FROM outlook_tasks
    WHERE user_id = ?
    ORDER BY
      CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
      datetime(received_at) DESC
  `).all(req.user.id);

  res.json(rows);
});

// PATCH /api/outlook/tasks/:id
router.patch('/tasks/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'done'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz durum. pending veya done olmalı.' });
  }

  const db = getDb();
  const task = db.prepare('SELECT * FROM outlook_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) {
    return res.status(404).json({ error: 'Görev bulunamadı' });
  }

  if (status === 'done') {
    db.prepare("UPDATE outlook_tasks SET status = 'done', completed_at = datetime('now') WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  } else {
    db.prepare("UPDATE outlook_tasks SET status = 'pending', completed_at = NULL WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  }

  const updated = db.prepare('SELECT * FROM outlook_tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  res.json(updated);
});

module.exports = router;
