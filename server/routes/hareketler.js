const express = require('express');
const { authenticate } = require('../middleware/auth');
const evira = require('../utils/evira');
const { sql } = require('../utils/evira');
const { getDb } = require('../db/schema');

const router = express.Router();
router.use(authenticate);

function buildWhere(params, baslangic, bitis, islem_tipi, stok) {
  let where = 'WHERE 1=1';

  // Tarih filtresi isteğe bağlı — ikisi de gönderilmişse uygula
  if (baslangic && bitis) {
    params.startDate = { type: sql.Date, value: new Date(baslangic) };
    params.endDate   = { type: sql.Date, value: new Date(bitis) };
    where += ' AND CAST(SF.TARIH AS DATE) >= @startDate AND CAST(SF.TARIH AS DATE) <= @endDate';
  }

  if (islem_tipi && islem_tipi !== 'TUMU') {
    const gcdMap = { GIRIS: '0', CIKIS: '1', TRANSFER: '2' };
    if (gcdMap[islem_tipi]) {
      params.islemGcd = { type: sql.VarChar(1), value: gcdMap[islem_tipi] };
      where += ' AND SF.FIS_GCD = @islemGcd';
    }
  }

  if (stok && stok.trim()) {
    params.stok = { type: sql.NVarChar(100), value: `%${stok.trim()}%` };
    where += ` AND (
      SK.STOK_KODU COLLATE Turkish_CI_AI LIKE @stok
      OR SK.STOK_ADI COLLATE Turkish_CI_AI LIKE @stok
      OR (SELECT P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF=SF.PROJE_REF) COLLATE Turkish_CI_AI LIKE @stok
      OR (SELECT P.PROJE_ADI  FROM PROJE P WHERE P.PROJE_REF=SF.PROJE_REF) COLLATE Turkish_CI_AI LIKE @stok
    )`;
  }

  return where;
}

// GET /api/hareketler
router.get('/', async (req, res) => {
  try {
    const { baslangic, bitis, islem_tipi, stok } = req.query;
    const params = {};
    const where  = buildWhere(params, baslangic, bitis, islem_tipi, stok);

    const rows = await evira.query(`
      SELECT TOP 5000
        ISNULL((SELECT P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF=SF.PROJE_REF), '') AS PROJE_KODU,
        ISNULL((SELECT P.PROJE_ADI  FROM PROJE P WHERE P.PROJE_REF=SF.PROJE_REF), '') AS PROJE_ADI,
        CONVERT(VARCHAR(10), SF.TARIH, 120) AS TARIH,
        SF.FIS_NO,
        ISNULL((SELECT A.AMBAR_KODU+','+A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU=SH.AMBAR_KODU), SH.AMBAR_KODU) AS AMBAR_KODU,
        ISNULL((SELECT A.AMBAR_KODU+','+A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU=SH.HEDEF_AMBAR), SH.HEDEF_AMBAR) AS HEDEF_AMBAR,
        ISNULL((SELECT FT.FIS_ADI FROM FISTURLERI FT WHERE FT.FIS_TURU=SF.FIS_TURU), SF.FIS_TURU) AS FIS_TURU,
        CASE SF.FIS_GCD WHEN '0' THEN 'GIRIS' WHEN '1' THEN 'CIKIS' WHEN '2' THEN 'TRANSFER' ELSE 'YOK' END AS ISLEMTIPI,
        SK.STOK_KODU,
        SK.STOK_ADI,
        SUM(SH.MIKTAR) AS MIKTAR,
        ISNULL((SELECT SB.BIRIM FROM STOKBIRIM SB WHERE SB.BIRIM_REF=SH.ANABIRIM_REF), '') AS BIRIM,
        0 AS TOPLAM_TUTAR,
        0 AS BIRIM_FIYAT,
        ISNULL((SELECT K.KULLANICI_ADI+' - '+K.ADI_SOYADI FROM KULLANICI K WHERE K.KULLANICI_REF=SF.KULLANICI_REF), '') AS KULLANICI,
        SH.TAKIP_NO
      FROM STOKKARTI SK
      JOIN STOKHAREKETLERI SH ON SH.STOK_REF = SK.STOK_REF
      JOIN STOKFISLERI SF      ON SF.FB_REF   = SH.FB_REF
      ${where}
      GROUP BY
        SF.PROJE_REF, SF.TARIH, SF.FIS_NO, SH.AMBAR_KODU, SH.HEDEF_AMBAR,
        SF.FIS_TURU, SF.FIS_GCD, SH.FIRMA_REF, SH.ANABIRIM_REF, SF.KULLANICI_REF,
        SH.TAKIP_NO, SH.STOK_REF, SK.STOK_KODU, SK.STOK_ADI,
        SH.PAKET, SH.HEDEF_PAKET, SF.SAAT, SF.SB_REF, SH.SB_REF, SF.BELGE_NO
      ORDER BY SF.TARIH DESC, SF.FIS_NO DESC
    `, params);

    const giris    = rows.filter(r => r.ISLEMTIPI === 'GIRIS').length;
    const cikis    = rows.filter(r => r.ISLEMTIPI === 'CIKIS').length;
    const transfer = rows.filter(r => r.ISLEMTIPI === 'TRANSFER').length;

    res.json({ rows, count: rows.length, giris, cikis, transfer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hareketler/distinct?kolon=PROJE_KODU&baslangic=...&bitis=...
// Dropdown filtreler için tüm tarih aralığındaki benzersiz değerleri döner (limitsiz)
router.get('/distinct', async (req, res) => {
  try {
    const { kolon, baslangic, bitis, islem_tipi } = req.query;
    const ALLOWED = ['PROJE_KODU', 'FIS_TURU', 'ISLEMTIPI', 'AMBAR_KODU', 'HEDEF_AMBAR', 'BIRIM'];
    if (!ALLOWED.includes(kolon)) return res.status(400).json({ error: 'Geçersiz kolon' });

    const params = {};
    const where  = buildWhere(params, baslangic, bitis, islem_tipi, null);

    // Kolon adını tablo prefix'iyle eşleştir
    const KOLON_MAP = {
      PROJE_KODU:  `ISNULL((SELECT P.PROJE_KODU FROM PROJE P WHERE P.PROJE_REF=SF.PROJE_REF), '')`,
      FIS_TURU:    `ISNULL((SELECT FT.FIS_ADI FROM FISTURLERI FT WHERE FT.FIS_TURU=SF.FIS_TURU), SF.FIS_TURU)`,
      ISLEMTIPI:   `CASE SF.FIS_GCD WHEN '0' THEN 'GIRIS' WHEN '1' THEN 'CIKIS' WHEN '2' THEN 'TRANSFER' ELSE 'YOK' END`,
      AMBAR_KODU:  `ISNULL((SELECT A.AMBAR_KODU+','+A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU=SH.AMBAR_KODU), SH.AMBAR_KODU)`,
      HEDEF_AMBAR: `ISNULL((SELECT A.AMBAR_KODU+','+A.AMBAR_ADI FROM AMBAR A WHERE A.AMBAR_KODU=SH.HEDEF_AMBAR), SH.HEDEF_AMBAR)`,
      BIRIM:       `ISNULL((SELECT SB.BIRIM FROM STOKBIRIM SB WHERE SB.BIRIM_REF=SH.ANABIRIM_REF), '')`,
    };

    const expr = KOLON_MAP[kolon];
    if (!expr) return res.status(400).json({ error: 'Geçersiz kolon' });

    const rows = await evira.query(`
      SELECT DISTINCT ${expr} AS VAL
      FROM STOKKARTI SK
      JOIN STOKHAREKETLERI SH ON SH.STOK_REF = SK.STOK_REF
      JOIN STOKFISLERI SF      ON SF.FB_REF   = SH.FB_REF
      ${where}
      ORDER BY VAL
    `, params);

    const values = rows.map(r => r.VAL).filter(v => v !== '');
    res.json({ values });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/hareketler/verilmeyenler?proje_kodu=A,B,C
// BOM'dan henüz çıkış yapılmamış kalemleri döner (malzeme_ihtiyac_cache)
router.get('/verilmeyenler', (req, res) => {
  try {
    const db = getDb();
    const { proje_kodu } = req.query;

    let rows;
    if (proje_kodu && proje_kodu.trim()) {
      const kodlar = proje_kodu.split(',').map(s => s.trim()).filter(Boolean);
      const ph = kodlar.map(() => '?').join(',');
      rows = db.prepare(`
        SELECT proje_kodu AS PROJE_KODU, alt_kod AS STOK_KODU, alt_adi AS STOK_ADI,
               miktar AS MIKTAR_GEREKLI, projelere_cikislar AS VERILEN,
               (miktar - projelere_cikislar) AS KALAN,
               birim AS BIRIM, birim_fiyatlar AS BIRIM_FIYAT
        FROM malzeme_ihtiyac_cache
        WHERE proje_kodu IN (${ph}) AND miktar > projelere_cikislar
        ORDER BY proje_kodu, alt_adi
      `).all(...kodlar);
    } else {
      rows = db.prepare(`
        SELECT proje_kodu AS PROJE_KODU, alt_kod AS STOK_KODU, alt_adi AS STOK_ADI,
               miktar AS MIKTAR_GEREKLI, projelere_cikislar AS VERILEN,
               (miktar - projelere_cikislar) AS KALAN,
               birim AS BIRIM, birim_fiyatlar AS BIRIM_FIYAT
        FROM malzeme_ihtiyac_cache
        WHERE miktar > projelere_cikislar
        ORDER BY proje_kodu, alt_adi
      `).all();
    }

    res.json({ rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
