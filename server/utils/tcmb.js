const https = require('https');

let _cache = null; // { usd, eur, date }

function fetchXml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 8000 }, (res) => {
      let data = '';
      res.setEncoding('latin1'); // TCMB XML Latin-1 encode
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

function parseRate(xml, currencyCode, field = 'BanknoteSelling') {
  const block = xml.match(
    new RegExp(`<Currency[^>]*CurrencyCode="${currencyCode}"[^>]*>[\\s\\S]*?<\\/Currency>`)
  );
  if (!block) return null;
  const val = block[0].match(new RegExp(`<${field}>([\\d.]+)<\\/>`));
  // Some TCMB fields close without tag name
  const val2 = block[0].match(new RegExp(`<${field}>([\\d.,]+)<\/${field}>`));
  const raw = (val2 || val)?.[1]?.replace(',', '.') || null;
  return raw ? parseFloat(raw) : null;
}

async function getRates() {
  const today = new Date().toISOString().slice(0, 10);

  if (_cache?.date === today && _cache.usd && _cache.eur) {
    return { usd: _cache.usd, eur: _cache.eur, source: 'cache', date: today };
  }

  try {
    const xml = await fetchXml('https://www.tcmb.gov.tr/kurlar/today.xml');
    const usd = parseRate(xml, 'USD', 'BanknoteSelling');
    const eur = parseRate(xml, 'EUR', 'BanknoteSelling');

    if (usd && eur) {
      _cache = { usd, eur, date: today };
      console.log(`[TCMB] Kurlar güncellendi: USD=${usd}, EUR=${eur}`);
      return { usd, eur, source: 'tcmb', date: today };
    }
  } catch (e) {
    console.warn('[TCMB] Kur çekilemedi:', e.message);
  }

  // TCMB'ye ulaşılamazsa cache'teki eski değeri döndür
  if (_cache) {
    return { usd: _cache.usd, eur: _cache.eur, source: 'cache-stale', date: _cache.date };
  }

  return { usd: null, eur: null, source: 'error', date: today };
}

module.exports = { getRates };
