'use strict';

const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');

const INPUT_FILE  = path.join(__dirname, '..', 'gecici', 'Ocak 2025-2026 Mart 30.xls');
const OUTPUT_FILE = path.join(__dirname, '..', 'gecici', 'Urun Fiyat Analiz.xlsx');

const TODAY = new Date(2026, 2, 30); // 30 Mart 2026

// ── Türkçe karakter normalizer ──────────────────────────────────────────────
function norm(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/İ/g,'I').replace(/ı/g,'I')
    .replace(/Ş/g,'S').replace(/ş/g,'S')
    .replace(/Ğ/g,'G').replace(/ğ/g,'G')
    .replace(/Ü/g,'U').replace(/ü/g,'U')
    .replace(/Ö/g,'O').replace(/ö/g,'O')
    .replace(/Ç/g,'C').replace(/ç/g,'C')
    .trim();
}

// ── Ana grup mapping ─────────────────────────────────────────────────────────
const HM = new Set([
  'HIRDAVAT','KARAVAN EKIPMAN','MEKANIK','3D-BASKI','BEDELSIZ',
  'CADIR','DOSEME','ELEKTRIK','KARAVAN','KIMYASAL','MOBILYA','YEDEK PARCA'
]);
function getAnaGrup(rawGrup) {
  const g = norm(rawGrup);
  if (!g) return 'DIGER';
  if (g === 'HAMMADDE' || HM.has(g)) return 'HAMMADDE';
  if (g === 'ETICARET' || g === 'E-TICARET') return 'E-TICARET';
  if (g === 'ARGE' || g === 'AR-GE') return 'ARGE';
  if (g === 'NUMUNE') return 'NUMUNE';
  if (g === 'MARKETING') return 'MARKETING';
  if (g === 'UYKU KAPSULU') return 'UYKU KAPSULU';
  if (g === 'KABIN') return 'KABIN';
  return 'DIGER';
}

// Ana grup sıralama önceliği
const GRUP_ORDER = ['HAMMADDE','E-TICARET','ARGE','NUMUNE','MARKETING','UYKU KAPSULU','KABIN','DIGER'];

function serialToDate(s) {
  if (!s || typeof s !== 'number') return null;
  return new Date(Math.round((s - 25569) * 86400000));
}

function fmtDate(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

function pctChange(newVal, oldVal) {
  if (!oldVal || oldVal === 0) return null;
  return (newVal - oldVal) / oldVal * 100;
}

// ── Veriyi oku ───────────────────────────────────────────────────────────────
console.log('Okunuyor:', INPUT_FILE);
const wb   = XLSX.readFile(INPUT_FILE);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
console.log(`${rows.length - 1} veri satiri okundu`);

// ── Ürün haritası oluştur ────────────────────────────────────────────────────
// Sadece iade olmayan satırlar (IADE_MIKTAR === 0) alımlara eklenir
const products = {};

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const yil = +r[0];
  const ay  = +r[1];
  if (!yil || !ay) continue;

  const stokKodu = String(r[5] || '').trim();
  if (!stokKodu) continue;

  const miktar       = +r[8]  || 0;
  const iadeMiktar   = +r[12] || 0;
  const fiyat        = +r[13] || 0;  // orijinal birim fiyat
  const faturaTutar  = +r[16] || 0;  // TL toplam (Q sütunu)
  const tutar        = +r[14] || 0;  // TUTAR = FIYAT × MIKTAR (sipariş para birimi)
  const tarihSerial  = +r[2]  || 0;
  const tarih        = serialToDate(tarihSerial) || new Date(yil, ay - 1, 1);
  const doviz        = String(r[19] || 'TL').trim();

  if (!products[stokKodu]) {
    products[stokKodu] = {
      kod:     stokKodu,
      adi:     String(r[6] || '').trim(),
      altGrup: norm(String(r[7] || '')),
      anaGrup: getAnaGrup(String(r[7] || '')),
      doviz,
      alimlar: [],
    };
  }

  // Normal alım (iade değil)
  // tlBirim: TUTAR/MIKTAR = FIYAT (her zaman sipariş TL değeri; FATURA_TUTAR farklı olabilir)
  if (iadeMiktar === 0 && miktar > 0 && fiyat > 0) {
    const tlBirim = fiyat; // FIYAT = TUTAR/MIKTAR (TL sipariş birim fiyatı)
    products[stokKodu].alimlar.push({ tarih, yil, ay, miktar, fiyat, tlBirim, tutar, doviz });
  }
}

// ── Her ürün için analitik hesapla ───────────────────────────────────────────
function lastPriceInMonths(alimlar, monthCandidates) {
  // monthCandidates: [{yil, ay}] - en güncel/tercihli önce
  for (const { yil, ay } of monthCandidates) {
    const ayAl = alimlar.filter(a => a.yil === yil && a.ay === ay);
    if (ayAl.length > 0) {
      const last = ayAl[ayAl.length - 1];
      return { tlBirim: last.tlBirim, yil, ay, label: `${yil}-${String(ay).padStart(2,'0')}` };
    }
  }
  return null;
}

const analyzed = Object.values(products)
  .filter(p => p.alimlar.length > 0)
  .map(p => {
    const al = [...p.alimlar].sort((a, b) => a.tarih - b.tarih);

    const toplamAdet  = al.reduce((s, a) => s + a.miktar, 0);
    const toplamTutar = al.reduce((s, a) => s + a.tutar, 0);   // TUTAR toplamı (FATURA_TUTAR değil)
    const ortFiyat    = toplamAdet > 0 ? toplamTutar / toplamAdet : 0;

    const ilk = al[0];
    const son = al[al.length - 1];

    // Ekim/Kasım/Aralık 2025 - hangisinde alım varsa en yenisi
    const ekaRef = lastPriceInMonths(al, [
      { yil: 2025, ay: 12 },
      { yil: 2025, ay: 11 },
      { yil: 2025, ay: 10 },
    ]);

    // Ocak 2026
    const oca2026 = lastPriceInMonths(al, [{ yil: 2026, ay: 1 }]);

    // Artış 1: İlk → Eki/Kas/Ara 2025
    const artis1 = ekaRef ? pctChange(ekaRef.tlBirim, ilk.tlBirim) : null;

    // Artış 2: Eki/Kas/Ara 2025 → Oca 2026
    const refForOca  = ekaRef ? ekaRef.tlBirim : ilk.tlBirim;
    const artis2     = oca2026 ? pctChange(oca2026.tlBirim, refForOca) : null;

    // Son alım artışı: yalnızca son alım Ocak 2026'dan SONRA ise
    const sonSonrasiOca = son.yil > 2026 || (son.yil === 2026 && son.ay > 1);
    const refForSon     = oca2026 ? oca2026.tlBirim : refForOca;
    const artis3        = sonSonrasiOca ? pctChange(son.tlBirim, refForSon) : null;

    // Ortalama alım sıklığı (gün)
    let siklik = null;
    if (al.length >= 2) {
      const gunFark = (son.tarih - ilk.tarih) / 86400000;
      siklik = Math.round(gunFark / (al.length - 1));
    }

    // Son alımdan bugüne gün
    const gunlerdenBeri = Math.round((TODAY - son.tarih) / 86400000);

    return {
      anaGrup: p.anaGrup,
      altGrup: p.altGrup,
      kod:     p.kod,
      adi:     p.adi,
      doviz:   p.doviz,
      toplamAdet,
      ortFiyat,
      ilkTarih:     ilk.tarih,
      ilkFiyat:     ilk.tlBirim,
      ekaRef,
      artis1,
      oca2026,
      artis2,
      sonTarih:    son.tarih,
      sonFiyat:    son.tlBirim,
      artis3,
      siklik,
      alimSayisi:  al.length,
      gunlerdenBeri,
    };
  })
  .sort((a, b) => {
    const ao = GRUP_ORDER.indexOf(a.anaGrup);
    const bo = GRUP_ORDER.indexOf(b.anaGrup);
    if (ao !== bo) return ao - bo;
    if (a.altGrup < b.altGrup) return -1;
    if (a.altGrup > b.altGrup) return 1;
    return a.adi.localeCompare(b.adi);
  });

console.log(`${analyzed.length} urun analiz edildi`);

// ── Renk yardımcıları ─────────────────────────────────────────────────────────
function artisRenk(pctVal) {
  // pctVal: number (%)
  if (pctVal === null || pctVal === undefined) return null;
  if (pctVal < 0)   return { bg: null, font: 'FF00B050' };   // yeşil
  if (pctVal < 10)  return { bg: null, font: 'FF886600' };   // koyu sarı
  if (pctVal < 25)  return { bg: null, font: 'FFCC4400' };   // turuncu
  return              { bg: 'FFFFE0E0', font: 'FFCC0000' };   // kırmızı
}

function gunRenk(gun) {
  if (gun > 180) return { bg: 'FFFF4444', font: 'FFFFFFFF' }; // kırmızı: 6 ay+
  if (gun > 90)  return { bg: 'FFFF9900', font: 'FFFFFFFF' }; // turuncu: 3-6 ay
  if (gun > 60)  return { bg: 'FFFFC000', font: 'FF333333' }; // sarı: 2-3 ay
  return null;
}

// ── Excel yaz ────────────────────────────────────────────────────────────────
async function writeExcel() {
  const owb  = new ExcelJS.Workbook();
  owb.creator  = 'Satin Alma Analiz';
  owb.created  = new Date();

  const sheet = owb.addWorksheet('URUN FIYAT ANALIZ', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 4 }],
    properties: { defaultRowHeight: 17 },
  });

  // Sütun tanımları
  sheet.columns = [
    { header: 'ANA GRUP',              width: 14 },  // 1
    { header: 'ALT GRUP',              width: 18 },  // 2
    { header: 'STOK KODU',             width: 14 },  // 3
    { header: 'URUN ADI',              width: 32 },  // 4
    { header: 'TOPLAM ADET',           width: 12 },  // 5
    { header: 'TL ORT BIRIM FIYAT',    width: 17 },  // 6
    { header: 'ILK ALIM TARIHI',       width: 14 },  // 7
    { header: 'ILK TL BIRIM FIYAT',    width: 16 },  // 8
    { header: 'EKI/KAS/ARA AYIN',      width: 16 },  // 9
    { header: 'EKI/KAS/ARA FIYATI',    width: 17 },  // 10
    { header: 'ILK → EKA ARTIS %',     width: 16 },  // 11
    { header: 'OCA 2026 FIYATI',       width: 15 },  // 12
    { header: 'EKA → OCA26 ARTIS %',   width: 18 },  // 13
    { header: 'SON ALIM TARIHI',        width: 14 },  // 14
    { header: 'SON ALIM TL FIYATI',    width: 16 },  // 15
    { header: 'OCA26 → SON ARTIS %',   width: 18 },  // 16
    { header: 'ORT ALIM SIKLIGI (GUN)',width: 21 },  // 17
    { header: 'ALIM SAYISI',           width: 12 },  // 18
    { header: 'SON ALIMDAN (GUN)',      width: 16 },  // 19
  ];

  // ── Başlık satırı stili ──────────────────────────────────────────────────
  const hdr = sheet.getRow(1);
  hdr.height = 32;
  for (let c = 1; c <= 19; c++) {
    const cell = hdr.getCell(c);
    cell.fill        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.font        = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment   = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border      = { bottom: { style: 'medium', color: { argb: 'FF4472C4' } } };
  }

  // AutoFilter
  sheet.autoFilter = { from: 'A1', to: 'S1' };

  // ── Veri satırları ────────────────────────────────────────────────────────
  const BG_EVEN     = 'FFD6E4F0'; // açık mavi
  const BG_ODD      = 'FFFCFCFC'; // neredeyse beyaz
  const BG_GRUP_HDR = 'FF2E75B6'; // koyu mavi grup başlığı
  const BG_GRUP2    = 'FF70AD47'; // yeşil: E-TİCARET
  const BG_GRUP3    = 'FFE2691E'; // turuncu: ARGE
  const BG_GRUP4    = 'FFED7D31'; // sarı-turuncu: NUMUNE
  const BG_GRUP5    = 'FF7030A0'; // mor: MARKETING
  const BG_GRUP6    = 'FF00B0F0'; // cyan: UYKU KAPSULU
  const BG_GRUP7    = 'FF00B050'; // yeşil: KABİN
  const BG_GRUPDIGER= 'FF808080'; // gri: DİĞER

  const grupColors = {
    'HAMMADDE':    'FF1F4E79',
    'E-TICARET':   'FF375623',
    'ARGE':        'FF843C0C',
    'NUMUNE':      'FF7F4B1F',
    'MARKETING':   'FF3A1459',
    'UYKU KAPSULU':'FF004E6B',
    'KABIN':       'FF1E5E3A',
    'DIGER':       'FF3D3D3D',
  };

  let prevAnaGrup = null;
  let dataRowIdx  = 2; // Excel satır numarası (1=header)

  for (const p of analyzed) {
    // ── Ana grup başlık satırı ──────────────────────────────────────────────
    if (p.anaGrup !== prevAnaGrup) {
      const gRow = sheet.addRow(Array(19).fill(''));
      const gNum  = gRow.number;
      const bgFg  = grupColors[p.anaGrup] || BG_GRUPDIGER;

      for (let c = 1; c <= 19; c++) {
        const cell = gRow.getCell(c);
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFg } };
        cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
      sheet.mergeCells(`A${gNum}:S${gNum}`);
      sheet.getCell(`A${gNum}`).value = `▶  ${p.anaGrup}`;
      gRow.height = 22;

      prevAnaGrup = p.anaGrup;
      dataRowIdx++;
    }

    // ── Veri satırı ────────────────────────────────────────────────────────
    const bg = dataRowIdx % 2 === 0 ? BG_EVEN : BG_ODD;

    const row = sheet.addRow([
      p.anaGrup,
      p.altGrup,
      p.kod,
      p.adi,
      p.toplamAdet,
      p.ortFiyat        || null,
      p.ilkTarih,                               // col 7 = G
      p.ilkFiyat        || null,                 // col 8 = H
      p.ekaRef          ? p.ekaRef.label : '-',  // col 9 = I
      p.ekaRef          ? p.ekaRef.tlBirim : null, // col 10 = J
      null,                                      // col 11 = K  (formul ile doldurulacak)
      p.oca2026         ? p.oca2026.tlBirim : null, // col 12 = L
      null,                                      // col 13 = M  (formul ile doldurulacak)
      p.sonTarih,                                // col 14 = N
      p.sonFiyat        || null,                 // col 15 = O
      null,                                      // col 16 = P  (formul ile doldurulacak)
      p.siklik          !== null ? p.siklik : null, // col 17 = Q
      p.alimSayisi,                              // col 18 = R
      null,                                      // col 19 = S  (TODAY()-N formul)
    ]);

    row.height = 17;

    // Temel stil
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.alignment = { vertical: 'middle', horizontal: col <= 4 ? 'left' : 'center' };
      cell.font      = { size: 9 };
    });

    // Tarih formatı
    const tarihCell7 = row.getCell(7);
    tarihCell7.value      = p.ilkTarih;
    tarihCell7.numFmt     = 'DD.MM.YYYY';
    const tarihCell14 = row.getCell(14);
    tarihCell14.value     = p.sonTarih;
    tarihCell14.numFmt    = 'DD.MM.YYYY';

    // Sayısal format
    row.getCell(5).numFmt  = '#,##0.00';
    row.getCell(6).numFmt  = '#,##0.00 ₺';
    row.getCell(8).numFmt  = '#,##0.00 ₺';
    row.getCell(10).numFmt = '#,##0.00 ₺';
    row.getCell(12).numFmt = '#,##0.00 ₺';
    row.getCell(15).numFmt = '#,##0.00 ₺';
    row.getCell(17).numFmt = '#,##0';
    row.getCell(18).numFmt = '#,##0';
    row.getCell(19).numFmt = '#,##0';

    // Excel FORMULÜ % sütunları (H=col8=ILK, J=col10=EKA, L=col12=OCA26, O=col15=SON)
    const rn = row.number;
    const H = `H${rn}`, J = `J${rn}`, L = `L${rn}`, O_ = `O${rn}`, N_ = `N${rn}`;

    // K: ILK → EKA % =IF(AND(H>0,J>0),(J-H)/H,"")
    const kCell = row.getCell(11);
    kCell.value   = { formula: `IF(AND(${H}>0,${J}>0),(${J}-${H})/${H},"")`, result: p.artis1 !== null ? p.artis1/100 : '' };
    kCell.numFmt  = '+0.0%;-0.0%;0.0%';

    // M: EKA → OCA26 % =IF(AND(J>0,L>0),(L-J)/J, IF(AND(H>0,L>0),(L-H)/H,""))
    const mCell = row.getCell(13);
    mCell.value   = { formula: `IF(AND(${J}>0,${L}>0),(${L}-${J})/${J},IF(AND(${H}>0,${L}>0),(${L}-${H})/${H},""))`, result: p.artis2 !== null ? p.artis2/100 : '' };
    mCell.numFmt  = '+0.0%;-0.0%;0.0%';

    // P: OCA26 → SON % =IF(AND(L>0,O>0),(O-L)/L,"")
    const pCell = row.getCell(16);
    pCell.value   = { formula: `IF(AND(${L}>0,${O_}>0),(${O_}-${L})/${L},"")`, result: p.artis3 !== null ? p.artis3/100 : '' };
    pCell.numFmt  = '+0.0%;-0.0%;0.0%';

    // S: SON ALIMDAN (GUN) - dinamik formul =IF(N>0,TODAY()-N,"")
    const sCell = row.getCell(19);
    sCell.value   = { formula: `IF(${N_}>0,TODAY()-${N_},"")`, result: p.gunlerdenBeri };
    sCell.numFmt  = '#,##0';

    // Artış renklendirmesi (result değerine göre)
    for (const [cell, rawPct] of [[kCell, p.artis1],[mCell, p.artis2],[pCell, p.artis3]]) {
      if (rawPct !== null) {
        const rk = artisRenk(rawPct);
        if (rk) {
          if (rk.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rk.bg } };
          cell.font = { bold: true, color: { argb: rk.font }, size: 9 };
        }
      }
    }

    // Son alımdan (gün) renklendirme
    const gRenk = gunRenk(p.gunlerdenBeri);
    if (gRenk) {
      sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gRenk.bg } };
      sCell.font = { bold: true, color: { argb: gRenk.font }, size: 9 };
    }

    dataRowIdx++;
  }

  // ── Renk açıklama notu ────────────────────────────────────────────────────
  const legendSheet = owb.addWorksheet('RENK ACIKLAMASI');
  legendSheet.columns = [{ header: 'TANIM', width: 35 }, { header: 'ANLAM', width: 45 }];
  const legendHdr = legendSheet.getRow(1);
  legendHdr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  legendHdr.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  legendHdr.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  legendHdr.getCell(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  const legends = [
    ['ARTIS % - Yeşil renk',          'Fiyat düşmüş'],
    ['ARTIS % - Koyu sarı renk',      '%0-%10 arasında artış'],
    ['ARTIS % - Turuncu renk',        '%10-%25 arasında artış'],
    ['ARTIS % - Kırmızı renk',        '%25 üzeri artış'],
    ['SON ALIMDAN - Sarı arka plan',  '60-90 gün önce (2-3 ay)'],
    ['SON ALIMDAN - Turuncu arka plan','90-180 gün önce (3-6 ay)'],
    ['SON ALIMDAN - Kırmızı arka plan','180 gün üzeri (6 ay+) - KONTROL ET!'],
    ['EKI/KAS/ARA AYININ sütunu',     'Ekim/Kasım/Aralık 2025 içinde alım yapılan en son ay'],
    ['TL BIRIM FIYAT',                'FATURA_TUTAR / MIKTAR (kur dahil TL karşılığı)'],
    ['ORT ALIM SIKLIGI',              'Alımlar arası ortalama gün sayısı'],
  ];

  legends.forEach(([tanim, anlam], i) => {
    const r = legendSheet.addRow([tanim, anlam]);
    r.getCell(1).font = { size: 10 };
    r.getCell(2).font = { size: 10 };
    if (i % 2 === 0) {
      r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; });
    }
  });

  await owb.xlsx.writeFile(OUTPUT_FILE);
  console.log(`\nYAZILDI: ${OUTPUT_FILE}`);
  console.log(`Toplam urun: ${analyzed.length}`);
  console.log(`Satir sayisi: ${dataRowIdx}`);
}

writeExcel().catch(err => {
  console.error('HATA:', err.message, err.stack);
  process.exit(1);
});
