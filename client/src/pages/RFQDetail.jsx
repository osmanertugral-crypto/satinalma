import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRFQ, addRFQResponse, updateRFQStatus } from '../api';
import { Card, Button, Badge, Table, Spinner, Modal, Input, Select } from '../components/UI';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function RFQDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const { data: rfq, isLoading } = useQuery({ queryKey: ['rfq', id], queryFn: () => getRFQ(id).then(r => r.data) });
  const [responseModal, setResponseModal] = useState(false);
  const [resForm, setResForm] = useState({ supplier_id: '', product_id: '', unit_price: '', currency: 'TRY', lead_time_days: '' });

  const responseMutation = useMutation({
    mutationFn: (data) => addRFQResponse(id, data),
    onSuccess: () => { qc.invalidateQueries(['rfq', id]); setResponseModal(false); }
  });

  const statusMutation = useMutation({
    mutationFn: (status) => updateRFQStatus(id, { status }),
    onSuccess: () => qc.invalidateQueries(['rfq', id])
  });

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!rfq) return <div className="p-8 text-gray-500">Bulunamadı.</div>;

  // Karşılaştırma tablosu: ürün x tedarikçi
  const supplierNames = rfq.suppliers?.map(s => ({ id: s.supplier_id, name: s.supplier_name })) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/rfq')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{rfq.rfq_number}</h1>
            <p className="text-gray-500 text-sm">{rfq.title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && rfq.status === 'open' && (
            <>
              <Button size="sm" onClick={() => setResponseModal(true)}>Yanıt Gir</Button>
              <Button size="sm" variant="secondary" onClick={() => statusMutation.mutate('closed')}>Kapat</Button>
            </>
          )}
        </div>
      </div>

      {/* Bilgiler */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Card className="p-4"><span className="text-gray-500">Son Tarih</span><p className="font-medium mt-1">{rfq.deadline || '-'}</p></Card>
        <Card className="p-4"><span className="text-gray-500">Tedarikçi Sayısı</span><p className="font-medium mt-1">{rfq.suppliers?.length || 0}</p></Card>
        <Card className="p-4"><span className="text-gray-500">Durum</span><p className="font-medium mt-1">{rfq.status === 'open' ? 'Açık' : rfq.status === 'closed' ? 'Kapalı' : 'İptal'}</p></Card>
      </div>

      {/* Karşılaştırma Tablosu */}
      <Card className="p-5">
        <h2 className="font-semibold text-gray-700 mb-4">Teklif Karşılaştırması</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 border border-gray-200">Ürün</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 border border-gray-200">Miktar</th>
                {supplierNames.map(s => (
                  <th key={s.id} className="px-4 py-3 text-left font-semibold text-gray-600 border border-gray-200">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rfq.items?.map(item => {
                const itemResponses = rfq.responses?.filter(r => r.product_id === item.product_id) || [];
                const prices = itemResponses.map(r => r.unit_price).filter(Boolean);
                const minPrice = prices.length ? Math.min(...prices) : null;
                return (
                  <tr key={item.id} className="border border-gray-200">
                    <td className="px-4 py-3 font-medium text-gray-800 border border-gray-200">{item.product_name}</td>
                    <td className="px-4 py-3 text-gray-600 border border-gray-200">{item.quantity} {item.unit}</td>
                    {supplierNames.map(s => {
                      const resp = itemResponses.find(r => r.supplier_id === s.id);
                      const isMin = resp?.unit_price === minPrice && minPrice !== null;
                      return (
                        <td key={s.id} className={`px-4 py-3 border border-gray-200 ${isMin ? 'bg-emerald-50' : ''}`}>
                          {resp?.unit_price != null ? (
                            <span className={`font-medium ${isMin ? 'text-emerald-700' : 'text-gray-700'}`}>
                              {resp.unit_price.toLocaleString('tr-TR')} {resp.currency}
                              {isMin && <span className="ml-1 text-xs">(En Düşük)</span>}
                            </span>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Yanıt Girme Modal */}
      <Modal open={responseModal} onClose={() => setResponseModal(false)} title="Tedarikçi Yanıtı Gir">
        <Select label="Tedarikçi *" value={resForm.supplier_id} onChange={e => setResForm(f => ({ ...f, supplier_id: e.target.value }))}>
          <option value="">Seçin...</option>
          {rfq.suppliers?.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
        </Select>
        <Select label="Ürün *" value={resForm.product_id} onChange={e => setResForm(f => ({ ...f, product_id: e.target.value }))} className="mt-3">
          <option value="">Seçin...</option>
          {rfq.items?.map(i => <option key={i.product_id} value={i.product_id}>{i.product_name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Input label="Birim Fiyat *" type="number" step="0.01" value={resForm.unit_price} onChange={e => setResForm(f => ({ ...f, unit_price: e.target.value }))} />
          <Select label="Para Birimi" value={resForm.currency} onChange={e => setResForm(f => ({ ...f, currency: e.target.value }))}>
            {['TRY', 'USD', 'EUR'].map(c => <option key={c}>{c}</option>)}
          </Select>
          <Input label="Teslimat Süresi (gün)" type="number" value={resForm.lead_time_days} onChange={e => setResForm(f => ({ ...f, lead_time_days: e.target.value }))} />
        </div>
        {responseMutation.error && <p className="text-red-500 text-sm mt-2">{responseMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setResponseModal(false)}>İptal</Button>
          <Button onClick={() => responseMutation.mutate(resForm)} disabled={!resForm.supplier_id || !resForm.product_id || responseMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>
    </div>
  );
}
