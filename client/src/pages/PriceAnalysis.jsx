import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMonthlySummary, getProductPriceAnalysis } from '../api';
import { PageHeader, Card, Badge, Spinner } from '../components/UI';
import { TrendingUp, TrendingDown, Minus, Search, BarChart2, LineChart as LineChartIcon, Filter, ArrowUpDown, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Area, AreaChart, Cell, PieChart, Pie
} from 'recharts';

const CATEGORY_COLORS = {
  HAMMADDE: '#1F4E79',
  'E-TICARET': '#375623',
  ARGE: '#C05621',
  NUMUNE: '#B7791F',
  MARKETING: '#6B46C1',
  'UYKU KAPSULU': '#0891B2',
  KABIN: '#059669',
  DIGER: '#6B7280',
  GENEL_TOPLAM: '#1E40AF',
};

const CATEGORY_LABELS = {
  HAMMADDE: 'Hammadde',
  'E-TICARET': 'E-Ticaret',
  ARGE: 'Ar-Ge',
  NUMUNE: 'Numune',
  MARKETING: 'Marketing',
  'UYKU KAPSULU': 'Uyku Kapsülü',
  KABIN: 'Kabin',
  DIGER: 'Diğer',
};

function formatTRY(val) {
  if (val == null) return '-';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);
}

function formatNum(val) {
  if (val == null) return '-';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(val);
}

function exportRowsToExcel(filename, sheetName, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function ExportExcelButton({ onClick, label = 'Excel Indir' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Download size={14} />
      {label}
    </button>
  );
}

function ChangeIndicator({ value }) {
  if (value == null) return <span className="text-gray-300">—</span>;
  const color = value > 10 ? 'text-red-600' : value > 0 ? 'text-amber-600' : value < 0 ? 'text-emerald-600' : 'text-gray-500';
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${color}`}>
      <Icon size={14} />
      %{formatNum(Math.abs(value))}
    </span>
  );
}

// ── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'monthly', label: 'Aylık Özet', icon: BarChart2 },
  { id: 'products', label: 'Ürün Fiyat Analizi', icon: LineChartIcon },
];

export default function PriceAnalysisPage() {
  const [activeTab, setActiveTab] = useState('monthly');

  return (
    <div className="p-6">
      <PageHeader
        title="Grafiksel Fiyat Analizi"
        subtitle="Aylık satınalma özeti ve ürün bazlı fiyat değişim analizi"
      />

      {/* Tab Bar */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'monthly' && <MonthlySummaryTab />}
      {activeTab === 'products' && <ProductAnalysisTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: AYLIK ÖZET
// ══════════════════════════════════════════════════════════════════════════════
function MonthlySummaryTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['monthly-summary'],
    queryFn: () => getMonthlySummary().then(r => r.data)
  });
  const [incSortBy, setIncSortBy] = useState('changePercent');
  const [incSortDir, setIncSortDir] = useState('desc');
  const [detailSortBy, setDetailSortBy] = useState('changePercent');
  const [detailSortDir, setDetailSortDir] = useState('desc');

  if (isLoading) return <Spinner />;
  if (!data || (!data.months && !data.monthTrend)) {
    return <Card className="p-8 text-center text-gray-400">Henüz aylık veri bulunamadı. Önce bir satınalma raporu içe aktarın.</Card>;
  }

  if (data.mode === 'excel-comparison') {
    const summary = data.summary || {};
    const monthTrend = data.monthTrend || [];
    const comparisons = data.comparisons || [];
    const topIncreases = data.topIncreases || [];

    const sortedTopIncreases = [...topIncreases].sort((a, b) => {
      const getVal = (x) => {
        if (incSortBy === 'name') return String(x.name || '');
        if (incSortBy === 'currentPrice') return Number(x.currentPrice || Number.NEGATIVE_INFINITY);
        return Number(x.changePercent || Number.NEGATIVE_INFINITY);
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av).localeCompare(String(bv), 'tr');
        return incSortDir === 'asc' ? cmp : -cmp;
      }
      if (av === bv) return String(a.code || '').localeCompare(String(b.code || ''), 'tr');
      return incSortDir === 'asc' ? av - bv : bv - av;
    });

    const sortedComparisons = [...comparisons].sort((a, b) => {
      const getVal = (x) => {
        if (detailSortBy === 'name') return String(x.name || '');
        if (detailSortBy === 'currentDate') return String(x.currentDate || '');
        if (detailSortBy === 'previousDate') return String(x.previousDate || '');
        if (detailSortBy === 'currentPrice') return Number(x.currentPrice || Number.NEGATIVE_INFINITY);
        if (detailSortBy === 'previousPrice') return Number(x.previousPrice || Number.NEGATIVE_INFINITY);
        return Number(x.changePercent || Number.NEGATIVE_INFINITY);
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (typeof av === 'string' || typeof bv === 'string') {
        const cmp = String(av).localeCompare(String(bv), 'tr');
        return detailSortDir === 'asc' ? cmp : -cmp;
      }
      if (av === bv) return String(a.code || '').localeCompare(String(b.code || ''), 'tr');
      return detailSortDir === 'asc' ? av - bv : bv - av;
    });

    const toggleIncSort = (key) => {
      if (incSortBy === key) {
        setIncSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setIncSortBy(key);
      setIncSortDir('desc');
    };

    const toggleDetailSort = (key) => {
      if (detailSortBy === key) {
        setDetailSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        return;
      }
      setDetailSortBy(key);
      setDetailSortDir('desc');
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryCard label="Mevcut Ay" value={data.currentMonth || '-'} />
          <SummaryCard label="Bir Onceki Ay" value={data.previousMonth || '-'} />
          <SummaryCard label="Mevcut Ay Toplam" value={formatTRY(summary.currentMonthTotal || 0)} />
          <SummaryCard label="Onceki Ay Toplam" value={formatTRY(summary.previousMonthTotal || 0)} />
          <SummaryCard label="Aydan Aya Degisim" value={summary.monthToMonthChangePercent == null ? '-' : `%${formatNum(summary.monthToMonthChangePercent)}`} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SummaryCard label="Mevcut Ay Alim Satiri" value={formatNum(summary.currentMonthOrderCount || 0)} />
          <SummaryCard label="Mevcut Ay Tedarikci" value={formatNum(summary.currentMonthSupplierCount || 0)} />
          <SummaryCard label="Karsilastirilan Urun" value={formatNum(summary.comparedProductCount || 0)} />
        </div>

        <Card className="p-4">
          <h3 className="font-semibold text-gray-700 mb-4">Son 12 Ay Toplam Alim Trendi</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthTrend} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(val, key) => [key === 'GENEL_TOPLAM' ? formatTRY(val) : formatNum(val), key === 'GENEL_TOPLAM' ? 'Toplam Tutar' : key]} />
              <Bar dataKey="GENEL_TOPLAM" fill="#1E40AF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4 overflow-auto">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-700">En Yuksek Artislar (Son Alim vs Onceki Alim)</h3>
              <ExportExcelButton
                onClick={() => exportRowsToExcel(
                  `en-yuksek-artislar-${data.currentMonth || 'rapor'}.xlsx`,
                  'EnYuksekArtislar',
                  sortedTopIncreases.map(item => ({
                    StokKodu: item.code,
                    Urun: item.name,
                    SonAlimTarihi: item.currentDate,
                    SonAlimTedarikci: item.currentSupplier,
                    SonFiyat: item.currentPrice,
                    OncekiAlimTarihi: item.previousDate,
                    OncekiAlimTedarikci: item.previousSupplier,
                    OncekiFiyat: item.previousPrice,
                    ArtisYuzde: item.changePercent,
                  }))
                )}
              />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2">
                    <button type="button" onClick={() => toggleIncSort('name')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Urun
                      <ArrowUpDown size={13} className={incSortBy === 'name' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-2 px-2">
                    <button type="button" onClick={() => toggleIncSort('changePercent')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Artis
                      <ArrowUpDown size={13} className={incSortBy === 'changePercent' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-2 px-2">
                    <button type="button" onClick={() => toggleIncSort('currentPrice')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Son Fiyat
                      <ArrowUpDown size={13} className={incSortBy === 'currentPrice' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTopIncreases.slice(0, 10).map(item => (
                  <tr key={`${item.code}-${item.currentDate}`} className="border-b border-gray-100">
                    <td className="py-2 px-2">
                      <div className="font-medium text-gray-700">{item.name}</div>
                      <div className="text-xs text-gray-400">{item.code}</div>
                    </td>
                    <td className="py-2 px-2 text-right"><ChangeIndicator value={item.changePercent} /></td>
                    <td className="py-2 px-2 text-right text-gray-700">{formatTRY(item.currentPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-4 overflow-auto">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-gray-700">Son Alim ve Onceki Alim Detayi</h3>
              <ExportExcelButton
                onClick={() => exportRowsToExcel(
                  `son-alim-karsilastirma-${data.currentMonth || 'rapor'}.xlsx`,
                  'SonAlimKarsilastirma',
                  sortedComparisons.map(item => ({
                    StokKodu: item.code,
                    Urun: item.name,
                    SonAlimTarihi: item.currentDate,
                    SonAlimTedarikci: item.currentSupplier,
                    SonFiyat: item.currentPrice,
                    SonMiktar: item.currentQty,
                    OncekiAlimTarihi: item.previousDate,
                    OncekiAlimTedarikci: item.previousSupplier,
                    OncekiFiyat: item.previousPrice,
                    ArtisYuzde: item.changePercent,
                  }))
                )}
              />
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2">
                    <button type="button" onClick={() => toggleDetailSort('name')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Urun
                      <ArrowUpDown size={13} className={detailSortBy === 'name' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-left py-2 px-2">
                    <button type="button" onClick={() => toggleDetailSort('currentDate')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Son Alim
                      <ArrowUpDown size={13} className={detailSortBy === 'currentDate' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-left py-2 px-2">
                    <button type="button" onClick={() => toggleDetailSort('previousDate')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Onceki Alim
                      <ArrowUpDown size={13} className={detailSortBy === 'previousDate' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                  <th className="text-right py-2 px-2">
                    <button type="button" onClick={() => toggleDetailSort('changePercent')} className="inline-flex items-center gap-1 hover:text-gray-800">
                      Degisim
                      <ArrowUpDown size={13} className={detailSortBy === 'changePercent' ? 'text-blue-600' : 'text-gray-400'} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedComparisons.slice(0, 80).map(item => (
                  <tr key={`${item.code}-${item.currentDate}-detail`} className="border-b border-gray-100">
                    <td className="py-2 px-2">
                      <div className="font-medium text-gray-700">{item.name}</div>
                      <div className="text-xs text-gray-400">{item.code}</div>
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-700">
                      <div>{item.currentDate || '-'}</div>
                      <div className="text-gray-500">{item.currentSupplier || '-'}</div>
                      <div className="font-medium">{formatTRY(item.currentPrice)}</div>
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-700">
                      <div>{item.previousDate || '-'}</div>
                      <div className="text-gray-500">{item.previousSupplier || '-'}</div>
                      <div className="font-medium">{item.previousPrice == null ? '-' : formatTRY(item.previousPrice)}</div>
                    </td>
                    <td className="py-2 px-2 text-right"><ChangeIndicator value={item.changePercent} /></td>
                  </tr>
                ))}
                {sortedComparisons.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-400">Karsilastirilabilir alim bulunamadi</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    );
  }

  const { months, categories } = data;

  // Son ay pizza chart için
  const lastMonth = months[months.length - 1];
  const pieData = categories
    .filter(c => (lastMonth[c] || 0) > 0)
    .map(c => ({ name: CATEGORY_LABELS[c] || c, value: lastMonth[c] || 0, color: CATEGORY_COLORS[c] || '#6B7280' }));

  // Toplam genel
  const grandTotal = months.reduce((s, m) => s + (m.GENEL_TOPLAM || 0), 0);

  return (
    <div className="space-y-6">
      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Toplam Ay" value={months.length} />
        <SummaryCard label="Toplam Harcama" value={formatTRY(grandTotal)} />
        <SummaryCard label="Aylık Ortalama" value={formatTRY(grandTotal / months.length)} />
        <SummaryCard label="Kategori Sayısı" value={categories.length} />
      </div>

      {/* Aylık Stacked Bar Chart */}
      <Card className="p-4">
        <h3 className="font-semibold text-gray-700 mb-4">Aylık Kategori Bazlı Satınalma Toplamları</h3>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={months} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val, name) => [formatTRY(val), CATEGORY_LABELS[name] || name]}
              labelFormatter={l => `Ay: ${l}`}
            />
            <Legend formatter={v => CATEGORY_LABELS[v] || v} />
            {categories.map(cat => (
              <Bar key={cat} dataKey={cat} stackId="a" fill={CATEGORY_COLORS[cat] || '#6B7280'} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Genel Toplam Trend Line */}
      <Card className="p-4">
        <h3 className="font-semibold text-gray-700 mb-4">Genel Toplam Trend</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={months} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1E40AF" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#1E40AF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(val) => [formatTRY(val), 'Genel Toplam']} />
            <Area type="monotone" dataKey="GENEL_TOPLAM" stroke="#1E40AF" strokeWidth={2}
              fillOpacity={1} fill="url(#colorTotal)" />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Kategori dağılımı (son ay) Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-4">
          <h3 className="font-semibold text-gray-700 mb-4">Son Ay Kategori Dağılımı ({lastMonth.month})</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                outerRadius={110} label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`}
                labelLine={{ strokeWidth: 1 }}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={val => formatTRY(val)} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Aylık tablo */}
        <Card className="p-4 overflow-auto">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-700">Aylık Tablo</h3>
            <ExportExcelButton
              onClick={() => exportRowsToExcel(
                'aylik-ozet.xlsx',
                'AylikOzet',
                months.map(m => {
                  const row = { Ay: m.month, Toplam: m.GENEL_TOPLAM };
                  categories.forEach(c => { row[CATEGORY_LABELS[c] || c] = m[c] || 0; });
                  return row;
                })
              )}
            />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-500">Ay</th>
                {categories.map(c => (
                  <th key={c} className="text-right py-2 px-2 font-medium text-gray-500">{CATEGORY_LABELS[c] || c}</th>
                ))}
                <th className="text-right py-2 px-2 font-bold text-gray-700">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.month} className={i % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="py-1.5 px-2 font-medium text-gray-700">{m.month}</td>
                  {categories.map(c => (
                    <td key={c} className="py-1.5 px-2 text-right text-gray-600">{formatTRY(m[c] || 0)}</td>
                  ))}
                  <td className="py-1.5 px-2 text-right font-bold text-gray-800">{formatTRY(m.GENEL_TOPLAM)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-blue-50">
                <td className="py-2 px-2 font-bold text-gray-800">TOPLAM</td>
                {categories.map(c => (
                  <td key={c} className="py-2 px-2 text-right font-bold text-gray-700">
                    {formatTRY(months.reduce((s, m) => s + (m[c] || 0), 0))}
                  </td>
                ))}
                <td className="py-2 px-2 text-right font-bold text-blue-800">{formatTRY(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: ÜRÜN FİYAT ANALİZİ
// ══════════════════════════════════════════════════════════════════════════════
function ProductAnalysisTab() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sortBy, setSortBy] = useState('overallChange');
  const [sortDir, setSortDir] = useState('desc');

  const { data: payload, isLoading, isError } = useQuery({
    queryKey: ['product-price-analysis', catFilter, search, periodFilter, yearFilter, monthFilter],
    queryFn: () => getProductPriceAnalysis({
      category: catFilter || undefined,
      search: search || undefined,
      period: periodFilter,
      year: yearFilter || undefined,
      month: monthFilter || undefined,
    }).then(r => r.data),
    keepPreviousData: true
  });

  const products = Array.isArray(payload) ? payload : (payload?.data || []);
  const summary = Array.isArray(payload)
    ? {
        totalProducts: products.length,
        totalStockQty: products.reduce((sum, p) => sum + Number(p.totalQty || 0), 0),
        avgIncreasePercent: (() => {
          const vals = products.map(p => p.overallChange).filter(v => v != null);
          return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        })(),
        weightedIncreasePercent: null,
      }
    : (payload?.summary || {});
  const availableYears = Array.isArray(payload)
    ? [...new Set(products.map(p => String(p.lastDate || '').slice(0, 4)).filter(Boolean).map(v => Number(v)).filter(Boolean))].sort((a, b) => b - a)
    : (payload?.availableYears || []);

  useEffect(() => {
    if (!selectedProduct) return;
    const exists = products.some(p => p.product_id === selectedProduct.product_id);
    if (!exists) setSelectedProduct(null);
  }, [products, selectedProduct]);

  const MONTH_OPTIONS = [
    { value: '1', label: 'Ocak' },
    { value: '2', label: 'Subat' },
    { value: '3', label: 'Mart' },
    { value: '4', label: 'Nisan' },
    { value: '5', label: 'Mayis' },
    { value: '6', label: 'Haziran' },
    { value: '7', label: 'Temmuz' },
    { value: '8', label: 'Agustos' },
    { value: '9', label: 'Eylul' },
    { value: '10', label: 'Ekim' },
    { value: '11', label: 'Kasim' },
    { value: '12', label: 'Aralik' },
  ];

  const PERIOD_OPTIONS = [
    { value: 'all', label: 'Tum Donem' },
    { value: '3', label: 'Son 3 Ay' },
    { value: '6', label: 'Son 6 Ay' },
    { value: '12', label: 'Son 1 Yil' },
  ];

  // En çok artan ve en çok düşen ürünler
  const topIncreasing = useMemo(() =>
    [...products].filter(p => p.overallChange != null).sort((a, b) => b.overallChange - a.overallChange).slice(0, 5),
    [products]
  );
  const topDecreasing = useMemo(() =>
    [...products].filter(p => p.overallChange != null).sort((a, b) => a.overallChange - b.overallChange).slice(0, 5),
    [products]
  );

  const sortedProducts = useMemo(() => {
    const list = [...products];
    const getVal = (p, key) => {
      if (key === 'overallChange') return Number(p.overallChange ?? Number.NEGATIVE_INFINITY);
      if (key === 'totalQty') return Number(p.totalQty ?? Number.NEGATIVE_INFINITY);
      return 0;
    };
    list.sort((a, b) => {
      const av = getVal(a, sortBy);
      const bv = getVal(b, sortBy);
      if (av === bv) return String(a.code || '').localeCompare(String(b.code || ''), 'tr');
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [products, sortBy, sortDir]);

  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortBy(column);
    setSortDir('desc');
  }

  // Kategori dağılım istatistiği
  const catStats = useMemo(() => {
    const map = {};
    for (const p of products) {
      if (!map[p.anaGrup]) map[p.anaGrup] = { count: 0, avgChange: 0, total: 0 };
      map[p.anaGrup].count++;
      if (p.overallChange != null) {
        map[p.anaGrup].total += p.overallChange;
        map[p.anaGrup].avgChange = map[p.anaGrup].total / map[p.anaGrup].count;
      }
    }
    return map;
  }, [products]);

  return (
    <div className="space-y-6">
      {isError && (
        <Card className="p-4 border border-red-200 bg-red-50 text-red-700 text-sm">
          Fiyat analizi verisi alınamadı. Sunucuyu yeniden başlatıp tekrar deneyin.
        </Card>
      )}

      {/* Filtreler */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Ürün Ara</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Stok kodu veya ürün adı..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Kategori</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={catFilter} onChange={e => setCatFilter(e.target.value)}
            >
              <option value="">Tümü</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[260px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Donem</label>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white">
              {PERIOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriodFilter(option.value)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${periodFilter === option.value ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Yil</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={yearFilter}
              onChange={e => setYearFilter(e.target.value)}
            >
              <option value="">Tumu</option>
              {availableYears.map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Ay</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
            >
              <option value="">Tum Aylar</option>
              {MONTH_OPTIONS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-500">
            <Filter size={14} className="inline mr-1" />
            {products.length} ürün
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Filtrelenen Urun" value={summary.totalProducts ?? products.length} />
        <SummaryCard label="Toplam Stok Adedi" value={formatNum(summary.totalStockQty || 0)} />
        <SummaryCard label="Ort. Artis" value={summary.avgIncreasePercent == null ? '-' : `%${formatNum(summary.avgIncreasePercent)}`} />
        <SummaryCard label="Stok Agirlikli Artis" value={summary.weightedIncreasePercent == null ? '-' : `%${formatNum(summary.weightedIncreasePercent)}`} />
      </div>

      {/* Kategori özet kartları */}
      {!catFilter && Object.keys(catStats).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {Object.entries(catStats).map(([cat, stat]) => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className="text-left p-3 rounded-xl border border-gray-200 bg-white hover:shadow-md transition-shadow">
              <div className="w-3 h-3 rounded-full mb-2" style={{ backgroundColor: CATEGORY_COLORS[cat] }} />
              <p className="text-xs font-medium text-gray-500">{CATEGORY_LABELS[cat] || cat}</p>
              <p className="text-lg font-bold text-gray-800">{stat.count}</p>
              <p className="text-xs mt-0.5">
                <ChangeIndicator value={Math.round(stat.avgChange * 100) / 100} />
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Top 5 Artan / Azalan */}
      {!catFilter && !search && products.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-4">
            <h3 className="font-semibold text-red-700 mb-3 flex items-center gap-2">
              <TrendingUp size={18} /> En Çok Artan 5 Ürün
            </h3>
            {topIncreasing.map(p => (
              <div key={p.product_id}
                className="flex items-center justify-between py-2 border-b border-gray-50 cursor-pointer hover:bg-red-50 px-2 rounded"
                onClick={() => setSelectedProduct(p)}
              >
                <div>
                  <span className="text-xs font-mono text-gray-400 mr-2">{p.code}</span>
                  <span className="text-sm text-gray-700">{p.name}</span>
                </div>
                <ChangeIndicator value={p.overallChange} />
              </div>
            ))}
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-emerald-700 mb-3 flex items-center gap-2">
              <TrendingDown size={18} /> En Çok Düşen 5 Ürün
            </h3>
            {topDecreasing.map(p => (
              <div key={p.product_id}
                className="flex items-center justify-between py-2 border-b border-gray-50 cursor-pointer hover:bg-emerald-50 px-2 rounded"
                onClick={() => setSelectedProduct(p)}
              >
                <div>
                  <span className="text-xs font-mono text-gray-400 mr-2">{p.code}</span>
                  <span className="text-sm text-gray-700">{p.name}</span>
                </div>
                <ChangeIndicator value={p.overallChange} />
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Seçili ürün detay grafiği */}
      {selectedProduct && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800">
                {selectedProduct.code} — {selectedProduct.name}
              </h3>
              <p className="text-sm text-gray-500">
                <Badge color={selectedProduct.overallChange > 10 ? 'red' : selectedProduct.overallChange > 0 ? 'yellow' : 'green'}>
                  {CATEGORY_LABELS[selectedProduct.anaGrup] || selectedProduct.anaGrup}
                </Badge>
                <span className="ml-3">İlk: {formatTRY(selectedProduct.firstPrice)} ({selectedProduct.firstDate})</span>
                <span className="ml-3">Son: {formatTRY(selectedProduct.lastPrice)} ({selectedProduct.lastDate})</span>
                <span className="ml-3">Toplam Değişim: <ChangeIndicator value={selectedProduct.overallChange} /></span>
              </p>
            </div>
            <button onClick={() => setSelectedProduct(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={selectedProduct.trend} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatNum(v)} />
              <Tooltip formatter={(val, name) => {
                const labels = { avgPrice: 'Ort. Fiyat', minPrice: 'Min', maxPrice: 'Max' };
                return [formatTRY(val), labels[name] || name];
              }} />
              <Legend formatter={v => ({ avgPrice: 'Ort. Fiyat', minPrice: 'Min', maxPrice: 'Max' }[v] || v)} />
              <Line type="monotone" dataKey="avgPrice" stroke="#1E40AF" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="minPrice" stroke="#059669" strokeWidth={1} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="maxPrice" stroke="#DC2626" strokeWidth={1} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Ürün listesi tablosu */}
      {isLoading ? <Spinner /> : (
        <Card className="overflow-auto">
          <div className="p-3 border-b border-gray-200 flex justify-end">
            <ExportExcelButton
              onClick={() => exportRowsToExcel(
                `urun-fiyat-analizi-${new Date().toISOString().slice(0, 10)}.xlsx`,
                'UrunFiyatAnalizi',
                sortedProducts.map(p => ({
                  StokKodu: p.code,
                  Urun: p.name,
                  Kategori: CATEGORY_LABELS[p.anaGrup] || p.anaGrup,
                  IlkFiyat: p.firstPrice,
                  SonFiyat: p.lastPrice,
                  ToplamDegisimYuzde: p.overallChange,
                  ToplamAdet: p.totalQty,
                  SonAlimTarihi: p.lastDate,
                  KayitSayisi: p.priceCount,
                }))
              )}
            />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-3 font-medium text-gray-500">Kod</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500">Ürün</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500">Kategori</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">İlk Fiyat</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">Son Fiyat</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">
                  <button type="button" onClick={() => toggleSort('overallChange')} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-800">
                    Toplam Değişim
                    <ArrowUpDown size={13} className={sortBy === 'overallChange' ? 'text-blue-600' : 'text-gray-400'} />
                  </button>
                </th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">
                  <button type="button" onClick={() => toggleSort('totalQty')} className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-800">
                    Toplam Adet
                    <ArrowUpDown size={13} className={sortBy === 'totalQty' ? 'text-blue-600' : 'text-gray-400'} />
                  </button>
                </th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">Son Alim</th>
                <th className="text-center py-2.5 px-3 font-medium text-gray-500">Kayıt</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map((p, i) => (
                <tr
                  key={p.product_id}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    selectedProduct?.product_id === p.product_id ? 'bg-blue-50' : i % 2 === 0 ? 'hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'
                  }`}
                  onClick={() => setSelectedProduct(p)}
                >
                  <td className="py-2 px-3 font-mono text-xs text-gray-500">{p.code}</td>
                  <td className="py-2 px-3 font-medium text-gray-800 max-w-[200px] truncate">{p.name}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[p.anaGrup] }} />
                      <span className="text-xs text-gray-600">{CATEGORY_LABELS[p.anaGrup] || p.anaGrup}</span>
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right text-gray-600">{formatTRY(p.firstPrice)}</td>
                  <td className="py-2 px-3 text-right font-semibold text-gray-800">{formatTRY(p.lastPrice)}</td>
                  <td className="py-2 px-3 text-right"><ChangeIndicator value={p.overallChange} /></td>
                  <td className="py-2 px-3 text-right text-gray-600">{formatNum(p.totalQty || 0)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{p.lastDate || '-'}</td>
                  <td className="py-2 px-3 text-center text-xs text-gray-400">{p.priceCount}</td>
                </tr>
              ))}
              {sortedProducts.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">Fiyat verisi bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
    </Card>
  );
}
