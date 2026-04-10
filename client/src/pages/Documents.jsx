import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { uploadDocument, getDocuments, deleteDocument, getDocumentDownloadUrl } from '../api';
import { PageHeader, Card, Button, Select, Table, Spinner } from '../components/UI';
import { Upload, Download, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ENTITY_TYPES = [
  { value: 'supplier', label: 'Tedarikçi' },
  { value: 'product', label: 'Ürün' },
  { value: 'po', label: 'Satın Alma Siparişi' },
  { value: 'quotation', label: 'Teklif Talebi' },
];

export default function DocumentsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [entityType, setEntityType] = useState('po');
  const [entityId, setEntityId] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['docs', entityType, entityId],
    queryFn: () => entityId ? getDocuments({ entity_type: entityType, entity_id: entityId }).then(r => r.data) : Promise.resolve([]),
    enabled: !!entityId,
  });

  async function handleFileUpload(e) {
    const file = e.target.files[0]; if (!file || !entityId) return;
    const fd = new FormData();
    fd.append('file', file); fd.append('entity_type', entityType); fd.append('entity_id', entityId);
    setUploading(true);
    try { await uploadDocument(fd); qc.invalidateQueries(['docs', entityType, entityId]); }
    finally { setUploading(false); e.target.value = ''; }
  }

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => qc.invalidateQueries(['docs', entityType, entityId])
  });

  return (
    <div className="p-6">
      <PageHeader title="Belgeler" subtitle="Sözleşme, fatura ve diğer belgeler" />

      <Card className="p-5 mb-6">
        <div className="flex gap-4 items-end">
          <Select label="Kayıt Tipi" value={entityType} onChange={e => { setEntityType(e.target.value); setEntityId(''); }}>
            {ENTITY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">ID (Tedarikçi/Ürün/PO ID)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="İlgili kaydın ID'sini girin veya ilgili sayfadan da yükleyebilirsiniz..."
              value={entityId} onChange={e => setEntityId(e.target.value)} />
          </div>
          {canEdit && entityId && (
            <label className="cursor-pointer">
              <Button as="span" disabled={uploading}><Upload size={16} /> {uploading ? 'Yükleniyor...' : 'Yükle'}</Button>
              <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.doc,.docx,.xlsx,.xls,.jpg,.jpeg,.png" />
            </label>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-2">Not: Belgeler tedarikçi, ürün ve PO detay sayfalarından da yüklenebilir.</p>
      </Card>

      <Card>
        {isLoading ? <Spinner /> : (
          <Table headers={['Dosya Adı', 'Tür', 'Boyut', 'Yükleyen', 'Tarih', 'İşlem']}
            empty={!entityId ? 'ID girerek belgeleri arayın' : docs.length === 0 && 'Belge bulunamadı'}>
            {docs.map(d => (
              <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{d.original_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.mimetype || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.size ? (d.size / 1024).toFixed(1) + ' KB' : '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{d.uploaded_by_name || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{new Date(d.created_at).toLocaleDateString('tr-TR')}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <a href={getDocumentDownloadUrl(d.id)} download className="text-blue-500 hover:text-blue-700"><Download size={15} /></a>
                    {canEdit && <button onClick={() => deleteMutation.mutate(d.id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
