# Satınalma Yönetim Sistemi — Teknik Devir Dokümanı

> **Hazırlanma tarihi:** Mayıs 2026  
> **Durum:** Aktif geliştirme aşamasında, iç kullanım

---

## İçindekiler

1. [Proje Özeti](#1-proje-özeti)
2. [Teknoloji Yığını](#2-teknoloji-yığını)
3. [Dizin Yapısı](#3-dizin-yapısı)
4. [Kurulum ve Ayağa Kaldırma](#4-kurulum-ve-ayağa-kaldırma)
5. [Ortam Değişkenleri (.env)](#5-ortam-değişkenleri-env)
6. [Veritabanı Mimarisi](#6-veritabanı-mimarisi)
7. [Sunucu (Express API)](#7-sunucu-express-api)
8. [İstemci (React)](#8-i̇stemci-react)
9. [Dış Sistem Entegrasyonları](#9-dış-sistem-entegrasyonları)
10. [Zamanlayıcı (Scheduler)](#10-zamanlayıcı-scheduler)
11. [Kimlik Doğrulama ve Yetkilendirme](#11-kimlik-doğrulama-ve-yetkilendirme)
12. [Yeni Özellik Ekleme — Standart Akış](#12-yeni-özellik-ekleme--standart-akış)
13. [Veritabanı Migration Eklemek](#13-veritabanı-migration-eklemek)
14. [Bağımlılıklar (Dependencies)](#14-bağımlılıklar-dependencies)
15. [Bilinen Sorunlar ve Dikkat Noktaları](#15-bilinen-sorunlar-ve-dikkat-noktaları)
16. [Geliştirici Başvurusu — Hızlı Komutlar](#16-geliştirici-başvurusu--hızlı-komutlar)

---

## 1. Proje Özeti

Şirket içi **satın alma süreçlerini** dijitalleştiren tam yığın (full-stack) bir web uygulamasıdır. Ürün/tedarikçi kataloğu, teklif talepleri (RFQ), sipariş yönetimi, depo stok takibi, finans izleme ve departman talep onay iş akışını tek çatı altında toplar.

**Bağlı dış sistemler:**
- **TIGER3** — Şirket ERP'si (MS SQL Server)
- **EVIRA** — Depo yönetim sistemi (MS SQL Server)
- **Microsoft Outlook** — E-posta görev senkronizasyonu (OAuth2 / Graph API)

---

## 2. Teknoloji Yığını

| Katman | Teknoloji | Versiyon |
|--------|-----------|---------|
| Frontend | React | 19.x |
| Routing | React Router | 7.x |
| Server state | TanStack Query | 5.x |
| HTTP client | Axios | 1.14 |
| Stil | TailwindCSS | 4.2 |
| Grafikler | Recharts | 3.8 |
| Form yönetimi | React Hook Form | 7.72 |
| Build aracı | Vite | 8.x |
| Backend | Express.js | 5.x |
| Yerel DB | SQLite (better-sqlite3) | 12.x (sync) |
| Dış DB | MS SQL Server (mssql) | 12.x |
| Auth | JWT (jsonwebtoken) | 9.x |
| Şifreleme | bcryptjs | 3.x |
| Dosya yükleme | multer | 2.x |
| Excel | exceljs + xlsx | 4.x / 0.18 |
| PDF | pdfkit | 0.18 |
| Zamanlayıcı | node-cron | 4.x |
| E-posta | nodemailer | 6.x |
| Çalışma zamanı | Node.js | 18+ |
| Platform | Windows (batch scripts) | — |

---

## 3. Dizin Yapısı

```
Satınalma/
│
├── client/                         # React + Vite frontend (port 5173)
│   ├── public/                     # Statik dosyalar
│   ├── src/
│   │   ├── App.jsx                 # Router + QueryClient + AuthProvider
│   │   ├── main.jsx                # Uygulama giriş noktası
│   │   ├── index.css               # Global stiller
│   │   ├── api/
│   │   │   ├── axios.js            # Axios instance, JWT interceptor, 401 logout
│   │   │   └── index.js            # ~200+ API helper fonksiyonu
│   │   ├── context/
│   │   │   └── AuthContext.jsx     # JWT token + user state (useAuth hook)
│   │   ├── components/
│   │   │   ├── Layout.jsx          # Navbar + Sidebar navigation
│   │   │   ├── UI.jsx              # Button, Input, Card, Modal bileşenleri
│   │   │   └── MultiSelectFilter.jsx
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── pages/                  # 30+ sayfa bileşeni
│   │   └── utils/                  # Yardımcı fonksiyonlar
│   ├── vite.config.js              # /api → localhost:3001 proxy
│   ├── package.json
│   └── index.html
│
├── server/                         # Express.js backend (port 3001)
│   ├── index.js                    # ANA GİRİŞ NOKTASI — uygulama buradan başlar
│   ├── .env                        # Ortam değişkenleri (asla git'e ekleme!)
│   ├── satinalma.db                # SQLite veritabanı dosyası
│   ├── satinalma.db-shm            # WAL shared memory (normal, silme)
│   ├── satinalma.db-wal            # WAL log (normal, silme)
│   ├── db/
│   │   └── schema.js               # Tüm tablo tanımları + otomatik migration
│   ├── middleware/
│   │   └── auth.js                 # authenticate() + authorize() middleware
│   ├── routes/                     # 21 API route modülü (aşağıda listelendi)
│   ├── utils/
│   │   ├── tiger3.js               # TIGER3 MS SQL connection pool
│   │   ├── evira.js                # EVIRA MS SQL connection pool
│   │   ├── scheduler.js            # node-cron otomatik senkronizasyon
│   │   ├── searchUtils.js          # Türkçe karakter normalize arama
│   │   ├── excelPurchaseFallback.js# Tiger3 kesilince Excel'den fallback
│   │   └── excelRefresh.js         # Excel yenileme yardımcı fonksiyonları
│   ├── controllers/                # (opsiyonel yardımcı dosyalar)
│   └── package.json
│
├── schema/                         # TIGER3 ve EVIRA MS SQL şema dokümantasyonu
│   ├── TIGER3/                     # Tablolar, view'lar, prosedürler, trigger'lar
│   └── EVIRA/
│
├── uploads/                        # Yüklenen belgeler (multer hedef dizini)
│
├── Tabloalarım/                    # Excel kaynak dosyaları (manuel sync)
│
├── launch.js                       # DEV LAUNCHER: server + client + tarayıcı
├── setup.bat                       # İLK KURULUM: npm install (server + client)
├── start.bat                       # GELİŞTİRME: launch.js çalıştırır
├── start_prod.bat                  # PRODUCTION: build al + sunucu başlat
└── DEVIR_DOKUMANI.md               # Bu doküman
```

---

## 4. Kurulum ve Ayağa Kaldırma

### Ön Koşullar

| Gereksinim | Min. Sürüm | Kontrol |
|-----------|-----------|--------|
| Node.js | 18.x LTS | `node --version` |
| npm | 9.x | `npm --version` |
| Windows | 10/11 | — |

> **Not:** MS SQL bağlantıları (TIGER3/EVIRA) isteğe bağlıdır. Bağlantı olmadan uygulama SQLite üzerinden çalışmaya devam eder; sadece ERP sync özellikleri pasif olur.

---

### Adım 1 — Kaynak Kodunu Hazırla

```bash
# Zip'ten çıkartıldıysa ya da git clone yapıldıysa:
cd Satınalma
```

---

### Adım 2 — Bağımlılıkları Kur (tek seferlik)

**Otomatik (Windows — önerilen):**
```bat
setup.bat
```

**Manuel:**
```bash
# Server bağımlılıkları
cd server
npm install

# Client bağımlılıkları
cd ../client
npm install

cd ..
```

---

### Adım 3 — Ortam Değişkenlerini Ayarla

`server/.env` dosyasını kontrol et veya oluştur. Detaylar için [Bölüm 5](#5-ortam-değişkenleri-env)'e bak.

```bash
# Dosya zaten varsa kontrol et:
cat server/.env
```

---

### Adım 4A — Geliştirme Ortamı Başlatma

```bat
start.bat
```

Bu script `launch.js`'i çalıştırır. `launch.js` şunları yapar:
1. `server/index.js` başlatır (port 3001)
2. Sunucu hazır olana kadar polling yapar (`/api/auth/me`)
3. `client/` altında `npm run dev` çalıştırır (port 5173)
4. 3.5 saniye sonra tarayıcıyı `http://localhost:5173` adresinde açar

```
[SERVER] Server çalışıyor: http://localhost:3001
[LAUNCHER] Sunucu hazır, client başlatılıyor...
[CLIENT] VITE v8.x  ready in xxx ms
```

> **İlk girişte veritabanı otomatik oluşur.** Varsayılan admin: `admin@satinalma.com / admin123`

---

### Adım 4B — Production Başlatma

```bat
start_prod.bat
```

Bu script sırasıyla:
1. `client/` içinde `npm run build` çalıştırır → `client/dist/` oluşur
2. Express'i `NODE_ENV=production` ile başlatır (port 3001)
3. Express hem API'yi hem `client/dist/`'i servis eder
4. Tarayıcıyı `http://localhost:3001` adresinde açar

Ağdaki diğer makineler erişimi: `http://<SUNUCU_IP>:3001`  
Sunucu IP'sini öğrenmek için: `ipconfig`

---

### Adım 5 — TIGER3 / EVIRA Bağlantısını Ayarla (isteğe bağlı)

1. Tarayıcıda `Admin > Settings` sayfasına git
2. Tiger3 ve EVIRA bağlantı bilgilerini gir
3. "Bağlantıyı Test Et" butonuna bas
4. Başarılıysa Scheduler'ı aktifleştir

---

### Adım 6 — Microsoft Outlook Entegrasyonu (isteğe bağlı)

1. [Azure Portal](https://portal.azure.com)'da bir App Registration oluştur
2. Redirect URI ekle: `http://localhost:3001/api/outlook/callback`
3. Client ID ve Client Secret'ı `server/.env`'e yaz:
   ```env
   OUTLOOK_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   OUTLOOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Uygulamayı yeniden başlat

---

## 5. Ortam Değişkenleri (.env)

Dosya: `server/.env`

```env
# Sunucu
PORT=3001

# JWT Kimlik Doğrulama
JWT_SECRET=satinalma_super_secret_jwt_key_2026   # ⚠️ PRODUCTION'DA MUTLAKA DEĞİŞTİR
JWT_EXPIRES_IN=8h                                 # Token geçerlilik süresi

# Microsoft Outlook OAuth2 (isteğe bağlı)
OUTLOOK_TENANT_ID=common
OUTLOOK_CLIENT_ID=                               # Azure AD App Registration'dan al
OUTLOOK_CLIENT_SECRET=                           # Azure AD App Registration'dan al
OUTLOOK_REDIRECT_URI=http://localhost:3001/api/outlook/callback
OUTLOOK_REDIRECT_SUCCESS_URL=http://localhost:5173/outlook-tasks?connected=1
OUTLOOK_REDIRECT_FAIL_URL=http://localhost:5173/outlook-tasks?connected=0
```

> **Önemli:** Tiger3 ve EVIRA şifreleri `.env`'de değil, `db_settings` SQLite tablosunda saklanır. Bu tabloya Settings sayfasından ya da doğrudan SQLite üzerinden erişilir.

---

## 6. Veritabanı Mimarisi

### 6.1 SQLite (Ana Veritabanı)

**Dosya:** `server/satinalma.db`  
**Kütüphane:** `better-sqlite3` (senkron API — async/await yok)  
**Şema + Migration:** `server/db/schema.js` — `initDb()` fonksiyonu uygulama başladığında otomatik çalışır.

**Aktif PRAGMA ayarları:**
```sql
PRAGMA journal_mode = WAL;    -- Eş zamanlı okuma/yazma
PRAGMA foreign_keys = ON;     -- Referans bütünlüğü aktif
```

**Özel SQLite fonksiyonu:** `norm(text)` — Türkçe karakterleri ASCII'ye dönüştürür (ş→s, ç→c vb.), büyük/küçük harf duyarsız arama sağlar.

#### Tablo Kataloğu

| Tablo | Açıklama | Kritik Alan |
|-------|----------|-------------|
| `users` | Kullanıcı hesapları | `role`: `admin` / `user` / `viewer` |
| `suppliers` | Tedarikçiler | `external_code` → Tiger3 eşleşmesi |
| `products` | Ürün kataloğu | `code` UNIQUE |
| `supplier_products` | Tedarikçi-Ürün N:M | — |
| `price_history` | Fiyat geçmişi | tarih bazlı kayıt |
| `purchase_orders` | Satın alma siparişleri | `po_number` UNIQUE |
| `po_items` | Sipariş satırları | Virtual col: `total_price = qty * unit_price` |
| `quotations` | RFQ — Teklif Talepleri | `rfq_number` UNIQUE |
| `inventory` | Stok seviyeleri | min_stock uyarısı |
| `inventory_transactions` | Stok hareketleri | `type`: `in`/`out`/`adjustment` |
| `documents` | Yüklenen belgeler | path → `uploads/` dizini |
| `outlook_tasks` | Outlook e-posta görevleri | OAuth token saklama |
| `department_requests` | Departman satın alma talepleri | onay iş akışı |
| `request_logs` | Talep durum geçmişi | denetim izi (immutable) |
| `request_tasks` | Satın alma görev atamaları | — |
| `warehouse_stock` | Depo stoku (Gebze/E-ticaret/Showroom) | Excel'den sync |
| `damage_reports` | Hasar/kırık tutanakları | — |
| `project_offers` | Proje teklifleri | çoklu para birimi |
| `project_offer_items` | Teklif satırları | — |
| `malzeme_ihtiyac_cache` | Üretim malzeme ihtiyaç raporu önbelleği | Tiger3'ten |
| `ciro_cache` | Ciro/satış raporu önbelleği | Tiger3'ten |
| `finance_ekstre_cache` | Finans ekstre önbelleği | Tiger3'ten |
| `tiger_purchase_history` | Satın alma geçmişi önbelleği | Tiger3'ten |
| `tiger_price_analysis` | Fiyat analizi önbelleği | Tiger3'ten |
| `evira_stock_cache` | Depo stok önbelleği | EVIRA'dan |
| `db_settings` | Sistem ayarları | Tiger3/EVIRA bağlantısı, scheduler |

#### db_settings Tablosu — Kritik Kayıtlar

```sql
-- Bağlantı bilgileri
tiger3_server, tiger3_database, tiger3_user, tiger3_password, tiger3_port
evira_server,  evira_database,  evira_user,  evira_password,  evira_port

-- Scheduler
auto_refresh_enabled   -- '0' veya '1'
auto_refresh_interval  -- dakika cinsinden (varsayılan: 60)
```

---

### 6.2 MS SQL Server — TIGER3

**Amaç:** Şirket ERP sistemi — ürün, tedarikçi, sipariş, satın alma geçmişi  
**Dosya:** `server/utils/tiger3.js`

```
Server:   10.10.10.241  (varsayılan — db_settings'den override edilir)
DB:       TIGER3
User:     webservices
Port:     1433
Encrypt:  false (iç ağ, self-signed sertifika)
Pool:     max 5 bağlantı, 30s idle timeout
```

**Bağlantı yönetimi:**
- `getPool()` — mevcut pool'u döndürür ya da yeni oluşturur
- `query(sqlText, params)` — parametreli sorgu çalıştırır
- `testConnection(customSettings?)` — bağlantı testi, `{ success, message }` döner
- `resetPool()` — ayarlar değiştiğinde pool'u sıfırlar

**Kritik davranış:** Ayarlar her sorguda `db_settings` tablosundan okunur. Bağlantı başarısız olursa pool sıfırlanır ve sonraki istekte yeniden bağlanmaya çalışılır.

---

### 6.3 MS SQL Server — EVIRA

**Amaç:** Depo yönetim sistemi — gerçek zamanlı envanter  
**Dosya:** `server/utils/evira.js`  
**Bağlantı:** TIGER3 ile aynı sunucu (`10.10.10.241`), farklı database (`EVIRA`)  
**API:** `tiger3.js` ile birebir aynı yapı (`getPool`, `query`, `testConnection`, `resetPool`)

---

## 7. Sunucu (Express API)

**Giriş noktası:** `server/index.js`  
**Framework:** Express.js 5.x (CommonJS modülleri — `require()`)

### Başlatma Sırası (`index.js`)

```
1. dotenv.config()           → .env yüklenir
2. process.on('uncaughtException')  → kritik hata yakalama
3. express() setup           → CORS, JSON, urlencoded
4. app.use('/api/...')       → 21 route modülü bağlanır
5. production static serve   → NODE_ENV=production ise client/dist servis edilir
6. app.use(errorHandler)     → global hata middleware
7. initDb()                  → SQLite şema oluşturulur/güncellenir
8. scheduler.start()         → cron başlar
9. app.listen(PORT)          → 3001'de dinlemeye başlar
```

### Route Tablosu

| URL Prefix | Dosya | Açıklama |
|-----------|-------|----------|
| `/api/auth` | `routes/auth.js` | Giriş, token yenileme, şifre değişikliği |
| `/api/users` | `routes/users.js` | Kullanıcı CRUD (admin only) |
| `/api/suppliers` | `routes/suppliers.js` | Tedarikçiler + Tiger3 sync |
| `/api/products` | `routes/products.js` | Ürünler + çoklu kategori + Tiger3 sync |
| `/api/prices` | `routes/prices.js` | Fiyat takibi + alert yönetimi |
| `/api/po` | `routes/po.js` | Satın alma siparişleri + Tiger3 push/pull |
| `/api/rfq` | `routes/rfq.js` | Teklif talepleri + tedarikçi yanıtları |
| `/api/inventory` | `routes/inventory.js` | Stok yönetimi + hareketler |
| `/api/documents` | `routes/documents.js` | Multer ile dosya yükleme/indirme |
| `/api/reports` | `routes/reports.js` | Dashboard KPI + analizler |
| `/api/import` | `routes/import.js` | Excel dosyası toplu import |
| `/api/outlook` | `routes/outlook.js` | OAuth2 akışı + Graph API görev sync |
| `/api/warehouse` | `routes/warehouse.js` | Depo stok + Excel senkronizasyon |
| `/api/malzeme-ihtiyac` | `routes/malzeme-ihtiyac.js` | Üretim malzeme ihtiyaç raporları |
| `/api/department-requests` | `routes/department-requests.js` | Departman talepleri + onay akışı |
| `/api/finance` | `routes/finance.js` | Cari hesaplar, ekstre, döviz kurları |
| `/api/damage-reports` | `routes/damage-reports.js` | Hasar tutanakları |
| `/api/projects` | `routes/projects.js` | Proje teklifleri + kar/zarar analizi |
| `/api/ciro` | `routes/ciro.js` | Satış/ciro analizi raporları |
| `/api/settings` | `routes/settings.js` | Sistem konfigürasyonu (admin) |
| `/api/evira` | `routes/evira.js` | EVIRA stok senkronizasyonu |

### Dosya Yükleme

Multer `uploads/` dizinine yazar. `documents` tablosunda dosya adı ve yolu saklanır; fiziksel dosya bu dizinde durur. **Backup alırken `uploads/` dizinini dahil et.**

---

## 8. Kimlik Doğrulama ve Yetkilendirme

**Dosya:** `server/middleware/auth.js`

### Akış

```
Client → Authorization: Bearer <JWT> → authenticate() → req.user = payload → authorize('admin') → route handler
```

### Middleware Fonksiyonları

```js
authenticate           // Token yoksa 401, geçersizse 401
authorize('admin')     // Role yoksa 403
authorize('admin', 'user')  // İkisinden biri yeterliyse geçer
```

### JWT Payload Yapısı

```json
{
  "id": 1,
  "email": "admin@satinalma.com",
  "role": "admin",
  "name": "Admin",
  "iat": 1234567890,
  "exp": 1234596690
}
```

**Token süresi:** 8 saat (JWT_EXPIRES_IN). Refresh token mekanizması yok — süre dolunca kullanıcı tekrar giriş yapar.

### Roller

| Rol | Yetki |
|----|-------|
| `admin` | Tüm işlemler + kullanıcı yönetimi + sistem ayarları |
| `user` | Standart işlemler (oluşturma, güncelleme, silme) |
| `viewer` | Sadece okuma |

### Client Tarafı

**Dosya:** `client/src/context/AuthContext.jsx`  
**Hook:** `useAuth()` — tüm componentlerde kullanılır

Token ve user bilgisi `localStorage`'da tutulur. `axios.js` her isteğe `Authorization: Bearer <token>` ekler. 401 gelince otomatik logout ve `/login`'e yönlendirme yapılır.

---

## 9. İstemci (React)

**Giriş:** `client/src/main.jsx`  
**Router:** `client/src/App.jsx`

### API Client

**Dosya:** `client/src/api/axios.js`

```js
// Base URL: /api  (Vite proxy → localhost:3001)
// Request interceptor: localStorage'dan token alır, header'a ekler
// Response interceptor: 401 → logout() çağrısı
```

**Yardımcı fonksiyonlar:** `client/src/api/index.js` — 200+ önceden tanımlı API çağrısı (getSuppliers, createPO, updateProduct vb.)

### Sayfa Listesi (pages/)

| Dosya | URL | Açıklama |
|-------|-----|----------|
| `Login.jsx` | `/login` | Giriş formu |
| `Dashboard.jsx` | `/` | KPI kartları |
| `Suppliers.jsx` | `/suppliers` | Tedarikçi listesi |
| `SupplierDetail.jsx` | `/suppliers/:id` | Tedarikçi detayı |
| `ProductsAndPriceAnalysis.jsx` | `/products` | Ürün kataloğu + grafik |
| `Prices.jsx` | `/prices` | Fiyat takibi |
| `PO.jsx` | `/po` | Sipariş listesi |
| `PODetail.jsx` | `/po/:id` | Sipariş detayı |
| `RFQ.jsx` | `/rfq` | Teklif talepleri |
| `RFQDetail.jsx` | `/rfq/:id` | Teklif detayı |
| `Inventory.jsx` | `/inventory` | Stok yönetimi |
| `Depo.jsx` | `/warehouse` | Depo stoku |
| `MalzemeIhtiyac.jsx` | `/malzeme-ihtiyac` | Üretim ihtiyaç raporu |
| `Finance.jsx` | `/finance` | Finans |
| `CiroRaporu.jsx` | `/ciro` | Satış analizi |
| `DepartmentRequests.jsx` | `/requests` | Departman talepleri |
| `OutlookTasks.jsx` | `/outlook-tasks` | Outlook görevleri |
| `DamageReports.jsx` | `/damage-reports` | Hasar tutanakları |
| `Projects.jsx` | `/projects` | Proje teklifleri |
| `ProjectDetail.jsx` | `/projects/:id` | Proje detayı |
| `Reports.jsx` | `/reports` | Raporlar |
| `AdminUsers.jsx` | `/admin/users` | Kullanıcı yönetimi (admin) |
| `Settings.jsx` | `/settings` | Sistem ayarları (admin) |

---

## 10. Dış Sistem Entegrasyonları

### 10.1 TIGER3 ERP

Tiger3'ten çekilen veriler:
- Ürünler, tedarikçiler, siparişler (canlı sync)
- Satın alma geçmişi, fiyat analizi (önbelleklenir)
- Ciro raporu, malzeme ihtiyaç (önbelleklenir)
- Finans ekstresi (önbelleklenir)

Bağlantı bilgileri `db_settings` tablosundan dinamik okunur. Ayarlar değiştiğinde pool otomatik yeniden oluşur (`resetPool()`).

**Fallback:** Tiger3 bağlantısı kesilirse `utils/excelPurchaseFallback.js` devreye girer — `Tabloalarım/` altındaki Excel dosyasından veri çeker.

### 10.2 EVIRA Depo

Gerçek zamanlı envanter verisi. Scheduler çalıştığında `evira_stock_cache` tablosu güncellenir. `/api/evira` endpoint'leri bu cache'i okur.

### 10.3 Microsoft Outlook (OAuth2)

**Akış:**
```
/api/outlook/auth → Microsoft login sayfası → callback → token kayıt → görevler sync
```

**Token depolama:** `outlook_tasks` tablosu içinde `access_token` ve `refresh_token` saklanır.  
**Graph API:** Outlook görevleri (To-Do) listeleme ve durum güncelleme.

**Gereksinim:** Azure AD'de App Registration (bkz. Bölüm 4 Adım 6).

### 10.4 E-posta (nodemailer)

Tedarikçi iletişimi ve bildirimler için kullanılır. SMTP ayarları Settings sayfasından yapılır.

### 10.5 Excel Entegrasyonu

İki yönlü:
- **Import:** `xlsx` / `exceljs` kütüphaneleri ile Excel dosyasından veri içe aktarma (`/api/import`)
- **Sync:** `Tabloalarım/` altındaki Excel dosyalarından depo/malzeme/finans verisi okuma
- **Export:** Raporları Excel olarak indirme

---

## 11. Zamanlayıcı (Scheduler)

**Dosya:** `server/utils/scheduler.js`  
**Kütüphane:** `node-cron`

Scheduler uygulama başlarken `index.js` tarafından `scheduler.start()` ile devreye alınır.

**Ayarlar** (`db_settings` tablosu):
```
auto_refresh_enabled  = '1'    → scheduler aktif
auto_refresh_interval = '60'   → her 60 dakikada bir çalışır
```

**Senkronize edilen veriler:**
- TIGER3: Ürünler, Tedarikçiler, Siparişler
- TIGER3: Satın alma geçmişi, Fiyat analizi
- TIGER3: Ciro raporu, Malzeme ihtiyaç, Finans
- EVIRA: Stok seviyeleri

**Hata davranışı:** Bir sync adımı başarısız olsa bile diğerleri devam eder. Hata console'a loglanır, uygulama çökmez.

---

## 12. Yeni Özellik Ekleme — Standart Akış

```
1. server/routes/yenimodül.js     → Express Router oluştur
2. server/index.js                → app.use('/api/yenimodül', require('./routes/yenimodül'))
3. client/src/api/index.js        → API helper fonksiyonları ekle
4. client/src/pages/Yeni.jsx      → React sayfa bileşeni oluştur
5. client/src/App.jsx             → <Route path="/yeni" element={<Yeni />} /> ekle
6. client/src/components/Layout.jsx → Sidebar linkleri güncelle
```

### Route Dosyası Şablonu

```js
// server/routes/yenimodül.js
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticate, authorize } = require('../middleware/auth');

// Herkes erişebilir
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM yeni_tablo').all();
  res.json(rows);
});

// Sadece admin
router.post('/', authenticate, authorize('admin'), (req, res) => {
  // ...
});

module.exports = router;
```

---

## 13. Veritabanı Migration Eklemek

`server/db/schema.js` içindeki `initDb()` fonksiyonuna ekle. Her zaman idempotent ol:

```js
// Yeni tablo
db.exec(`
  CREATE TABLE IF NOT EXISTS yeni_tablo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isim TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Mevcut tabloya yeni kolon (migration)
try {
  db.exec(`ALTER TABLE mevcut_tablo ADD COLUMN yeni_kolon TEXT DEFAULT ''`);
} catch (e) {
  // Kolon zaten varsa hata fırlat, yoksay
}
```

> `initDb()` her uygulama başlangıcında çalışır. `CREATE TABLE IF NOT EXISTS` ve try-catch yaklaşımı sayesinde hem ilk kurulum hem de güncelleme aynı kodla çalışır.

---

## 14. Bağımlılıklar (Dependencies)

### Server (`server/package.json`)

```json
{
  "express":        "^5.2.1",   // Web framework
  "better-sqlite3": "^12.8.0",  // SQLite (senkron, hızlı)
  "bcryptjs":       "^3.0.3",   // Şifre hash
  "jsonwebtoken":   "^9.0.3",   // JWT
  "cors":           "^2.8.6",   // CORS middleware
  "mssql":          "^12.5.0",  // MS SQL Server (Tiger3/EVIRA)
  "multer":         "^2.1.1",   // Dosya yükleme
  "nodemailer":     "^6.10.1",  // E-posta
  "exceljs":        "^4.4.0",   // Excel oluşturma/okuma
  "xlsx":           "^0.18.5",  // Excel parsing
  "pdfkit":         "^0.18.0",  // PDF oluşturma
  "node-cron":      "^4.2.1",   // Zamanlayıcı
  "uuid":           "^13.0.0",  // UUID üretimi
  "dotenv":         "^17.3.1",  // .env dosyası
  "nodemon":        "^3.1.14"   // Dev auto-reload (devDependency)
}
```

### Client (`client/package.json`)

```json
{
  "react":                   "^19.2.4",   // UI kütüphanesi
  "react-dom":               "^19.2.4",
  "react-router-dom":        "^7.13.2",   // Routing
  "@tanstack/react-query":   "^5.95.2",   // Server state
  "axios":                   "^1.14.0",   // HTTP
  "react-hook-form":         "^7.72.0",   // Form yönetimi
  "lucide-react":            "^1.7.0",    // İkonlar
  "recharts":                "^3.8.1",    // Grafikler
  "xlsx":                    "^0.18.5",   // Excel
  "vite":                    "^8.0.1",    // Build tool
  "@vitejs/plugin-react":    "^6.0.1",
  "tailwindcss":             "^4.2.2",    // CSS
  "@tailwindcss/vite":       "^4.2.2"
}
```

---

## 15. Bilinen Sorunlar ve Dikkat Noktaları

### Güvenlik

| Konu | Durum | Aksiyon |
|------|-------|---------|
| JWT_SECRET varsayılan değer | ⚠️ Riskli | Production'da mutlaka değiştir |
| Tiger3/EVIRA şifreleri SQLite'da plaintext | ⚠️ Riskli | Şifreleme eklenebilir (AES-256-GCM) |
| Token refresh yok | ℹ️ Bilgi | 8 saatte bir manuel tekrar giriş gerekir |

### Teknik

| Konu | Açıklama |
|------|----------|
| WAL dosyaları | `satinalma.db-shm` ve `satinalma.db-wal` normaldir, silme |
| Excel fallback | Tiger3 kesilince stale (eski) Excel verisi gösterilir |
| uploads/ dizini | Backup kapsamına alınmalı — DB'de sadece path var |
| Scheduler kısmi hata | Bir sync adımı başarısız olursa diğerleri devam eder |
| Port çakışması | 3001 kullanımdaysa server başlamaz — `netstat -ano | findstr 3001` |
| better-sqlite3 native | Node.js sürümü değişirse `npm rebuild better-sqlite3` gerekebilir |

### MS SQL Bağlantısı

| Konu | Açıklama |
|------|----------|
| `encrypt: false` | İç ağ bağlantısı, self-signed sertifika — production'da dikkat |
| `trustServerCertificate: true` | Aynı sebep |
| Bağlantı timeout | 15 saniye (connectionTimeout), sorgu timeout 60 saniye |

---

## 16. Geliştirici Başvurusu — Hızlı Komutlar

```bash
# Geliştirme başlat
start.bat

# Production başlat (build + serve)
start_prod.bat

# Bağımlılıkları kur (ilk kurulum)
setup.bat

# SQLite veritabanını aç (Windows)
# sqlite3 server/satinalma.db
# ya da DB Browser for SQLite ile aç: https://sqlitebrowser.org

# Sistem ayarlarını sorgula
sqlite3 server/satinalma.db "SELECT * FROM db_settings;"

# Tüm tabloları listele
sqlite3 server/satinalma.db ".tables"

# Kullanıcıları listele
sqlite3 server/satinalma.db "SELECT id, email, role FROM users;"

# 3001 portunu hangi process kullanıyor?
netstat -ano | findstr :3001

# better-sqlite3 native modülü yeniden derle (Node sürümü değişince)
cd server && npm rebuild better-sqlite3
```

### Yeni Geliştirici Başlangıç Kontrol Listesi

- [ ] Node.js 18+ kurulu (`node --version`)
- [ ] `setup.bat` çalıştırıldı (dependencies)
- [ ] `start.bat` ile uygulama ayağa kalktı
- [ ] `http://localhost:5173` açıldı
- [ ] `admin@satinalma.com / admin123` ile giriş yapıldı
- [ ] Dashboard yüklendi (temel kontrol)
- [ ] Admin > Settings: Tiger3/EVIRA bağlantısı test edildi
- [ ] Scheduler durumu kontrol edildi
- [ ] Bir tedarikçi, bir ürün, bir sipariş incelendi

---

*Bu doküman, `server/db/schema.js`, `server/index.js`, `server/utils/tiger3.js`, `server/middleware/auth.js` ve tüm route/util dosyaları incelenerek Mayıs 2026'da hazırlanmıştır. Büyük yapısal değişikliklerde güncelleyin.*
