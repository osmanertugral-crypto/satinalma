import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProduct, getPriceTrend, addPrice, getPriceAlerts, createPriceAlert, deletePriceAlert, getSuppliers } from '../api';
import { Card, Button, Table, Spinner, Modal, Input, Select, Badge } from '../components/UI';
import { ArrowLeft, Plus, Trash2, Bell, ShoppingCart } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const { data: product, isLoading } = useQuery({ queryKey: ['product', id], queryFn: () => getProduct(id).then(r => r.data) });
  const { data: trend = [] } = useQuery({ queryKey: ['price-trend', id], queryFn: () => getPriceTrend({ product_id: id }).then(r => r.data) });
  const { data: alerts = [] } = useQuery({ queryKey: ['price-alerts'], queryFn: () => getPriceAlerts().then(r => r.data) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers().then(r => r.data) });

  const [priceModal, setPriceModal] = useState(false);
  const [priceForm, setPriceForm] = useState({ supplier_id: '', price: '', currency: 'TRY', price_date: new Date().toISOString().slice(0,10), notes: '' });
  const [alertModal, setAlertModal] = useState(false);
  const [alertForm, setAlertForm] = useState({ threshold_percent: '' });

  const addPriceMutation = useMutation({
    mutationFn: (data) => addPrice({ ...data, product_id: id }),
    onSuccess: () => { qc.invalidateQueries(['product', id]); qc.invalidateQueries(['price-trend', id]); setPriceModal(false); }
  });

  const addAlertMutation = useMutation({
    mutationFn: (data) => createPriceAlert({ ...data, product_id: id }),
    onSuccess: () => { qc.invalidateQueries(['price-alerts']); setAlertModal(false); }
  });

  const deleteAlertMutation = useMutation({
    mutationFn: deletePriceAlert,
    onSuccess: () => qc.invalidateQueries(['price-alerts'])
  });

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!product) return <div className="p-8 text-gray-500">Ürün bulunamadı.</div>;

  const productAlerts = alerts.filter(a => a.product_id === id);

  // Grafik için tedarikçilere göre renk
  const supplierNames = [...new Set(trend.map(t => t.supplier_name))];
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Grafik verisi: her tarihe göre tedarikçi fiyatları
  const chartDataMap = {};
  trend.forEach(t => {
    if (!chartDataMap[t.price_date]) chartDataMap[t.price_date] = { date: t.price_date };
    chartDataMap[t.price_date][t.supplier_name] = t.price;
  });
  const chartData = Object.values(chartDataMap).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/products')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
          <span className="text-sm text-gray-500 font-mono">{product.code}</span>
          <span className="ml-2"><Badge color={product.active ? 'green' : 'gray'}>{product.active ? 'Aktif' : 'Pasif'}</Badge></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ürün Bilgileri */}
        <Card className="p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Ürün Bilgileri</h2>
          {[['Kategori', product.category_name], ['Birim', product.unit], ['Min. Stok', product.min_stock_level], ['Mevcut Stok', product.stock ?? 0], ['Açıklama', product.description]].map(([k, v]) => v != null ? (
            <div key={k} className="flex gap-2 text-sm mb-2">
              <span className="text-gray-500 min-w-24">{k}:</span>
              <span className={`font-medium ${k === 'Mevcut Stok' && v <= product.min_stock_level ? 'text-red-600' : 'text-gray-800'}`}>{v}</span>
            </div>
          ) : null)}
        </Card>

        {/* Tedarikçiler */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-700 mb-4">Tedarikçiler</h2>
          <Table headers={['Tedarikçi', 'Teslimat Süresi', 'Tercihli']} empty={!product.suppliers?.length && 'Tedarikçi yok'}>
            {product.suppliers?.map(s => (
              <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-800">{s.supplier_name}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{s.lead_time_days} gün</td>
                <td className="px-4 py-2"><Badge color={s.is_preferred ? 'green' : 'gray'}>{s.is_preferred ? 'Evet' : 'Hayır'}</Badge></td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {/* Son Satınalmalar */}
      <Card className="p-5">
        <h2 className="font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <ShoppingCart size={16} className="text-blue-500" /> Son Satınalmalar
        </h2>
        {product.purchaseHistory?.length > 0 ? (
          <>
            {/* En son alım özet satırı */}
            <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide block">Son Tedarikçi</span>
                <span className="font-bold text-blue-800">{product.purchaseHistory[0].supplier_name || '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide block">Tarih</span>
                <span className="font-semibold text-gray-700">{product.purchaseHistory[0].order_date ? new Date(product.purchaseHistory[0].order_date).toLocaleDateString('tr-TR') : '-'}</span>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide block">Birim Fiyat</span>
                <span className="font-semibold text-gray-700">
                  {Number(product.purchaseHistory[0].unit_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {product.purchaseHistory[0].currency}
                </span>
              </div>
              <div>
                <span className="text-gray-500 text-xs uppercase tracking-wide block">Miktar</span>
                <span className="font-semibold text-gray-700">{Number(product.purchaseHistory[0].quantity).toLocaleString('tr-TR')} {product.unit}</span>
              </div>
            </div>
            <Table headers={['Tarih', 'Sipariş No', 'Tedarikçi', 'Miktar', 'Birim Fiyat', 'Para Birimi', 'Satır Toplamı', 'Durum']}>
              {product.purchaseHistory.map((h, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-500 whitespace-nowrap">{h.order_date ? new Date(h.order_date).toLocaleDateString('tr-TR') : '-'}</td>
                  <td className="px-4 py-2 text-sm font-mono text-gray-600">{h.po_number}</td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-800">{h.supplier_name || <span className="text-gray-400">-</span>}</td>
                  <td className="px-4 py-2 text-sm text-right text-gray-700">{Number(h.quantity).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold text-gray-800">{Number(h.unit_price).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">{h.currency}</td>
                  <td className="px-4 py-2 text-sm text-right font-semibold text-gray-800">{Number(h.line_total).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2"><Badge color={h.status === 'delivered' ? 'green' : h.status === 'cancelled' ? 'red' : 'blue'}>{h.status}</Badge></td>
                </tr>
              ))}
            </Table>
          </>
        ) : (
          <p className="text-gray-400 text-sm py-4 text-center">Bu ürün için satınalma siparişi kaydı bulunamadı.<br /><span className="text-xs">"Şimdi Güncelle" ile Tiger3'ten sipariş senkronizasyonu gerekebilir.</span></p>
        )}
      </Card>

      {/* Fiyat Trend Grafiği */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Fiyat Geçmişi</h2>
          <div className="flex gap-2">
            {canEdit && <Button size="sm" variant="secondary" onClick={() => setAlertModal(true)}><Bell size={14} /> Uyarı Ekle</Button>}
            {canEdit && <Button size="sm" onClick={() => setPriceModal(true)}><Plus size={14} /> Fiyat Gir</Button>}
          </div>
        </div>

        {chartData.length === 0 ? <p className="text-gray-400 text-sm text-center py-8">Fiyat verisi yok.</p> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v?.toLocaleString('tr-TR') + ' ₺'} />
              <Legend />
              {supplierNames.map((name, i) => (
                <Line key={name} type="monotone" dataKey={name} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Fiyat Tablosu */}
        <div className="mt-4">
          <Table headers={['Tarih', 'Tedarikçi', 'Fiyat', 'Para Birimi']} empty={!product.prices?.length && 'Fiyat kaydı yok'}>
            {product.prices?.slice(0, 20).map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-500">{p.price_date}</td>
                <td className="px-4 py-2 text-sm text-gray-800">{p.supplier_name}</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-800">{p.price.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{p.currency}</td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      {/* Fiyat Uyarıları */}
      {productAlerts.length > 0 && (
        <Card className="p-5">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Bell size={16} className="text-amber-500" /> Fiyat Uyarı Kuralları</h2>
          <div className="space-y-2">
            {productAlerts.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                <span className="text-sm text-gray-700">Artış %{a.threshold_percent}'i aşarsa uyar</span>
                {canEdit && <button onClick={() => deleteAlertMutation.mutate(a.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Fiyat Ekleme Modal */}
      <Modal open={priceModal} onClose={() => setPriceModal(false)} title="Fiyat Gir">
        <Select label="Tedarikçi *" value={priceForm.supplier_id} onChange={e => setPriceForm(f => ({ ...f, supplier_id: e.target.value }))}>
          <option value="">Seçin...</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Fiyat *" type="number" step="0.01" value={priceForm.price} onChange={e => setPriceForm(f => ({ ...f, price: e.target.value }))} />
          <Select label="Para Birimi" value={priceForm.currency} onChange={e => setPriceForm(f => ({ ...f, currency: e.target.value }))}>
            {['TRY', 'USD', 'EUR'].map(c => <option key={c}>{c}</option>)}
          </Select>
        </div>
        <Input label="Tarih *" type="date" value={priceForm.price_date} onChange={e => setPriceForm(f => ({ ...f, price_date: e.target.value }))} className="mt-3" />
        {addPriceMutation.error && <p className="text-red-500 text-sm mt-2">{addPriceMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setPriceModal(false)}>İptal</Button>
          <Button onClick={() => addPriceMutation.mutate(priceForm)} disabled={!priceForm.supplier_id || !priceForm.price || addPriceMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>

      {/* Alert Modal */}
      <Modal open={alertModal} onClose={() => setAlertModal(false)} title="Fiyat Artış Uyarısı" size="sm">
        <Input label="Eşik Yüzdesi (%) *" type="number" value={alertForm.threshold_percent} onChange={e => setAlertForm({ threshold_percent: e.target.value })} placeholder="Örn: 10" />
        <p className="text-xs text-gray-400 mt-1">Fiyat bu oran kadar artarsa dashboard'da uyarı gösterilir.</p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setAlertModal(false)}>İptal</Button>
          <Button onClick={() => addAlertMutation.mutate(alertForm)} disabled={!alertForm.threshold_percent || addAlertMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>
    </div>
  );
}
