import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPOs, createPO, updatePOStatus, deletePO, getSuppliers, getProducts } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Textarea, Table, Spinner } from '../components/UI';
import { Plus, Eye, Trash2, ArrowUpDown, Search, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

const STATUS_LABELS = { draft: 'Taslak', sent: 'Gönderildi', confirmed: 'Onaylandı', delivered: 'Teslim Alındı', cancelled: 'İptal', açık: 'Açık', bekleyen: 'Bekleyen', kapanan: 'Kapanan' };
const STATUS_COLOR = { draft: 'gray', sent: 'blue', confirmed: 'green', delivered: 'purple', cancelled: 'red', açık: 'yellow', bekleyen: 'orange', kapanan: 'green' };

const EMPTY_PO = { supplier_id: '', order_date: new Date().toISOString().slice(0,10), expected_date: '', currency: 'TRY', notes: '' };

export default function POPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date_desc');
  const [modal, setModal] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(EMPTY_PO);
  const [items, setItems] = useState([{ product_id: '', quantity: 1, unit_price: '', notes: '' }]);
  const [deleteId, setDeleteId] = useState(null);

  const { data: rawPos = [], isLoading } = useQuery({
    queryKey: ['pos', statusFilter, supplierFilter],
    queryFn: () => getPOs({ status: statusFilter || undefined, supplier_id: supplierFilter || undefined }).then(r => r.data)
  });

  const pos = useMemo(() => {
    let list = [...rawPos];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        (p.po_number || '').toLowerCase().includes(s) ||
        (p.supplier_name || '').toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => {
      if (sortBy === 'date_asc') return (a.order_date || '').localeCompare(b.order_date || '');
      if (sortBy === 'supplier') return (a.supplier_name || '').localeCompare(b.supplier_name || '', 'tr');
      return (b.order_date || '').localeCompare(a.order_date || '');
    });
  }, [rawPos, search, sortBy]);

  const summary = useMemo(() => {
    const map = {};
    for (const po of pos) {
      if (!map[po.status]) map[po.status] = { count: 0, total: 0 };
      map[po.status].count++;
      map[po.status].total += po.total_amount || 0;
    }
    return map;
  }, [pos]);
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => getSuppliers().then(r => r.data) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => getProducts().then(r => r.data) });

  const createMutation = useMutation({
    mutationFn: (data) => createPO(data),
    onSuccess: () => { qc.invalidateQueries(['pos']); setModal(false); setForm(EMPTY_PO); setItems([{ product_id: '', quantity: 1, unit_price: '', notes: '' }]); }
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updatePOStatus(id, { status }),
    onSuccess: () => qc.invalidateQueries(['pos'])
  });

  const deleteMutation = useMutation({
    mutationFn: deletePO,
    onSuccess: () => { qc.invalidateQueries(['pos']); setDeleteId(null); }
  });

  function addItem() { setItems(i => [...i, { product_id: '', quantity: 1, unit_price: '', notes: '' }]); }
  function removeItem(idx) { setItems(i => i.filter((_, ii) => ii !== idx)); }
  function updateItem(idx, key, val) { setItems(i => i.map((it, ii) => ii === idx ? { ...it, [key]: val } : it)); }

  const total = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0), 0);

  function handleSave() {
    createMutation.mutate({ ...form, items });
  }

  function handleExport() {
    const rows = pos.map(po => ({
      'PO No': po.po_number,
      'Tedarikçi': po.supplier_name,
      'Sipariş Tarihi': po.order_date,
      'Beklenen Teslimat': po.expected_date || '',
      'Tutar': po.total_amount || 0,
      'Para Birimi': po.currency,
      'Durum': STATUS_LABELS[po.status] || po.status,
      'Gecikmişş': po.expected_date && po.expected_date < today && !['kapanan', 'cancelled', 'delivered'].includes(po.status) ? 'Evet' : 'Hayır',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Siparişler');
    XLSX.writeFile(wb, `siparisler_${today}.xlsx`);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Satın Alma Siparişleri"
        subtitle={`${pos.length} sipariş`}
        action={canEdit && <Button onClick={() => setModal(true)}><Plus size={16} /> Yeni Sipariş</Button>}
      />

      {pos.length > 0 && (
        <div className="flex gap-3 mb-4 flex-wrap">
          {Object.entries(STATUS_LABELS).map(([k, v]) => summary[k] ? (
            <div key={k} className="bg-white rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-2 shadow-sm">
              <Badge color={STATUS_COLOR[k]}>{v}</Badge>
              <span className="text-sm font-semibold text-gray-700">{summary[k].count} adet</span>
              <span className="text-xs text-gray-300">|</span>
              <span className="text-sm text-gray-600">{summary[k].total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
            </div>
          ) : null)}
        </div>
      )}

      <Card>
        <div className="p-4 border-b border-gray-100 flex gap-3 items-center flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              className="pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              placeholder="PO No veya tedarikçi..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tüm Durumlar</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
            <option value="">Tüm Tedarikçiler</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-gray-400" />
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="date_desc">Tarihe Göre (Yeni Önce)</option>
              <option value="date_asc">Tarihe Göre (Eski Önce)</option>
              <option value="supplier">Tedarikçiye Göre</option>
            </select>
          </div>
          <button
            onClick={handleExport}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            <Download size={14} /> Excel
          </button>
        </div>

        {isLoading ? <Spinner /> : (
          <Table headers={['PO No', 'Tedarikçi', 'Sipariş Tarihi', 'Beklenen Teslimat', 'Tutar', 'Durum', 'İşlem']}
            empty={pos.length === 0 && 'Sipariş bulunamadı'}>
            {pos.map(po => {
              const isLate = po.expected_date && po.expected_date < today && !['kapanan', 'cancelled', 'delivered'].includes(po.status);
              return (
              <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm text-blue-600 font-medium">{po.po_number}</td>
                <td className="px-4 py-3 text-gray-800">{po.supplier_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{po.order_date}</td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={isLate ? 'text-red-600 font-medium' : 'text-gray-500'}>{po.expected_date || '-'}</span>
                    {isLate && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">Gecikmiş</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-gray-700">{po.total_amount?.toLocaleString('tr-TR')} {po.currency}</td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <select
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={po.status}
                      onChange={e => statusMutation.mutate({ id: po.id, status: e.target.value })}
                      disabled={statusMutation.isPending}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : <Badge color={STATUS_COLOR[po.status]}>{STATUS_LABELS[po.status]}</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => navigate(`/po/${po.id}`)} className="text-blue-500 hover:text-blue-700"><Eye size={16} /></button>
                    {user?.role === 'admin' && po.status === 'draft' && <button onClick={() => setDeleteId(po.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>}
                  </div>
                </td>
              </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* PO Oluşturma Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Yeni Satın Alma Siparişi" size="xl">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Select label="Tedarikçi *" value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
            <option value="">Seçin...</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          <Select label="Para Birimi" value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
            {['TRY', 'USD', 'EUR'].map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Sipariş Tarihi *" type="date" value={form.order_date} onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))} />
          <Input label="Beklenen Teslimat" type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} />
          <Textarea label="Notlar" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="col-span-2" />
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-700">Kalemler</h3>
            <Button size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Kalem Ekle</Button>
          </div>
          {items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
              <div className="col-span-5">
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={item.product_id} onChange={e => updateItem(idx, 'product_id', e.target.value)}>
                  <option value="">Ürün seçin...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number" placeholder="Miktar" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
              </div>
              <div className="col-span-2">
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  type="number" placeholder="Birim Fiyat" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
              </div>
              <div className="col-span-2 text-sm text-gray-600 pb-2 text-right font-medium">
                {((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)).toLocaleString('tr-TR')}
              </div>
              <div className="col-span-1">
                <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 pb-2"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <div className="text-right font-bold text-lg text-gray-800 mt-3 border-t pt-3">
            Toplam: {total.toLocaleString('tr-TR')} {form.currency}
          </div>
        </div>

        {createMutation.error && <p className="text-red-500 text-sm mt-2">{createMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(false)}>İptal</Button>
          <Button onClick={handleSave} disabled={!form.supplier_id || createMutation.isPending}>Oluştur</Button>
        </div>
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Sipariş Sil" size="sm">
        <p className="text-gray-600">Bu siparişi silmek istediğinize emin misiniz?</p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>İptal</Button>
          <Button variant="danger" onClick={() => deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>Sil</Button>
        </div>
      </Modal>
    </div>
  );
}
