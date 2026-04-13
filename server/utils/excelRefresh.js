/**
 * Excel Power Query & Pivot sorgularını PowerShell COM otomasyonu ile yeniler.
 * Ana kaynak SQL Server; script tüm OLEDB bağlantılarını senkron çalıştırır
 * ve pivot tabloları yenileyip dosyayı kaydeder.
 */
const { execFile } = require('child_process');
const path = require('path');

const REFRESH_SCRIPT = path.join(__dirname, '..', 'refresh-ciro-excel.ps1');

/**
 * @param {string} filePath  Yenilenecek Excel dosyasının tam yolu
 * @returns {Promise<string>} PS script çıktısı
 */
function refreshExcelQueries(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', REFRESH_SCRIPT, filePath],
      { timeout: 300_000 }, // 5 dakika
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error('Excel sorguları yenilenemedi: ' + (stderr || err.message)));
        } else {
          resolve(stdout.trim());
        }
      }
    );
  });
}

module.exports = { refreshExcelQueries };
