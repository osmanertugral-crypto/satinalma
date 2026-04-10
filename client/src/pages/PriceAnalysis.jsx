import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMonthlySummary, getProductPriceAnalysis } from '../api';
import { PageHeader, Card, Badge, Spinner } from '../components/UI';
import { TrendingUp, TrendingDown, Minus, Search, BarChart2, LineChart as LineChartIcon, Filter } from 'lucide-react';
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

  if (isLoading) return <Spinner />;
  if (!data || !data.months || data.months.length === 0) {
    return <Card className="p-8 text-center text-gray-400">Henüz aylık veri bulunamadı. Önce bir satınalma raporu içe aktarın.</Card>;
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
          <h3 className="font-semibold text-gray-700 mb-4">Aylık Tablo</h3>
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
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['product-price-analysis', catFilter, search],
    queryFn: () => getProductPriceAnalysis({ category: catFilter || undefined, search: search || undefined }).then(r => r.data),
    keepPreviousData: true
  });

  // En çok artan ve en çok düşen ürünler
  const topIncreasing = useMemo(() =>
    [...products].filter(p => p.overallChange != null).sort((a, b) => b.overallChange - a.overallChange).slice(0, 5),
    [products]
  );
  const topDecreasing = useMemo(() =>
    [...products].filter(p => p.overallChange != null).sort((a, b) => a.overallChange - b.overallChange).slice(0, 5),
    [products]
  );

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
          <div className="text-sm text-gray-500">
            <Filter size={14} className="inline mr-1" />
            {products.length} ürün
          </div>
        </div>
      </Card>

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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-3 font-medium text-gray-500">Kod</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500">Ürün</th>
                <th className="text-left py-2.5 px-3 font-medium text-gray-500">Kategori</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">İlk Fiyat</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">Q4 2025 Ort.</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">2026 Ort.</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">Son Fiyat</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">Toplam Değişim</th>
                <th className="text-right py-2.5 px-3 font-medium text-gray-500">Q4→2026</th>
                <th className="text-center py-2.5 px-3 font-medium text-gray-500">Kayıt</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
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
                  <td className="py-2 px-3 text-right text-gray-600">{p.q4Avg ? formatTRY(p.q4Avg) : '—'}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{p.recentAvg ? formatTRY(p.recentAvg) : '—'}</td>
                  <td className="py-2 px-3 text-right font-semibold text-gray-800">{formatTRY(p.lastPrice)}</td>
                  <td className="py-2 px-3 text-right"><ChangeIndicator value={p.overallChange} /></td>
                  <td className="py-2 px-3 text-right"><ChangeIndicator value={p.q4ToRecentChange} /></td>
                  <td className="py-2 px-3 text-center text-xs text-gray-400">{p.priceCount}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400">Fiyat verisi bulunamadı</td></tr>
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
