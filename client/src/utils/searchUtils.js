/**
 * Türkçe karakterleri ASCII karşılıklarına dönüştürür ve küçük harfe çevirir.
 * Büyük/küçük harf ve Türkçe/İngilizce karakter farkına duyarsız arama için kullanılır.
 */
export function normSearch(s) {
  if (!s) return '';
  return String(s).toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
    .replace(/î/g, 'i').replace(/â/g, 'a').replace(/û/g, 'u');
}
