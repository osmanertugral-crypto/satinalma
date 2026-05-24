# SVC Takip Modülü — Kurulum Talimatları

## Kopyalanacak Dosyalar

| Dosya | Hedef Konum |
|-------|------------|
| `client/src/pages/SvcTakip.jsx`  | `client/src/pages/SvcTakip.jsx`  |
| `client/src/pages/SvcDetail.jsx` | `client/src/pages/SvcDetail.jsx` |
| `server/routes/svc.js`           | `server/routes/svc.js`           |

---

## 1. server/index.js — Route Ekle

```js
const svcRouter = require('./routes/svc');
app.use('/api/svc', svcRouter);
```

---

## 2. client/src/App.jsx — Import ve Route Ekle

```jsx
import SvcTakipPage  from './pages/SvcTakip';
import SvcDetailPage from './pages/SvcDetail';

// Routes içine:
<Route path="svc-takip"      element={<SvcTakipPage />} />
<Route path="svc-takip/:id"  element={<SvcDetailPage />} />
```

---

## 3. client/src/components/Layout.jsx — Menü Kalemi

```jsx
{ to: '/svc-takip', icon: TrendingUp, label: 'SVC Takip', key: 'svc-takip' },
```

---

## 4. client/src/api/index.js — API Fonksiyonları

`client/src/api/index.js` dosyasına aşağıdaki bölümü ekle:

```js
// SVC Takip
export const getSvcProjects        = (params)           => api.get('/svc', { params });
export const createSvcProject      = (data)             => api.post('/svc', data);
export const getSvcProject         = (id)               => api.get(`/svc/${id}`);
export const updateSvcProject      = (id, data)         => api.patch(`/svc/${id}`, data);
export const changeSvcStatus       = (id, data)         => api.patch(`/svc/${id}/status`, data);
export const deleteSvcProject      = (id)               => api.delete(`/svc/${id}`);
export const createSvcItem         = (id, data)         => api.post(`/svc/${id}/items`, data);
export const updateSvcItem         = (id, itemId, data) => api.patch(`/svc/${id}/items/${itemId}`, data);
export const deleteSvcItem         = (id, itemId)       => api.delete(`/svc/${id}/items/${itemId}`);
export const uploadSvcFile         = (id, formData)     => api.post(`/svc/${id}/files`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteSvcFile         = (id, fileId)       => api.delete(`/svc/${id}/files/${fileId}`);
export const getSvcFileDownloadUrl = (id, fileId)       => `/api/svc/${id}/files/${fileId}/download`;
export const getSvcLogs            = (id)               => api.get(`/svc/${id}/logs`);
export const applySvcMargin        = (id, data)         => api.patch(`/svc/${id}/margin`, data);
export const getSvcMetaUsers       = ()                 => api.get('/svc/meta/users');
export const updateUserSvcRole     = (id, svcRole)      => api.patch(`/users/${id}`, { svc_role: svcRole });
export const importSvcFromExcel    = (formData)         => api.post('/svc/import', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
export const getSvcCoverUrl        = (id)               => `/api/svc/${id}/cover`;
export const getSvcTeklifPdfUrl    = (id)               => `/api/svc/${id}/teklif-pdf`;
export const downloadSvcTeklifPdf  = (id)               => api.get(`/svc/${id}/teklif-pdf`, { responseType: 'blob' });
```

---

## 5. server/db/schema.js — Tablo ve Migration Ekle

`initDb()` fonksiyonu içine, diğer CREATE TABLE'lardan sonra ekle:

```js
// SVC Takip tabloları
try { database.exec("ALTER TABLE users ADD COLUMN svc_role TEXT DEFAULT 'none'"); } catch(e) {}

database.exec(`
  CREATE TABLE IF NOT EXISTS svc_projects (
    id TEXT PRIMARY KEY,
    project_name TEXT NOT NULL DEFAULT '',
    institution TEXT DEFAULT '',
    description TEXT DEFAULT '',
    vehicle TEXT DEFAULT '',
    superstructure TEXT DEFAULT '',
    country TEXT DEFAULT '',
    quantity INTEGER DEFAULT 1,
    consultant_name TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    offer_due_date TEXT,
    offer_sent_date TEXT,
    cost_total_tl REAL DEFAULT 0,
    sale_price_tl REAL DEFAULT 0,
    offer_price_tl REAL DEFAULT 0,
    margin_rate REAL DEFAULT 0,
    realized_revenue_tl REAL DEFAULT 0,
    notes_purchase TEXT DEFAULT '',
    notes_consultant TEXT DEFAULT '',
    notes_management TEXT DEFAULT '',
    result_note TEXT DEFAULT '',
    cover_image TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS svc_project_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES svc_projects(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    category TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    description TEXT DEFAULT '',
    brand TEXT DEFAULT '',
    size_info TEXT DEFAULT '',
    unit TEXT DEFAULT 'adet',
    quantity REAL DEFAULT 1,
    tech_spec TEXT DEFAULT '',
    purchase_note TEXT DEFAULT '',
    termin TEXT DEFAULT '',
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    actual_unit_price REAL DEFAULT 0,
    actual_total_price REAL DEFAULT 0,
    actual_approved INTEGER DEFAULT 0,
    actual_note TEXT DEFAULT '',
    include_in_offer INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS svc_project_files (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES svc_projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_type TEXT DEFAULT 'other',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS svc_project_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES svc_projects(id) ON DELETE CASCADE,
    user_id INTEGER,
    user_name TEXT DEFAULT '',
    action TEXT DEFAULT '',
    old_status TEXT DEFAULT '',
    new_status TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
```

---

## 6. npm Bağımlılıkları

`server/` klasöründe şunların kurulu olması gerekiyor:

```bash
npm install pdfkit jszip uuid multer xlsx
```

---

## Rol Sistemi

| svc_role     | Açıklama                        |
|--------------|---------------------------------|
| `none`       | Erişim yok                      |
| `consultant` | Danışman — fiyat göremez        |
| `purchasing` | Satın alma — maliyet görebilir  |
| `manager`    | Yönetici — teklif verebilir     |
| `management` | Üst yönetim — her şeyi görebilir|

Admin kullanıcılar otomatik tam yetkiye sahiptir.
