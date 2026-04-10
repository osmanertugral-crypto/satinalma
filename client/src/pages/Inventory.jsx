import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getInventory, getInventoryTransactions, createInventoryTransaction, getProducts, syncInventoryFromExcel } from '../api';
import { PageHeader, Card, Button, Badge, Modal, Input, Select, Table, Spinner } from '../components/UI';
import { Plus, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function InventoryPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ product_id: '', type: 'in', quantity: '', reference: '', notes: '' });
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [syncResult, setSyncResult] = useState(null);

  const syncMutation = useMutation({
    mutationFn: syncInventoryFromExcel,
    onSuccess: (res) => { 
      qc.invalidateQueries(['inventory']); 
      qc.invalidateQueries(['products']);
      setSyncResult(res.data);
      setTimeout(() => setSyncResult(null), 5000);
    }
  });

  const { data: inventory = [], isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => getInventory().then(r => r.data) });
  const { data: transactions = [] } = useQuery({ queryKey: ['inv-transactions', selectedProduct], queryFn: () => getInventoryTransactions(selectedProduct ? { product_id: selectedProduct } : {}).then(r => r.data) });

  const txMutation = useMutation({
    mutationFn: createInventoryTransaction,
    onSuccess: () => { qc.invalidateQueries(['inventory']); qc.invalidateQueries(['inv-transactions']); qc.invalidateQueries(['dashboard']); setModal(false); setForm({ product_id: '', type: 'in', quantity: '', reference: '', notes: '' }); }
  });

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Envanter"
        subtitle="Anlık stok seviyeleri"
        action={
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                <RefreshCw size={16} className={syncMutation.isPending ? 'animate-spin' : ''} />
                {syncMutation.isPending ? 'Güncelleniyor...' : 'Excel\'den Yenile'}
              </Button>
            )}
            {canEdit && <Button onClick={() => setModal(true)}><Plus size={16} /> Stok Hareketi</Button>}
          </div>
        }
      />

      {syncResult && (
        <Card className="p-4 bg-green-50 border-green-200">
          <p className="text-green-800 text-sm font-medium">
            ✓ {syncResult.message} — Güncellenen: {syncResult.updated}, Yeni: {syncResult.created}, Atlanan: {syncResult.skipped} (Toplam Excel satırı: {syncResult.total})
          </p>
        </Card>
      )}
      {syncMutation.error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-red-700 text-sm">{syncMutation.error.response?.data?.error || 'Senkronizasyon başarısız'}</p>
        </Card>
      )}

      <Card>
        {isLoading ? <Spinner /> : (
          <Table headers={['Kod', 'Ürün', 'Kategori', 'Birim', 'Stok', 'Min. Stok', 'Durum']}
            empty={inventory.length === 0 && 'Envanter verisi bulunamadı'}>
            {inventory.map(i => (
              <tr key={i.id}
                className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${selectedProduct === i.product_id ? 'bg-blue-50' : ''}`}
                onClick={() => setSelectedProduct(selectedProduct === i.product_id ? null : i.product_id)}>
                <td className="px-4 py-3 font-mono text-sm text-gray-500">{i.code}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{i.product_name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{i.category_name || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{i.unit}</td>
                <td className={`px-4 py-3 text-sm font-bold ${i.low_stock ? 'text-red-600' : 'text-emerald-600'}`}>{i.quantity}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{i.min_stock_level}</td>
                <td className="px-4 py-3"><Badge color={i.low_stock ? 'red' : 'green'}>{i.low_stock ? 'Düşük' : 'Normal'}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Hareketler */}
      <Card className="p-5">
        <h2 className="font-semibold text-gray-700 mb-4">
          {selectedProduct ? `Hareket Geçmişi — ${inventory.find(i => i.product_id === selectedProduct)?.product_name || ''}` : 'Son Stok Hareketleri'}
          {selectedProduct && <button onClick={() => setSelectedProduct(null)} className="ml-2 text-xs text-blue-500 underline">Tümünü Göster</button>}
        </h2>
        <Table headers={['Tarih', 'Ürün', 'Tip', 'Miktar', 'Referans', 'Kullanıcı']}
          empty={transactions.length === 0 && 'Hareket yok'}>
          {transactions.map(t => (
            <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2 text-sm text-gray-500">{new Date(t.created_at).toLocaleDateString('tr-TR')}</td>
              <td className="px-4 py-2 text-sm font-medium text-gray-800">{t.product_name}</td>
              <td className="px-4 py-2">
                {t.type === 'in' ? <span className="flex items-center gap-1 text-emerald-600 text-sm"><ArrowDown size={14} />Giriş</span>
                  : t.type === 'out' ? <span className="flex items-center gap-1 text-red-500 text-sm"><ArrowUp size={14} />Çıkış</span>
                  : <Badge color="gray">Düzeltme</Badge>}
              </td>
              <td className="px-4 py-2 text-sm font-semibold text-gray-700">{t.quantity}</td>
              <td className="px-4 py-2 text-sm text-gray-500">{t.reference || '-'}</td>
              <td className="px-4 py-2 text-sm text-gray-500">{t.created_by_name || '-'}</td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Stok Hareketi Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title="Stok Hareketi Ekle">
        <Select label="Ürün *" value={form.product_id} onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}>
          <option value="">Seçin...</option>
          {inventory.map(i => <option key={i.product_id} value={i.product_id}>{i.code} — {i.product_name} (Mevcut: {i.quantity})</option>)}
        </Select>
        <Select label="Hareket Tipi" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="mt-3">
          <option value="in">Giriş</option>
          <option value="out">Çıkış</option>
          <option value="adjustment">Stok Düzeltme (Mutlak)</option>
        </Select>
        <Input label="Miktar *" type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-3" />
        <Input label="Referans (PO No vb.)" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} className="mt-3" />
        <Input label="Notlar" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-3" />
        {txMutation.error && <p className="text-red-500 text-sm mt-2">{txMutation.error.response?.data?.error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setModal(false)}>İptal</Button>
          <Button onClick={() => txMutation.mutate(form)} disabled={!form.product_id || !form.quantity || txMutation.isPending}>Kaydet</Button>
        </div>
      </Modal>
    </div>
  );
}
