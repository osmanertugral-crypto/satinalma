const express = require('express');
const router = express.Router();
const path = require('path');
const XLSX = require('xlsx');
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../db/schema');
const { refreshExcelQueries } = require('../utils/excelRefresh');
const tiger3 = require('../utils/tiger3');

router.use(authenticate);

const EXCEL_PATH = path.join(__dirname, '..', '..', 'gecici', 'MALZEME İHTİYAÇ TOPLAM SATINALMA.xlsx');

// TIGER3'ten malzeme ihtiyaç verisi çek ve SQLite cache'e yaz
async function syncFromTIGER3() {
  const rows = await tiger3.query(`
    SELECT
      PROJE_KODU,
      KARAVAN_ADI,
      [ALT_KOD_TÜR]                 AS ALT_KOD_TUR,
      ALT_KOD,
      ALT_ADI,
      MIKTAR,
      BIRIM,
      [PROJELERE_ÇIKIŞLAR_YENI]     AS PROJELERE_CIKISLAR_YENI,
      ELDE_KALAN,
      [ÜRETİM DEPO]                 AS URETIM_DEPO,
      [AÇIK_SATINALMA_SİPARİŞLERİ] AS ACIK_SATINALMA_SIPARISLERI,
      CASE
        WHEN (MIKTAR - [PROJELERE_ÇIKIŞLAR_YENI] - ELDE_KALAN
              - [ÜRETİM DEPO] - [AÇIK_SATINALMA_SİPARİŞLERİ]) > 0
        THEN (MIKTAR - [PROJELERE_ÇIKIŞLAR_YENI] - ELDE_KALAN
              - [ÜRETİM DEPO] - [AÇIK_SATINALMA_SİPARİŞLERİ])
        ELSE 0
      END                            AS SATINALMA,
      BIRIM_FIYATLAR,
      [SON SATINALMA CARİ ÜNVANI]  AS SON_SATINALMA_CARI_UNVANI,
      TUTAR,
      ALTSTOKGRUPKODU
    FROM [DST_123_ÜRETİM_İHTİYAÇ_RAPORU_BURAK_YENI1309]
  `);

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM malzeme_ihtiyac_cache').run();
    const stmt = db.prepare(`
      INSERT INTO malzeme_ihtiyac_cache
        (proje_kodu, karavan_adi, alt_kod_tur, alt_kod, alt_adi,
         miktar, birim, projelere_cikislar, elde_kalan, uretim_depo,
         acik_satinalma_siparisleri, satinalma, birim_fiyatlar,
         son_satinalma_cari, tutar, alt_stok_grup_kodu)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    let count = 0;
    for (const r of rows) {
      stmt.run(
        String(r.PROJE_KODU || '').trim(),
        String(r.KARAVAN_ADI || '').trim(),
        String(r.ALT_KOD_TUR || '').trim(),
        String(r.ALT_KOD || '').trim(),
        String(r.ALT_ADI || '').trim(),
        +r.MIKTAR || 0,
        String(r.BIRIM || '').trim(),
        +r.PROJELERE_CIKISLAR_YENI || 0,
        +r.ELDE_KALAN || 0,
        +r.URETIM_DEPO || 0,
        +r.ACIK_SATINALMA_SIPARISLERI || 0,
        +r.SATINALMA || 0,
        +r.BIRIM_FIYATLAR || 0,
        String(r.SON_SATINALMA_CARI_UNVANI || '').trim(),
        +r.TUTAR || 0,
        String(r.ALTSTOKGRUPKODU || '').trim()
      );
      count++;
    }
    db.prepare(
      "INSERT INTO malzeme_ihtiyac_sync_log (row_count, status, message) VALUES (?, 'success', ?)"
    ).run(count, `TIGER3'ten ${count} satır senkronize edildi`);
    return count;
  });
  return tx();
}

// Malzeme ihtiyaç verisi: önce cache, yoksa Excel
function getUretimRows() {
  const db = getDb();
  const cacheCount = db.prepare('SELECT COUNT(*) as c FROM malzeme_ihtiyac_cache').get().c;
  if (cacheCount > 0) {
    return db.prepare('SELECT * FROM malzeme_ihtiyac_cache').all().map(r => ({
      'PROJE_KODU': r.proje_kodu,
      'KARAVAN_ADI': r.karavan_adi,
      'ALT_KOD_TÜR': r.alt_kod_tur,
      'ALT_KOD': r.alt_kod,
      'ALT_ADI': r.alt_adi,
      'MIKTAR': r.miktar,
      'BIRIM': r.birim,
      'PROJELERE_ÇIKIŞLAR_YENI': r.projelere_cikislar,
      'ELDE_KALAN': r.elde_kalan,
      'ÜRETİM DEPO': r.uretim_depo,
      'AÇIK_SATINALMA_SİPARİŞLERİ': r.acik_satinalma_siparisleri,
      'SATINALMA': r.satinalma,
      'BIRIM_FIYATLAR': r.birim_fiyatlar,
      'SON SATINALMA CARİ ÜNVANI': r.son_satinalma_cari,
      'TUTAR': r.tutar,
      'ALTSTOKGRUPKODU': r.alt_stok_grup_kodu,
    }));
  }
  // Excel fallback
  const wb = XLSX.readFile(EXCEL_PATH, { cellFormula: false, cellStyles: false });
  const ws = wb.Sheets['ÜRETİM İHTİYAÇ RAPORU'];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// Sayfaları yenile — önce TIGER3, yoksa Excel SQL sorgularını çalıştır
router.post('/refresh', async (req, res) => {
  try {
    let count, source;
    try {
      count = await syncFromTIGER3();
      source = 'tiger3';
    } catch (tiger3Err) {
      console.warn('Malzeme İhtiyaç: TIGER3 bağlanamadı, Excel fallback:', tiger3Err.message);
      const fs = require('fs');
      if (!fs.existsSync(EXCEL_PATH)) {
        return res.status(404).json({ error: 'Excel dosyası bulunamadı ve TIGER3 bağlantısı yok: ' + tiger3Err.message });
      }
      await refreshExcelQueries(EXCEL_PATH);
      const wb = XLSX.readFile(EXCEL_PATH, { cellFormula: false, cellStyles: false });
      const ws = wb.Sheets['ÜRETİM İHTİYAÇ RAPORU'];
      count = ws ? XLSX.utils.sheet_to_json(ws, { defval: '' }).length : 0;
      source = 'excel';
    }
    res.json({
      success: true,
      source,
      count,
      message: `${count} satır güncellendi (${source === 'tiger3' ? 'TIGER3 doğrudan bağlantı' : 'Excel'})`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Malzeme refresh error:', err);
    res.status(500).json({ error: 'Yenileme hatası: ' + err.message });
  }
});

// ÜRETİM İHTİYAÇ RAPORU verilerini getir
router.get('/uretim-ihtiyac', (req, res) => {
  try {
    const { proje } = req.query;
    const rows = getUretimRows();

    let data = rows.map(r => ({
      proje_kodu: r['PROJE_KODU'] || '',
      karavan_adi: r['KARAVAN_ADI'] || '',
      alt_kod_tur: r['ALT_KOD_TÜR'] || '',
      alt_kod: r['ALT_KOD'] || '',
      alt_adi: r['ALT_ADI'] || '',
      miktar: r['MIKTAR'] || 0,
      birim: r['BIRIM'] || '',
      projelere_cikislar: r['PROJELERE_ÇIKIŞLAR_YENI'] || 0,
      elde_kalan: r['ELDE_KALAN'] || 0,
      uretim_depo: r['ÜRETİM DEPO'] || 0,
      satinalma: r['SATINALMA'] || 0,
      acik_satinalma_siparisleri: r['AÇIK_SATINALMA_SİPARİŞLERİ'] || 0,
      toplam: r['TOPLAM'] || 0,
      birim_fiyat: r['BIRIM_FIYATLAR'] || 0,
      son_satinalma_cari: r['SON SATINALMA CARİ ÜNVANI'] || '',
      tutar: r['TUTAR'] || 0,
      alt_stok_grup_kodu: r['ALTSTOKGRUPKODU'] || '',
    }));

    // Proje filtreleme
    if (proje) {
      const projeler = proje.split(',');
      data = data.filter(d => projeler.includes(d.proje_kodu));
    }

    // Benzersiz proje kodları
    const projeler = [...new Set(rows.map(r => r['PROJE_KODU']).filter(Boolean))].sort();

    res.json({ data, projeler, toplam: data.length });
  } catch (err) {
    console.error('Uretim ihtiyac error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PROJE MALİYET verilerini getir
router.get('/proje-maliyet', (req, res) => {
  try {
    const wb = XLSX.readFile(EXCEL_PATH, { cellFormula: false, cellStyles: false });
    const ws = wb.Sheets['PROJE MALİYET'];

    if (!ws) return res.status(404).json({ error: 'PROJE MALİYET sayfası bulunamadı' });

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Header satır 2'de (index 2): "Satır Etiketleri", "Toplam Maliyet"
    const data = [];
    let genelToplam = 0;

    for (let i = 3; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0] === '' || row[0] === 'Genel Toplam') {
        if (row[0] === 'Genel Toplam') genelToplam = row[1] || 0;
        continue;
      }
      data.push({
        proje_kodu: row[0],
        toplam_maliyet: row[1] || 0,
      });
    }

    // Maliyete göre sırala (büyükten küçüğe)
    data.sort((a, b) => b.toplam_maliyet - a.toplam_maliyet);

    res.json({ data, genel_toplam: genelToplam });
  } catch (err) {
    console.error('Proje maliyet error:', err);
    res.status(500).json({ error: err.message });
  }
});

// SATINALMA verilerini getir
// ÜRETİM İHTİYAÇ RAPORU'ndan malzeme/stok/fiyat/tedarikçi bilgileri alınır.
// SATINALMA sheet formül tabanlı olduğu için xlsx kütüphanesi okuyamaz,
// bu yüzden tüm veriler ÜRETİM İHTİYAÇ RAPORU'ndan hesaplanır.
router.get('/satinalma', (req, res) => {
  try {
    const { proje } = req.query;
    const uretimRows = getUretimRows();

    // Hangi projeler dahil edilecek?
    const projeler = proje ? proje.split(',') : null;

    // Alt_kod bazında global stok değerlerini al (ilk satırdan - tüm projelerde aynı)
    const globalStok = {};
    for (const row of uretimRows) {
      const altKod = row['ALT_KOD'];
      if (!altKod || globalStok[altKod]) continue;
      globalStok[altKod] = {
        alt_adi: row['ALT_ADI'] || '',
        son_satinalma_cari: row['SON SATINALMA CARİ ÜNVANI'] || '',
        birim_fiyat: Number(row['BIRIM_FIYATLAR']) || 0,
        depo_stok: Number(row['ELDE_KALAN']) || 0,
        uretim_depo: Number(row['ÜRETİM DEPO']) || 0,
        acik_siparisler: Number(row['AÇIK_SATINALMA_SİPARİŞLERİ']) || 0,
        // SATINALMA sütunu: Excel'in önceden hesapladığı toplam satınalma değeri
        satinalma_col: Number(row['SATINALMA']) || 0,
      };
    }

    let data;

    if (!projeler) {
      // Proje seçilmemişse: Excel'in önceden hesapladığı SATINALMA sütununu kullan
      // SATINALMA sütunu = alınması gereken miktar (tüm stok düşümleri yapılmış)
      data = Object.entries(globalStok).map(([alt_kod, g]) => {
        const gercekSatinalma = g.satinalma_col;

        return {
          alt_kod,
          alt_adi: g.alt_adi,
          son_satinalma_cari: g.son_satinalma_cari,
          toplam_ihtiyac: 0,
          projelere_cikislar: 0,
          depo_stok: g.depo_stok,
          uretim_depo: g.uretim_depo,
          acik_siparisler: g.acik_siparisler,
          toplam_satinalma: Math.max(0, gercekSatinalma),
          birim_fiyat: g.birim_fiyat,
          toplam_maliyet: Math.max(0, gercekSatinalma) * g.birim_fiyat,
          gercek_satinalma: gercekSatinalma,
          alinmasi_gereken_tutar: Math.max(0, gercekSatinalma) * g.birim_fiyat,
        };
      });
    } else {
      // Proje seçildiyse: seçili projelerin malzeme ihtiyacını alt_kod bazında topla
      const ihtiyacMap = {};
      for (const row of uretimRows) {
        if (!projeler.includes(row['PROJE_KODU'])) continue;
        const altKod = row['ALT_KOD'];
        if (!altKod) continue;

        if (!ihtiyacMap[altKod]) {
          ihtiyacMap[altKod] = {
            alt_kod: altKod,
            toplam_miktar: 0,
            projelere_cikislar: 0,
            projeler: new Set(),
          };
        }
        ihtiyacMap[altKod].toplam_miktar += Number(row['MIKTAR']) || 0;
        ihtiyacMap[altKod].projelere_cikislar += Number(row['PROJELERE_ÇIKIŞLAR_YENI']) || 0;
        ihtiyacMap[altKod].projeler.add(row['PROJE_KODU']);
      }

      data = Object.values(ihtiyacMap).map(item => {
        const g = globalStok[item.alt_kod] || {};
        // Seçili projeler için: İhtiyaç - Çıkışlar - DepoStok - AçıkSiparişler
        // Not: ÜretimDepo bu formüle dahil değil (Excel ile tutarlı)
        const gercekSatinalma = item.toplam_miktar - item.projelere_cikislar
          - (g.depo_stok || 0) - (g.acik_siparisler || 0);
        const birimFiyat = g.birim_fiyat || 0;

        return {
          alt_kod: item.alt_kod,
          alt_adi: g.alt_adi || '',
          son_satinalma_cari: g.son_satinalma_cari || '',
          toplam_ihtiyac: item.toplam_miktar,
          projelere_cikislar: item.projelere_cikislar,
          depo_stok: g.depo_stok || 0,
          uretim_depo: g.uretim_depo || 0,
          acik_siparisler: g.acik_siparisler || 0,
          toplam_satinalma: Math.max(0, gercekSatinalma),
          birim_fiyat: birimFiyat,
          toplam_maliyet: Math.max(0, gercekSatinalma) * birimFiyat,
          gercek_satinalma: gercekSatinalma,
          alinmasi_gereken_tutar: Math.max(0, gercekSatinalma) * birimFiyat,
          projeler: [...item.projeler],
        };
      });
    }

    // Özet istatistikler
    const alinmasi_gereken_toplam = data.reduce((s, d) => s + d.alinmasi_gereken_tutar, 0);
    const toplam_maliyet = data.reduce((s, d) => s + d.toplam_maliyet, 0);
    const eksik_urun_sayisi = data.filter(d => d.gercek_satinalma > 0).length;

    const result = {
      data,
      toplam: data.length,
      ozet: { alinmasi_gereken_toplam, toplam_maliyet, eksik_urun_sayisi, toplam_urun: data.length }
    };
    if (projeler) result.secili_projeler = projeler;

    res.json(result);
  } catch (err) {
    console.error('Satinalma error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Tüm projeleri getir (Cache/Excel + Database)
router.get('/all-projects', (req, res) => {
  try {
    const db = getDb();
    let sourceProjects = [];
    let dbProjects = [];
    const warnings = [];

    // 1. Önce cache'den, yoksa Excel'den proje kodlarını al
    try {
      const rows = getUretimRows();
      sourceProjects = [...new Set(rows.map(r => r['PROJE_KODU']).filter(Boolean))].sort();
      if (sourceProjects.length === 0) {
        warnings.push('Veri kaynağında proje kodu bulunamadı');
      }
    } catch (e) {
      warnings.push('Veri okuma hatası: ' + e.message);
    }

    // 2. Veritabanından tüm proje adlarını al (project_offers'dan)
    try {
      dbProjects = db.prepare(
        'SELECT DISTINCT project_name FROM project_offers WHERE project_name IS NOT NULL AND project_name != "" ORDER BY project_name'
      ).all().map(r => r.project_name).filter(p => p && !sourceProjects.includes(p));
    } catch (e) {
      warnings.push('Database sorgusu hatası: ' + e.message);
    }

    // 3. Birleştir (cache/Excel projeleri önce, sonra veritabanı projeleri)
    const allProjects = [...sourceProjects, ...dbProjects];
    
    // Eğer veri yoksa fallback projeler döndür
    if (allProjects.length === 0) {
      warnings.push('Sistem projesi otomatik olarak ekleniyor');
      allProjects.push('TEST-PRJ-001', 'TEST-PRJ-002');
    }

    res.json({
      projeler: allProjects,
      sourceCount: sourceProjects.length,
      databaseCount: dbProjects.length,
      toplam: allProjects.length,
      warnings: warnings.length > 0 ? warnings : undefined
    });
  } catch (err) {
    console.error('All projects error:', err);
    res.status(500).json({ 
      error: err.message,
      note: 'Proje listesi alınamadı. Excel ve Database kontrol edin.'
    });
  }
});

// Tedarikçi sipariş PDF oluştur
router.post('/tedarikci-pdf', (req, res) => {
  try {
    const { tedarikci, urunler, projeler } = req.body;
    if (!tedarikci || !urunler || !urunler.length) {
      return res.status(400).json({ error: 'Tedarikçi ve ürün listesi gerekli' });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    const safeFileName = tedarikci.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ ]/g, '').trim();
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeFileName)}_siparis.pdf"`);
    doc.pipe(res);

    // Font (use Helvetica which is built-in, Turkish chars may not render perfectly)
    // Header
    doc.fontSize(16).text('SATIN ALMA SİPARİŞ FORMU', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`Tarih: ${new Date().toLocaleDateString('tr-TR')}`, { align: 'right' });
    doc.moveDown(0.3);
    if (projeler && projeler.length) {
      doc.fontSize(9).fillColor('#666').text(`Projeler: ${projeler.join(', ')}`, { align: 'right' });
    }
    doc.moveDown(0.5);

    // Tedarikçi bilgisi
    doc.fontSize(11).fillColor('#000').text('Tedarikci:', { continued: true }).text(` ${tedarikci}`);
    doc.moveDown(0.8);

    // Tablo başlığı
    const tableTop = doc.y;
    const colX = [40, 140, 340, 410, 490];
    const colWidths = [100, 200, 70, 80, 65];

    doc.fontSize(8).fillColor('#444');
    doc.rect(40, tableTop - 2, 515, 16).fill('#f0f0f0');
    doc.fillColor('#333');
    doc.text('MALZEME KODU', colX[0], tableTop, { width: colWidths[0] });
    doc.text('MALZEME ADI', colX[1], tableTop, { width: colWidths[1] });
    doc.text('ADET', colX[2], tableTop, { width: colWidths[2], align: 'right' });
    doc.text('BİRİM FİYAT', colX[3], tableTop, { width: colWidths[3], align: 'right' });
    doc.text('TUTAR', colX[4], tableTop, { width: colWidths[4], align: 'right' });

    let y = tableTop + 18;
    let toplamTutar = 0;

    doc.fillColor('#000');
    for (const u of urunler) {
      if (y > 760) {
        doc.addPage();
        y = 40;
      }
      const adet = Number(u.adet) || 0;
      const birimFiyat = Number(u.birim_fiyat) || 0;
      const tutar = adet * birimFiyat;
      toplamTutar += tutar;

      doc.fontSize(7);
      doc.text(u.alt_kod || '', colX[0], y, { width: colWidths[0] });
      doc.text(u.alt_adi || '', colX[1], y, { width: colWidths[1] });
      doc.text(adet.toLocaleString('tr-TR'), colX[2], y, { width: colWidths[2], align: 'right' });
      doc.text(birimFiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), colX[3], y, { width: colWidths[3], align: 'right' });
      doc.text(tutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }), colX[4], y, { width: colWidths[4], align: 'right' });

      y += 14;
      doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#eee').stroke();
    }

    // Toplam
    y += 4;
    doc.rect(40, y - 2, 515, 16).fill('#f0f0f0');
    doc.fillColor('#000').fontSize(9);
    doc.text('TOPLAM', colX[0], y, { width: 370, align: 'right' });
    doc.text(toplamTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' TL', colX[4], y, { width: colWidths[4], align: 'right' });

    doc.end();
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.syncFromTIGER3 = syncFromTIGER3;
