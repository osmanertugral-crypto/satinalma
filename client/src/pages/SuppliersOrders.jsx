import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPO, getPOs, getSupplierPanelDetail, getSupplierStats, getSuppliers } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Table, Spinner, StatCard } from '../components/UI';
import { Search, Calendar, BarChart3, PieChart as PieChartIcon, TrendingUp, ShoppingCart, Users, DollarSign, FileText } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import { useSearchParams } from 'react-router-dom';

const MONTHS = ['', 'Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));
const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const STATUS_LABELS = { draft: 'Taslak', sent: 'Gonderildi', confirmed: 'Onaylandi', delivered: 'Teslim', cancelled: 'Iade', 'açık': 'Acik', bekleyen: 'Bekleyen', kapanan: 'Kapanan' };
const STATUS_COLORS = { draft: '#94a3b8', sent: '#3b82f6', confirmed: '#f59e0b', delivered: '#10b981', cancelled: '#ef4444', 'açık': '#eab308', bekleyen: '#f97316', kapanan: '#10b981' };

export default function SuppliersOrdersPage() {
  const [params] = useSearchParams();
  const [viewMode, setViewMode] = useState(params.get('tab') === 'orders' ? 'orders' : 'suppliers');
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState(params.get('status') || '');
  const [supplierSort, setSupplierSort] = useState('name_asc');
  const [orderSort, setOrderSort] = useState('date_desc');

  const [chartYear, setChartYear] = useState(String(new Date().getFullYear()));
  const [chartMonth, setChartMonth] = useState('');

  const [supplierModalId, setSupplierModalId] = useState(null);
  const [poModalId, setPoModalId] = useState(null);

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
      if (orderSort === 'date_asc') return (a.order_date || '').localeCompare(b.order_date || '');
      if (orderSort === 'amount_desc') return Number(b.total_amount || 0) - Number(a.total_amount || 0);
      if (orderSort === 'amount_asc') return Number(a.total_amount || 0) - Number(b.total_amount || 0);
      return (b.order_date || '').localeCompare(a.order_date || '');
    });
  }, [allOrders, filterYear, filterMonth, search, orderStatusFilter, orderSort]);

  const sortedSuppliers = useMemo(() => {
    const list = [...supplierRows];
    return list.sort((a, b) => {
      if (supplierSort === 'name_desc') return String(b.name || '').localeCompare(String(a.name || ''), 'tr');
      if (supplierSort === 'amount_desc') return Number(b.year_total_amount || 0) - Number(a.year_total_amount || 0);
      if (supplierSort === 'amount_asc') return Number(a.year_total_amount || 0) - Number(b.year_total_amount || 0);
      if (supplierSort === 'count_desc') return Number(b.order_count || 0) - Number(a.order_count || 0);
      if (supplierSort === 'count_asc') return Number(a.order_count || 0) - Number(b.order_count || 0);
      return String(a.name || '').localeCompare(String(b.name || ''), 'tr');
    });
  }, [supplierRows, supplierSort]);

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

  const chartTopSuppliers = (statsData?.topSuppliers || []).map(s => ({
    name: s.name.length > 25 ? `${s.name.slice(0, 25)}...` : s.name,
    fullName: s.name,
    toplam_tutar: s.toplam_tutar,
  }));

  const chartPieStatus = (statsData?.statusDist || []).map(s => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.sayi,
    color: STATUS_COLORS[s.status] || '#94a3b8',
  }));

  const yearTotal = statsData?.yearTotal || { toplam_tutar: 0, toplam_siparis: 0, aktif_tedarikci: 0, acik_siparis: 0 };
  const isLoadingMain = viewMode === 'suppliers' ? suppliersLoading : ordersLoading;

  return (
    <div className="p-6">
      <PageHeader title="Siparisler ve Tedarikciler" subtitle="Tek ekranda tedarikci, siparis ve detay modal akisi" />

      <Card className="mb-6">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary"><BarChart3 size={16} /> Grafikler</Button>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={chartYear} onChange={e => setChartYear(e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={chartMonth} onChange={e => setChartMonth(e.target.value)}>
              <option value="">Tum Aylar</option>
              {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Toplam Tutar" value={`₺${(yearTotal.toplam_tutar || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`} icon={DollarSign} color="blue" />
        <StatCard label="Toplam Siparis" value={yearTotal.toplam_siparis || 0} icon={ShoppingCart} color="green" />
        <StatCard label="Aktif Tedarikci" value={yearTotal.aktif_tedarikci || 0} icon={Users} color="purple" />
        <StatCard label="Kapanmamis Siparis" value={yearTotal.acik_siparis || 0} icon={FileText} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <div className="p-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Aylik Satinalma Tutari</h3></div>
          <div className="p-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="ay" />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Tutar') return [`₺${Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name];
                    return [value, name];
                  }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.ayFull || label}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="toplam_tutar" name="Tutar" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" dataKey="siparis_sayisi" name="Siparis" stroke="#ef4444" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div className="p-4 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Durum Dagilimi</h3></div>
          <div className="p-4" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartPieStatus} dataKey="value" nameKey="name" outerRadius={90}>
                  {chartPieStatus.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Legend />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString('tr-TR')} sipariş`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
            <button className={`px-3 py-2 text-sm ${viewMode === 'suppliers' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`} onClick={() => setViewMode('suppliers')}>Tedarikciler</button>
            <button className={`px-3 py-2 text-sm ${viewMode === 'orders' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`} onClick={() => setViewMode('orders')}>Siparisler</button>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-56" placeholder={viewMode === 'suppliers' ? 'Tedarikci ara...' : 'PO no veya tedarikci ara...'} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">Tum Yil</option>
            {MONTHS.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
          </select>
          {viewMode === 'suppliers' && (
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={supplierSort} onChange={e => setSupplierSort(e.target.value)}>
              <option value="name_asc">Ad (A-Z)</option>
              <option value="name_desc">Ad (Z-A)</option>
              <option value="amount_desc">Tutar (Azalan)</option>
              <option value="amount_asc">Tutar (Artan)</option>
              <option value="count_desc">Siparis Sayisi (Azalan)</option>
              <option value="count_asc">Siparis Sayisi (Artan)</option>
            </select>
          )}
          {viewMode === 'orders' && (
            <>
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={orderStatusFilter} onChange={e => setOrderStatusFilter(e.target.value)}>
                <option value="">Tum Durumlar</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                <option value="cancelled">Iadeler</option>
              </select>
              <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={orderSort} onChange={e => setOrderSort(e.target.value)}>
                <option value="date_desc">Tarih (Yeni-Eski)</option>
                <option value="date_asc">Tarih (Eski-Yeni)</option>
                <option value="amount_desc">Tutar (Azalan)</option>
                <option value="amount_asc">Tutar (Artan)</option>
              </select>
            </>
          )}
        </div>

        {isLoadingMain ? <Spinner /> : viewMode === 'suppliers' ? (
          <Table headers={['Ad', 'Iletisim', 'Telefon', 'Sehir', 'Toplam Tutar', 'Siparis']} empty={sortedSuppliers.length === 0 && 'Tedarikci bulunamadi'}>
            {sortedSuppliers.map(s => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSupplierModalId(s.id)}>
                <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                <td className="px-4 py-3 text-gray-600">{s.contact_name || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{s.phone || '-'}</td>
                <td className="px-4 py-3 text-gray-600">{s.city || '-'}</td>
                <td className="px-4 py-3 font-semibold text-gray-800">{Number(s.year_total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</td>
                <td className="px-4 py-3 text-gray-600">{s.order_count || 0}</td>
              </tr>
            ))}
          </Table>
        ) : (
          <Table headers={['PO No', 'Tedarikci', 'Siparis Tarihi', 'Durum', 'Toplam']} empty={filteredOrders.length === 0 && 'Siparis bulunamadi'}>
            {filteredOrders.map(po => (
              <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setPoModalId(po.id)}>
                <td className="px-4 py-3 text-blue-600 font-medium">{po.po_number}</td>
                <td className="px-4 py-3 text-gray-700">{po.supplier_name}</td>
                <td className="px-4 py-3 text-gray-600">{po.order_date || '-'}</td>
                <td className="px-4 py-3"><Badge color={po.status === 'cancelled' ? 'red' : po.status === 'kapanan' ? 'green' : 'yellow'}>{STATUS_LABELS[po.status] || po.status}</Badge></td>
                <td className="px-4 py-3 font-semibold text-gray-800">{Number(po.total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {po.currency || 'TRY'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!supplierModalId} onClose={() => setSupplierModalId(null)} title={supplierDetail?.name || 'Tedarikci Detayi'} size="xl">
        {supplierDetailLoading ? <Spinner /> : supplierDetail && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Urunler</h3>
              <Table headers={['Kod', 'Ad', 'Birim']} empty={!supplierDetail.products?.length && 'Urun yok'}>
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
              <h3 className="font-semibold text-gray-700 mb-3">Siparisler</h3>
              <Table headers={['PO', 'Tarih', 'Durum', 'Tutar']} empty={supplierOrders.length === 0 && 'Siparis yok'}>
                {supplierOrders.map(po => (
                  <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => { setSupplierModalId(null); setPoModalId(po.id); }}>
                    <td className="px-3 py-2 text-sm text-blue-600">{po.po_number}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{po.order_date}</td>
                    <td className="px-3 py-2"><Badge color={po.status === 'cancelled' ? 'red' : po.status === 'kapanan' ? 'green' : 'yellow'}>{STATUS_LABELS[po.status] || po.status}</Badge></td>
                    <td className="px-3 py-2 text-sm text-gray-700">{Number(po.total_amount || 0).toLocaleString('tr-TR')} {po.currency || 'TRY'}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}
      </Modal>

      <Modal open={!!poModalId} onClose={() => setPoModalId(null)} title={poDetail?.po_number || 'Siparis Detayi'} size="xl">
        {poDetailLoading ? <Spinner /> : poDetail && (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div><span className="text-gray-500">Tedarikci:</span> <span className="font-medium text-gray-800">{poDetail.supplier_name}</span></div>
                <div><span className="text-gray-500">Siparis Tarihi:</span> <span className="font-medium text-gray-800">{poDetail.order_date || '-'}</span></div>
                <div><span className="text-gray-500">Beklenen:</span> <span className="font-medium text-gray-800">{poDetail.expected_date || '-'}</span></div>
                <div><span className="text-gray-500">Durum:</span> <Badge color={poDetail.status === 'cancelled' ? 'red' : poDetail.status === 'kapanan' ? 'green' : 'yellow'}>{STATUS_LABELS[poDetail.status] || poDetail.status}</Badge></div>
                <div><span className="text-gray-500">Para Birimi:</span> <span className="font-medium text-gray-800">{poDetail.currency || 'TRY'}</span></div>
                <div><span className="text-gray-500">Toplam:</span> <span className="font-semibold text-gray-900">{Number(poDetail.total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {poDetail.currency || 'TRY'}</span></div>
              </div>
              {poDetail.notes && <p className="mt-3 text-sm text-gray-600 border-t pt-3">{poDetail.notes}</p>}
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-gray-700 mb-3">Kalemler</h3>
              <Table headers={['Urun Kodu', 'Urun Adi', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam']} empty={!poDetail.items?.length && 'Kalem yok'}>
                {poDetail.items?.map(item => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-xs text-gray-600">{item.product_code}</td>
                    <td className="px-3 py-2 text-sm text-gray-800">{item.product_name}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{item.quantity}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{item.unit}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{Number(item.unit_price || 0).toLocaleString('tr-TR')}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-gray-800">{Number((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('tr-TR')}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        )}
      </Modal>
    </div>
  );
}
