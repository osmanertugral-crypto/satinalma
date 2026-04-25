const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { refreshExcelQueries } = require('../utils/excelRefresh');
const { getDb } = require('../db/schema');
const tiger3 = require('../utils/tiger3');

router.use(authenticate);

const EXCEL_PATH = path.join(__dirname, '../../gecici/Cari Extre.xlsx');

// ── helpers ──
function excelDateToJS(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const utc_days = Math.floor(serial - 25569);
  return new Date(utc_days * 86400 * 1000);
}
function formatDate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d;
  if (typeof d === 'number') d = excelDateToJS(d);
  if (!(d instanceof Date) || isNaN(d)) return null;
  return d.toISOString().split('T')[0];
}
function readSheet(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' }).map(row => {
    const t = {};
    for (const [k, v] of Object.entries(row))
      t[k.trim().replace(/\r?\n/g, ' ').replace(/\s+/g, ' ')] = v;
    return t;
  });
}
function num(v) { return typeof v === 'number' ? v : 0; }

// TIGER3'ten ekstre verisi çek ve SQLite cache'e yaz
async function syncFromTIGER3() {
  const rows = await tiger3.query('SELECT * FROM PRC_CARI_HESAP_EKSTRESI_123_ONR');

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM finance_ekstre_cache').run();
    const stmt = db.prepare(`
      INSERT INTO finance_ekstre_cache
        (code, definition_, sign, borc, alacak, indate, duedate,
         vadesuresi, islem_dovizi, islem_doviz_tutari, typ, fis_no, belge_no,
         satir_aciklamasi, cari_tur, logicalref)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    let count = 0;
    for (const r of rows) {
      stmt.run(
        String(r.CODE || '').trim(),
        String(r.DEFINITION_ || r.DEFINITION || '').trim(),
        +r.SIGN || 0,
        +r.BORC || 0,
        +r.ALACAK || 0,
        r.INDATE ? String(r.INDATE).substring(0, 10) : null,
        r.DUEDATE ? String(r.DUEDATE).substring(0, 10) : null,
        +r.VADESURESI || 0,
        String(r.ISLEM_DOVIZI || '').trim(),
        +r.ISLEM_DOVIZ_TUTARI || 0,
        String(r.TYP || r.TYPE || '').trim(),
        String(r.FIS_NO || '').trim(),
        String(r.BELGE_NO || '').trim(),
        String(r.SATIR_ACIKLAMASI || '').trim(),
        String(r.CARI_TUR || r['CARI TUR'] || '').trim(),
        +r.LOGICALREF || 0
      );
      count++;
    }
    return count;
  });
  return tx();
}

function getEkstreRows(code) {
  const db = getDb();
  return db.prepare('SELECT * FROM finance_ekstre_cache WHERE code = ?').all(code).map(r => ({
    CODE: r.code, DEFINITION_: r.definition_, SIGN: r.sign, BORC: r.borc, ALACAK: r.alacak,
    INDATE: r.indate, DUEDATE: r.duedate, VADESURESI: r.vadesuresi, ISLEM_DOVIZI: r.islem_dovizi,
    ISLEM_DOVIZ_TUTARI: r.islem_doviz_tutari, TYP: r.typ, FIS_NO: r.fis_no, BELGE_NO: r.belge_no,
    SATIR_ACIKLAMASI: r.satir_aciklamasi, 'CARI TUR': r.cari_tur, LOGICALREF: r.logicalref,
  }));
}

// ── TCMB döviz kurları (cache 1 saat) ──
let kurCache = { ts: 0, data: null };
async function fetchTCMB() {
  const now = Date.now();
  if (kurCache.data && now - kurCache.ts < 3600_000) return kurCache.data;
  try {
    const resp = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml');
    const xml = await resp.text();
    // Parse USD
    const usdMatch = xml.match(/<Currency[^>]*Kod="USD"[^>]*>[\s\S]*?<BanknoteSelling>([\d.]+)<\/BanknoteSelling>/);
    const eurMatch = xml.match(/<Currency[^>]*Kod="EUR"[^>]*>[\s\S]*?<BanknoteSelling>([\d.]+)<\/BanknoteSelling>/);
    const tarihMatch = xml.match(/Tarih="([^"]+)"/);
    const data = {
      usd: usdMatch ? parseFloat(usdMatch[1]) : null,
      eur: eurMatch ? parseFloat(eurMatch[1]) : null,
      tarih: tarihMatch ? tarihMatch[1] : new Date().toLocaleDateString('tr-TR'),
    };
    kurCache = { ts: now, data };
    return data;
  } catch (e) {
    console.error('TCMB fetch error:', e.message);
    return kurCache.data || { usd: null, eur: null, tarih: null };
  }
}

// ═══════════════════════════════════════════
// GET /api/finance/kurlar
// ═══════════════════════════════════════════
router.get('/kurlar', async (req, res) => {
  try {
    const data = await fetchTCMB();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/finance/ozet
// finance_ekstre_cache'ten borç/alacak döviz bazlı özet
// ═══════════════════════════════════════════
router.get('/ozet', (req, res) => {
  try {
    const db = getDb();
    const emptyGroup = { yurticiUretim: { doviz: 0, tl: 0 }, diger: { doviz: 0, tl: 0 }, toplam: { tl: 0 } };
    const empty = { borc: { TL: emptyGroup, USD: emptyGroup, EUR: emptyGroup }, alacak: { TL: emptyGroup, USD: emptyGroup, EUR: emptyGroup }, genelToplam: 0 };

    const count = db.prepare('SELECT COUNT(*) as c FROM finance_ekstre_cache').get().c;
    if (count === 0) return res.json(empty);

    // borc = alacak < 0 (faturalar, borcumuz); alacak = borc > 0 (ödemeler / alacaklar)
    const aggRows = db.prepare(`
      SELECT
        COALESCE(NULLIF(islem_dovizi,''), 'TL') AS doviz,
        cari_tur,
        SUM(CASE WHEN alacak < 0 THEN ABS(alacak) ELSE 0 END) AS borc_tl,
        SUM(CASE WHEN alacak < 0 THEN ABS(islem_doviz_tutari) ELSE 0 END) AS borc_doviz,
        SUM(CASE WHEN borc > 0 THEN borc ELSE 0 END) AS alacak_tl,
        SUM(CASE WHEN borc > 0 THEN islem_doviz_tutari ELSE 0 END) AS alacak_doviz
      FROM finance_ekstre_cache
      GROUP BY COALESCE(NULLIF(islem_dovizi,''), 'TL'), cari_tur
    `).all();

    function buildSection(doviz) {
      const isTL = doviz === 'TL';
      const dRows = aggRows.filter(r => r.doviz === doviz);
      const uretimRows = dRows.filter(r => /üretim/i.test(r.cari_tur || ''));
      const digerRows  = dRows.filter(r => !/üretim/i.test(r.cari_tur || ''));

      function makeGroup(grp) {
        return {
          doviz: isTL ? grp.reduce((s, r) => s + r.borc_tl, 0) : grp.reduce((s, r) => s + r.borc_doviz, 0),
          tl:    grp.reduce((s, r) => s + r.borc_tl, 0),
        };
      }
      function makeAlacakGroup(grp) {
        return {
          doviz: isTL ? grp.reduce((s, r) => s + r.alacak_tl, 0) : grp.reduce((s, r) => s + r.alacak_doviz, 0),
          tl:    grp.reduce((s, r) => s + r.alacak_tl, 0),
        };
      }

      return {
        borc: {
          yurticiUretim: makeGroup(uretimRows),
          diger:         makeGroup(digerRows),
          toplam:        { tl: dRows.reduce((s, r) => s + r.borc_tl, 0) },
        },
        alacak: {
          yurticiUretim: makeAlacakGroup(uretimRows),
          diger:         makeAlacakGroup(digerRows),
          toplam:        { tl: dRows.reduce((s, r) => s + r.alacak_tl, 0) },
        },
      };
    }

    const tl  = buildSection('TL');
    const usd = buildSection('USD');
    const eur = buildSection('EUR');

    const genelToplam = [tl, usd, eur].reduce((s, sec) => s + sec.borc.toplam.tl - sec.alacak.toplam.tl, 0);

    res.json({
      borc:   { TL: tl.borc,   USD: usd.borc,   EUR: eur.borc   },
      alacak: { TL: tl.alacak, USD: usd.alacak, EUR: eur.alacak },
      genelToplam,
    });
  } catch (err) {
    console.error('Finance ozet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/finance/cariler
// finance_ekstre_cache'ten cari bazlı bakiye listesi
// bakiye < 0 = borcumuz, bakiye > 0 = alacağımız
// ═══════════════════════════════════════════
router.get('/cariler', (req, res) => {
  try {
    const { cariKontrol, doviz } = req.query;
    const db = getDb();

    const count = db.prepare('SELECT COUNT(*) as c FROM finance_ekstre_cache').get().c;
    if (count === 0) return res.json([]);

    const today = new Date().toISOString().split('T')[0];
    let rows = db.prepare(`
      SELECT
        code AS cariKodu,
        MAX(definition_) AS cariAdi,
        COALESCE(NULLIF(islem_dovizi,''), 'TL') AS doviz,
        MAX(cari_tur) AS cariKontrol,
        SUM(CASE WHEN borc > 0 THEN borc ELSE 0 END)
          - SUM(CASE WHEN alacak < 0 THEN ABS(alacak) ELSE 0 END) AS bakiye,
        SUM(CASE WHEN alacak < 0 AND duedate IS NOT NULL AND duedate <= ? THEN ABS(alacak) ELSE 0 END) AS vadesiGelen,
        SUM(CASE WHEN alacak < 0 AND (duedate IS NULL OR duedate > ?) THEN ABS(alacak) ELSE 0 END) AS vadesiGelmeyen
      FROM finance_ekstre_cache
      GROUP BY code, COALESCE(NULLIF(islem_dovizi,''), 'TL')
    `).all(today, today);

    if (cariKontrol && cariKontrol !== 'TÜMÜ')
      rows = rows.filter(r => (r.cariKontrol || '') === cariKontrol);
    if (doviz && doviz !== 'TÜMÜ')
      rows = rows.filter(r => r.doviz === doviz);

    res.json(rows.filter(r => r.cariKodu));
  } catch (err) {
    console.error('Finance cariler error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/finance/cari-detay
// RESTAR EKSTRE – tek cari için fatura/ödeme detayı
// ALACAK < 0 → fatura (borcumuz), BORC > 0 → ödeme
// ═══════════════════════════════════════════
router.get('/cari-detay', (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'code gerekli' });

    const allRows = getEkstreRows(code);

    // Tüm işlemler tarih sırasına göre
    const islemler = allRows.map(r => ({
      ref:          r['LOGICALREF'],
      tarih:        formatDate(r['INDATE']),
      vadeTarihi:   formatDate(r['DUEDATE']),
      vadeSuresi:   num(r['VADESURESI']),
      tip:          r['TYP'] || '',
      sign:         num(r['SIGN']),
      borc:         num(r['BORC']),
      alacak:       num(r['ALACAK']),
      doviz:        r['ISLEM_DOVIZI'] || 'TL',
      dovizTutar:   num(r['ISLEM_DOVIZ_TUTARI']),
      fisNo:        r['FIS_NO'] || '',
      belgeNo:      r['BELGE_NO'] || '',
      aciklama:     r['SATIR_ACIKLAMASI'] || '',
      cariTur:      r['CARI TUR'] || '',
    })).sort((a, b) => (a.tarih || '').localeCompare(b.tarih || ''));

    // Cari adı
    const cariAdi = allRows[0]?.['DEFINITION_'] || code;

    // Faturalar ve ödemeler ayır
    const faturalar = islemler
      .filter(r => r.alacak < 0)
      .map(r => ({
        ...r,
        tutar: Math.abs(r.alacak),
        dovizTutarAbs: Math.abs(r.dovizTutar),
      }));

    const odemeler = islemler.filter(r => r.borc > 0);

    // Toplam fatura ve toplam ödeme (TL cinsinden – BORC/ALACAK kolonları TL)
    const toplamFatura = faturalar.reduce((s, f) => s + f.tutar, 0);
    const toplamOdeme = odemeler.reduce((s, o) => s + o.borc, 0);
    const kalanBorc = toplamFatura - toplamOdeme; // pozitifse hala borçluyuz

    // FIFO fatura ödeme eşleştirme: en eski fatura önce ödenir
    let odemePotu = toplamOdeme;
    const faturaDetay = faturalar.map(f => {
      if (odemePotu >= f.tutar) {
        odemePotu -= f.tutar;
        return { ...f, odpiranMiktar: f.tutar, kalanBorc: 0, durum: 'odendi' };
      } else if (odemePotu > 0) {
        const odpiranMiktar = odemePotu;
        odemePotu = 0;
        return { ...f, odpiranMiktar, kalanBorc: f.tutar - odpiranMiktar, durum: 'kismi' };
      } else {
        return { ...f, odpiranMiktar: 0, kalanBorc: f.tutar, durum: 'odenmedi' };
      }
    });

    // Son 1 yıllık ödeme analizi
    const birYilOnce = new Date();
    birYilOnce.setFullYear(birYilOnce.getFullYear() - 1);
    const birYilStr = birYilOnce.toISOString().split('T')[0];
    const sonBirYilOdemeler = odemeler.filter(o => o.tarih && o.tarih >= birYilStr);
    const sonBirYilFaturalar = faturalar.filter(f => f.tarih && f.tarih >= birYilStr);

    // Ortalama ödeme vadesi (faturalarda vadesuresi)
    const vadeSureleri = faturalar.filter(f => f.vadeSuresi > 0);
    const ortVade = vadeSureleri.length > 0
      ? Math.round(vadeSureleri.reduce((s, f) => s + f.vadeSuresi, 0) / vadeSureleri.length)
      : 0;

    // Son ödeme bilgisi
    const sonOdemeler = odemeler.filter(o => o.tarih).sort((a, b) => b.tarih.localeCompare(a.tarih));
    const sonOdeme = sonOdemeler[0] || null;

    // Aylık özet (son 24 ay)
    const aylik = {};
    islemler.forEach(r => {
      if (!r.tarih) return;
      const ay = r.tarih.substring(0, 7);
      if (!aylik[ay]) aylik[ay] = { ay, fatura: 0, odeme: 0 };
      if (r.alacak < 0) aylik[ay].fatura += Math.abs(r.alacak);
      if (r.borc > 0) aylik[ay].odeme += r.borc;
    });
    const aylikArr = Object.values(aylik).sort((a, b) => a.ay.localeCompare(b.ay));
    let kumulatif = 0;
    aylikArr.forEach(a => { kumulatif += a.fatura - a.odeme; a.kalanBorc = kumulatif; });

    // Son 1 yıl aylık ödeme ortalaması
    const sonBirYilAylik = aylikArr.filter(a => a.ay >= birYilStr.substring(0, 7));
    const ortAylikOdeme = sonBirYilAylik.length > 0
      ? Math.round(sonBirYilAylik.reduce((s, a) => s + a.odeme, 0) / sonBirYilAylik.length)
      : 0;

    // Ödenmemiş gün hesabı: en eski ödenmemiş faturanın tarihi
    const enEskiOdenmemis = faturaDetay.find(f => f.durum !== 'odendi');
    const odenmeGunSayisi = enEskiOdenmemis?.tarih
      ? Math.floor((Date.now() - new Date(enEskiOdenmemis.tarih).getTime()) / 86400_000)
      : 0;

    res.json({
      cariKodu: code,
      cariAdi,
      toplamFatura,
      toplamOdeme,
      kalanBorc,
      ortVade,
      odenmeGunSayisi,
      sonOdeme: sonOdeme ? { tarih: sonOdeme.tarih, tutar: sonOdeme.borc, doviz: sonOdeme.doviz } : null,
      sonBirYilOzet: {
        toplamFatura: sonBirYilFaturalar.reduce((s, f) => s + f.tutar, 0),
        toplamOdeme: sonBirYilOdemeler.reduce((s, o) => s + o.borc, 0),
        faturaSayisi: sonBirYilFaturalar.length,
        odemeSayisi: sonBirYilOdemeler.length,
        ortAylikOdeme,
      },
      faturalar: faturaDetay,
      odemeler: odemeler.map(o => ({
        tarih: o.tarih,
        tutar: o.borc,
        doviz: o.doviz,
        dovizTutar: o.dovizTutar,
        tip: o.tip,
        belgeNo: o.belgeNo,
        fisNo: o.fisNo,
        aciklama: o.aciklama,
      })),
      aylikOzet: aylikArr,
      islemSayisi: islemler.length,
    });
  } catch (err) {
    console.error('Finance cari-detay error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/finance/refresh-excel — Önce TIGER3, başarısız olursa Excel
let refreshState = { status: 'idle', startedAt: null, finishedAt: null, message: null, error: null };

router.post('/refresh-excel', (req, res) => {
  if (refreshState.status === 'running') {
    return res.json({
      success: false,
      running: true,
      message: 'Yenileme zaten devam ediyor, lütfen bekleyin…',
      startedAt: refreshState.startedAt,
    });
  }

  refreshState = { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, message: null, error: null };

  const run = async () => {
    try {
      const count = await syncFromTIGER3();
      refreshState = { status: 'done', startedAt: refreshState.startedAt, finishedAt: new Date().toISOString(), message: `TIGER3'ten ${count} kayıt alındı`, error: null };
    } catch (tiger3Err) {
      console.warn('Finance: TIGER3 bağlanamadı, Excel fallback:', tiger3Err.message);
      try {
        await refreshExcelQueries(EXCEL_PATH);
        refreshState = { status: 'done', startedAt: refreshState.startedAt, finishedAt: new Date().toISOString(), message: 'Excel güncellendi (TIGER3 bağlantı hatası)', error: null };
      } catch (excelErr) {
        refreshState = { status: 'error', startedAt: refreshState.startedAt, finishedAt: new Date().toISOString(), message: null, error: excelErr.message };
      }
    }
  };
  run();

  res.json({ success: true, running: true, message: 'Güncelleme arka planda başlatıldı…' });
});

router.get('/refresh-status', (req, res) => {
  res.json(refreshState);
});

module.exports = router;
module.exports.syncFromTIGER3 = syncFromTIGER3;
