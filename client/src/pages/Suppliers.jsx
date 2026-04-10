import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSuppliers, getSupplierStats, createSupplier, updateSupplier, deleteSupplier } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Textarea, Select, Table, Spinner, StatCard } from '../components/UI';
import { Plus, Pencil, Trash2, Eye, Search, ArrowUpDown, Calendar, TrendingUp, ShoppingCart, Users, DollarSign, BarChart3, PieChart as PieChartIcon } from 'lucide-react';
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

  const { data: rawSuppliers = [], isLoading } = useQuery({
    queryKey: ['suppliers', search, filterYear, filterMonth],
    queryFn: () => getSuppliers({ search: search || undefined, year: filterYear, month: filterMonth || undefined }).then(r => r.data),
  });

  const { data: statsData } = useQuery({
    queryKey: ['supplier-stats', chartYear],
    queryFn: () => getSupplierStats({ year: chartYear }).then(r => r.data),
  });

  const chartMonthly = useMemo(() => {
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
  }, [statsData]);

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

  const yearTotal = statsData?.yearTotal || { toplam_tutar: 0, toplam_siparis: 0, aktif_tedarikci: 0 };

  const suppliers = [...rawSuppliers].sort((a, b) => {
    if (sortBy === 'year_total_amount') return (b.year_total_amount || 0) - (a.year_total_amount || 0);
    if (sortBy === 'order_count') return (b.order_count || 0) - (a.order_count || 0);
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });

  const saveMutation = useMutation({
    mutationFn: (data) => modal?.id ? updateSupplier(modal.id, data) : createSupplier(data),
    onSuccess: () => { qc.invalidateQueries(['suppliers']); setModal(null); }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => { qc.invalidateQueries(['suppliers']); setDeleteId(null); }
  });

  function openAdd() { setForm(EMPTY); setModal('add'); }
  function openEdit(s) { setForm({ ...s }); setModal({ id: s.id }); }
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
            </div>
          )}
        </div>
      </Card>

      {showCharts && (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Toplam Tutar"
              value={`₺${(yearTotal.toplam_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={DollarSign}
              color="blue"
            />
            <StatCard
              label="Toplam Sipariş"
              value={yearTotal.toplam_siparis || 0}
              icon={ShoppingCart}
              color="green"
            />
            <StatCard
              label="Aktif Tedarikçi"
              value={yearTotal.aktif_tedarikci || 0}
              icon={Users}
              color="purple"
            />
            <StatCard
              label="Ort. Sipariş Tutarı"
              value={`₺${yearTotal.toplam_siparis ? ((yearTotal.toplam_tutar || 0) / yearTotal.toplam_siparis).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}`}
              icon={TrendingUp}
              color="orange"
            />
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Monthly Bar Chart */}
            <Card>
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><BarChart3 size={16} className="text-blue-500" /> Aylık Satınalma Tutarı ({chartYear})</h3>
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
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><TrendingUp size={16} className="text-green-500" /> En Yüksek Tutarlı Tedarikçiler ({chartYear})</h3>
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
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><PieChartIcon size={16} className="text-purple-500" /> Sipariş Durumu Dağılımı ({chartYear})</h3>
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
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users size={16} className="text-amber-500" /> Aylık Aktif Tedarikçi Sayısı ({chartYear})</h3>
              </div>
              <div className="p-4" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartMonthly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="ay" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={(_label, payload) => payload?.[0]?.payload?.ayFull || _label} />
                    <Legend />
                    <Line type="monotone" dataKey="tedarikci_sayisi" name="Tedarikçi Sayısı" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
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
            headers={['Ad', 'İletişim', 'Telefon', 'Şehir', `${filterMonth ? MONTHS[parseInt(filterMonth)] + ' ' : ''}${filterYear} Toplam Tutar`, 'Sipariş', 'Durum', 'İşlem']}
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
                  <Badge color={s.active ? 'green' : 'gray'}>{s.active ? 'Aktif' : 'Pasif'}</Badge>
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
