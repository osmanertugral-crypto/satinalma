const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../gecici/Ocak 2025-2026 Mart 30.xls');
const OUTPUT_FILE = path.join(__dirname, '../gecici/Ocak 2025-2026 Mart 30 - ANALIZ.xlsx');

// ============ NORMALIZASYON ============
function normalize(str) {
  if (!str) return '';
  return String(str)
    .toUpperCase()
    .replace(/[ŞşİıÖöÜüÇçĞğ]/g, m => ({
      'Ş': 'S', 'ş': 'S',
      'İ': 'I', 'ı': 'I',
      'Ö': 'O', 'ö': 'O',
      'Ü': 'U', 'ü': 'U',
      'Ç': 'C', 'ç': 'C',
      'Ğ': 'G', 'ğ': 'G'
    }[m] || m))
    .trim();
}

// ============ GRUP MAPPING ============
const HAMMADDE_ALT_GRUPLAR = [
  'HIRDAVAT', 'KARAVAN EKIPMAN', 'MEKANIK', '3D-BASKI', 'BEDELSIZ',
  'CADIR', 'DOSEME', 'ELEKTRIK', 'KARAVAN', 'KIMYASAL', 'MOBILYA', 'YEDEK PARCA'
];

const ANA_GRUP_MAP = {
  'HAMMADDE': HAMMADDE_ALT_GRUPLAR.map(g => normalize(g)),
  'E-TICARET': ['E-TICARET', 'ETICARET', 'ETİCARET'],
  'ARGE': ['ARGE', 'AR-GE'],
  'NUMUNE': ['NUMUNE'],
  'MARKETING': ['MARKETING', 'PAZARLAMA']
};

function getAnaGrup(stokGrup) {
  const norm = normalize(stokGrup);
  for (const [anaGrup, altGruplar] of Object.entries(ANA_GRUP_MAP)) {
    if (altGruplar.some(a => normalize(a) === norm)) {
      return anaGrup;
    }
  }
  return normalize(stokGrup) || 'DİĞER';
}

function getAltGrupNormalized(stokGrup) {
  const norm = normalize(stokGrup);
  if (normalize('DOSEME') === norm || normalize('DÖŞEME') === norm) {
    return 'DOSEME';
  }
  return norm || '';
}

// ============ TARİH DÖNÜŞTÜRME ============
function excelSerialToDate(serial) {
  if (!serial || typeof serial !== 'number') return new Date();
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms);
}

// ============ VERİ OKUMA ============
console.log('📖 Okuyuluyor:', INPUT_FILE);
const workbook = XLSX.readFile(INPUT_FILE);
const ws = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

if (rows.length < 2) {
  console.error('❌ Boş dosya!');
  process.exit(1);
}

const data = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const yil = parseInt(r[0]) || 0;
  const ay = parseInt(r[1]) || 0;
  if (yil === 0 || ay === 0) continue;

  const tarih = excelSerialToDate(r[2]);
  const stokKodu = String(r[6]).trim();
  const stokAdi = String(r[7]).trim();
  const stokGrup = String(r[8]).trim();
  const miktar = parseFloat(r[9]) || 0;
  const birim = String(r[10]).trim();
  const iadeMiktar = parseFloat(r[13]) || 0;
  const fiyat = parseFloat(r[14]) || 0;
  const tutar = parseFloat(r[15]) || 0;
  const doviz = String(r[22]).trim() || 'TL';

  data.push({
    yil, ay, tarih, stokKodu, stokAdi, stokGrup, miktar, birim,
    iadeMiktar, fiyat, tutar, doviz,
    anaGrup: getAnaGrup(stokGrup),
    altGrup: getAltGrupNormalized(stokGrup),
    isIade: iadeMiktar > 0
  });
}

console.log(`✅ ${data.length} satır okundu\n`);

// ============ AY-URUN INDEKSI ============
const ayUrunIndex = {}; // {YIL_AY -> {STOK_KODU -> {entries: [], firstPrice, lastPrice}}}

data.forEach(row => {
  const ayKey = `${row.yil}_${String(row.ay).padStart(2, '0')}`;
  if (!ayUrunIndex[ayKey]) ayUrunIndex[ayKey] = {};
  if (!ayUrunIndex[ayKey][row.stokKodu]) {
    ayUrunIndex[ayKey][row.stokKodu] = { entries: [], firstPrice: null, lastPrice: null };
  }
  ayUrunIndex[ayKey][row.stokKodu].entries.push(row);
  if (row.fiyat > 0) {
    if (!ayUrunIndex[ayKey][row.stokKodu].firstPrice) {
      ayUrunIndex[ayKey][row.stokKodu].firstPrice = row.fiyat;
    }
    ayUrunIndex[ayKey][row.stokKodu].lastPrice = row.fiyat;
  }
});

// ============ ÜRÜN FIYAT TARİHÇESİ ============
const urunFiyatTarihcesi = {}; // {STOK_KODU -> [{yil, ay, fiyat, tarih}, ...]}

data.forEach(row => {
  if (!urunFiyatTarihcesi[row.stokKodu]) {
    urunFiyatTarihcesi[row.stokKodu] = [];
  }
  if (row.fiyat > 0) {
    urunFiyatTarihcesi[row.stokKodu].push({
      yil: row.yil,
      ay: row.ay,
      fiyat: row.fiyat,
      tarih: row.tarih
    });
  }
});

// Her ürünün tarihçesini sırala ve duplikat sil (en son fiyat tutulsun)
Object.keys(urunFiyatTarihcesi).forEach(kod => {
  const tarihleme = {};
  urunFiyatTarihcesi[kod].forEach(entry => {
    const key = `${entry.yil}_${entry.ay}`;
    if (!tarihleme[key] || entry.tarih > tarihleme[key].tarih) {
      tarihleme[key] = entry;
    }
  });
  urunFiyatTarihcesi[kod] = Object.values(tarihleme).sort((a, b) => 
    new Date(a.tarih) - new Date(b.tarih)
  );
});

// ============ TÜZEL KÖKLİ ÜRÜN ANALİZİ ============
const urunAnaiz = {}; // {STOK_KODU -> {adet, tutar, alımlar: [{tarih, miktar}], ...}}

data.forEach(row => {
  if (!urunAnaiz[row.stokKodu]) {
    urunAnaiz[row.stokKodu] = {
      kod: row.stokKodu,
      adi: row.stokAdi,
      anaGrup: row.anaGrup,
      altGrup: row.altGrup,
      toplamAdet: 0,
      toplamTutar: 0,
      alimlar: []
    };
  }
  const u = urunAnaiz[row.stokKodu];
  u.toplamAdet += row.miktar;
  u.toplamTutar += row.tutar;
  if (!row.isIade) {
    u.alimlar.push({ tarih: row.tarih, miktar: row.miktar });
  }
});

// ============ AYLAR LİSTESİ ============
const aylar = [];
const aySet = new Set();
for (let y = 2025; y <= 2026; y++) {
  const maxAy = y === 2025 ? 12 : 3;
  for (let m = 1; m <= maxAy; m++) {
    const key = `${y}_${String(m).padStart(2, '0')}`;
    aySet.add(key);
    if (aylar.length < 15) aylar.push({ yil: y, ay: m, key });
  }
}

console.log(`📅 ${aylar.length} ay bulundu: ${aylar.map(a => `${a.yil}/${a.ay}`).join(', ')}\n`);

// ============ EXCEL YAZISI ============
async function generateExcel() {
  const wb = new ExcelJS.Workbook();

  // ============ AY İÇİN SHEET OLUŞTUR ============
  function makeMonthSheet(ay) {
    const sheet = wb.addWorksheet(`${ay.yil}-${String(ay.ay).padStart(2, '0')}`);
    let row = 1;

    // Başlık
    sheet.getCell(row, 1).value = `${ay.yil} YILI ${ay.ay}. AYALIMLAR`;
    row += 2;

    // Normal Alımlar
    sheet.getCell(row, 1).value = 'NORMAL ALIMLAR';
    row++;
    const headers = ['Ana Grup', 'Alt Grup', 'Stok Kodu', 'Ürün Adı', 'Miktar', 'Birim', 'Birim Fiyat', 'Tutar', 'Döviz'];
    headers.forEach((h, idx) => {
      sheet.getCell(row, idx + 1).value = h;
    });
    row++;

    const ayKey = ay.key;
    let normalToplam = 0;
    let gruBazliToplamlar = {};

    const urunlerAy = Object.entries(ayUrunIndex[ayKey] || {});
    urunlerAy.forEach(([kod, veri]) => {
      const normalGirisler = veri.entries.filter(e => !e.isIade);
      if (normalGirisler.length === 0) return;

      const first = normalGirisler[0];
      const topMiktar = normalGirisler.reduce((s, e) => s + e.miktar, 0);
      const topTutar = normalGirisler.reduce((s, e) => s + e.tutar, 0);
      const avgFiyat = topTutar / topMiktar;

      const gruKey = `${first.anaGrup}|${first.altGrup}`;
      if (!gruBazliToplamlar[gruKey]) gruBazliToplamlar[gruKey] = 0;
      gruBazliToplamlar[gruKey] += topTutar;

      sheet.getCell(row, 1).value = first.anaGrup;
      sheet.getCell(row, 2).value = first.altGrup;
      sheet.getCell(row, 3).value = kod;
      sheet.getCell(row, 4).value = first.stokAdi;
      sheet.getCell(row, 5).value = topMiktar;
      sheet.getCell(row, 6).value = first.birim;
      sheet.getCell(row, 7).value = avgFiyat.toFixed(2);
      sheet.getCell(row, 8).value = topTutar.toFixed(2);
      sheet.getCell(row, 9).value = first.doviz;
      normalToplam += topTutar;
      row++;
    });

    // Grup Ara Toplamları
    row++;
    Object.entries(gruBazliToplamlar).forEach(([gru, tutar]) => {
      const [ana, alt] = gru.split('|');
      sheet.getCell(row, 1).value = `${ana} - ${alt} Ara Toplamı`;
      sheet.getCell(row, 8).value = tutar.toFixed(2);
      row++;
    });

    row++;
    sheet.getCell(row, 1).value = 'NORMAL ALIMLARTOPLAM';
    sheet.getCell(row, 8).value = normalToplam.toFixed(2);
    row += 2;

    // İADELER
    sheet.getCell(row, 1).value = 'İADELER';
    row++;
    headers.forEach((h, idx) => {
      sheet.getCell(row, idx + 1).value = h;
    });
    row++;

    let iadeToplam = 0;
    urunlerAy.forEach(([kod, veri]) => {
      const iadeGirisler = veri.entries.filter(e => e.isIade);
      if (iadeGirisler.length === 0) return;

      const first = iadeGirisler[0];
      const topMiktar = iadeGirisler.reduce((s, e) => s + e.iadeMiktar, 0);
      const topTutar = iadeGirisler.reduce((s, e) => s + e.tutar, 0);

      sheet.getCell(row, 1).value = first.anaGrup;
      sheet.getCell(row, 2).value = first.altGrup;
      sheet.getCell(row, 3).value = kod;
      sheet.getCell(row, 4).value = first.stokAdi;
      sheet.getCell(row, 5).value = topMiktar;
      sheet.getCell(row, 6).value = first.birim;
      sheet.getCell(row, 7).value = (topTutar / topMiktar).toFixed(2);
      sheet.getCell(row, 8).value = topTutar.toFixed(2);
      sheet.getCell(row, 9).value = first.doviz;
      iadeToplam += topTutar;
      row++;
    });

    row++;
    sheet.getCell(row, 1).value = 'İADELER TOPLAM';
    sheet.getCell(row, 8).value = iadeToplam.toFixed(2);
    row += 2;

    // NET TOPLAM
    sheet.getCell(row, 1).value = 'NET TOPLAM';
    sheet.getCell(row, 8).value = (normalToplam - iadeToplam).toFixed(2);

    // Sütun genişliğini ayarla
    sheet.columns = [
      { width: 15 }, { width: 18 }, { width: 12 }, { width: 25 },
      { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 10 }
    ];
  }

  // Tüm aylar için sheet yap
  aylar.forEach(ay => makeMonthSheet(ay));

  // ============ GENEL ÖZET SHEET ============
  const ozet = wb.addWorksheet('GENEL OZET');
  let row = 1;

  // Tablo başlıkları
  ozet.getCell(row, 1).value = 'AY';
  const anaGruplar = ['HAMMADDE', 'E-TICARET', 'ARGE', 'NUMUNE', 'MARKETING'];
  anaGruplar.forEach((g, idx) => {
    ozet.getCell(row, idx + 2).value = g;
  });
  ozet.getCell(row, anaGruplar.length + 2).value = 'İADE';
  ozet.getCell(row, anaGruplar.length + 3).value = 'NET TOPLAM';
  row++;

  aylar.forEach(ay => {
    const ayKey = ay.key;
    ozet.getCell(row, 1).value = `${ay.yil}/${String(ay.ay).padStart(2, '0')}`;

    const gruToplamlar = {};
    anaGruplar.forEach(g => gruToplamlar[g] = 0);
    let iadeToplam = 0;

    const urunlerAy = Object.entries(ayUrunIndex[ayKey] || {});
    urunlerAy.forEach(([kod, veri]) => {
      veri.entries.forEach(entry => {
        if (entry.isIade) {
          iadeToplam += entry.tutar;
        } else {
          gruToplamlar[entry.anaGrup] = (gruToplamlar[entry.anaGrup] || 0) + entry.tutar;
        }
      });
    });

    let netToplam = 0;
    anaGruplar.forEach((g, idx) => {
      const val = gruToplamlar[g];
      if (val > 0) ozet.getCell(row, idx + 2).value = val.toFixed(2);
      netToplam += val;
    });

    if (iadeToplam > 0) ozet.getCell(row, anaGruplar.length + 2).value = iadeToplam.toFixed(2);
    ozet.getCell(row, anaGruplar.length + 3).value = (netToplam - iadeToplam).toFixed(2);
    row++;
  });

  // ============ ÜRÜN ANALİZ SHEET ============
  const analiz = wb.addWorksheet('ORUN ANALIZ');
  row = 1;

  // Başlıklar
  const analizHeaders = [
    'Stok Kodu', 'Ürün Adı', 'Ana Grup', 'Alt Grup',
    'Toplam Adet', 'Toplam Tutar', 'Ort. Birim Fiyat',
    'Oca25 Fiyat', 'Kas25 Fiyat', 'Oca25->Kas25 %',
    'Oca26 Fiyat', 'Kas25->Oca26 %',
    'Mar26 Fiyat', 'Oca26->Mar26 %',
    'Ort. Alım Sıklığı (Gün)', 'Ort. Alım Miktarı'
  ];
  analizHeaders.forEach((h, idx) => {
    analiz.getCell(row, idx + 1).value = h;
  });
  row++;

  Object.entries(urunAnaiz).forEach(([kod, urun]) => {
    if (urun.alimlar.length === 0) return;

    // Fiyat tarihi bulma fonksiyonu
    function getFiyatForMonth(yil, ay) {
      const aranacak = urunFiyatTarihcesi[kod] || [];
      // Exact ay bulsa ideal
      const exact = aranacak.find(e => e.yil === yil && e.ay === ay);
      if (exact) return exact.fiyat;
      // Yoksa geriye git
      const oncesi = aranacak.filter(e => 
        new Date(e.tarih) < new Date(yil, ay - 1, 1)
      );
      return oncesi.length > 0 ? oncesi[oncesi.length - 1].fiyat : null;
    }

    const fiyat_oca25 = getFiyatForMonth(2025, 1);
    const fiyat_kas25 = getFiyatForMonth(2025, 11);
    const fiyat_oca26 = getFiyatForMonth(2026, 1);
    const fiyat_mar26 = getFiyatForMonth(2026, 3);

    const artis_oca_kas = fiyat_oca25 && fiyat_kas25
      ? (((fiyat_kas25 - fiyat_oca25) / fiyat_oca25) * 100).toFixed(2)
      : null;
    const artis_kas_oca = fiyat_kas25 && fiyat_oca26
      ? (((fiyat_oca26 - fiyat_kas25) / fiyat_kas25) * 100).toFixed(2)
      : null;
    const artis_oca_mar = fiyat_oca26 && fiyat_mar26
      ? (((fiyat_mar26 - fiyat_oca26) / fiyat_oca26) * 100).toFixed(2)
      : null;

    // Ortalama alım sıklığı
    const alimSiralama = urun.alimlar.sort((a, b) => a.tarih - b.tarih);
    const ilkTarih = alimSiralama[0].tarih;
    const sonTarih = alimSiralama[alimSiralama.length - 1].tarih;
    const gunFarki = (sonTarih - ilkTarih) / (1000 * 60 * 60 * 24);
    const ortAlimSikligi = alimSiralama.length > 1 ? (gunFarki / (alimSiralama.length - 1)).toFixed(2) : 'N/A';
    const ortAlimMiktari = (urun.toplamAdet / urun.alimlar.length).toFixed(2);

    const ortFiyat = (urun.toplamTutar / urun.toplamAdet).toFixed(2);

    analiz.getCell(row, 1).value = kod;
    analiz.getCell(row, 2).value = urun.adi;
    analiz.getCell(row, 3).value = urun.anaGrup;
    analiz.getCell(row, 4).value = urun.altGrup;
    analiz.getCell(row, 5).value = urun.toplamAdet;
    analiz.getCell(row, 6).value = urun.toplamTutar.toFixed(2);
    analiz.getCell(row, 7).value = ortFiyat;
    analiz.getCell(row, 8).value = fiyat_oca25 ? fiyat_oca25.toFixed(2) : '-';
    analiz.getCell(row, 9).value = fiyat_kas25 ? fiyat_kas25.toFixed(2) : '-';
    analiz.getCell(row, 10).value = artis_oca_kas || '-';
    analiz.getCell(row, 11).value = fiyat_oca26 ? fiyat_oca26.toFixed(2) : '-';
    analiz.getCell(row, 12).value = artis_kas_oca || '-';
    analiz.getCell(row, 13).value = fiyat_mar26 ? fiyat_mar26.toFixed(2) : '-';
    analiz.getCell(row, 14).value = artis_oca_mar || '-';
    analiz.getCell(row, 15).value = ortAlimSikligi;
    analiz.getCell(row, 16).value = ortAlimMiktari;
    row++;
  });

  // Sütun genişliğini ayarla
  analiz.columns = [
    { width: 12 }, { width: 25 }, { width: 12 }, { width: 15 },
    { width: 12 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 12 }, { width: 14 }, { width: 12 }, { width: 14 },
    { width: 16 }, { width: 16 }
  ];

  ozet.columns = [
    { width: 12 },
    { width: 15 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 14 }
  ];

  await wb.xlsx.writeFile(OUTPUT_FILE);
  console.log(`✅ Yazıldı: ${OUTPUT_FILE}`);
}

generateExcel().catch(err => {
  console.error('❌ Hata:', err);
  process.exit(1);
});
