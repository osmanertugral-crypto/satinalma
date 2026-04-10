const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../gecici/Ocak 2025-2026 Mart 30.xls');

console.log(`\n📂 Dosya: ${filePath}\n`);

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  
  console.log(`📊 Sheet Adı: ${sheetName}`);
  console.log(`\n🔍 Kolon Başlıkları (İlk Satır):`);
  
  // Başlıkları ve ilk 10 veriyi oku
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  
  if (rows.length === 0) {
    console.log('❌ Boş dosya!');
    process.exit(1);
  }
  
  // Başlıklar (sütun indeks → başlık)
  const headers = rows[0];
  headers.forEach((h, idx) => {
    const col = String.fromCharCode(65 + idx);
    console.log(`  ${col}: "${h}"`);
  });
  
  console.log(`\n📋 İlk 15 Veri Satırı:\n`);
  console.log('| Satır |', headers.map((h, i) => `${String.fromCharCode(65 + i)}`).join(' | '), '|');
  console.log('|-------|' + headers.map(() => '---').join('|') + '|');
  
  for (let i = 1; i <= Math.min(15, rows.length - 1); i++) {
    const values = rows[i].map(v => 
      typeof v === 'number' ? v.toFixed(2) : String(v).substring(0, 20)
    );
    console.log(`| ${i.toString().padStart(5)} | ${values.join(' | ')} |`);
  }
  
  console.log(`\n📊 Toplam Satır Sayısı: ${rows.length - 1} (başlık hariç)`);
  console.log(`✅ İnceleme tamamlandı!\n`);
  
} catch (err) {
  console.error('❌ Hata:', err.message);
  process.exit(1);
}
