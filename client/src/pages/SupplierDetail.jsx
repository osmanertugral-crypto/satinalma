import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupplier, getProducts, getPOs, addSupplierProduct, removeSupplierProduct, uploadDocument, getDocuments, deleteDocument, getDocumentDownloadUrl } from '../api';
import { Card, Button, Badge, Table, Spinner, Modal, Select, Input } from '../components/UI';
import { ArrowLeft, Plus, Trash2, Upload, Download, ShoppingCart, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const { data: supplier, isLoading } = useQuery({ queryKey: ['supplier', id], queryFn: () => getSupplier(id).then(r => r.data) });
  const { data: allProducts = [] } = useQuery({ queryKey: ['products'], queryFn: () => getProducts().then(r => r.data) });
  const { data: docs = [] } = useQuery({ queryKey: ['docs', 'supplier', id], queryFn: () => getDocuments({ entity_type: 'supplier', entity_id: id }).then(r => r.data) });
  const { data: orders = [] } = useQuery({ queryKey: ['pos', 'supplier', id], queryFn: () => getPOs({ supplier_id: id }).then(r => r.data) });

  const STATUS_LABELS = { draft: 'Taslak', sent: 'Gönderildi', confirmed: 'Onaylandı', delivered: 'Teslim Alındı', cancelled: 'İptal' };
  const STATUS_COLOR = { draft: 'gray', sent: 'blue', confirmed: 'green', delivered: 'purple', cancelled: 'red' };

  const [addProdModal, setAddProdModal] = useState(false);
  const [prodForm, setProdForm] = useState({ product_id: '', lead_time_days: 0, is_preferred: false });

  const addProdMutation = useMutation({
    mutationFn: (data) => addSupplierProduct(id, data),
    onSuccess: () => { qc.invalidateQueries(['supplier', id]); setAddProdModal(false); }
  });

  const removeProdMutation = useMutation({
    mutationFn: (spId) => removeSupplierProduct(id, spId),
    onSuccess: () => qc.invalidateQueries(['supplier', id])
  });

  const [uploading, setUploading] = useState(false);
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('entity_type', 'supplier');
    fd.append('entity_id', id);
    setUploading(true);
    try { await uploadDocument(fd); qc.invalidateQueries(['docs', 'supplier', id]); }
    finally { setUploading(false); e.target.value = ''; }
  }

  const deleteDocMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => qc.invalidateQueries(['docs', 'supplier', id])
  });

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!supplier) return <div className="p-8 text-gray-500">Tedarikçi bulunamadı.</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/suppliers')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{supplier.name}</h1>
          <Badge color={supplier.active ? 'green' : 'gray'}>{supplier.active ? 'Aktif' : 'Pasif'}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Bilgiler */}
        <Card className="p-5 lg:col-span-1">
          <h2 className="font-semibold text-gray-700 mb-4">İletişim Bilgileri</h2>
          {[['İletişim', supplier.contact_name], ['E-posta', supplier.email], ['Telefon', supplier.phone], ['Adres', supplier.address], ['Şehir', supplier.city], ['Ülke', supplier.country], ['Vergi No', supplier.tax_number], ['Vergi Dairesi', supplier.tax_office], ['Ödeme Koşulları', supplier.payment_terms]].map(([k, v]) => v ? (
            <div key={k} className="flex gap-2 text-sm mb-2">
              <span className="text-gray-500 min-w-24">{k}:</span>
              <span className="text-gray-800 font-medium">{v}</span>
            </div>
          ) : null)}
          {supplier.notes && <p className="text-sm text-gray-500 mt-3 border-t pt-3">{supplier.notes}</p>}
        </Card>

        {/* Ürünler */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Temin Ettiği Ürünler ({supplier.products?.length || 0})</h2>
            {canEdit && <Button size="sm" onClick={() => setAddProdModal(true)}><Plus size={14} /> Ürün Ekle</Button>}
          </div>
          <Table headers={['Ürün Kodu', 'Ürün Adı', 'Kategori', 'Teslimat Süresi', 'Tercihli', '']}
            empty={!supplier.products?.length && 'Ürün eklenmemiş'}>
            {supplier.products?.map(sp => (
              <tr key={sp.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-500">{sp.code}</td>
                <td className="px-4 py-2 text-sm font-medium text-gray-800">{sp.name}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{sp.category_name || '-'}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{sp.lead_time_days} gün</td>
                <td className="px-4 py-2"><Badge color={sp.is_preferred ? 'green' : 'gray'}>{sp.is_preferred ? 'Evet' : 'Hayır'}</Badge></td>
                <td className="px-4 py-2">
                  {canEdit && <button onClick={() => removeProdMutation.mutate(sp.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>

      {/* Siparişler */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2"><ShoppingCart size={18} /> Siparişler ({orders.length})</h2>
        </div>
        {orders.length === 0 ? <p className="text-gray-400 text-sm">Bu tedarikçiye ait sipariş bulunamadı.</p> : (
          <Table headers={['Sipariş No', 'Tarih', 'Beklenen Tarih', 'Durum', 'Toplam Tutar', '']}
            empty={!orders.length && 'Sipariş yok'}>
            {orders.map(po => (
              <tr key={po.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/po/${po.id}`)}>
                <td className="px-4 py-3 text-sm font-medium text-blue-600">{po.po_number}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{new Date(po.order_date).toLocaleDateString('tr-TR')}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{po.expected_date ? new Date(po.expected_date).toLocaleDateString('tr-TR') : '-'}</td>
                <td className="px-4 py-3"><Badge color={STATUS_COLOR[po.status]}>{STATUS_LABELS[po.status]}</Badge></td>
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{Number(po.total_amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {po.currency}</td>
                <td className="px-4 py-3"><Eye size={16} className="text-blue-500" /></td>
              </tr>
            ))}
          </Table>
        )}
        {orders.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">Toplam {orders.length} sipariş</span>
            <span className="font-semibold text-gray-800">
              Genel Toplam: {orders.reduce((sum, po) => sum + Number(po.total_amount), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {orders[0]?.currency || 'TRY'}
            </span>
          </div>
        )}
      </Card>

      {/* Belgeler */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Belgeler ({docs.length})</h2>
          {canEdit && (
            <label className="cursor-pointer">
              <Button size="sm" as="span" disabled={uploading}><Upload size={14} /> {uploading ? 'Yükleniyor...' : 'Dosya Yükle'}</Button>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png" />
            </label>
          )}
        </div>
        {docs.length === 0 ? <p className="text-gray-400 text-sm">Belge yüklenmemiş.</p> : (
          <div className="space-y-2">
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{d.original_name}</p>
                  <p className="text-xs text-gray-400">{d.uploaded_by_name} · {new Date(d.created_at).toLocaleDateString('tr-TR')}</p>
                </div>
                <div className="flex gap-2">
                  <a href={getDocumentDownloadUrl(d.id)} download className="text-blue-500 hover:text-blue-700"><Download size={15} /></a>
                  {canEdit && <button onClick={() => deleteDocMutation.mutate(d.id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ürün Ekleme Modal */}
      <Modal open={addProdModal} onClose={() => setAddProdModal(false)} title="Ürün İlişkilendir">
        <Select label="Ürün *" value={prodForm.product_id} onChange={e => setProdForm(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">Seçin...</option>
          {allProducts.filter(p => !supplier.products?.find(sp => sp.product_id === p.id)).map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </Select>
        <Input label="Teslimat Süresi (gün)" type="number" value={prodForm.lead_time_days} onChange={e => setProdForm(f => ({ ...f, lead_time_days: e.target.value }))} className="mt-3" />
        <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={prodForm.is_preferred} onChange={e => setProdForm(f => ({ ...f, is_preferred: e.target.checked }))} />
          Tercihli tedarikçi
        </label>
        {addProdMutation.error && <p className="text-red-500 text-sm mt-2">{addProdMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setAddProdModal(false)}>İptal</Button>
          <Button onClick={() => addProdMutation.mutate(prodForm)} disabled={!prodForm.product_id || addProdMutation.isPending}>Ekle</Button>
        </div>
      </Modal>
    </div>
  );
}
