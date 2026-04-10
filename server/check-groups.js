const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../gecici/Ocak 2025-2026 Mart 30.xls');

console.log('\n🔍 Stok Grubu Dağılımı Kontrol\n');

const workbook = XLSX.readFile(filePath);
const ws = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

const grupDagilimi = {};
const bosGrupSayisi = {};

for (let i = 1; i < Math.min(100, rows.length); i++) {
  const r = rows[i];
  const stokKodu = String(r[6]).trim();
  const stokGrup = String(r[8]).trim();
  
  if (stokKodu === 'ECTURB100002' || stokKodu === 'ECTURB100003') {
    console.log(`  ${stokKodu}: "${stokGrup}" (${stokGrup.length} karakter)\n`);
  }
  
  if (!grupDagilimi[stokGrup]) {
    grupDagilimi[stokGrup] = 0;
  }
  grupDagilimi[stokGrup]++;
}

console.log('\n📊 Stok Grubu Sayıları (Boş olanlar dahil):\n');
Object.entries(grupDagilimi)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([grup, sayi]) => {
    const display = grup === '' ? '(BOŞTUR)' : grup;
    console.log(`  "${display}": ${sayi}`);
  });

console.log('\n');
