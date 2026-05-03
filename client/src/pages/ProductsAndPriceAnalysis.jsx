import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getProducts, getProductStats, createProduct, updateProduct, deleteProduct,
  getCategories, createCategory, syncWarehouse,
  getMonthlySummary,
  getProductPurchaseSummary, getProductPurchaseDetail,
} from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Textarea, Table, Spinner, StatCard } from '../components/UI';
import {
  Plus, Pencil, Trash2, Eye, Search, Tag, ExternalLink, RefreshCw,
  ArrowUpDown, BarChart3, TrendingUp, TrendingDown, Package, AlertTriangle,
  Calendar, DollarSign, PieChart as PieChartIcon, LineChart as LineChartIcon,
  X, ChevronDown, Truck, Hash, Filter, Download, Car, Layers,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MultiSelectFilter from '../components/MultiSelectFilter';
import { normSearch } from '../utils/searchUtils';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line, LineChart, AreaChart, Area,
} from 'recharts';

// ── Sabitler ─────────────────────────────────────────────────────────────────
const MAIN_TABS = [
  { id: 'products', label: 'Ürünler', icon: Package },
  { id: 'analysis', label: 'Fiyat Analizi', icon: TrendingUp },
  { id: 'models', label: 'Ürün Modelleri', icon: Car },
];

const YEARS = ['2022', '2023', '2024', '2025', '2026'];
const MONTHS = [
  { value: '', label: 'Tüm Aylar' },
  { value: '1', label: 'Ocak' }, { value: '2', label: 'Şubat' },
  { value: '3', label: 'Mart' }, { value: '4', label: 'Nisan' },
  { value: '5', label: 'Mayıs' }, { value: '6', label: 'Haziran' },
  { value: '7', label: 'Temmuz' }, { value: '8', label: 'Ağustos' },
  { value: '9', label: 'Eylül' }, { value: '10', label: 'Ekim' },
  { value: '11', label: 'Kasım' }, { value: '12', label: 'Aralık' },
];
const COLORS = ['#3b82f6','#ef4444','#f59e0b','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316','#6366f1','#14b8a6'];
const EMPTY_PRODUCT = { code: '', name: '', category_id: '', unit: 'adet', min_stock_level: 0, description: '' };

const HOTOMOBIL_MODELS = [
  {
    category: 'ATLAS CAMPER TOPPER',
    color: '#1E40AF',
    items: [
      { name: 'Atlas Camper Topper', abbr: 'ACT', desc: 'Araç üstü yerleşim — şase bağımsız kabin çözümü' },
    ],
  },
  {
    category: 'EU SIZE PICK-UP CAMPER',
    color: '#065F46',
    items: [
      { name: 'Gladiator S', abbr: 'GS', desc: 'Küçük Avrupa ölçülü pick-up karavan' },
      { name: 'Gladiator SM', abbr: 'GSM', desc: 'Orta-küçük Avrupa ölçülü pick-up karavan' },
      { name: 'Gladiator SH', abbr: 'GSH', desc: 'Yüksek profilli Avrupa ölçülü pick-up karavan' },
      { name: 'Gladiator SE', abbr: 'GSE', desc: 'Genişletilmiş Avrupa ölçülü pick-up karavan' },
    ],
  },
  {
    category: 'USA SIZE PICK-UP CAMPER',
    color: '#92400E',
    items: [
      { name: 'Gladiator L', abbr: 'GL', desc: 'Büyük ABD ölçülü pick-up karavan' },
      { name: 'Gladiator XL', abbr: 'GXL', desc: 'Ekstra büyük ABD ölçülü pick-up karavan' },
      { name: 'Gladiator KLE', abbr: 'GKLE', desc: 'ABD ölçülü lüks donanımlı pick-up karavan' },
    ],
  },
  {
    category: 'CYBERGLAD PICK-UP CAMPER',
    color: '#4C1D95',
    items: [
      { name: 'Cyberglad', abbr: 'CG', desc: 'Modern tasarımlı elektrikli pick-up karavan' },
    ],
  },
];

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────
function fmtNum(v, opts = {}) {
  if (v == null) return '-';
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2, ...opts });
}
function fmtPrice(v, currency = 'TRY') {
  if (v == null) return '-';
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₺';
  return `${sym}${fmtNum(v, { minimumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('tr-TR');
}
function changeBadge(pct) {
  if (pct == null) return <span className="text-gray-300">—</span>;
  const cls = pct > 20 ? 'text-red-600' : pct > 5 ? 'text-amber-600' : pct < 0 ? 'text-emerald-600' : 'text-gray-500';
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : null;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold text-xs ${cls}`}>
      {Icon && <Icon size={12} />}
      {pct > 0 ? '+' : ''}{fmtNum(pct)}%
    </span>
  );
}

// ── Ana sayfa bileşeni ────────────────────────────────────────────────────────
export default function ProductsAndPriceAnalysisPage() {
  const [activeTab, setActiveTab] = useState('products');

  return (
    <div className="p-6">
      <PageHeader
        title="Ürünler ve Fiyat Analizi"
        subtitle="Ürün yönetimi, satınalma analizi ve Hotomobil model kataloğu"
      />

      {/* Ana Sekme Çubuğu */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {MAIN_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
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

      {activeTab === 'products' && <ProductsTab />}
      {activeTab === 'analysis' && <PriceAnalysisTab />}
      {activeTab === 'models' && <ModelsTab />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKMESİ 1: ÜRÜNLER
// ══════════════════════════════════════════════════════════════════════════════
function ProductsTab() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState([]);
  const [sortBy, setSortBy] = useState('name');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [deleteId, setDeleteId] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [syncResult, setSyncResult] = useState(null);
  const [showCharts, setShowCharts] = useState(true);
  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));

  const CHART_YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));
  const MONTH_LABELS = ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => getCategories().then(r => r.data) });

  const mergedCategories = useMemo(() => {
    const map = {};
    for (const cat of categories) {
      const key = normSearch(cat.name);
      if (!map[key]) map[key] = { key, name: cat.name, ids: [] };
      map[key].ids.push(String(cat.id));
    }
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [categories]);

  const categoryIdParam = useMemo(() => {
    if (categoryFilter.length === 0) return undefined;
    const ids = categoryFilter.flatMap(key => mergedCategories.find(c => c.key === key)?.ids || []);
    return ids.length > 0 ? ids.join(',') : undefined;
  }, [categoryFilter, mergedCategories]);

  const { data: rawProducts = [], isLoading } = useQuery({
    queryKey: ['products', search, categoryIdParam],
    queryFn: () => getProducts({ search: search || undefined, category_id: categoryIdParam }).then(r => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['product-stats', chartYear],
    queryFn: () => getProductStats({ year: chartYear }).then(r => r.data),
  });

  const chartMonthly = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const found = statsData?.monthly?.find(r => r.month === m);
      return { ay: MONTH_LABELS[m].slice(0, 3), ayFull: MONTH_LABELS[m], toplam_tutar: found?.toplam_tutar || 0, urun_cesidi: found?.urun_cesidi || 0 };
    });
  }, [statsData]);

  const stockSummary = statsData?.stockSummary || { toplam_urun: 0, kritik_stok: 0, stoksuz: 0, yeterli_stok: 0 };
  const stockPieData = useMemo(() => [
    { name: 'Yeterli', value: stockSummary.yeterli_stok || 0, color: '#10b981' },
    { name: 'Kritik', value: stockSummary.kritik_stok || 0, color: '#f59e0b' },
    { name: 'Stoksuz', value: stockSummary.stoksuz || 0, color: '#ef4444' },
  ].filter(s => s.value > 0), [stockSummary]);

  const products = [...rawProducts].sort((a, b) => {
    if (sortBy === 'stock') return (b.stock ?? 0) - (a.stock ?? 0);
    if (sortBy === 'last_price') return (b.last_price ?? 0) - (a.last_price ?? 0);
    if (sortBy === 'last_order_date') return (b.last_order_date || '').localeCompare(a.last_order_date || '');
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });

  const syncMutation = useMutation({
    mutationFn: syncWarehouse,
    onSuccess: (res) => { qc.invalidateQueries(['products']); setSyncResult(res.data); setTimeout(() => setSyncResult(null), 5000); },
  });
  const saveMutation = useMutation({
    mutationFn: (data) => modal?.id ? updateProduct(modal.id, data) : createProduct(data),
    onSuccess: () => { qc.invalidateQueries(['products']); setModal(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { qc.invalidateQueries(['products']); setDeleteId(null); },
  });
  const catMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { qc.invalidateQueries(['categories']); setCatModal(false); setNewCatName(''); },
  });

  function openEdit(p) {
    setForm({ code: p.code, name: p.name, category_id: p.category_id || '', unit: p.unit, min_stock_level: p.min_stock_level, description: p.description || '' });
    setModal({ id: p.id });
  }

  return (
    <div>
      {/* Aksiyonlar */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">{products.length} ürün</span>
        <div className="flex gap-2">
          {canEdit && (
            <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
              {syncMutation.isPending ? 'Güncelleniyor...' : 'Stok Yenile'}
            </Button>
          )}
          {canEdit && <Button variant="secondary" onClick={() => setCatModal(true)}><Tag size={16} /> Kategori</Button>}
          {canEdit && <Button onClick={() => { setForm(EMPTY_PRODUCT); setModal('add'); }}><Plus size={16} /> Yeni Ürün</Button>}
        </div>
      </div>

      {syncResult && (
        <Card className="p-3 mb-4 bg-green-50 border-green-200">
          <p className="text-green-800 text-sm">✓ {syncResult.message || 'Stok güncellendi'} — {syncResult.count || 0} ürün</p>
        </Card>
      )}

      {/* Grafikler */}
      <Card className="mb-4">
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <Button size="sm" variant={showCharts ? 'primary' : 'secondary'} onClick={() => setShowCharts(v => !v)}>
            <BarChart3 size={15} /> {showCharts ? 'Grafikleri Gizle' : 'Grafikleri Göster'}
          </Button>
          {showCharts && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white" value={chartYear} onChange={e => setChartYear(e.target.value)}>
                {CHART_YEARS.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {showCharts && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <StatCard label="Toplam Ürün" value={stockSummary.toplam_urun || 0} icon={Package} color="blue" />
            <StatCard label="Yeterli Stok" value={stockSummary.yeterli_stok || 0} icon={Package} color="green" />
            <StatCard label="Kritik Stok" value={stockSummary.kritik_stok || 0} icon={AlertTriangle} color="orange" />
            <StatCard label="Stoksuz" value={stockSummary.stoksuz || 0} icon={AlertTriangle} color="red" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <Card>
              <div className="p-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={15} className="text-blue-500" /> Devir Hızı En Yüksek ({chartYear})</p>
              </div>
              <div className="p-3" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData?.turnover || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="code" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip formatter={v => [fmtNum(v), 'Devir Hızı']} labelFormatter={(_l, p) => p?.[0]?.payload?.name || _l} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="devir_hizi" name="Devir Hızı" radius={[0, 4, 4, 0]}>
                      {(statsData?.turnover || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="p-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><DollarSign size={15} className="text-green-500" /> En Yüksek Tutarlı ({chartYear})</p>
              </div>
              <div className="p-3" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData?.topByAmount || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${(v/1e3).toFixed(0)}K`} />
                    <YAxis type="category" dataKey="code" tick={{ fontSize: 9 }} width={100} />
                    <Tooltip formatter={v => [`₺${fmtNum(v)}`, 'Tutar']} labelFormatter={(_l, p) => p?.[0]?.payload?.name || _l} contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="toplam_tutar" name="Tutar" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="p-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><BarChart3 size={15} className="text-purple-500" /> Aylık Alım Trendi ({chartYear})</p>
              </div>
              <div className="p-3" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="ay" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : `${(v/1e3).toFixed(0)}K`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v, name) => name === 'Tutar' ? [`₺${fmtNum(v)}`, name] : [v, name]} labelFormatter={(_l, p) => p?.[0]?.payload?.ayFull || _l} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="toplam_tutar" name="Tutar" fill="#8b5cf6" radius={[4,4,0,0]} />
                    <Line yAxisId="right" type="monotone" dataKey="urun_cesidi" name="Ürün Çeşidi" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <div className="p-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><PieChartIcon size={15} className="text-amber-500" /> Stok Durumu</p>
              </div>
              <div className="p-3" style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stockPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} %${(percent*100).toFixed(0)}`}>
                      {stockPieData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={v => [`${v} ürün`, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {(statsData?.priceChanges || []).length > 0 && (
            <Card className="mb-4">
              <div className="p-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={15} className="text-red-500" /> En Çok Fiyat Değişen Ürünler ({chartYear})</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="bg-gray-50 text-gray-600 text-xs">
                    <th className="px-4 py-2 text-left">Kod</th><th className="px-4 py-2 text-left">Ürün</th>
                    <th className="px-4 py-2 text-right">Min</th><th className="px-4 py-2 text-right">Max</th>
                    <th className="px-4 py-2 text-right">Değişim</th><th className="px-4 py-2 text-center">Fiyat #</th>
                  </tr></thead>
                  <tbody>
                    {(statsData?.priceChanges || []).map((p, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-500 text-xs">{p.code}</td>
                        <td className="px-4 py-2">{p.name}</td>
                        <td className="px-4 py-2 text-right text-emerald-600">₺{fmtNum(p.min_fiyat)}</td>
                        <td className="px-4 py-2 text-right text-red-600">₺{fmtNum(p.max_fiyat)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{changeBadge(p.degisim_yuzde)}</td>
                        <td className="px-4 py-2 text-center"><Badge color="blue">{p.farkli_fiyat_sayisi}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Ürün Listesi */}
      <Card>
        <div className="p-3 border-b border-gray-100 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ürün adı veya kodu..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <MultiSelectFilter
            options={mergedCategories.map(c => ({ value: c.key, label: c.name }))}
            value={categoryFilter} onChange={setCategoryFilter}
          />
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">İsme Göre</option>
            <option value="stock">Stoğa Göre</option>
            <option value="last_price">Son Fiyata Göre</option>
            <option value="last_order_date">Son Alıma Göre</option>
          </select>
        </div>

        {isLoading ? <Spinner /> : (
          <Table headers={['Kod','Ad','Kategori','Birim','Son Fiyat','Son Alım','Stok','Durum','İşlem']} empty={products.length === 0 && 'Ürün bulunamadı'}>
            {products.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.code}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.category_name || '-'}</td>
                <td className="px-4 py-3 text-sm">{p.unit}</td>
                <td className="px-4 py-3 text-sm font-semibold">
                  {p.last_price ? `${fmtNum(p.last_price, { minimumFractionDigits: 2 })} ${p.last_currency || 'TRY'}` : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {p.last_order_date ? (
                    <div className="flex items-center gap-1">
                      <span>{new Date(p.last_order_date).toLocaleDateString('tr-TR')}</span>
                      {p.last_po_id && (
                        <button onClick={e => { e.stopPropagation(); navigate(`/po/${p.last_po_id}`); }} className="text-blue-500 hover:text-blue-700"><ExternalLink size={12} /></button>
                      )}
                    </div>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`font-medium ${p.stock <= p.min_stock_level ? 'text-red-600' : 'text-emerald-600'}`}>{p.stock ?? 0}</span>
                </td>
                <td className="px-4 py-3"><Badge color={p.active ? 'green' : 'gray'}>{p.active ? 'Aktif' : 'Pasif'}</Badge></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/products/${p.id}`)} className="text-blue-500 hover:text-blue-700"><Eye size={15} /></button>
                    {canEdit && <button onClick={() => openEdit(p)} className="text-amber-500 hover:text-amber-700"><Pencil size={15} /></button>}
                    {user?.role === 'admin' && <button onClick={() => setDeleteId(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Ürün Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Ürün Düzenle' : 'Yeni Ürün'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ürün Kodu *" name="code" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
          <Input label="Ürün Adı *" name="name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Select label="Kategori" name="category_id" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
            <option value="">Seçin...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Birim" name="unit" value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
            {['adet','kg','litre','metre','paket','kutu','ton'].map(u => <option key={u}>{u}</option>)}
          </Select>
          <Input label="Min. Stok" name="min_stock_level" type="number" value={form.min_stock_level} onChange={e => setForm(f => ({ ...f, min_stock_level: e.target.value }))} />
          <Textarea label="Açıklama" name="description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="col-span-2" />
        </div>
        {saveMutation.error && <p className="text-red-500 text-sm mt-2">{saveMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(null)}>İptal</Button>
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Yeni Kategori" size="sm">
        <Input label="Kategori Adı" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setCatModal(false)}>İptal</Button>
          <Button onClick={() => catMutation.mutate({ name: newCatName })} disabled={!newCatName || catMutation.isPending}>Ekle</Button>
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Ürün Sil" size="sm">
        <p className="text-gray-600">Bu ürünü silmek istediğinize emin misiniz?</p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>İptal</Button>
          <Button variant="danger" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>Sil</Button>
        </div>
      </Modal>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKMESİ 2: FİYAT ANALİZİ
// ══════════════════════════════════════════════════════════════════════════════
function PriceAnalysisTab() {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['product-purchase-summary', selectedYear, selectedMonth, search],
    queryFn: () => getProductPurchaseSummary({
      year: selectedYear || undefined,
      month: selectedMonth || undefined,
      search: search || undefined,
    }).then(r => r.data),
    keepPreviousData: true,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['product-purchase-detail', selectedProduct?.code],
    queryFn: () => getProductPurchaseDetail(selectedProduct.code).then(r => r.data),
    enabled: !!selectedProduct,
  });

  const products = summaryData?.products || [];

  const kpi = useMemo(() => {
    const totalPurchases = products.reduce((s, p) => s + p.purchaseCount, 0);
    const totalQty = products.reduce((s, p) => s + p.totalQty, 0);
    const changes = products.filter(p => p.overallChange != null).map(p => p.overallChange);
    const avgChange = changes.length > 0 ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
    const totalSuppliers = Math.max(...products.map(p => p.supplierCount), 0);
    return { totalProducts: products.length, totalPurchases, totalQty, avgChange };
  }, [products]);

  const sorted = useMemo(() => {
    const list = [...products];
    list.sort((a, b) => {
      let av, bv;
      if (sortBy === 'name') { av = a.name || a.code; bv = b.name || b.code; return sortDir === 'asc' ? av.localeCompare(bv, 'tr') : bv.localeCompare(av, 'tr'); }
      if (sortBy === 'purchaseCount') { av = a.purchaseCount; bv = b.purchaseCount; }
      else if (sortBy === 'totalQty') { av = a.totalQty; bv = b.totalQty; }
      else if (sortBy === 'firstPrice') { av = a.firstPrice ?? -Infinity; bv = b.firstPrice ?? -Infinity; }
      else if (sortBy === 'lastPrice') { av = a.lastPrice ?? -Infinity; bv = b.lastPrice ?? -Infinity; }
      else if (sortBy === 'avgPrice') { av = a.avgPrice ?? -Infinity; bv = b.avgPrice ?? -Infinity; }
      else if (sortBy === 'overallChange') { av = a.overallChange ?? -Infinity; bv = b.overallChange ?? -Infinity; }
      else { av = 0; bv = 0; }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [products, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  }

  function SortBtn({ col, label }) {
    const active = sortBy === col;
    return (
      <button onClick={() => toggleSort(col)} className={`inline-flex items-center gap-1 hover:text-gray-800 ${active ? 'text-blue-600' : ''}`}>
        {label}<ArrowUpDown size={12} className={active ? 'text-blue-600' : 'text-gray-400'} />
      </button>
    );
  }

  function exportExcel() {
    const rows = sorted.map(p => ({
      Kod: p.code, Ürün: p.name,
      AlımSayısı: p.purchaseCount, ToplamAdet: p.totalQty,
      İlkFiyat: p.firstPrice, İlkTarih: p.firstDate,
      SonFiyat: p.lastPrice, SonTarih: p.lastDate,
      OrtFiyat: p.avgPrice, DeğişimYüzde: p.overallChange,
      TedarikçiSayısı: p.supplierCount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AlımAnalizi');
    XLSX.writeFile(wb, `alim-analizi-${selectedYear || 'tumzaman'}-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Yıl Toggle */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Yıl</label>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white">
              <button
                onClick={() => { setSelectedYear(''); setSelectedMonth(''); }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${!selectedYear ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >Tümü</button>
              {YEARS.map(y => (
                <button key={y} onClick={() => setSelectedYear(y)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${selectedYear === y ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >{y}</button>
              ))}
            </div>
          </div>

          {/* Ay Seçimi */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ay</label>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              disabled={!selectedYear}
            >
              {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          {/* Arama */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Ürün Ara</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text" placeholder="Stok kodu veya ürün adı..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={search} onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <button onClick={exportExcel} className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Excel
          </button>
        </div>

        {/* Dönem etiketi */}
        {selectedYear && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">
              {selectedYear}{selectedMonth ? ` — ${MONTHS.find(m => m.value === selectedMonth)?.label}` : ' (Tüm Yıl)'}
            </span>
            <button onClick={() => { setSelectedYear(''); setSelectedMonth(''); }} className="text-xs text-gray-400 hover:text-gray-600">× Temizle</button>
          </div>
        )}
      </Card>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Ürün Sayısı</p>
          <p className="text-2xl font-bold text-gray-800">{fmtNum(kpi.totalProducts)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Toplam Alım</p>
          <p className="text-2xl font-bold text-gray-800">{fmtNum(kpi.totalPurchases)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Toplam Adet</p>
          <p className="text-2xl font-bold text-gray-800">{fmtNum(kpi.totalQty)}</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">Ort. Fiyat Değişimi</p>
          <p className="text-2xl font-bold">{kpi.avgChange == null ? '-' : changeBadge(Math.round(kpi.avgChange * 100) / 100)}</p>
        </Card>
      </div>

      {/* Ürün Listesi + Detay Panel yan yana */}
      <div className={`flex gap-4 ${selectedProduct ? '' : ''}`}>
        {/* Tablo */}
        <Card className={`overflow-auto ${selectedProduct ? 'flex-1 min-w-0' : 'w-full'}`}>
          {isLoading ? <div className="p-8"><Spinner /></div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                  <th className="px-3 py-3 text-left font-medium"><SortBtn col="name" label="Ürün" /></th>
                  <th className="px-3 py-3 text-center font-medium"><SortBtn col="purchaseCount" label="Alım #" /></th>
                  <th className="px-3 py-3 text-right font-medium"><SortBtn col="totalQty" label="Top. Adet" /></th>
                  <th className="px-3 py-3 text-right font-medium"><SortBtn col="firstPrice" label="İlk Fiyat" /></th>
                  <th className="px-3 py-3 text-right font-medium"><SortBtn col="lastPrice" label="Son Fiyat" /></th>
                  <th className="px-3 py-3 text-right font-medium"><SortBtn col="avgPrice" label="Ort. Fiyat" /></th>
                  <th className="px-3 py-3 text-right font-medium"><SortBtn col="overallChange" label="Değişim" /></th>
                  <th className="px-3 py-3 text-center font-medium">Ted.</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr
                    key={p.code}
                    className={`border-b border-gray-100 cursor-pointer transition-colors ${
                      selectedProduct?.code === p.code ? 'bg-blue-50 border-l-2 border-l-blue-500' : i % 2 === 0 ? 'hover:bg-gray-50' : 'bg-gray-50/50 hover:bg-gray-100'
                    }`}
                    onClick={() => setSelectedProduct(selectedProduct?.code === p.code ? null : p)}
                  >
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800 text-xs leading-tight">{p.name}</div>
                      <div className="text-gray-400 text-xs font-mono">{p.code}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{p.purchaseCount}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtNum(p.totalQty)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 text-xs">
                      <div>{fmtPrice(p.firstPrice)}</div>
                      <div className="text-gray-400">{fmtDate(p.firstDate)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-800 text-xs">
                      <div>{fmtPrice(p.lastPrice)}</div>
                      <div className="text-gray-400 font-normal">{fmtDate(p.lastDate)}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtPrice(p.avgPrice)}</td>
                    <td className="px-3 py-2.5 text-right">{changeBadge(p.overallChange)}</td>
                    <td className="px-3 py-2.5 text-center text-gray-500">{p.supplierCount}</td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">
                    {isLoading ? '' : selectedYear ? `${selectedYear} yılında alım kaydı bulunamadı` : 'Alım verisi bulunamadı'}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </Card>

        {/* Ürün Detay Paneli */}
        {selectedProduct && (
          <ProductDetailPanel
            product={selectedProduct}
            detailData={detailData}
            isLoading={detailLoading}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </div>
    </div>
  );
}

// ── Ürün Detay Paneli ─────────────────────────────────────────────────────────
function ProductDetailPanel({ product, detailData, isLoading, onClose }) {
  const purchases = detailData?.purchases || [];
  const returns = detailData?.returns || [];

  const chartData = useMemo(() => {
    return purchases
      .filter(p => p.price != null)
      .map(p => ({ date: p.date?.slice(0, 7) || p.date, price: p.price, qty: p.qty }));
  }, [purchases]);

  function exportDetail() {
    if (!detailData) return;
    const rows = purchases.map(p => ({
      Tarih: p.date, Tedarikçi: p.supplier, Miktar: p.qty,
      BirimFiyat: p.price, Tutar: p.amount, ParaBirimi: p.currency || 'TRY',
      DeğişimYüzde: p.changePct,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'AlımDetay');
    XLSX.writeFile(wb, `${product.code}-alim-gecmisi.xlsx`);
  }

  return (
    <div className="w-[480px] shrink-0">
      <Card className="h-full overflow-y-auto">
        {/* Başlık */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 sticky top-0 z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">{product.code}</span>
              </div>
              <h3 className="font-bold text-gray-900 text-sm leading-snug">{product.name}</h3>
            </div>
            <div className="flex gap-1">
              <button onClick={exportDetail} title="Excel indir" className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-100">
                <Download size={15} />
              </button>
              <button onClick={onClose} className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* KPI satırı */}
          {isLoading ? <div className="mt-2 text-xs text-gray-400">Yükleniyor...</div> : (
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                { label: 'Alım', value: detailData?.totalPurchaseCount ?? '—' },
                { label: 'Top. Adet', value: fmtNum(detailData?.totalQty) },
                { label: 'Tedarikçi', value: detailData?.supplierCount ?? '—' },
                { label: 'İade', value: detailData?.returnCount || 0 },
              ].map(k => (
                <div key={k.label} className="bg-white rounded-lg p-2 shadow-sm">
                  <div className="text-lg font-bold text-gray-800">{k.value}</div>
                  <div className="text-xs text-gray-500">{k.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center"><Spinner /></div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Fiyat Grafiği */}
            {chartData.length > 1 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><LineChartIcon size={13} /> Fiyat Trendi (tüm zamanlar)</h4>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => fmtNum(v)} width={55} />
                      <Tooltip formatter={v => [fmtPrice(v), 'Fiyat']} contentStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tedarikçiler */}
            {detailData?.suppliers?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1"><Truck size={13} /> Tedarikçiler</h4>
                <div className="flex flex-wrap gap-1">
                  {detailData.suppliers.map(s => (
                    <span key={s} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Alım Geçmişi */}
            <div>
              <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                <Hash size={13} /> Tüm Alımlar ({purchases.length})
              </h4>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-2 py-2 text-left text-gray-500">Tarih</th>
                      <th className="px-2 py-2 text-right text-gray-500">Adet</th>
                      <th className="px-2 py-2 text-right text-gray-500">Birim Fiyat</th>
                      <th className="px-2 py-2 text-right text-gray-500">Değişim</th>
                      <th className="px-2 py-2 text-left text-gray-500">Tedarikçi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...purchases].reverse().map((p, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${i === 0 ? 'bg-blue-50 font-medium' : ''}`}>
                        <td className="px-2 py-2 text-gray-600">{fmtDate(p.date)}</td>
                        <td className="px-2 py-2 text-right text-gray-700">{fmtNum(p.qty)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-gray-800">{fmtPrice(p.price, p.currency)}</td>
                        <td className="px-2 py-2 text-right">{p.changePct != null ? changeBadge(p.changePct) : <span className="text-gray-300 text-xs">—</span>}</td>
                        <td className="px-2 py-2 text-gray-500 truncate max-w-[110px]" title={p.supplier}>{p.supplier || '-'}</td>
                      </tr>
                    ))}
                    {purchases.length === 0 && (
                      <tr><td colSpan={5} className="py-4 text-center text-gray-400">Alım kaydı yok</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Özet satır */}
              {purchases.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  {(() => {
                    const prices = purchases.filter(p => p.price != null && p.price > 0).map(p => p.price);
                    const first = purchases[0];
                    const last = purchases[purchases.length - 1];
                    return (
                      <>
                        <div className="bg-emerald-50 rounded p-2 text-center">
                          <div className="font-bold text-emerald-700">{fmtPrice(first?.price, first?.currency)}</div>
                          <div className="text-emerald-600">İlk Alış</div>
                          <div className="text-gray-400">{fmtDate(first?.date)}</div>
                        </div>
                        <div className="bg-gray-50 rounded p-2 text-center">
                          <div className="font-bold text-gray-700">{fmtPrice(prices.length ? prices.reduce((a,b) => a+b, 0) / prices.length : null)}</div>
                          <div className="text-gray-500">Ortalama</div>
                        </div>
                        <div className="bg-blue-50 rounded p-2 text-center">
                          <div className="font-bold text-blue-700">{fmtPrice(last?.price, last?.currency)}</div>
                          <div className="text-blue-600">Son Alış</div>
                          <div className="text-gray-400">{fmtDate(last?.date)}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* İadeler */}
            {returns.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                  <AlertTriangle size={13} /> İadeler ({returns.length})
                </h4>
                <div className="overflow-x-auto border border-red-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-red-50 border-b border-red-200">
                        <th className="px-2 py-2 text-left text-red-600">Tarih</th>
                        <th className="px-2 py-2 text-right text-red-600">Adet</th>
                        <th className="px-2 py-2 text-right text-red-600">Birim Fiyat</th>
                        <th className="px-2 py-2 text-left text-red-600">Tedarikçi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {returns.map((r, i) => (
                        <tr key={i} className="border-b border-red-100">
                          <td className="px-2 py-2 text-gray-600">{fmtDate(r.date)}</td>
                          <td className="px-2 py-2 text-right text-red-700 font-medium">{fmtNum(r.qty)}</td>
                          <td className="px-2 py-2 text-right">{fmtPrice(r.price, r.currency)}</td>
                          <td className="px-2 py-2 text-gray-500 truncate max-w-[110px]">{r.supplier || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-1 text-xs text-red-600 text-right">Toplam iade: {fmtNum(detailData?.returnQty)} adet</div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SEKMESİ 3: ÜRÜN MODELLERİ
// ══════════════════════════════════════════════════════════════════════════════
function ModelsTab() {
  const [selectedModel, setSelectedModel] = useState(null);

  return (
    <div className="space-y-6">
      {/* Başlık ve genel görsel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sol: Ürün ailesi görseli */}
        <Card className="overflow-hidden">
          <div className="bg-slate-900 p-4">
            <div className="text-white text-center mb-3">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-2xl font-black tracking-tight"><span className="text-red-500">HOTO</span>MOBİL</span>
              </div>
              <p className="text-slate-400 text-xs">Camper Family — İnovatif Mobil Yaşam Çözümleri</p>
            </div>
            <img
              src="/urun-modelleri.png"
              alt="Hotomobil Camper Family"
              className="w-full rounded-lg"
              onError={e => { e.target.style.display = 'none'; }}
            />
          </div>
          <div className="p-3 bg-slate-50 text-xs text-center text-gray-500">
            Hotomobil Camper Family — Tüm model serileri
          </div>
        </Card>

        {/* Sağ: Model kısaltmaları özet */}
        <Card className="p-4">
          <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-blue-500" />
            Model Kısaltmaları Referansı
          </h3>
          <div className="space-y-4">
            {HOTOMOBIL_MODELS.map(group => (
              <div key={group.category}>
                <div className="text-xs font-semibold uppercase tracking-wider mb-2 px-2 py-1 rounded" style={{ color: group.color, backgroundColor: group.color + '15' }}>
                  {group.category}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {group.items.map(m => (
                    <button
                      key={m.abbr}
                      onClick={() => setSelectedModel(selectedModel?.abbr === m.abbr ? null : m)}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left ${
                        selectedModel?.abbr === m.abbr ? 'border-blue-400 bg-blue-50 shadow-sm' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: group.color }}>
                        {m.abbr}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{m.name}</div>
                        <div className="text-xs text-gray-500">{m.abbr}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Seçili model detayı */}
      {selectedModel && (
        <Card className="p-4 border-2 border-blue-200 bg-blue-50/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: HOTOMOBIL_MODELS.find(g => g.items.find(i => i.abbr === selectedModel.abbr))?.color || '#3b82f6' }}>
                {selectedModel.abbr}
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{selectedModel.name}</h3>
                <p className="text-sm text-gray-500">Kısaltma: <strong>{selectedModel.abbr}</strong></p>
              </div>
            </div>
            <button onClick={() => setSelectedModel(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <p className="text-sm text-gray-700 bg-white rounded-lg p-3 border border-blue-200">{selectedModel.desc}</p>
        </Card>
      )}

      {/* Tüm Modeller Detay Kartları */}
      <div>
        <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Car size={20} /> Tüm Model Serileri</h3>
        <div className="space-y-6">
          {HOTOMOBIL_MODELS.map(group => (
            <div key={group.category}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-1 w-8 rounded-full" style={{ backgroundColor: group.color }} />
                <h4 className="font-bold text-gray-700 text-sm uppercase tracking-wide">{group.category}</h4>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {group.items.map(m => (
                  <div
                    key={m.abbr}
                    className="rounded-xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedModel(selectedModel?.abbr === m.abbr ? null : m)}
                  >
                    {/* Model kısaltma header */}
                    <div className="p-5 flex flex-col items-center" style={{ backgroundColor: group.color }}>
                      <div className="text-4xl font-black text-white/20 mb-1 select-none">{m.abbr}</div>
                      <div className="text-white font-bold text-lg">{m.name}</div>
                    </div>
                    {/* Açıklama */}
                    <div className="p-3 bg-white">
                      <p className="text-xs text-gray-600 leading-relaxed">{m.desc}</p>
                      <div className="mt-2 inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: group.color }}>
                        {m.abbr}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PDF indirme bağlantısı notu */}
      <Card className="p-4 bg-slate-50 border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
            <Download size={18} className="text-white" />
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">Hotomobil Camper Family Katalog</p>
            <p className="text-xs text-gray-500">Tüm model özellikleri ve teknik detaylar için Hotomobil katalog dokümanına bakınız.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
