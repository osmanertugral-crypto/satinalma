const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const { refreshExcelQueries } = require('../utils/excelRefresh');

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
// 320 RESTAR ÖZET – borç/alacak döviz bazlı özet
// ═══════════════════════════════════════════
router.get('/ozet', (req, res) => {
  try {
    const wb = XLSX.readFile(EXCEL_PATH);
    const ws = wb.Sheets['320 RESTAR ÖZET'];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Borç satırları: 3=TL, 4=USD, 5=EUR
    // Alacak satırları: 12=TL, 13=USD, 14=EUR
    function parseRow(r) {
      return {
        yurticiUretim: { doviz: num(raw[r]?.[1]), tl: num(raw[r]?.[2]) },
        diger:         { doviz: num(raw[r]?.[6]), tl: num(raw[r]?.[7]) },
        toplam:        { tl: num(raw[r]?.[11]) },
      };
    }

    const borc = { TL: parseRow(3), USD: parseRow(4), EUR: parseRow(5) };
    const alacak = { TL: parseRow(12), USD: parseRow(13), EUR: parseRow(14) };
    const genelToplam = num(raw[15]?.[11]);

    res.json({ borc, alacak, genelToplam });
  } catch (err) {
    console.error('Finance ozet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════
// GET /api/finance/cariler
// 320 BORÇ-ALACAK RESTAR – filtreli cari listesi
// Sütun F = BAKİYE (orijinal döviz cinsinden)
// Negatif = borcumuz, Pozitif = alacağımız
// ═══════════════════════════════════════════
router.get('/cariler', (req, res) => {
  try {
    const { cariKontrol, doviz } = req.query;
    const wb = XLSX.readFile(EXCEL_PATH);
    let rows = readSheet(wb, '320 BORÇ-ALACAK RESTAR');

    if (cariKontrol && cariKontrol !== 'TÜMÜ')
      rows = rows.filter(r => (r['CARİ KONTROL'] || '') === cariKontrol);
    if (doviz && doviz !== 'TÜMÜ')
      rows = rows.filter(r => (r['İŞLEM DÖVİZİ'] || '') === doviz);

    const mapped = rows.filter(r => r['CARİ KODU']).map(r => ({
      cariKodu:        r['CARİ KODU'],
      cariAdi:         r['CARİ ADI'] || '',
      doviz:           r['İŞLEM DÖVİZİ'] || 'TL',
      cariKontrol:     r['CARİ KONTROL'] || '',
      bakiye:          num(r['BAKİYE']),          // F sütunu – orijinal döviz
      durumu:          r['DURUMU'] || '',
      vadeSuresi:      num(r['VADE SURESI']),
      vadesiGelen:     num(r['VADESI_GELEN']),
      vadesiGelmeyen:  num(r['VADESI_GELMEYEN']),
      enUzakFaturaTarihi: formatDate(r['EN UZAK FATURA TARİHİ']),
      enUzakFaturaNo:  r['EN UZAK FATURA NO'] || '',
      enUzakFaturaTutari: num(r['EN UZAK FATURA TUTARI']),
      enUzakGun:       typeof r['EN UZAK FATURA GÜNÜ'] === 'number' ? r['EN UZAK FATURA GÜNÜ'] : null,
      enYakinGun:      typeof r['EN YAKIN FATURA GÜNÜ'] === 'number' ? r['EN YAKIN FATURA GÜNÜ'] : null,
      ortGun:          typeof r['ORTALAMA BEKLEYEN FATURA GÜNÜ'] === 'number' ? r['ORTALAMA BEKLEYEN FATURA GÜNÜ'] : null,
      sonOdemeTarih:   formatDate(r['SON ÖDEME TARİHİ']),
      sonOdemeGun:     typeof r['SON ÖDEMEDEN SONRA GEÇEN GÜN'] === 'number' ? r['SON ÖDEMEDEN SONRA GEÇEN GÜN'] : null,
      sonOdemeTutar:   typeof r['SON ÖDEME TUTARI'] === 'number' ? r['SON ÖDEME TUTARI'] : null,
    }));

    res.json(mapped);
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

    const wb = XLSX.readFile(EXCEL_PATH);
    const allRows = readSheet(wb, 'RESTAR EKSTRE').filter(r => r['CODE'] === code);

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

// POST /api/finance/refresh-excel — SQL sorgularını arka planda yeniler
// Hemen 202 döner, işlem arka planda devam eder.
// GET /api/finance/refresh-status ile durum sorgulanabilir.
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

  // Arka planda çalıştır — await YOK, istek hemen döner
  refreshExcelQueries(EXCEL_PATH)
    .then(log => {
      refreshState = { status: 'done', startedAt: refreshState.startedAt, finishedAt: new Date().toISOString(), message: 'Cari Extre güncellendi', error: null };
      console.log('Finance Excel yenilendi:', log);
    })
    .catch(err => {
      refreshState = { status: 'error', startedAt: refreshState.startedAt, finishedAt: new Date().toISOString(), message: null, error: err.message };
      console.error('Finance Excel refresh hatası:', err.message);
    });

  res.json({ success: true, running: true, message: 'SQL sorguları arka planda çalıştırılıyor, tamamlandığında sayfa otomatik yenilenecek…' });
});

router.get('/refresh-status', (req, res) => {
  res.json(refreshState);
});

module.exports = router;
