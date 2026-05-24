import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPO, getPOs, getSupplierPanelDetail, getSupplierStats, getSuppliers } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Table, Spinner, StatCard } from '../components/UI';
import { Search, Calendar, BarChart3, TrendingUp, ShoppingCart, FileText, Clock, CheckCircle, AlertCircle, Package } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import { useSearchParams } from 'react-router-dom';

const MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));
const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#14b8a6'];

function currencySymbol(c) {
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  return '₺';
}

// Döviz tutarı ve TL karşılığını hesaplar.
// İki senaryo:
//   A) currency=USD/EUR : tutar dövizde → TL = tutar × kur
//   B) currency=TRY, referenceCurrency=EUR/USD : tutar TL'de → döviz = TL ÷ kur
function formatAmount(amount, currency, exchangeRate, referenceCurrency) {
  const num = Number(amount || 0);
  const rate = Number(exchangeRate || 0);

  // Senaryo A: USD veya EUR olarak kaydedilmiş sipariş
  if (currency === 'USD' || currency === 'EUR') {
    const sym = currencySymbol(currency);
    const original = sym + num.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    const tl = rate > 0 ? '₺' + (num * rate).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : null;
    return { original, tl, mode: 'foreign' };
  }

  // Senaryo B: TRY'de kayıtlı ama EUR/USD referanslı (LOGO'nun TRCURR=0 durumu)
  const ref = referenceCurrency;
  if ((ref === 'EUR' || ref === 'USD') && rate > 1) {
    const sym = currencySymbol(ref);
    const foreignAmt = num / rate;
    const original = sym + foreignAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
    const tl = '₺' + num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return { original, tl, mode: 'try-with-ref' };
  }

  // Senaryo C: Saf TRY sipariş
  const original = '₺' + num.toLocaleString('tr-TR', { minimumFractionDigits: 2 });
  return { original, tl: null, mode: 'try' };
}

const STATUS_LABELS = {
  draft: 'Taslak',
  sent: 'Gönderildi',
  confirmed: 'Kapanan Siparişler',
  delivered: 'Teslim Alındı',
  cancelled: 'İade Edilen Siparişler',
  'açık': 'Henüz Gelmemiş Siparişler',
  bekleyen: 'Bir Kısmı Gelen Siparişler',
  kapanan: 'Kapanan Siparişler',
};

function SortIcon({ col, sortKey, sortDir }) {
  if (col !== sortKey) return <span className="ml-1 text-gray-300 text-xs">↕</span>;
  return <span className="ml-1 text-blue-500 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

export default function SuppliersOrdersPage() {
  const [params] = useSearchParams();
  const [viewMode, setViewMode] = useState(params.get('tab') === 'suppliers' ? 'suppliers' : 'orders');
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState(params.get('status') || '');

  const [supplierSortKey, setSupplierSortKey] = useState('name');
  const [supplierSortDir, setSupplierSortDir] = useState('asc');
  const [orderSortKey, setOrderSortKey] = useState('date');
  const [orderSortDir, setOrderSortDir] = useState('desc');

  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));
  const [chartMonth, setChartMonth] = useState('');

  const [supplierModalId, setSupplierModalId] = useState(null);
  const [poModalId, setPoModalId] = useState(null);
  const [kpiModal, setKpiModal] = useState(null);

  const { data: supplierRows = [], isLoading: suppliersLoading } = useQuery({
    queryKey: ['suppliers', search, filterYear, filterMonth],
    queryFn: () => getSuppliers({ search: search || undefined, year: filterYear, month: filterMonth || undefined }).then(r => r.data),
  });

  const { data: allOrders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ['pos-all'],
    queryFn: () => getPOs().then(r => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['supplier-stats', chartYear, chartMonth],
    queryFn: () => getSupplierStats({ year: chartYear, month: chartMonth || undefined }).then(r => r.data),
  });

  const { data: supplierDetail, isLoading: supplierDetailLoading } = useQuery({
    queryKey: ['supplier-panel', supplierModalId],
    enabled: !!supplierModalId,
    queryFn: () => getSupplierPanelDetail(supplierModalId).then(r => r.data),
  });

  const supplierOrders = supplierDetail?.orders || [];

  const { data: poDetail, isLoading: poDetailLoading } = useQuery({
    queryKey: ['po', poModalId],
    enabled: !!poModalId,
    queryFn: () => getPO(poModalId).then(r => r.data),
  });

  const orderDashboard = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    const thisMonthOrders = allOrders.filter(po => {
      if (!po.order_date) return false;
      const d = new Date(po.order_date);
      return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth;
    });

    const acikOrders = allOrders.filter(po => {
      if (po.status !== 'açık') return false;
      if (!po.order_date) return false;
      return new Date(po.order_date).getFullYear() === currentYear;
    });

    const bekleyenOrders = allOrders.filter(po => {
      if (po.status !== 'bekleyen') return false;
      if (!po.order_date) return false;
      return new Date(po.order_date).getFullYear() === currentYear;
    });

    // Tüm para birimleri dahil (TRY filtresi kaldırıldı)
    const totalTLAmount = thisMonthOrders.reduce((sum, po) => sum + Number(po.total_amount || 0), 0);

    const prevMonthAcikOrders = allOrders.filter(po => {
      if (!po.order_date) return false;
      const d = new Date(po.order_date);
      return d.getFullYear() === prevMonthYear && d.getMonth() + 1 === prevMonth && po.status === 'açık';
    });

    const prevMonthBekleyenOrders = allOrders.filter(po => {
      if (!po.order_date) return false;
      const d = new Date(po.order_date);
      return d.getFullYear() === prevMonthYear && d.getMonth() + 1 === prevMonth && po.status === 'bekleyen';
    });

    return {
      thisMonthCount: thisMonthOrders.length,
      currentMonthName: MONTHS[currentMonth],
      acikCount: acikOrders.length,
      bekleyenCount: bekleyenOrders.length,
      totalTLAmount,
      prevMonthAcikCount: prevMonthAcikOrders.length,
      prevMonthAcikOrders,
      prevMonthBekleyenCount: prevMonthBekleyenOrders.length,
      prevMonthBekleyenOrders,
      prevMonthName: MONTHS[prevMonth],
    };
  }, [allOrders]);

  const handleSupplierSort = (key) => {
    if (supplierSortKey === key) {
      setSupplierSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSupplierSortKey(key);
      setSupplierSortDir('asc');
    }
  };

  const handleOrderSort = (key) => {
    if (orderSortKey === key) {
      setOrderSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderSortKey(key);
      setOrderSortDir('asc');
    }
  };

  const filteredOrders = useMemo(() => {
    const y = Number(filterYear);
    const m = filterMonth ? Number(filterMonth) : null;
    const s = search.trim().toLowerCase();

    const filtered = allOrders.filter(po => {
      if (!po.order_date) return false;
      const d = new Date(po.order_date);
      if (Number.isNaN(d.getTime())) return false;
      if (y && d.getFullYear() !== y) return false;
      if (m && d.getMonth() + 1 !== m) return false;
      if (orderStatusFilter && po.status !== orderStatusFilter) return false;
      if (s) {
        const inText = (po.po_number || '').toLowerCase().includes(s) || (po.supplier_name || '').toLowerCase().includes(s);
        if (!inText) return false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const dir = orderSortDir === 'asc' ? 1 : -1;
      if (orderSortKey === 'po_number') return dir * (a.po_number || '').localeCompare(b.po_number || '');
      if (orderSortKey === 'supplier') return dir * (a.supplier_name || '').localeCompare(b.supplier_name || '', 'tr');
      if (orderSortKey === 'amount') return dir * (Number(a.total_amount || 0) - Number(b.total_amount || 0));
      return dir * (a.order_date || '').localeCompare(b.order_date || '');
    });
  }, [allOrders, filterYear, filterMonth, search, orderStatusFilter, orderSortKey, orderSortDir]);

  const sortedSuppliers = useMemo(() => {
    const list = [...supplierRows];
    return list.sort((a, b) => {
      const dir = supplierSortDir === 'asc' ? 1 : -1;
      if (supplierSortKey === 'name') return dir * String(a.name || '').localeCompare(String(b.name || ''), 'tr');
      if (supplierSortKey === 'amount') return dir * (Number(a.year_total_amount || 0) - Number(b.year_total_amount || 0));
      if (supplierSortKey === 'count') return dir * (Number(a.order_count || 0) - Number(b.order_count || 0));
      return 0;
    });
  }, [supplierRows, supplierSortKey, supplierSortDir]);

  const chartMonthly = useMemo(() => {
    if (chartMonth) {
      const m = parseInt(chartMonth, 10);
      const found = statsData?.monthly?.find(r => r.month === m);
      return [{ ay: MONTHS[m].slice(0, 3), ayFull: MONTHS[m], toplam_tutar: found?.toplam_tutar || 0, siparis_sayisi: found?.siparis_sayisi || 0 }];
    }
    const all = [];
    for (let m = 1; m <= 12; m++) {
      const found = statsData?.monthly?.find(r => r.month === m);
      all.push({ ay: MONTHS[m].slice(0, 3), ayFull: MONTHS[m], toplam_tutar: found?.toplam_tutar || 0, siparis_sayisi: found?.siparis_sayisi || 0 });
    }
    return all;
  }, [statsData, chartMonth]);

  const chartMonthSupplierRanking = useMemo(() => {
    const y = parseInt(chartYear, 10);
    const m = chartMonth ? parseInt(chartMonth, 10) : new Date().getMonth() + 1;

    const periodOrders = allOrders.filter(po => {
      if (!po.order_date) return false;
      const d = new Date(po.order_date);
      if (d.getFullYear() !== y) return false;
      if (d.getMonth() + 1 !== m) return false;
      return true;
    });

    const bySupplier = {};
    periodOrders.forEach(po => {
      const name = po.supplier_name || 'Bilinmiyor';
      if (!bySupplier[name]) bySupplier[name] = 0;
      bySupplier[name] += Number(po.total_amount || 0);
    });

    return Object.entries(bySupplier)
      .map(([name, value]) => ({
        name: name.length > 22 ? `${name.slice(0, 22)}…` : name,
        fullName: name,
        value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [allOrders, chartYear, chartMonth]);

  const activePeriodLabel = chartMonth ? `${MONTHS[parseInt(chartMonth, 10)]} ${chartYear}` : `${chartYear} Yılı`;
  const isLoadingMain = viewMode === 'suppliers' ? suppliersLoading : ordersLoading;

  const statusBadgeColor = (status) => {
    if (status === 'cancelled') return 'red';
    if (status === 'kapanan' || status === 'confirmed' || status === 'delivered') return 'green';
    if (status === 'bekleyen') return 'orange';
    if (status === 'açık') return 'yellow';
    return 'gray';
  };

  const thSortable = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap';
  const thPlain = 'text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';

  return (
    <div className="p-6">
      <PageHeader title="Siparişler ve Tedarikçiler" subtitle="Sipariş yönetimi, tedarikçi takibi ve analiz" />

      {/* Dashboard KPI Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard
          label={`${orderDashboard.currentMonthName} Siparişleri`}
          value={orderDashboard.thisMonthCount}
          icon={ShoppingCart}
          color="blue"
        />
        <StatCard
          label="Açık Siparişler"
          value={orderDashboard.acikCount}
          icon={FileText}
          color="yellow"
        />
        <StatCard
          label="Beklemedeki Siparişler"
          value={orderDashboard.bekleyenCount}
          icon={Clock}
          color="orange"
        />
        <StatCard
          label={`${orderDashboard.currentMonthName} Sipariş Tutarı`}
          value={`₺${orderDashboard.totalTLAmount.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={TrendingUp}
          color="green"
        />
        <div
          className={orderDashboard.prevMonthAcikCount > 0 ? 'cursor-pointer' : ''}
          onClick={orderDashboard.prevMonthAcikCount > 0
            ? () => setKpiModal({ title: `${orderDashboard.prevMonthName} — Açık Siparişler`, orders: orderDashboard.prevMonthAcikOrders })
            : undefined}
        >
          {orderDashboard.prevMonthAcikCount > 0 ? (
            <StatCard
              label={`${orderDashboard.prevMonthName} Açık Sipariş`}
              value={orderDashboard.prevMonthAcikCount}
              icon={AlertCircle}
              color="red"
            />
          ) : (
            <StatCard
              label={`${orderDashboard.prevMonthName} Açık Sipariş`}
              value="Yok"
              icon={CheckCircle}
              color="purple"
            />
          )}
        </div>
        <div
          className={orderDashboard.prevMonthBekleyenCount > 0 ? 'cursor-pointer' : ''}
          onClick={orderDashboard.prevMonthBekleyenCount > 0
            ? () => setKpiModal({ title: `${orderDashboard.prevMonthName} — Bekleyen Siparişler`, orders: orderDashboard.prevMonthBekleyenOrders })
            : undefined}
        >
          {orderDashboard.prevMonthBekleyenCount > 0 ? (
            <StatCard
              label={`${orderDashboard.prevMonthName} Bekleyen Sipariş`}
              value={orderDashboard.prevMonthBekleyenCount}
              icon={Package}
              color="orange"
            />
          ) : (
            <StatCard
              label={`${orderDashboard.prevMonthName} Bekleyen Sipariş`}
              value="Yok"
              icon={Package}
              color="purple"
            />
          )}
        </div>
      </div>

      {/* Grafik Filtresi */}
      <Card className="mb-6">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-700">Dönem Grafikleri</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={chartYear} onChange={e => setChartYear(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={chartMonth} onChange={e => setChartMonth(e.target.value)}>
              <option value="">Tüm Aylar</option>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Aylık Satınalma Tutarı</h3>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="ay" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => {
                      if (name === 'Tutar') return [`₺${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, name];
                      return [value, name];
                    }}
                    labelFormatter={(label, payload) => payload?.[0]?.payload?.ayFull || label}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="toplam_tutar" name="Tutar" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" dataKey="siparis_sayisi" name="Sipariş" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {activePeriodLabel} — Tutara Göre Tedarikçi Sıralaması
            </h3>
            <div style={{ height: 260 }}>
              {chartMonthSupplierRanking.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Bu dönemde sipariş bulunamadı
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartMonthSupplierRanking}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={90}
                      innerRadius={30}
                      paddingAngle={2}
                    >
                      {chartMonthSupplierRanking.map((entry, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>} />
                    <Tooltip
                      formatter={(value, name) => [
                        `₺${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Tablo Bölümü */}
      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              className={`px-3 py-2 text-sm ${viewMode === 'orders' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setViewMode('orders')}
            >
              Siparişler
            </button>
            <button
              className={`px-3 py-2 text-sm ${viewMode === 'suppliers' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              onClick={() => setViewMode('suppliers')}
            >
              Tedarikçiler
            </button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-56"
              placeholder={viewMode === 'suppliers' ? 'Tedarikçi ara...' : 'PO no veya tedarikçi ara...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">Tüm Aylar</option>
            {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
          </select>
          {viewMode === 'orders' && (
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
              <option value="">Tüm Durumlar</option>
              <option value="açık">Henüz Gelmemiş Siparişler</option>
              <option value="bekleyen">Bir Kısmı Gelen Siparişler</option>
              <option value="kapanan">Kapanan Siparişler</option>
              <option value="cancelled">İade Edilen Siparişler</option>
              <option value="sent">Gönderildi</option>
              <option value="draft">Taslak</option>
            </select>
          )}
        </div>

        {isLoadingMain ? <Spinner /> : viewMode === 'suppliers' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={thSortable} onClick={() => handleSupplierSort('name')}>
                    Ad <SortIcon col="name" sortKey={supplierSortKey} sortDir={supplierSortDir} />
                  </th>
                  <th className={thPlain}>İletişim</th>
                  <th className={thPlain}>Telefon</th>
                  <th className={thPlain}>Şehir</th>
                  <th className={thSortable} onClick={() => handleSupplierSort('amount')}>
                    Toplam Tutar <SortIcon col="amount" sortKey={supplierSortKey} sortDir={supplierSortDir} />
                  </th>
                  <th className={thSortable} onClick={() => handleSupplierSort('count')}>
                    Sipariş <SortIcon col="count" sortKey={supplierSortKey} sortDir={supplierSortDir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedSuppliers.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-12">Tedarikçi bulunamadı</td></tr>
                ) : sortedSuppliers.map(s => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSupplierModalId(s.id)}>
                    <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.contact_name || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.city || '-'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{Number(s.year_total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                    <td className="px-4 py-3 text-gray-600">{s.order_count || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className={thSortable} onClick={() => handleOrderSort('po_number')}>
                    PO No <SortIcon col="po_number" sortKey={orderSortKey} sortDir={orderSortDir} />
                  </th>
                  <th className={thSortable} onClick={() => handleOrderSort('supplier')}>
                    Tedarikçi <SortIcon col="supplier" sortKey={orderSortKey} sortDir={orderSortDir} />
                  </th>
                  <th className={thSortable} onClick={() => handleOrderSort('date')}>
                    Sipariş Tarihi <SortIcon col="date" sortKey={orderSortKey} sortDir={orderSortDir} />
                  </th>
                  <th className={thPlain}>Durum</th>
                  <th className={thSortable} onClick={() => handleOrderSort('amount')}>
                    Tutar (Orijinal) <SortIcon col="amount" sortKey={orderSortKey} sortDir={orderSortDir} />
                  </th>
                  <th className={thPlain}>Tutar (TL)</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-12">Sipariş bulunamadı</td></tr>
                ) : filteredOrders.map(po => {
                  const { original, tl } = formatAmount(po.total_amount, po.currency, po.exchange_rate, po.reference_currency);
                  return (
                  <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setPoModalId(po.id)}>
                    <td className="px-4 py-3 text-blue-600 font-medium">{po.po_number}</td>
                    <td className="px-4 py-3 text-gray-700">{po.supplier_name}</td>
                    <td className="px-4 py-3 text-gray-600">{po.order_date || '-'}</td>
                    <td className="px-4 py-3">
                      <Badge color={statusBadgeColor(po.status)}>
                        {STATUS_LABELS[po.status] || po.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {original}
                      {po.currency && po.currency !== 'TRY' && <span className="ml-1 text-xs text-gray-400">{po.currency}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{tl || <span className="text-gray-400">—</span>}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* KPI Modal - Önceki Ay Siparişleri */}
      <Modal open={!!kpiModal} onClose={() => setKpiModal(null)} title={kpiModal?.title || ''} size="lg">
        {kpiModal && (
          kpiModal.orders.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center">Bu dönemde sipariş bulunamadı.</p>
          ) : (
            <Table headers={['PO No', 'Tedarikçi', 'Tarih', 'Durum', 'Tutar (Orijinal)', 'Tutar (TL)']}>
              {kpiModal.orders.map(po => {
                const { original, tl } = formatAmount(po.total_amount, po.currency, po.exchange_rate, po.reference_currency);
                return (
                <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => { setKpiModal(null); setPoModalId(po.id); }}>
                  <td className="px-3 py-2 text-sm text-blue-600 font-medium">{po.po_number}</td>
                  <td className="px-3 py-2 text-sm text-gray-700">{po.supplier_name}</td>
                  <td className="px-3 py-2 text-sm text-gray-600">{po.order_date || '-'}</td>
                  <td className="px-3 py-2">
                    <Badge color={statusBadgeColor(po.status)}>
                      {STATUS_LABELS[po.status] || po.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold text-gray-800">
                    {original}
                    {po.currency && po.currency !== 'TRY' && <span className="ml-1 text-xs text-gray-400">{po.currency}</span>}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-700">{tl || '—'}</td>
                </tr>
                );
              })}
            </Table>
          )
        )}
      </Modal>

      {/* Tedarikçi Detay Modal */}
      <Modal open={!!supplierModalId} onClose={() => setSupplierModalId(null)} title={supplierDetail?.name || 'Tedarikçi Detayı'} size="xl">
        {supplierDetailLoading ? <Spinner /> : supplierDetail && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Ürünler</h3>
              <Table headers={['Kod', 'Ad', 'Birim']} empty={!supplierDetail.products?.length && 'Ürün yok'}>
                {supplierDetail.products?.map(p => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-xs text-gray-600">{p.code}</td>
                    <td className="px-3 py-2 text-sm text-gray-800">{p.name}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.unit || '-'}</td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Siparişler</h3>
              <Table headers={['PO', 'Tarih', 'Durum', 'Tutar']} empty={supplierOrders.length === 0 && 'Sipariş yok'}>
                {supplierOrders.map(po => {
                  const { original, tl } = formatAmount(po.total_amount, po.currency, po.exchange_rate, po.reference_currency);
                  return (
                  <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => { setSupplierModalId(null); setPoModalId(po.id); }}>
                    <td className="px-3 py-2 text-sm text-blue-600">{po.po_number}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{po.order_date}</td>
                    <td className="px-3 py-2">
                      <Badge color={statusBadgeColor(po.status)}>
                        {STATUS_LABELS[po.status] || po.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      <div className="font-medium">{original}{po.currency && po.currency !== 'TRY' && <span className="ml-1 text-xs text-gray-400">{po.currency}</span>}</div>
                      {tl && <div className="text-xs text-gray-500">{tl} TL</div>}
                    </td>
                  </tr>
                  );
                })}
              </Table>
            </Card>
          </div>
        )}
      </Modal>

      {/* Sipariş Detay Modal */}
      <Modal open={!!poModalId} onClose={() => setPoModalId(null)} title={poDetail?.po_number || 'Sipariş Detayı'} size="xl">
        {poDetailLoading ? <Spinner /> : poDetail && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-gray-500">Tedarikçi:</span> <span className="font-medium text-gray-800">{poDetail.supplier_name}</span></div>
                <div><span className="text-gray-500">Sipariş Tarihi:</span> <span className="font-medium text-gray-800">{poDetail.order_date || '-'}</span></div>
                <div><span className="text-gray-500">Beklenen:</span> <span className="font-medium text-gray-800">{poDetail.expected_date || '-'}</span></div>
                <div>
                  <span className="text-gray-500">Durum:</span>{' '}
                  <Badge color={statusBadgeColor(poDetail.status)}>
                    {STATUS_LABELS[poDetail.status] || poDetail.status}
                  </Badge>
                </div>
                {(() => {
                  const { original, tl, mode } = formatAmount(poDetail.total_amount, poDetail.currency, poDetail.exchange_rate, poDetail.reference_currency);
                  const refCur = poDetail.reference_currency || poDetail.currency || 'TRY';
                  const displayCur = mode === 'try-with-ref' ? refCur : (poDetail.currency || 'TRY');
                  return (
                    <>
                      <div>
                        <span className="text-gray-500">Para Birimi:</span>{' '}
                        <span className="font-medium text-gray-800">{displayCur}</span>
                        {poDetail.exchange_rate > 1 && (
                          <span className="ml-2 text-xs text-gray-400">Kur: {Number(poDetail.exchange_rate).toLocaleString('tr-TR', { minimumFractionDigits: 4 })}</span>
                        )}
                      </div>
                      <div>
                        <span className="text-gray-500">Toplam:</span>{' '}
                        <span className="font-semibold text-gray-900">{original}</span>
                        {tl && <span className="ml-2 text-sm text-gray-600">= {tl} TL</span>}
                      </div>
                    </>
                  );
                })()}
              </div>
              {poDetail.notes && <p className="mt-3 text-sm text-gray-600 border-t pt-3">{poDetail.notes}</p>}
            </Card>

            <Card className="p-4">
              {(() => {
                const items = poDetail.items || [];
                const gelenSayisi = items.filter(i => (i.received_quantity || 0) >= (i.quantity || 0) && (i.quantity || 0) > 0).length;
                const gelmeyenSayisi = items.filter(i => (i.received_quantity || 0) === 0).length;
                const kismiSayisi = items.filter(i => (i.received_quantity || 0) > 0 && (i.received_quantity || 0) < (i.quantity || 0)).length;
                const bekleyenTutarTry = items.reduce((s, i) => {
                  const bek = Math.max(0, (i.quantity || 0) - (i.received_quantity || 0));
                  return s + bek * (i.unit_price || 0);
                }, 0);
                const { mode: poMode } = formatAmount(poDetail.total_amount, poDetail.currency, poDetail.exchange_rate, poDetail.reference_currency);
                const poIsTryRef = poMode === 'try-with-ref';
                const poRate = Number(poDetail.exchange_rate || 1);
                const poEffCur = poIsTryRef ? poDetail.reference_currency : (poDetail.currency || 'TRY');
                const poBekSym = currencySymbol(poEffCur);
                const bekleyenDisplay = poIsTryRef && poRate > 0 ? bekleyenTutarTry / poRate : bekleyenTutarTry;
                return (
                  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100 flex-wrap">
                    <h3 className="font-semibold text-gray-700">Kalemler</h3>
                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                      <span className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-semibold border border-green-200">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                        Geldi: {gelenSayisi}
                      </span>
                      {kismiSayisi > 0 && (
                        <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-semibold border border-amber-200">
                          <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                          Kısmi: {kismiSayisi}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-semibold border border-red-200">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                        Gelmedi: {gelmeyenSayisi}
                      </span>
                      {bekleyenDisplay > 0 && (
                        <span className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-semibold border border-red-200">
                          Bekleyen: {poBekSym}{bekleyenDisplay.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
              <Table headers={['Ürün Kodu', 'Ürün Adı', 'Sipariş', 'Gelen', 'Bekleyen', 'Birim', 'Birim Fiyat', 'Bekleyen Tutar']} empty={!poDetail.items?.length && 'Kalem yok'}>
                {poDetail.items?.map(item => {
                  const gelen = item.received_quantity || 0;
                  const siparisMiktar = item.quantity || 0;
                  const bekleyenMiktar = Math.max(0, siparisMiktar - gelen);
                  const bekleyenTutar = bekleyenMiktar * (item.unit_price || 0);
                  const tamGeldi = gelen >= siparisMiktar && siparisMiktar > 0;
                  const hicGelmedi = gelen === 0;
                  const rowCls = tamGeldi
                    ? 'bg-green-50 border-b border-green-100'
                    : hicGelmedi
                      ? 'bg-red-50 border-b border-red-100'
                      : 'bg-amber-50 border-b border-amber-100';
                  const nameCls = tamGeldi ? 'text-green-800' : hicGelmedi ? 'text-red-800' : 'text-amber-800';
                  const { mode } = formatAmount(poDetail.total_amount, poDetail.currency, poDetail.exchange_rate, poDetail.reference_currency);
                  const isTryRef = mode === 'try-with-ref';
                  const effectiveCur = isTryRef ? poDetail.reference_currency : (poDetail.currency || 'TRY');
                  const sym = currencySymbol(effectiveCur);
                  const rate = Number(poDetail.exchange_rate || 1);
                  // TRY referanslı siparişlerde birim fiyatlar TL, dövize çevir
                  const displayUnitPrice = isTryRef && rate > 0
                    ? Number(item.unit_price || 0) / rate
                    : Number(item.unit_price || 0);
                  const displayBekleyenTutar = isTryRef && rate > 0
                    ? bekleyenTutar / rate
                    : bekleyenTutar;
                  return (
                    <tr key={item.id} className={rowCls}>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.product_code}</td>
                      <td className="px-3 py-2 text-sm font-medium">
                        <span className={nameCls}>{item.product_name}</span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{siparisMiktar}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-green-700">{gelen > 0 ? gelen : '—'}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-red-700">{bekleyenMiktar > 0 ? bekleyenMiktar : '—'}</td>
                      <td className="px-3 py-2 text-sm text-gray-500">{item.unit}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{sym}{displayUnitPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-red-700">
                        {displayBekleyenTutar > 0 ? `${sym}${displayBekleyenTutar.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
