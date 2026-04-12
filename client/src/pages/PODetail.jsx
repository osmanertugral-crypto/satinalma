import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPO, updatePOStatus, uploadDocument, getDocuments, deleteDocument, getDocumentDownloadUrl } from '../api';
import { Card, Button, Badge, Table, Spinner, Modal, Input, Select } from '../components/UI';
import { ArrowLeft, Upload, Download, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const STATUS_LABELS = { draft: 'Taslak', sent: 'Gönderildi', confirmed: 'Onaylandı', delivered: 'Teslim Alındı', cancelled: 'İptal', açık: 'Açık', bekleyen: 'Bekleyen', kapanan: 'Kapanan' };
const STATUS_COLOR = { draft: 'gray', sent: 'blue', confirmed: 'green', delivered: 'purple', cancelled: 'red', açık: 'yellow', bekleyen: 'orange', kapanan: 'green' };
const NEXT_STATUS = { draft: 'sent', sent: 'confirmed', confirmed: 'delivered', açık: 'bekleyen', bekleyen: 'kapanan' };
const NEXT_LABEL = { draft: 'Gönderildi İşaretle', sent: 'Onayla', confirmed: 'Teslim Alındı', açık: 'Teslim Alma', bekleyen: 'Tamamen Teslim Al' };

export default function PODetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const { data: po, isLoading } = useQuery({ queryKey: ['po', id], queryFn: () => getPO(id).then(r => r.data) });
  const { data: docs = [] } = useQuery({ queryKey: ['docs', 'po', id], queryFn: () => getDocuments({ entity_type: 'po', entity_id: id }).then(r => r.data) });

  const [statusModal, setStatusModal] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0,10));

  const statusMutation = useMutation({
    mutationFn: (data) => updatePOStatus(id, data),
    onSuccess: () => { qc.invalidateQueries(['po', id]); qc.invalidateQueries(['pos']); qc.invalidateQueries(['dashboard']); setStatusModal(false); }
  });

  const [uploading, setUploading] = useState(false);
  async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData();
    fd.append('file', file); fd.append('entity_type', 'po'); fd.append('entity_id', id);
    setUploading(true);
    try { await uploadDocument(fd); qc.invalidateQueries(['docs', 'po', id]); }
    finally { setUploading(false); e.target.value = ''; }
  }

  const deleteDocMutation = useMutation({ mutationFn: deleteDocument, onSuccess: () => qc.invalidateQueries(['docs', 'po', id]) });

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!po) return <div className="p-8 text-gray-500">Sipariş bulunamadı.</div>;

  const nextStatus = NEXT_STATUS[po.status];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/po')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{po.po_number}</h1>
            <span className="text-sm text-gray-500">{po.supplier_name}</span>
            <span className="ml-2"><Badge color={STATUS_COLOR[po.status]}>{STATUS_LABELS[po.status]}</Badge></span>
          </div>
        </div>
        {canEdit && nextStatus && (
          <Button onClick={() => setStatusModal(true)} variant="success">{NEXT_LABEL[po.status]}</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold text-gray-700 mb-4">Sipariş Bilgileri</h2>
          {[['Tedarikçi', po.supplier_name], ['Sipariş Tarihi', po.order_date], ['Beklenen Teslimat', po.expected_date], ['Teslim Tarihi', po.delivery_date], ['Para Birimi', po.currency], ['Toplam', po.total_amount?.toLocaleString('tr-TR') + ' ' + po.currency]].map(([k, v]) => v ? (
            <div key={k} className="flex gap-2 text-sm mb-2">
              <span className="text-gray-500 min-w-28">{k}:</span>
              <span className="font-medium text-gray-800">{v}</span>
            </div>
          ) : null)}
          {po.notes && <p className="text-sm text-gray-500 mt-3 border-t pt-3">{po.notes}</p>}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="font-semibold text-gray-700 mb-4">Kalemler</h2>
          <Table headers={['Ürün Kodu', 'Ürün Adı', 'Miktar', 'Birim', 'Birim Fiyat', 'Toplam']}
            empty={!po.items?.length && 'Kalem yok'}>
            {po.items?.map(item => (
              <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-sm text-gray-500">{item.product_code}</td>
                <td className="px-4 py-2 text-sm font-medium text-gray-800">{item.product_name}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{item.quantity}</td>
                <td className="px-4 py-2 text-sm text-gray-500">{item.unit}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{item.unit_price?.toLocaleString('tr-TR')}</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-800">{(item.quantity * item.unit_price).toLocaleString('tr-TR')}</td>
              </tr>
            ))}
          </Table>
          <div className="text-right font-bold text-lg text-gray-800 mt-3 px-4">
            Toplam: {po.total_amount?.toLocaleString('tr-TR')} {po.currency}
          </div>
        </Card>
      </div>

      {/* Belgeler */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Belgeler</h2>
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

      {/* Durum Modal */}
      <Modal open={statusModal} onClose={() => setStatusModal(false)} title={NEXT_LABEL[po.status]} size="sm">
        {nextStatus === 'delivered' && (
          <Input label="Teslim Alma Tarihi" type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
        )}
        <p className="text-sm text-gray-500 mt-2">
          {nextStatus === 'delivered' ? 'Sipariş teslim alındı olarak işaretlenecek ve stok otomatik güncellenecek.' : 'Durumu güncellemek istediğinize emin misiniz?'}
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setStatusModal(false)}>İptal</Button>
          <Button variant="success" onClick={() => statusMutation.mutate({ status: nextStatus, delivery_date: deliveryDate })} disabled={statusMutation.isPending}>Onayla</Button>
        </div>
      </Modal>
    </div>
  );
}
