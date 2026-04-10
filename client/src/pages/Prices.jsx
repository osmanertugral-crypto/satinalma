import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPrices, addPrice, deletePrice, getPriceAlerts, createPriceAlert, deletePriceAlert, getProducts, getSuppliers } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Table, Spinner } from '../components/UI';
import { Plus, Trash2, Bell, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function PricesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [productFilter, setProductFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', product_id: '', price: '', currency: 'TRY', price_date: new Date().toISOString().slice(0,10), notes: '' });

  const { data: prices = [], isLoading } = useQuery({
    queryKey: ['prices', productFilter, supplierFilter],
    queryFn: () => getPrices({ product_id: productFilter || undefined, supplier_id: supplierFilter || undefined }).then(r => r.data)
  });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => getProducts().then(r => r.data) });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers().then(r => r.data) });

  const addMutation = useMutation({
    mutationFn: addPrice,
    onSuccess: () => { qc.invalidateQueries(['prices']); setModal(false); }
  });

  const deleteMutation = useMutation({
    mutationFn: deletePrice,
    onSuccess: () => qc.invalidateQueries(['prices'])
  });

  return (
    <div className="p-6">
      <PageHeader
        title="Fiyat Geçmişi"
        subtitle={`${prices.length} kayıt`}
        action={canEdit && <Button onClick={() => setModal(true)}><Plus size={16} /> Fiyat Gir</Button>}
      />

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3">
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
            value={productFilter} onChange={e => setProductFilter(e.target.value)}>
            <option value="">Tüm Ürünler</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1"
            value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
            <option value="">Tüm Tedarikçiler</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {isLoading ? <Spinner /> : (
          <Table headers={['Tarih', 'Ürün', 'Tedarikçi', 'Fiyat', 'Para Birimi', 'Birim', '']}
            empty={prices.length === 0 && 'Fiyat kaydı bulunamadı'}>
            {prices.map(p => (
              <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-500">{p.price_date}</td>
                <td className="px-4 py-2 text-sm font-medium text-gray-800">{p.product_name}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{p.supplier_name}</td>
                <td className="px-4 py-2 text-sm font-bold text-gray-800">{p.price.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{p.currency}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{p.unit}</td>
                <td className="px-4 py-2">
                  {user?.role === 'admin' && (
                    <button onClick={() => deleteMutation.mutate(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Fiyat Girme Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Fiyat Gir">
        <Select label="Ürün *" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">Seçin...</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </Select>
        <Select label="Tedarikçi *" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className="mt-3">
          <option value="">Seçin...</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Fiyat *" type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
          <Select label="Para Birimi" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
            {['TRY', 'USD', 'EUR'].map(c => <option key={c}>{c}</option>)}
          </Select>
        </div>
        <Input label="Tarih *" type="date" value={form.price_date} onChange={e => setForm(f => ({ ...f, price_date: e.target.value }))} className="mt-3" />
        {addMutation.error && <p className="text-red-500 text-sm mt-2">{addMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(false)}>İptal</Button>
          <Button onClick={() => addMutation.mutate(form)} disabled={!form.product_id || !form.supplier_id || !form.price || addMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>
    </div>
  );
}
