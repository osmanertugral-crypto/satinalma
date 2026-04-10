import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts, getProductStats, createProduct, updateProduct, deleteProduct, getCategories, createCategory, syncWarehouse } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Textarea, Table, Spinner, StatCard } from '../components/UI';
import { Plus, Pencil, Trash2, Eye, Search, Tag, ExternalLink, RefreshCw, ArrowUpDown, BarChart3, TrendingUp, Package, AlertTriangle, Calendar, DollarSign, PieChart as PieChartIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';

const EMPTY = { code: '', name: '', category_id: '', unit: 'adet', min_stock_level: 0, description: '' };

export default function ProductsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name | stock | last_order_date | last_price
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [syncResult, setSyncResult] = useState(null);
  const [showCharts, setShowCharts] = useState(true);
  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));

  const MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));
  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6'];

  const { data: rawProducts = [], isLoading } = useQuery({
    queryKey: ['products', search, categoryFilter],
    queryFn: () => getProducts({ search: search || undefined, category_id: categoryFilter || undefined }).then(r => r.data)
  });

  const { data: statsData } = useQuery({
    queryKey: ['product-stats', chartYear],
    queryFn: () => getProductStats({ year: chartYear }).then(r => r.data),
  });

  const chartMonthly = useMemo(() => {
    const all = [];
    for (let m = 1; m <= 12; m++) {
      const found = statsData?.monthly?.find(r => r.month === m);
      all.push({
        ay: MONTHS[m].slice(0, 3),
        ayFull: MONTHS[m],
        toplam_tutar: found?.toplam_tutar || 0,
        urun_cesidi: found?.urun_cesidi || 0,
      });
    }
    return all;
  }, [statsData]);

  const stockSummary = statsData?.stockSummary || { toplam_urun: 0, kritik_stok: 0, stoksuz: 0, yeterli_stok: 0 };
  const stockPieData = useMemo(() => [
    { name: 'Yeterli Stok', value: stockSummary.yeterli_stok || 0, color: '#10b981' },
    { name: 'Kritik Stok', value: stockSummary.kritik_stok || 0, color: '#f59e0b' },
    { name: 'Stoksuz', value: stockSummary.stoksuz || 0, color: '#ef4444' },
  ].filter(s => s.value > 0), [stockSummary]);

  const products = [...rawProducts].sort((a, b) => {
    if (sortBy === 'stock') return (b.stock ?? 0) - (a.stock ?? 0);
    if (sortBy === 'last_price') return (b.last_price ?? 0) - (a.last_price ?? 0);
    if (sortBy === 'last_order_date') return (b.last_order_date || '').localeCompare(a.last_order_date || '');
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => getCategories().then(r => r.data) });

  const syncMutation = useMutation({
    mutationFn: syncWarehouse,
    onSuccess: (res) => {
      qc.invalidateQueries(['products']);
      setSyncResult(res.data);
      setTimeout(() => setSyncResult(null), 5000);
    }
  });

  const saveMutation = useMutation({
    mutationFn: (data) => modal?.id ? updateProduct(modal.id, data) : createProduct(data),
    onSuccess: () => { qc.invalidateQueries(['products']); setModal(null); }
  });
  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => { qc.invalidateQueries(['products']); setDeleteId(null); }
  });
  const catMutation = useMutation({
    mutationFn: (data) => createCategory(data),
    onSuccess: () => { qc.invalidateQueries(['categories']); setCatModal(false); setNewCatName(''); }
  });

  function openAdd() { setForm(EMPTY); setModal('add'); }
  function openEdit(p) { setForm({ code: p.code, name: p.name, category_id: p.category_id || '', unit: p.unit, min_stock_level: p.min_stock_level, description: p.description || '' }); setModal({ id: p.id }); }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }

  return (
    <div className="p-6">
      <PageHeader
        title="Ürünler & Kategoriler"
        subtitle={`${products.length} ürün`}
        action={
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
                {syncMutation.isPending ? 'Güncelleniyor...' : 'Stok Yenile'}
              </Button>
            )}
            {canEdit && <Button variant="secondary" onClick={() => setCatModal(true)}><Tag size={16} /> Kategori Ekle</Button>}
            {canEdit && <Button onClick={openAdd}><Plus size={16} /> Yeni Ürün</Button>}
          </div>
        }
      />

      {syncResult && (
        <Card className="p-4 mb-4 bg-green-50 border-green-200">
          <p className="text-green-800 text-sm font-medium">
            ✓ {syncResult.message || 'Stok güncellendi'} — {syncResult.count || 0} ürün senkronize edildi
          </p>
        </Card>
      )}
      {syncMutation.error && (
        <Card className="p-4 mb-4 bg-red-50 border-red-200">
          <p className="text-red-700 text-sm">{syncMutation.error.response?.data?.error || 'Senkronizasyon başarısız'}</p>
        </Card>
      )}

      {/* Charts Section */}
      <Card className="mb-6">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button size="sm" variant={showCharts ? 'primary' : 'secondary'} onClick={() => setShowCharts(v => !v)}>
              <BarChart3 size={16} /> {showCharts ? 'Grafikleri Gizle' : 'Grafikleri Göster'}
            </Button>
          </div>
          {showCharts && (
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-gray-400" />
              <span className="text-sm text-gray-500">Grafik Yılı:</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={chartYear}
                onChange={e => setChartYear(e.target.value)}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {showCharts && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Toplam Ürün" value={stockSummary.toplam_urun || 0} icon={Package} color="blue" />
            <StatCard label="Yeterli Stok" value={stockSummary.yeterli_stok || 0} icon={Package} color="green" />
            <StatCard label="Kritik Stok" value={stockSummary.kritik_stok || 0} icon={AlertTriangle} color="orange" />
            <StatCard label="Stoksuz Ürün" value={stockSummary.stoksuz || 0} icon={AlertTriangle} color="red" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Devir Hızı En Yüksek Ürünler */}
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={16} className="text-blue-500" /> Devir Hızı En Yüksek Ürünler ({chartYear})</h3>
                <p className="text-xs text-gray-400 mt-1">Sipariş Miktarı / Mevcut Stok</p>
              </div>
              <div className="p-4" style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData?.turnover || []} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="code" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip
                      formatter={(v, name) => [Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }), name]}
                      labelFormatter={(_l, p) => p?.[0]?.payload?.name || _l}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend />
                    <Bar dataKey="devir_hizi" name="Devir Hızı" radius={[0, 4, 4, 0]}>
                      {(statsData?.turnover || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* En Çok Sipariş Edilen Ürünler (Tutara Göre) */}
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><DollarSign size={16} className="text-green-500" /> En Yüksek Tutarlı Ürünler ({chartYear})</h3>
              </div>
              <div className="p-4" style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statsData?.topByAmount || []} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                    <YAxis type="category" dataKey="code" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip
                      formatter={(v, name) => {
                        if (name === 'Tutar') return [`₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, name];
                        return [Number(v).toLocaleString('tr-TR'), name];
                      }}
                      labelFormatter={(_l, p) => p?.[0]?.payload?.name || _l}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="toplam_tutar" name="Tutar" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Aylık Satınalma Trendi */}
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><BarChart3 size={16} className="text-purple-500" /> Aylık Ürün Satınalma Trendi ({chartYear})</h3>
              </div>
              <div className="p-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="ay" tick={{ fontSize: 12 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(v, name) => {
                        if (name === 'Tutar') return [`₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, name];
                        return [v, name];
                      }}
                      labelFormatter={(_l, p) => p?.[0]?.payload?.ayFull || _l}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="toplam_tutar" name="Tutar" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="urun_cesidi" name="Ürün Çeşidi" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Stok Durumu Pie + Kategori Dağılımı */}
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><PieChartIcon size={16} className="text-amber-500" /> Stok Durumu Dağılımı</h3>
              </div>
              <div className="p-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={stockPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`} labelLine={{ strokeWidth: 1 }}>
                      {stockPieData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                    <Tooltip formatter={(v) => [`${v} ürün`, '']} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Fiyat Değişim Tablosu */}
            {(statsData?.priceChanges || []).length > 0 && (
              <Card className="lg:col-span-2">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={16} className="text-red-500" /> En Çok Fiyat Değişen Ürünler ({chartYear})</h3>
                  <p className="text-xs text-gray-400 mt-1">Yıl içinde farklı fiyatlarla alınan ürünler</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600">
                        <th className="px-4 py-2 text-left">Kod</th>
                        <th className="px-4 py-2 text-left">Ürün</th>
                        <th className="px-4 py-2 text-right">Min Fiyat</th>
                        <th className="px-4 py-2 text-right">Max Fiyat</th>
                        <th className="px-4 py-2 text-right">Değişim %</th>
                        <th className="px-4 py-2 text-center">Farklı Fiyat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(statsData?.priceChanges || []).map((p, i) => (
                        <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-gray-500">{p.code}</td>
                          <td className="px-4 py-2 text-gray-800">{p.name}</td>
                          <td className="px-4 py-2 text-right text-green-600">₺{Number(p.min_fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right text-red-600">₺{Number(p.max_fiyat).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right">
                            <span className={`font-semibold ${p.degisim_yuzde > 50 ? 'text-red-600' : p.degisim_yuzde > 20 ? 'text-amber-600' : 'text-gray-600'}`}>
                              %{p.degisim_yuzde}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center"><Badge color="blue">{p.farkli_fiyat_sayisi}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Kategori Dağılımı */}
            {(statsData?.categoryDist || []).length > 0 && (
              <Card className="lg:col-span-2">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><PieChartIcon size={16} className="text-blue-500" /> Kategoriye Göre Satınalma Dağılımı ({chartYear})</h3>
                </div>
                <div className="p-4" style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsData?.categoryDist || []} margin={{ bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="category" tick={{ fontSize: 10, angle: -35, textAnchor: 'end' }} interval={0} height={80} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                      <Tooltip
                        formatter={(v, name) => {
                          if (name === 'Tutar') return [`₺${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, name];
                          return [v, name];
                        }}
                      />
                      <Legend />
                      <Bar dataKey="toplam_tutar" name="Tutar" radius={[4, 4, 0, 0]}>
                        {(statsData?.categoryDist || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ürün adı veya kodu ara..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Tüm Kategoriler</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-gray-400" />
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="name">İsme Göre</option>
              <option value="stock">Stoğa Göre</option>
              <option value="last_price">Son Fiyata Göre</option>
              <option value="last_order_date">Son Alıma Göre</option>
            </select>
          </div>
        </div>

        {isLoading ? <Spinner /> : (
          <Table headers={['Kod', 'Ad', 'Kategori', 'Birim', 'Son Fiyat', 'Son Alım', 'Stok', 'Durum', 'İşlem']}
            empty={products.length === 0 && 'Ürün bulunamadı'}>
            {products.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-500 font-mono">{p.code}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.category_name || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{p.unit}</td>
                <td className="px-4 py-3 text-sm">
                  {p.last_price ? (
                    <span className="font-semibold text-gray-800">{Number(p.last_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {p.last_currency || 'TRY'}</span>
                  ) : <span className="text-gray-400">-</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {p.last_order_date ? (
                    <div className="flex items-center gap-1">
                      <span className="text-gray-600">{new Date(p.last_order_date).toLocaleDateString('tr-TR')}</span>
                      {p.last_po_id && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/po/${p.last_po_id}`); }} className="text-blue-500 hover:text-blue-700" title={p.last_po_number}>
                          <ExternalLink size={13} />
                        </button>
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
                    <button onClick={() => navigate(`/products/${p.id}`)} className="text-blue-500 hover:text-blue-700"><Eye size={16} /></button>
                    {canEdit && <button onClick={() => openEdit(p)} className="text-amber-500 hover:text-amber-700"><Pencil size={16} /></button>}
                    {user?.role === 'admin' && <button onClick={() => setDeleteId(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}
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
          <Input label="Ürün Kodu *" name="code" value={form.code} onChange={handleChange} />
          <Input label="Ürün Adı *" name="name" value={form.name} onChange={handleChange} />
          <Select label="Kategori" name="category_id" value={form.category_id} onChange={handleChange}>
            <option value="">Seçin...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Birim" name="unit" value={form.unit} onChange={handleChange}>
            {['adet', 'kg', 'litre', 'metre', 'paket', 'kutu', 'ton'].map(u => <option key={u}>{u}</option>)}
          </Select>
          <Input label="Minimum Stok Seviyesi" name="min_stock_level" type="number" value={form.min_stock_level} onChange={handleChange} />
          <Textarea label="Açıklama" name="description" value={form.description} onChange={handleChange} className="col-span-2" />
        </div>
        {saveMutation.error && <p className="text-red-500 text-sm mt-2">{saveMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(null)}>İptal</Button>
          <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>

      {/* Kategori Modal */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Yeni Kategori" size="sm">
        <Input label="Kategori Adı" value={newCatName} onChange={e => setNewCatName(e.target.value)} />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setCatModal(false)}>İptal</Button>
          <Button onClick={() => catMutation.mutate({ name: newCatName })} disabled={!newCatName || catMutation.isPending}>Ekle</Button>
        </div>
      </Modal>

      {/* Silme */}
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
