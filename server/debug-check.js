const Database = require('better-sqlite3');
const path = require('path');
const XLSX = require('xlsx');

// Database kontrol
const db = new Database(path.join(__dirname, 'satinalma.db'));
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('\n=== DATABASE ===');
console.log('Tablolar:', tables.map(t => t.name).join(', '));

if (tables.find(t => t.name === 'project_offers')) {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM project_offers').get();
  console.log('project_offers satırı:', count.cnt);
  if (count.cnt > 0) {
    const projects = db.prepare('SELECT DISTINCT project_name FROM project_offers WHERE project_name IS NOT NULL AND project_name != "" LIMIT 5').all();
    console.log('DB Projeler:', projects.map(p => p.project_name).join(', '));
  }
} else {
  console.log('⚠️  project_offers tablosu YOK!');
}

// Excel kontrol
console.log('\n=== EXCEL ===');
const excelPath = path.join(__dirname, '..', '..', 'gecici', 'MALZEME İHTİYAÇ TOPLAM SATINALMA.xlsx');
try {
  const wb = XLSX.readFile(excelPath, { cellFormula: false, cellStyles: false });
  const ws = wb.Sheets['ÜRETİM İHTİYAÇ RAPORU'];
  if (ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const excelProjects = [...new Set(rows.map(r => r['PROJE_KODU']).filter(Boolean))].sort();
    console.log('Excel Projeler (' + excelProjects.length + '):', excelProjects.slice(0, 5).join(', '));
  } else {
    console.log('⚠️  ÜRETİM İHTİYAÇ RAPORU sayfası YOK!');
  }
} catch (e) {
  console.log('⚠️  Excel okuma hatası:', e.message);
}
