const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EXCEL_REFERENCE_PATH = path.join(__dirname, '..', '..', 'Tabloalarım', '25-26.XLSX');
const CURRENCY_MAP = { TL: 'TRY', US: 'USD', USD: 'USD', EU: 'EUR', EUR: 'EUR' };

let cache = { mtimeMs: 0, payload: null };

function encodeKey(v) {
  return Buffer.from(String(v || ''), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeKey(v) {
  const base = String(v || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = base.length % 4 === 0 ? 0 : (4 - (base.length % 4));
  const padded = base + '='.repeat(padLen);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const normalized = String(v).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(v, yil, ay) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms);
  }
  if (v instanceof Date) return v;
  if (typeof v === 'string' && v.trim()) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const y = Number(yil) || new Date().getFullYear();
  const m = Number(ay) || 1;
  return new Date(y, Math.max(0, m - 1), 1);
}

function findHeaderRow(rows) {
  const mustHave = ['FISNO', 'CARI_UNVANI', 'TARIH'];
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const vals = (rows[i] || []).map(c => String(c || '').trim().toUpperCase());
    if (mustHave.every(k => vals.includes(k))) return i;
  }
  return 0;
}

function readPayload() {
  if (!fs.existsSync(EXCEL_REFERENCE_PATH)) {
    return { orders: [], supplierProducts: new Map() };
  }

  const stat = fs.statSync(EXCEL_REFERENCE_PATH);
  if (cache.payload && cache.mtimeMs === stat.mtimeMs) return cache.payload;

  const wb = XLSX.readFile(EXCEL_REFERENCE_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) {
    cache = { mtimeMs: stat.mtimeMs, payload: { orders: [], supplierProducts: new Map() } };
    return cache.payload;
  }

  const headerIndex = findHeaderRow(rows);
  const header = rows[headerIndex] || [];
  const COL = {};
  header.forEach((h, i) => { COL[String(h || '').trim().toUpperCase()] = i; });

  if (COL.FISNO === undefined || COL.CARI_UNVANI === undefined || COL.TARIH === undefined) {
    cache = { mtimeMs: stat.mtimeMs, payload: { orders: [], supplierProducts: new Map() } };
    return cache.payload;
  }

  const orderMap = new Map();
  const supplierProducts = new Map();

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const fisNo = String(row[COL.FISNO] || '').trim();
    const supplierName = String(row[COL.CARI_UNVANI] || '').trim();
    if (!fisNo || !supplierName) continue;

    const supplierCode = COL.CARI_KODU !== undefined ? String(row[COL.CARI_KODU] || '').trim() : supplierName;
    if (!supplierCode) continue;

    const yil = COL.YIL !== undefined ? Number(row[COL.YIL]) : null;
    const ay = COL.AY !== undefined ? Number(row[COL.AY]) : null;
    const orderDateObj = toDate(row[COL.TARIH], yil, ay);
    const year = Number.isFinite(yil) && yil > 0 ? yil : orderDateObj.getFullYear();
    const month = Number.isFinite(ay) && ay >= 1 && ay <= 12 ? ay : orderDateObj.getMonth() + 1;
    const orderDate = orderDateObj.toISOString().slice(0, 10);

    const iadeMiktar = COL.IADE_MIKTAR !== undefined ? toNumber(row[COL.IADE_MIKTAR]) : 0;
    const kapaliRaw = COL.KAPALI !== undefined ? row[COL.KAPALI] : 0;
    const kapali = String(kapaliRaw).trim() === '1' || String(kapaliRaw).toLowerCase() === 'true';
    const status = iadeMiktar > 0 ? 'cancelled' : (kapali ? 'kapanan' : 'açık');

    const dovizRaw = COL.SIPARIS_DOVIZ_TIPI !== undefined ? String(row[COL.SIPARIS_DOVIZ_TIPI] || '').trim().toUpperCase() : 'TL';
    const currency = CURRENCY_MAP[dovizRaw] || 'TRY';

    const tutar = COL.TUTAR !== undefined ? toNumber(row[COL.TUTAR]) : 0;
    const miktar = COL.MIKTAR !== undefined ? toNumber(row[COL.MIKTAR]) : 0;
    const fiyat = COL.FIYAT !== undefined ? toNumber(row[COL.FIYAT]) : 0;
    const unit = COL.BIRIM !== undefined ? String(row[COL.BIRIM] || '').trim() : 'ADET';
    const productCode = COL.STOK_KODU !== undefined ? String(row[COL.STOK_KODU] || '').trim() : '';
    const productName = COL.STOK_ADI !== undefined ? String(row[COL.STOK_ADI] || '').trim() : '';

    const supplierId = `excelsup-${encodeKey(supplierCode)}`;
    const groupKey = `${year}|${supplierCode}|${fisNo}`;
    const orderId = `excelpo-${encodeKey(groupKey)}`;

    if (!orderMap.has(groupKey)) {
      orderMap.set(groupKey, {
        id: orderId,
        po_number: `IMP-${year}-${fisNo}`,
        supplier_id: supplierId,
        supplier_name: supplierName,
        supplier_code: supplierCode,
        status,
        order_date: orderDate,
        expected_date: null,
        delivery_date: null,
        currency,
        total_amount: 0,
        notes: 'Excel referans kaydi',
        items_map: new Map(),
      });
    }

    const order = orderMap.get(groupKey);
    if (order.status !== 'cancelled' && status === 'cancelled') order.status = 'cancelled';
    order.total_amount += tutar;

    const itemKey = `${productCode}|${unit}|${fiyat}`;
    if (!order.items_map.has(itemKey)) {
      order.items_map.set(itemKey, {
        id: `excelpoi-${encodeKey(`${groupKey}|${itemKey}`)}`,
        product_id: null,
        product_code: productCode,
        product_name: productName,
        unit,
        quantity: 0,
        unit_price: fiyat,
      });
    }
    const item = order.items_map.get(itemKey);
    item.quantity += (iadeMiktar > 0 ? iadeMiktar : miktar);

    if (!supplierProducts.has(supplierId)) supplierProducts.set(supplierId, new Map());
    const pMap = supplierProducts.get(supplierId);
    if (!pMap.has(productCode)) {
      pMap.set(productCode, {
        id: `excelsp-${encodeKey(`${supplierCode}|${productCode}`)}`,
        product_id: null,
        code: productCode,
        name: productName,
        unit,
        category_name: null,
      });
    }
  }

  const orders = Array.from(orderMap.values()).map(o => ({
    ...o,
    items: Array.from(o.items_map.values()),
    items_map: undefined,
  }));

  cache = { mtimeMs: stat.mtimeMs, payload: { orders, supplierProducts } };
  return cache.payload;
}

function matchYearMonth(order, year, month) {
  if (Number(year)) {
    const y = Number(order.order_date.slice(0, 4));
    if (y !== Number(year)) return false;
  }
  if (Number(month)) {
    const m = Number(order.order_date.slice(5, 7));
    if (m !== Number(month)) return false;
  }
  return true;
}

function getExcelOrders(filters = {}) {
  const { orders } = readPayload();
  const { year, month, status, supplier_id, search } = filters;
  const s = (search || '').trim().toLowerCase();

  return orders.filter(o => {
    if (!matchYearMonth(o, year, month)) return false;
    if (status && o.status !== status) return false;
    if (supplier_id && o.supplier_id !== supplier_id) return false;
    if (s) {
      const ok = (o.po_number || '').toLowerCase().includes(s) || (o.supplier_name || '').toLowerCase().includes(s);
      if (!ok) return false;
    }
    return true;
  }).sort((a, b) => (b.order_date || '').localeCompare(a.order_date || ''));
}

function getExcelOrderById(id) {
  const { orders } = readPayload();
  return orders.find(o => o.id === id) || null;
}

function getExcelSuppliers(filters = {}) {
  const { year, month, search, active } = filters;
  const rows = getExcelOrders({ year, month });
  const map = new Map();
  for (const o of rows) {
    if (!map.has(o.supplier_id)) {
      map.set(o.supplier_id, {
        id: o.supplier_id,
        name: o.supplier_name,
        contact_name: null,
        email: null,
        phone: null,
        city: null,
        active: 1,
        rating: null,
        year_total_amount: 0,
        order_count: 0,
      });
    }
    const s = map.get(o.supplier_id);
    s.year_total_amount += o.total_amount || 0;
    s.order_count += 1;
  }

  let list = Array.from(map.values());
  if (search) {
    const needle = String(search).toLowerCase();
    list = list.filter(r => (r.name || '').toLowerCase().includes(needle));
  }
  if (active !== undefined) {
    const target = active === 'true' ? 1 : 0;
    list = list.filter(r => r.active === target);
  }
  return list;
}

function getExcelSupplierStats({ year, month }) {
  const hasMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  const filtered = getExcelOrders({ year, month: hasMonth ? month : undefined });

  const monthlyMap = new Map();
  const topMap = new Map();
  const statusMap = new Map();
  const activeSupplierSet = new Set();
  let toplam_tutar = 0;
  let toplam_siparis = 0;
  let acik_siparis = 0;

  for (const o of filtered) {
    const m = Number(o.order_date.slice(5, 7));
    toplam_tutar += o.total_amount || 0;
    toplam_siparis += 1;
    if (o.status !== 'kapanan' && o.status !== 'cancelled') acik_siparis += 1;
    activeSupplierSet.add(o.supplier_id);

    if (!monthlyMap.has(m)) monthlyMap.set(m, { month: m, toplam_tutar: 0, siparis_sayisi: 0, tedarikci_set: new Set() });
    const mm = monthlyMap.get(m);
    mm.toplam_tutar += o.total_amount || 0;
    mm.siparis_sayisi += 1;
    mm.tedarikci_set.add(o.supplier_id);

    if (!topMap.has(o.supplier_id)) topMap.set(o.supplier_id, { id: o.supplier_id, name: o.supplier_name, toplam_tutar: 0, siparis_sayisi: 0 });
    const t = topMap.get(o.supplier_id);
    t.toplam_tutar += o.total_amount || 0;
    t.siparis_sayisi += 1;

    if (!statusMap.has(o.status)) statusMap.set(o.status, { status: o.status, sayi: 0, tutar: 0 });
    const st = statusMap.get(o.status);
    st.sayi += 1;
    st.tutar += o.total_amount || 0;
  }

  const monthly = Array.from(monthlyMap.values())
    .map(m => ({ month: m.month, toplam_tutar: m.toplam_tutar, siparis_sayisi: m.siparis_sayisi, tedarikci_sayisi: m.tedarikci_set.size }))
    .sort((a, b) => a.month - b.month);

  return {
    monthly,
    topSuppliers: Array.from(topMap.values()).sort((a, b) => b.toplam_tutar - a.toplam_tutar).slice(0, 10),
    statusDist: Array.from(statusMap.values()),
    yearTotal: {
      toplam_tutar,
      toplam_siparis,
      aktif_tedarikci: activeSupplierSet.size,
      acik_siparis,
    },
  };
}

function getExcelSupplierPanelDetail(supplierId) {
  const { supplierProducts } = readPayload();
  const suppliers = getExcelSuppliers({});
  const supplier = suppliers.find(s => s.id === supplierId);
  if (!supplier) return null;

  const products = Array.from((supplierProducts.get(supplierId) || new Map()).values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const orders = getExcelOrders({ supplier_id: supplierId });
  return { ...supplier, products, orders };
}

function getExcelProducts(filters = {}) {
  const { search, year, month } = filters;
  const rows = getExcelOrders({ year, month, search });
  const productMap = new Map();

  for (const order of rows) {
    for (const item of order.items || []) {
      const code = item.product_code || '';
      if (!code) continue;
      if (!productMap.has(code)) {
        productMap.set(code, {
          id: `excelprod-${encodeKey(code)}`,
          code,
          name: item.product_name || code,
          category_id: null,
          category_name: null,
          unit: item.unit || 'ADET',
          min_stock_level: 0,
          description: null,
          active: 1,
          stock: 0,
          gebze_stok: 0,
          eticaret_stok: 0,
          showroom_stok: 0,
          last_price: null,
          last_currency: null,
          last_order_date: null,
          last_po_id: null,
          last_po_number: null,
          total_amount: 0,
          total_quantity: 0,
          order_count: 0,
        });
      }

      const p = productMap.get(code);
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      p.total_quantity += qty;
      p.total_amount += qty * price;
      p.order_count += 1;

      if (!p.last_order_date || String(order.order_date) >= String(p.last_order_date)) {
        p.last_order_date = order.order_date;
        p.last_price = price;
        p.last_currency = order.currency || 'TRY';
        p.last_po_id = order.id;
        p.last_po_number = order.po_number;
      }
    }
  }

  let list = Array.from(productMap.values());
  if (search) {
    const needle = String(search).toLowerCase();
    list = list.filter(p => String(p.name || '').toLowerCase().includes(needle) || String(p.code || '').toLowerCase().includes(needle));
  }

  return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'tr'));
}

function getExcelProductById(productId) {
  const products = getExcelProducts({});
  return products.find(p => p.id === productId) || null;
}

function getExcelProductStats(year) {
  const y = Number(year) || new Date().getFullYear();
  const orders = getExcelOrders({ year: y });
  const productMap = new Map();
  const monthMap = new Map();

  for (const order of orders) {
    const m = Number(String(order.order_date).slice(5, 7));
    if (!monthMap.has(m)) monthMap.set(m, { month: m, urun_cesidi_set: new Set(), toplam_tutar: 0, toplam_miktar: 0 });
    const monthRow = monthMap.get(m);

    for (const item of order.items || []) {
      const code = item.product_code || '';
      if (!code) continue;
      const qty = Number(item.quantity || 0);
      const price = Number(item.unit_price || 0);
      const amount = qty * price;

      monthRow.urun_cesidi_set.add(code);
      monthRow.toplam_tutar += amount;
      monthRow.toplam_miktar += qty;

      if (!productMap.has(code)) {
        productMap.set(code, {
          id: `excelprod-${encodeKey(code)}`,
          code,
          name: item.product_name || code,
          toplam_miktar: 0,
          toplam_tutar: 0,
          siparis_set: new Set(),
          min_fiyat: null,
          max_fiyat: null,
          fiyat_set: new Set(),
        });
      }
      const p = productMap.get(code);
      p.toplam_miktar += qty;
      p.toplam_tutar += amount;
      p.siparis_set.add(order.id);
      if (price > 0) {
        p.min_fiyat = p.min_fiyat == null ? price : Math.min(p.min_fiyat, price);
        p.max_fiyat = p.max_fiyat == null ? price : Math.max(p.max_fiyat, price);
        p.fiyat_set.add(price);
      }
    }
  }

  const turnover = Array.from(productMap.values())
    .map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      toplam_miktar: Math.round(p.toplam_miktar * 100) / 100,
      siparis_sayisi: p.siparis_set.size,
      mevcut_stok: 0,
      devir_hizi: Math.round(p.toplam_miktar * 100) / 100,
    }))
    .sort((a, b) => b.devir_hizi - a.devir_hizi)
    .slice(0, 15);

  const monthly = Array.from(monthMap.values())
    .map(m => ({
      month: m.month,
      urun_cesidi: m.urun_cesidi_set.size,
      toplam_tutar: Math.round(m.toplam_tutar * 100) / 100,
      toplam_miktar: Math.round(m.toplam_miktar * 100) / 100,
    }))
    .sort((a, b) => a.month - b.month);

  const topByAmount = Array.from(productMap.values())
    .map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      toplam_tutar: Math.round(p.toplam_tutar * 100) / 100,
      toplam_miktar: Math.round(p.toplam_miktar * 100) / 100,
      siparis_sayisi: p.siparis_set.size,
    }))
    .sort((a, b) => b.toplam_tutar - a.toplam_tutar)
    .slice(0, 10);

  const priceChanges = Array.from(productMap.values())
    .filter(p => p.fiyat_set.size > 1 && p.min_fiyat > 0)
    .map(p => ({
      id: p.id,
      code: p.code,
      name: p.name,
      min_fiyat: p.min_fiyat,
      max_fiyat: p.max_fiyat,
      degisim_yuzde: Math.round(((p.max_fiyat - p.min_fiyat) / p.min_fiyat) * 1000) / 10,
      farkli_fiyat_sayisi: p.fiyat_set.size,
    }))
    .sort((a, b) => b.degisim_yuzde - a.degisim_yuzde)
    .slice(0, 10);

  return {
    turnover,
    categoryDist: [{ category: 'Genel', urun_sayisi: productMap.size, toplam_tutar: topByAmount.reduce((s, t) => s + t.toplam_tutar, 0) }],
    monthly,
    stockSummary: {
      toplam_urun: productMap.size,
      kritik_stok: 0,
      stoksuz: productMap.size,
      yeterli_stok: 0,
    },
    topByAmount,
    priceChanges,
  };
}

function getExcelReturnsSummary(periodMonths = 6) {
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - (Math.max(1, Number(periodMonths) || 6) - 1));
  const startStr = start.toISOString().slice(0, 10);

  const returns = getExcelOrders({}).filter(o => o.status === 'cancelled' && o.order_date >= startStr);
  return {
    summary: {
      count: returns.length,
      total: returns.reduce((s, r) => s + (r.total_amount || 0), 0),
    },
    orders: returns.slice(0, 50).map(o => ({
      id: o.id,
      po_number: o.po_number,
      order_date: o.order_date,
      total_amount: o.total_amount,
      currency: o.currency,
      supplier_name: o.supplier_name,
    })),
  };
}

module.exports = {
  getExcelOrders,
  getExcelOrderById,
  getExcelSuppliers,
  getExcelSupplierStats,
  getExcelSupplierPanelDetail,
  getExcelProducts,
  getExcelProductById,
  getExcelProductStats,
  getExcelReturnsSummary,
  encodeKey,
  decodeKey,
};
