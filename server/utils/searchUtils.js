/**
 * Türkçe karakterleri ASCII karşılıklarına dönüştürür ve küçük harfe çevirir.
 * SQLite norm() fonksiyonu ve Node.js tarafında ortak kullanım için.
 */
function normTr(s) {
  if (!s) return '';
  return String(s).toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
    .replace(/î/g, 'i').replace(/â/g, 'a').replace(/û/g, 'u');
}

module.exports = { normTr };
