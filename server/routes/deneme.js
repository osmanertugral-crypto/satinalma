const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../db/schema');
const evira = require('../utils/evira');
const { sql } = require('../utils/evira');

const router = express.Router();
router.use(authenticate);

// GET /api/deneme/projeler — malzeme_ihtiyac_cache'ten proje listesi + özet istatistikler
router.get('/projeler', (req, res) => {
  try {
    const db = getDb();
    const projeler = db.prepare(`
      SELECT
        proje_kodu,
        karavan_adi,
        COUNT(*)                                                              AS malzeme_sayisi,
        SUM(CASE WHEN satinalma > 0 THEN 1 ELSE 0 END)                       AS satinalma_gereken,
        SUM(CASE WHEN acik_satinalma_siparisleri > 0
                  AND satinalma <= 0               THEN 1 ELSE 0 END)        AS siparis_bekleyen,
        SUM(CASE WHEN projelere_cikislar >= miktar  THEN 1 ELSE 0 END)       AS cikis_tamamlanan,
        COALESCE(SUM(satinalma * birim_fiyatlar), 0)                         AS satinalma_tutar,
        COALESCE(SUM(tutar), 0)                                              AS toplam_tutar,
        MAX(synced_at)                                                       AS synced_at
      FROM malzeme_ihtiyac_cache
      WHERE proje_kodu IS NOT NULL AND proje_kodu != ''
      GROUP BY proje_kodu, karavan_adi
      ORDER BY
        SUM(CASE WHEN satinalma > 0 THEN 1 ELSE 0 END) DESC,
        proje_kodu
    `).all();

    res.json({ projeler });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deneme/bom/:kod — proje BOM listesi (Gebze stoğu ile)
router.get('/bom/:kod', (req, res) => {
  try {
    const db = getDb();
    const { kod } = req.params;

    const bom = db.prepare(`
      SELECT
        m.*,
        COALESCE(w.gebze_stok, 0) AS gebze_stok
      FROM malzeme_ihtiyac_cache m
      LEFT JOIN warehouse_stock w ON w.stok_kodu = m.alt_kod
      WHERE m.proje_kodu = ?
      ORDER BY m.alt_stok_grup_kodu, m.alt_adi
    `).all(kod);

    const stats = {
      toplam:             bom.length,
      satinalma_gereken:  bom.filter(r => Number(r.satinalma) > 0).length,
      siparis_bekleyen:   bom.filter(r => Number(r.acik_satinalma_siparisleri) > 0 && Number(r.satinalma) <= 0).length,
      cikis_tamamlanan:   bom.filter(r => Number(r.projelere_cikislar) >= Number(r.miktar) && Number(r.miktar) > 0).length,
      yeterli:            bom.filter(r => Number(r.satinalma) <= 0 && Number(r.acik_satinalma_siparisleri) <= 0 && Number(r.projelere_cikislar) < Number(r.miktar)).length,
      satinalma_tutar:    bom.reduce((s, r) => s + (Number(r.satinalma) * Number(r.birim_fiyatlar) || 0), 0),
      toplam_tutar:       bom.reduce((s, r) => s + (Number(r.tutar) || 0), 0),
    };

    res.json({ bom, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deneme/hareketler/:kod — EVIRA'dan canlı proje hareketleri
router.get('/hareketler/:kod', async (req, res) => {
  try {
    const { kod } = req.params;

    const rows = await evira.query(`
      SELECT TOP 1000
        CONVERT(VARCHAR(10), SF.TARIH, 120) AS TARIH,
        SF.FIS_NO,
        ISNULL(
          (SELECT A.AMBAR_KODU + ' - ' + A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU = SH.AMBAR_KODU),
          SH.AMBAR_KODU
        ) AS AMBAR,
        ISNULL(
          (SELECT A.AMBAR_KODU + ' - ' + A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU = SH.HEDEF_AMBAR),
          SH.HEDEF_AMBAR
        ) AS HEDEF_AMBAR,
        ISNULL(
          (SELECT FT.FIS_ADI FROM FISTURLERI FT WHERE FT.FIS_TURU = SF.FIS_TURU),
          SF.FIS_TURU
        ) AS FIS_TURU,
        CASE SF.FIS_GCD
          WHEN '0' THEN 'GIRIS'
          WHEN '1' THEN 'CIKIS'
          WHEN '2' THEN 'TRANSFER'
          ELSE 'YOK'
        END AS ISLEMTIPI,
        SK.STOK_KODU,
        SK.STOK_ADI,
        SUM(SH.MIKTAR) AS MIKTAR,
        ISNULL((SELECT SB.BIRIM FROM STOKBIRIM SB WHERE SB.BIRIM_REF = SH.ANABIRIM_REF), '') AS BIRIM,
        ROUND(
          CASE WHEN SUM(SH.MIKTAR) <> 0
            THEN SUM(SH.MIKTAR * SH.BIRIM_FIYAT) / SUM(SH.MIKTAR)
            ELSE 0
          END, 4
        ) AS BIRIM_FIYAT,
        SH.TAKIP_NO
      FROM STOKKARTI SK
      JOIN STOKHAREKETLERI SH ON SH.STOK_REF = SK.STOK_REF
      JOIN STOKFISLERI SF     ON SF.FB_REF   = SH.FB_REF
      WHERE (
        SELECT TOP 1 P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF = SF.PROJE_REF
      ) = @projeKodu
      GROUP BY
        SF.PROJE_REF, SF.TARIH, SF.FIS_NO, SH.AMBAR_KODU, SH.HEDEF_AMBAR,
        SF.FIS_TURU, SF.FIS_GCD, SH.FIRMA_REF, SH.ANABIRIM_REF, SF.KULLANICI_REF,
        SH.TAKIP_NO, SH.STOK_REF, SK.STOK_KODU, SK.STOK_ADI,
        SH.PAKET, SH.HEDEF_PAKET, SF.SAAT, SF.SB_REF, SH.SB_REF, SF.BELGE_NO
      ORDER BY SF.TARIH DESC, SF.FIS_NO DESC
    `, {
      projeKodu: { type: sql.NVarChar(50), value: kod },
    });

    res.json({ rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deneme/toplu?projeler=A,B,C — tüm (veya seçili) projeler bazında toplu ihtiyaç analizi
// Gebze stoğu bir kez (paylaşılan kaynak olarak) düşülür; diğer alanlar toplanır.
router.get('/toplu', (req, res) => {
  try {
    const db = getDb();
    const { projeler } = req.query;
    const projeList = projeler
      ? projeler.split(',').map(p => p.trim()).filter(Boolean)
      : [];

    const whereClause = projeList.length > 0
      ? `WHERE m.proje_kodu IN (${projeList.map(() => '?').join(',')})`
      : `WHERE m.proje_kodu IS NOT NULL AND m.proje_kodu != ''`;

    const rows = db.prepare(`
      SELECT
        m.alt_kod,
        m.alt_adi,
        m.birim,
        m.alt_stok_grup_kodu,
        m.alt_kod_tur,
        GROUP_CONCAT(DISTINCT m.proje_kodu)       AS proje_listesi,
        COUNT(DISTINCT m.proje_kodu)              AS proje_sayisi,
        SUM(m.miktar)                             AS toplam_miktar,
        SUM(m.projelere_cikislar)                 AS toplam_cikis,
        MAX(m.uretim_depo)                        AS max_uretim_depo,
        MAX(m.acik_satinalma_siparisleri)         AS max_acik_siparis,
        COALESCE(MAX(w.gebze_stok), 0)            AS gebze_stok,
        MAX(m.birim_fiyatlar)                     AS birim_fiyat,
        MAX(m.son_satinalma_cari)                 AS son_satinalma_cari
      FROM malzeme_ihtiyac_cache m
      LEFT JOIN warehouse_stock w ON w.stok_kodu = m.alt_kod
      ${whereClause}
      GROUP BY m.alt_kod, m.alt_adi, m.birim, m.alt_stok_grup_kodu, m.alt_kod_tur
      ORDER BY m.alt_stok_grup_kodu, m.alt_adi
    `).all(...projeList);

    /*
      Hesaplama mantığı:
        toplam_miktar   = seçili projeler için BOM toplamı (SUM — doğru)
        toplam_cikis    = projelere yapılan toplam çıkış   (SUM — doğru)
        gebze_stok      = Gebze ambarındaki fiziksel stok  (MAX — paylaşılan kaynak, bir kez sayılır)
        max_uretim_depo = Üretim deposundaki fiziksel stok (MAX — Tiger3 her proje satırında
                          aynı global değeri tekrar eder; SUM alınırsa proje sayısıyla çarpılır)
        max_acik_siparis= Açık satınalma siparişi         (MAX — aynı gerekçe)

      net_satinalma = MAX(0, toplam_miktar - toplam_cikis - gebze - uretim - acik_siparis)
    */
    const result = rows.map(r => {
      const toplam_miktar  = Number(r.toplam_miktar   || 0);
      const toplam_cikis   = Number(r.toplam_cikis    || 0);
      const uretim_depo    = Number(r.max_uretim_depo || 0);
      const acik_siparis   = Number(r.max_acik_siparis|| 0);
      const gebze_stok     = Number(r.gebze_stok      || 0);
      const birim_fiyat    = Number(r.birim_fiyat     || 0);

      const net_satinalma = Math.max(
        0,
        toplam_miktar - toplam_cikis - gebze_stok - uretim_depo - acik_siparis
      );
      const net_tutar = net_satinalma * birim_fiyat;

      return { ...r, uretim_depo, acik_siparis, net_satinalma, net_tutar };
    });

    const stats = {
      toplam_kalem:           result.length,
      satinalma_gereken:      result.filter(r => r.net_satinalma > 0).length,
      siparis_bekleyen:       result.filter(r => r.acik_siparis > 0 && r.net_satinalma <= 0).length,
      toplam_satinalma_tutar: result.reduce((s, r) => s + r.net_tutar, 0),
      toplam_bom_tutar:       result.reduce((s, r) => s + (Number(r.toplam_miktar) * Number(r.birim_fiyat || 0)), 0),
    };

    res.json({ rows: result, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deneme/evira-stok/:stokKodu — Belirli stok için tüm ambar stokları (EVIRA cache)
router.get('/evira-stok/:stokKodu', (req, res) => {
  try {
    const db = getDb();
    const { stokKodu } = req.params;
    const rows = db.prepare(`
      SELECT ambar_kodu, ambar_adi, stok_kodu, stok_adi, birim, miktar
      FROM evira_stock_cache
      WHERE stok_kodu = ?
      ORDER BY ambar_kodu
    `).all(stokKodu);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
