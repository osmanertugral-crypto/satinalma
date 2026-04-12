import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRFQs, createRFQ, updateRFQStatus, getSuppliers, getProducts } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Textarea, Table, Spinner } from '../components/UI';
import { Plus, Eye, Trash2, Search, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const STATUS_COLOR = { open: 'blue', closed: 'green', cancelled: 'red' };
const STATUS_LABELS = { open: 'Açık', closed: 'Kapalı', cancelled: 'İptal' };

export default function RFQPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [modal, setModal] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ title: '', deadline: '', notes: '' });
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [items, setItems] = useState([{ product_id: '', quantity: 1, notes: '' }]);

  const { data: rawRfqs = [], isLoading } = useQuery({ queryKey: ['rfqs'], queryFn: () => getRFQs().then(r => r.data) });

  const today = new Date().toISOString().slice(0, 10);
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const rfqs = useMemo(() => {
    if (!search) return rawRfqs;
    const s = search.toLowerCase();
    return rawRfqs.filter(r =>
      (r.rfq_number || '').toLowerCase().includes(s) ||
      (r.title || '').toLowerCase().includes(s)
    );
  }, [rawRfqs, search]);

  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers().then(r => r.data) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => getProducts().then(r => r.data) });

  const createMutation = useMutation({
    mutationFn: (data) => createRFQ(data),
    onSuccess: () => { qc.invalidateQueries(['rfqs']); setModal(false); setForm({ title: '', deadline: '', notes: '' }); setSelectedSuppliers([]); setItems([{ product_id: '', quantity: 1, notes: '' }]); }
  });

  function toggleSupplier(sid) {
    setSelectedSuppliers(s => s.includes(sid) ? s.filter(x => x !== sid) : [...s, sid]);
  }
  function addItem() { setItems(i => [...i, { product_id: '', quantity: 1, notes: '' }]); }
  function removeItem(idx) { setItems(i => i.filter((_, ii) => ii !== idx)); }
  function updateItem(idx, key, val) { setItems(i => i.map((it, ii) => ii === idx ? { ...it, [key]: val } : it)); }

  return (
    <div className="p-6">
      <PageHeader
        title="Teklif Talepleri (RFQ)"
        subtitle={`${rfqs.length} teklif talebi`}
        action={canEdit && <Button onClick={() => setModal(true)}><Plus size={16} /> Yeni RFQ</Button>}
      />

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="RFQ No veya başlık..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        {isLoading ? <Spinner /> : (
          <Table headers={['RFQ No', 'Başlık', 'Son Tarih', 'Oluşturulma', 'Tedarikçi', 'Kalem', 'Durum', 'İşlem']}
            empty={rfqs.length === 0 && 'RFQ bulunamadı'}>
            {rfqs.map(r => {
              const isExpired = r.deadline && r.deadline < today && r.status === 'open';
              const isNear = r.deadline && r.deadline >= today && r.deadline <= in3days && r.status === 'open';
              return (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm text-blue-600 font-medium">{r.rfq_number}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{r.title}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={isExpired ? 'text-red-600 font-medium' : isNear ? 'text-amber-600 font-medium' : 'text-gray-500'}>{r.deadline || '-'}</span>
                    {isExpired && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700"><AlertTriangle size={10} /> Süresi Geçti</span>}
                    {isNear && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700"><AlertTriangle size={10} /> Yakın</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(r.created_at).toLocaleDateString('tr-TR')}</td>
                <td className="px-4 py-3 text-sm text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{r.supplier_count || 0}</span>
                </td>
                <td className="px-4 py-3 text-sm text-center">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">{r.item_count || 0}</span>
                </td>
                <td className="px-4 py-3"><Badge color={STATUS_COLOR[r.status]}>{STATUS_LABELS[r.status]}</Badge></td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/rfq/${r.id}`)} className="text-blue-500 hover:text-blue-700"><Eye size={16} /></button>
                </td>
              </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* RFQ Oluşturma Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Yeni Teklif Talebi (RFQ)" size="xl">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input label="Başlık *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="col-span-2" />
          <Input label="Son Teklif Tarihi" type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          <Textarea label="Notlar" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tedarikçiler *</label>
          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
            {suppliers.map(s => (
              <label key={s.id} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="checkbox" checked={selectedSuppliers.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Ürünler *</h3>
            <Button size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Ekle</Button>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
              <div className="col-span-7">
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}>
                  <option value="">Ürün seçin...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number" placeholder="Miktar" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
              </div>
              <div className="col-span-2">
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>

        {createMutation.error && <p className="text-red-500 text-sm mt-2">{createMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(false)}>İptal</Button>
          <Button onClick={() => createMutation.mutate({ ...form, supplier_ids: selectedSuppliers, items })}
            disabled={!form.title || !selectedSuppliers.length || !items.some(i => i.product_id) || createMutation.isPending}>
            Oluştur
          </Button>
        </div>
      </Modal>
    </div>
  );
}
