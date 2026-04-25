import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSuppliers, getSupplierStats, createSupplier, updateSupplier, deleteSupplier, updateSupplierRating, toggleSupplierActive } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Textarea, Select, Table, Spinner, StatCard } from '../components/UI';
import { Plus, Pencil, Trash2, Eye, Search, ArrowUpDown, Calendar, TrendingUp, ShoppingCart, Users, DollarSign, BarChart3, PieChart as PieChartIcon, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line, ComposedChart, Area } from 'recharts';

const EMPTY = { name: '', contact_name: '', email: '', phone: '', address: '', city: '', country: 'Türkiye', tax_number: '', tax_office: '', payment_terms: '', notes: '' };

export default function SuppliersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name | year_total_amount | order_count
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState(''); // '' = tüm yıl
  const [modal, setModal] = useState(null); // null | 'add' | { id, ...data }
  const [form, setForm] = useState(EMPTY);
  const [deleteId, setDeleteId] = useState(null);

  const MONTHS = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));
  const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6'];
  const STATUS_LABELS = { draft: 'Taslak', sent: 'Gönderildi', confirmed: 'Onaylandı', delivered: 'Teslim', cancelled: 'İptal' };
  const STATUS_COLORS = { draft: '#94a3b8', sent: '#3b82f6', confirmed: '#f59e0b', delivered: '#10b981', cancelled: '#ef4444' };

  const [showCharts, setShowCharts] = useState(true);
  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));
  const [chartMonth, setChartMonth] = useState(''); // '' = tum aylar

  const { data: rawSuppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', search, filterYear, filterMonth],
    queryFn: () => getSuppliers({ search: search || undefined, year: filterYear, month: filterMonth || undefined }).then(r => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['supplier-stats', chartYear, chartMonth],
    queryFn: () => getSupplierStats({ year: chartYear, month: chartMonth || undefined }).then(r => r.data),
  });

  const chartMonthly = useMemo(() => {
    if (chartMonth) {
      const m = parseInt(chartMonth, 10);
      const found = statsData?.monthly?.find(r => r.month === m);
      return [{
        ay: MONTHS[m].slice(0, 3),
        ayFull: MONTHS[m],
        toplam_tutar: found?.toplam_tutar || 0,
        siparis_sayisi: found?.siparis_sayisi || 0,
        tedarikci_sayisi: found?.tedarikci_sayisi || 0,
      }];
    }

    const all = [];
    for (let m = 1; m <= 12; m++) {
      const found = statsData?.monthly?.find(r => r.month === m);
      all.push({
        ay: MONTHS[m].slice(0, 3),
        ayFull: MONTHS[m],
        toplam_tutar: found?.toplam_tutar || 0,
        siparis_sayisi: found?.siparis_sayisi || 0,
        tedarikci_sayisi: found?.tedarikci_sayisi || 0,
      });
    }
    return all;
  }, [statsData, chartMonth]);

  const chartPieStatus = useMemo(() => {
    return (statsData?.statusDist || []).map(s => ({
      name: STATUS_LABELS[s.status] || s.status,
      value: s.sayi,
      tutar: s.tutar,
      color: STATUS_COLORS[s.status] || '#94a3b8',
    }));
  }, [statsData]);

  const chartTopSuppliers = useMemo(() => {
    return (statsData?.topSuppliers || []).map(s => ({
      name: s.name.length > 25 ? s.name.slice(0, 25) + '...' : s.name,
      fullName: s.name,
      toplam_tutar: s.toplam_tutar,
      siparis_sayisi: s.siparis_sayisi,
    }));
  }, [statsData]);

  const yearTotal = statsData?.yearTotal || { toplam_tutar: 0, toplam_siparis: 0, aktif_tedarikci: 0, acik_siparis: 0 };
  const chartPeriodLabel = chartMonth ? `${MONTHS[parseInt(chartMonth, 10)]} ${chartYear}` : chartYear;
  const statusTotalCount = chartPieStatus.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
  const topSupplierMax = Math.max(...chartTopSuppliers.map(row => Number(row.toplam_tutar) || 0), 0);

  const suppliers = [...rawSuppliers].sort((a, b) => {
    if (sortBy === 'year_total_amount') return (b.year_total_amount || 0) - (a.year_total_amount || 0);
    if (sortBy === 'order_count') return (b.order_count || 0) - (a.order_count || 0);
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });

  const saveMutation = useMutation({
    mutationFn: (data) => modal?.id ? updateSupplier(modal.id, data) : createSupplier(data),
    onSuccess: () => { qc.invalidateQueries(['suppliers']); setModal(null); }
  });

  const ratingMutation = useMutation({
    mutationFn: ({ id, rating }) => updateSupplierRating(id, rating),
    onSuccess: () => qc.invalidateQueries(['suppliers'])
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id) => toggleSupplierActive(id),
    onSuccess: () => qc.invalidateQueries(['suppliers'])
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => { qc.invalidateQueries(['suppliers']); setDeleteId(null); }
  });

  function openAdd() { setForm(EMPTY); setModal('add'); }
  function openEdit(s) { setForm({ ...s, rating: s.rating || null }); setModal({ id: s.id }); }
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }
  function handleSave() { saveMutation.mutate(form); }

  return (
    <div className="p-6">
      <PageHeader
        title="Tedarikçiler"
        subtitle={`${suppliers.length} tedarikçi`}
        action={canEdit && <Button onClick={openAdd}><Plus size={16} /> Yeni Tedarikçi</Button>}
      />

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
              <span className="text-sm text-gray-500 ml-1">Ay:</span>
              <select
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={chartMonth}
                onChange={e => setChartMonth(e.target.value)}
              >
                <option value="">Tüm Aylar</option>
                {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
      </Card>

      {showCharts && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label={chartMonth ? 'Aylik Toplam Tutar' : 'Toplam Tutar'}
              value={`₺${(yearTotal.toplam_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={DollarSign}
              color="blue"
            />
            <StatCard
              label={chartMonth ? 'Aylik Siparis' : 'Toplam Sipariş'}
              value={yearTotal.toplam_siparis || 0}
              icon={ShoppingCart}
              color="green"
            />
            <StatCard
              label={chartMonth ? 'Aydaki Aktif Tedarikçi' : 'Aktif Tedarikçi'}
              value={yearTotal.aktif_tedarikci || 0}
              icon={Users}
              color="purple"
            />
            <StatCard
              label={chartMonth ? 'Aylik Kapanmamış Sipariş' : 'Kapanmamış Sipariş'}
              value={yearTotal.acik_siparis || 0}
              icon={FileText}
              color="orange"
            />
          </div>

          {!chartMonth ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Monthly Bar Chart */}
              <Card>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><BarChart3 size={16} className="text-blue-500" /> Aylık Satınalma Tutarı ({chartPeriodLabel})</h3>
                </div>
                <div className="p-4" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartMonthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="ay" tick={{ fontSize: 12 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === 'Tutar') return [`₺${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, name];
                          return [value, name];
                        }}
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.ayFull || _label}
                      />
                      <Legend />
                      <Bar yAxisId="left" dataKey="toplam_tutar" name="Tutar" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="right" type="monotone" dataKey="siparis_sayisi" name="Sipariş Sayısı" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Top Suppliers Horizontal Bar */}
              <Card>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={16} className="text-green-500" /> En Yüksek Tutarlı Tedarikçiler ({chartPeriodLabel})</h3>
                </div>
                <div className="p-4" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartTopSuppliers} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === 'Tutar') return [`₺${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`, name];
                          return [value, name];
                        }}
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName || _label}
                      />
                      <Bar dataKey="toplam_tutar" name="Tutar" radius={[0, 4, 4, 0]}>
                        {chartTopSuppliers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Status Pie */}
              <Card>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><PieChartIcon size={16} className="text-purple-500" /> Sipariş Durumu Dağılımı ({chartPeriodLabel})</h3>
                </div>
                <div className="p-4" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={chartPieStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`} labelLine={{ strokeWidth: 1 }}>
                        {chartPieStatus.map((s, i) => <Cell key={i} fill={s.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, name, props) => [`${v} sipariş (₺${Number(props.payload.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })})`, name]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Monthly Supplier Count */}
              <Card>
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users size={16} className="text-amber-500" /> Aylık Aktif Tedarikçi Sayısı ({chartPeriodLabel})</h3>
                </div>
                <div className="p-4" style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartMonthly}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="ay" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.ayFull || _label}
                        formatter={(value) => [value, 'Tedarikçi Sayısı']}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="tedarikci_sayisi" name="Tedarikçi Sayısı" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <Card className="p-4 lg:col-span-1">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Seçilen Ay Özeti ({chartPeriodLabel})</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2">
                    <span className="text-xs text-blue-700">Toplam Tutar</span>
                    <span className="text-sm font-semibold text-blue-800">₺{Number(yearTotal.toplam_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
                    <span className="text-xs text-emerald-700">Sipariş</span>
                    <span className="text-sm font-semibold text-emerald-800">{yearTotal.toplam_siparis || 0}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                    <span className="text-xs text-amber-700">Aktif Tedarikçi</span>
                    <span className="text-sm font-semibold text-amber-800">{yearTotal.aktif_tedarikci || 0}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-4 lg:col-span-1">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Sipariş Durumu ({chartPeriodLabel})</h3>
                <div className="space-y-2">
                  {chartPieStatus.length === 0 && <p className="text-xs text-gray-400">Veri yok</p>}
                  {chartPieStatus.map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-gray-100 px-3 py-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{row.name}</span>
                        <span className="text-gray-500">{row.value} sipariş</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-1.5">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.max(statusTotalCount ? (Number(row.value || 0) / statusTotalCount) * 100 : 0, row.value ? 6 : 0)}%`, backgroundColor: row.color || '#94a3b8' }}
                        />
                      </div>
                      <div className="text-xs text-gray-600">₺{Number(row.tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4 lg:col-span-1">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">En Yüksek Tedarikçiler ({chartPeriodLabel})</h3>
                <div className="space-y-2">
                  {chartTopSuppliers.length === 0 && <p className="text-xs text-gray-400">Veri yok</p>}
                  {chartTopSuppliers.slice(0, 6).map((row, idx) => (
                    <div key={idx} className="rounded-lg border border-gray-100 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-gray-700 truncate">{row.fullName}</span>
                        <span className="text-xs text-gray-500">{row.siparis_sayisi} PO</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400"
                          style={{ width: `${Math.max(topSupplierMax ? (Number(row.toplam_tutar || 0) / topSupplierMax) * 100 : 0, row.toplam_tutar ? 8 : 0)}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-600 mt-1">₺{Number(row.toplam_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ad, e-posta veya iletişim ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value)}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
            >
              <option value="">Tüm Yıl</option>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-gray-400" />
            <select
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
            >
              <option value="name">İsme Göre</option>
              <option value="year_total_amount">Toplam Tutara Göre</option>
              <option value="order_count">Sipariş Adedine Göre</option>
            </select>
          </div>
        </div>

        {isLoading ? <Spinner /> : (
          <Table
            headers={['Ad', 'İletişim', 'Telefon', 'Şehir', `${filterMonth ? MONTHS[parseInt(filterMonth)] + ' ' : ''}${filterYear} Toplam Tutar`, 'Sipariş', 'Puan', 'Durum', 'İşlem']}
            empty={suppliers.length === 0 && 'Tedarikçi bulunamadı'}
          >
            {suppliers.map(s => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.contact_name || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{s.city || '-'}</td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                  {s.year_total_amount > 0 ? Number(s.year_total_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺' : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{s.order_count > 0 ? s.order_count : '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-0.5">
                    {[1,2,3,4,5].map(star => (
                      <button
                        key={star}
                        title={`${star} yıldız`}
                        onClick={() => ratingMutation.mutate({ id: s.id, rating: s.rating === star ? null : star })}
                        className={`text-lg leading-none transition-colors ${star <= (s.rating || 0) ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
                      >★</button>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActiveMutation.mutate(s.id)}
                    disabled={toggleActiveMutation.isPending}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      s.active
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                    {s.active ? 'Aktif' : 'Pasif'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/suppliers/${s.id}`)} className="text-blue-500 hover:text-blue-700"><Eye size={16} /></button>
                    {canEdit && <button onClick={() => openEdit(s)} className="text-amber-500 hover:text-amber-700"><Pencil size={16} /></button>}
                    {user?.role === 'admin' && <button onClick={() => setDeleteId(s.id)} className="text-red-500 hover:text-red-700"><Trash2 size={16} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Ekleme/Düzenleme Modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Tedarikçi Düzenle' : 'Yeni Tedarikçi'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ad *" name="name" value={form.name} onChange={handleChange} className="col-span-2" required />
          <Input label="İletişim Kişisi" name="contact_name" value={form.contact_name} onChange={handleChange} />
          <Input label="E-posta" name="email" type="email" value={form.email} onChange={handleChange} />
          <Input label="Telefon" name="phone" value={form.phone} onChange={handleChange} />
          <Input label="Şehir" name="city" value={form.city} onChange={handleChange} />
          <Input label="Ülke" name="country" value={form.country} onChange={handleChange} />
          <Input label="Vergi No" name="tax_number" value={form.tax_number} onChange={handleChange} />
          <Input label="Vergi Dairesi" name="tax_office" value={form.tax_office} onChange={handleChange} />
          <Input label="Ödeme Koşulları" name="payment_terms" value={form.payment_terms} onChange={handleChange} />
          <Textarea label="Adres" name="address" value={form.address} onChange={handleChange} />
          <Textarea label="Notlar" name="notes" value={form.notes} onChange={handleChange} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tedarikçi Puanı</label>
            <div className="flex gap-1">
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, rating: f.rating === star ? null : star }))}
                  className={`text-2xl leading-none transition-colors ${star <= (form.rating || 0) ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
                >★</button>
              ))}
              {form.rating && <button type="button" onClick={() => setForm(f => ({ ...f, rating: null }))} className="text-xs text-gray-400 hover:text-gray-600 ml-2 self-center">Temizle</button>}
            </div>
          </div>
        </div>
        {saveMutation.error && <p className="text-red-500 text-sm mt-3">{saveMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(null)}>İptal</Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        </div>
      </Modal>

      {/* Silme onayı */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Tedarikçi Sil" size="sm">
        <p className="text-gray-600">Bu tedarikçiyi silmek istediğinize emin misiniz?</p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>İptal</Button>
          <Button variant="danger" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>Sil</Button>
        </div>
      </Modal>
    </div>
  );
}
