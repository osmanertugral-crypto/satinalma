const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '..', 'gecici', 'MALZEME İHTİYAÇ TOPLAM SATINALMA.xlsx');
const wb = XLSX.readFile(filePath);

console.log('=== SHEET\'LER ===');
wb.SheetNames.forEach(name => console.log('- ' + name));

console.log('\n=== İlk 5 Sheet\'i İncele ===');
wb.SheetNames.slice(0, 5).forEach(name => {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log(`\n[${name}] İlk 3 satır:`);
  data.slice(0, 3).forEach((row, idx) => {
    console.log(`  Satır ${idx}: ${JSON.stringify(row.slice(0, 8))}`);
  });
});

// Bağlantı stringi ara
console.log('\n=== SQL Bağlantı Bilgisi Arama ===');
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
  
  // SQL, server, connection, database gibi kelimeleri ara
  data.forEach((row, idx) => {
    Object.entries(row).forEach(([key, val]) => {
      const str = String(val || '').toLowerCase();
      if (str.includes('server') || str.includes('database') || str.includes('connection') || str.includes('sql')) {
        console.log(`\n[${name}] Satır ${idx}:`);
        console.log(`  Sütun: ${key}`);
        console.log(`  Değer: ${val}`);
      }
    });
  });
});
