const ExcelJS = require('exceljs');
const path = require('path');

const FILE = path.join(__dirname, '../gecici/Ocak 2025-2026 Mart 30 - ANALIZ.xlsx');

async function verify() {
  console.log('\n🔍 Excel Dosyası İçeriği Verifikasyonu\n');
  
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  
  console.log(`📊 Toplam Sheet Sayısı: ${wb.worksheets.length}`);
  console.log(`\n📋 Sheet İsimleri:`);
  wb.worksheets.forEach((ws, idx) => {
    console.log(`  ${idx + 1}. ${ws.name} (${ws.rowCount} satır)`);
  });

  // GENEL OZET kontrol
  const ozet = wb.getWorksheet('GENEL OZET');
  if (ozet) {
    console.log(`\n✅ GENEL OZET Sheet:`);
    console.log(`   Satırlar: ${ozet.rowCount}`);
    
    // İlk satır başlıkları
    console.log(`   Başlıklar:`);
    for (let col = 1; col <= 9; col++) {
      const val = ozet.getCell(1, col).value;
      if (val) console.log(`     Sütun ${col}: ${val}`);
    }
    
    // İlk 3 veri satırı örneği
    console.log(`\n   Örnek Veri (İlk 3 Ay):`);
    for (let r = 2; r <= 4 && r <= ozet.rowCount; r++) {
      const ay = ozet.getCell(r, 1).value;
      const hammadde = ozet.getCell(r, 2).value;
      const netToplam = ozet.getCell(r, 8).value;
      console.log(`     ${ay}: HAMMADDE=${hammadde}, NET=${netToplam}`);
    }
  }

  // URUN ANALIZ kontrol
  const analiz = wb.getWorksheet('ORUN ANALIZ');
  if (analiz) {
    console.log(`\n✅ URUN ANALIZ Sheet:`);
    console.log(`   Satırlar: ${analiz.rowCount}`);
    
    // Başlıklar
    console.log(`   Başlıklar (İlk 8 sütun):`);
    for (let col = 1; col <= 8; col++) {
      const val = analiz.getCell(1, col).value;
      if (val) console.log(`     Sütun ${col}: ${val}`);
    }
    
    // İlk 3 ürün örneği
    console.log(`\n   Örnek Ürünler (İlk 3):`);
    for (let r = 2; r <= 4 && r <= analiz.rowCount; r++) {
      const kod = analiz.getCell(r, 1).value;
      const adi = analiz.getCell(r, 2).value;
      const grup = analiz.getCell(r, 3).value;
      const adet = analiz.getCell(r, 5).value;
      const fiyatOca25 = analiz.getCell(r, 8).value;
      console.log(`     ${kod}: ${adi.substring(0,30)} | Grup=${grup} | Adet=${adet} | Oca25=${fiyatOca25}`);
    }
  }

  // Aylık sheet'ler örneği
  const aylıSheet = wb.getWorksheet('2025-01');
  if (aylıSheet) {
    console.log(`\n✅ Aylık Sheet Örneği (2025-01):`);
    console.log(`   Satırlar: ${aylıSheet.rowCount}`);
    
    // İlk veri bloğu başlığı
    console.log(`   İlk veri bloğu başlığı:`);
    for (let col = 1; col <= 6; col++) {
      const val = aylıSheet.getCell(4, col).value;
      if (val) console.log(`     Sütun ${col}: ${val}`);
    }
  }

  console.log(`\n✅ Verifikasyon Tamamlandı!\n`);
}

verify().catch(err => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});
