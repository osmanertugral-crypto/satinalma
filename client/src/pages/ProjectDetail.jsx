import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Save, Trash2 } from 'lucide-react';
import { createProjectItem, deleteProject, deleteProjectItem, getProjectDetail, updateProject, updateProjectItem } from '../api';
import { Badge, Button, Card, Input, Modal, Select, Spinner, StatCard, Table, Textarea } from '../components/UI';

function fmtCur(v) {
  return Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('tr-TR');
}

function statusBadge(status) {
  const s = String(status || 'offered');
  if (s === 'won') return { label: 'Onaylandi', color: 'green' };
  if (s === 'lost') return { label: 'Kaybettik', color: 'red' };
  if (s === 'pending') return { label: 'Beklemede', color: 'yellow' };
  return { label: 'Teklif Verildi', color: 'blue' };
}

const EMPTY_ITEM = {
  sort_order: '',
  category: '',
  product_name: '',
  description: '',
  brand: '',
  image_ref: '',
  product_note: '',
  size_info: '',
  unit: '',
  purchase_note: '',
  termin: '',
  unit_price: '',
  total_price: '',
  actual_unit_price: '',
  actual_total_price: '',
  actual_approved: 0,
  actual_note: '',
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteProjectModal, setDeleteProjectModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['project-detail', id],
    queryFn: () => getProjectDetail(id).then((r) => r.data),
  });

  const offer = data?.offer;
  const items = data?.items || [];
  const summary = data?.summary || {};

  const [form, setForm] = useState(null);
  React.useEffect(() => {
    if (!offer) return;
    setForm({
      project_name: offer.project_name || '',
      institution: offer.institution || '',
      sheet_name: offer.sheet_name || '',
      offer_type: offer.offer_type || '',
      country: offer.country || '',
      superstructure: offer.superstructure || '',
      vehicle: offer.vehicle || '',
      color: offer.color || '',
      quantity: offer.quantity || 0,
      created_date: offer.created_date || '',
      offer_due_date: offer.offer_due_date || '',
      usd_rate: offer.usd_rate || 0,
      eur_rate: offer.eur_rate || 0,
      quoted_tl: offer.quoted_tl || 0,
      quoted_eur: offer.quoted_eur || 0,
      quoted_usd: offer.quoted_usd || 0,
      status: offer.status || 'offered',
      pre_cost_tl: offer.pre_cost_tl || 0,
      realized_cost_tl: offer.realized_cost_tl || 0,
      realized_revenue_tl: offer.realized_revenue_tl || 0,
      result_note: offer.result_note || '',
      customer_note: offer.customer_note || '',
      purchase_note: offer.purchase_note || '',
    });
  }, [offer]);

  const saveProjectMutation = useMutation({
    mutationFn: (payload) => updateProject(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-detail', id] }),
  });

  const saveItemMutation = useMutation({
    mutationFn: ({ itemId, payload }) => itemId ? updateProjectItem(id, itemId, payload) : createProjectItem(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-detail', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setItemModal(null);
      setItemForm(EMPTY_ITEM);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId) => deleteProjectItem(id, itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-detail', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setDeleteRow(null);
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projeler');
    },
  });

  const quickItemMutation = useMutation({
    mutationFn: ({ itemId, payload }) => updateProjectItem(id, itemId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-detail', id] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  });

  const computed = useMemo(() => ({
    margin: Number(form?.realized_revenue_tl || 0) - Number(form?.realized_cost_tl || 0),
    preCostDiff: Number(form?.realized_cost_tl || 0) - Number(form?.pre_cost_tl || 0),
    itemActualTotal: Number(summary?.actualItemTotal || 0),
    itemVarianceTotal: Number(summary?.varianceTotal || 0),
    approvedCount: Number(summary?.approvedCount || 0),
  }), [form, summary]);

  if (isLoading || !form) return <div className="p-8"><Spinner /></div>;
  if (!offer) return <div className="p-8 text-gray-500">Proje bulunamadi.</div>;

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function saveProject() {
    saveProjectMutation.mutate({
      ...form,
      quantity: Number(form.quantity || 0),
      usd_rate: Number(form.usd_rate || 0),
      eur_rate: Number(form.eur_rate || 0),
      quoted_tl: Number(form.quoted_tl || 0),
      quoted_eur: Number(form.quoted_eur || 0),
      quoted_usd: Number(form.quoted_usd || 0),
      pre_cost_tl: Number(form.pre_cost_tl || 0),
      realized_cost_tl: Number(form.realized_cost_tl || 0),
      realized_revenue_tl: Number(form.realized_revenue_tl || 0),
    });
  }

  function openCreateItem() {
    setItemModal({ mode: 'create' });
    setItemForm({ ...EMPTY_ITEM, sort_order: items.length + 1 });
  }

  function openEditItem(row) {
    setItemModal({ mode: 'edit', id: row.id });
    setItemForm({
      sort_order: row.sort_order ?? '',
      category: row.category || '',
      product_name: row.product_name || '',
      description: row.description || '',
      brand: row.brand || '',
      image_ref: row.image_ref || '',
      product_note: row.product_note || '',
      size_info: row.size_info || '',
      unit: row.unit || '',
      purchase_note: row.purchase_note || '',
      termin: row.termin || '',
      unit_price: row.unit_price ?? '',
      total_price: row.total_price ?? '',
      actual_unit_price: row.actual_unit_price ?? '',
      actual_total_price: row.actual_total_price ?? '',
      actual_approved: Number(row.actual_approved || 0),
      actual_note: row.actual_note || '',
    });
  }

  function saveItem() {
    saveItemMutation.mutate({
      itemId: itemModal?.id,
      payload: {
        ...itemForm,
        sort_order: Number(itemForm.sort_order || 0),
        unit_price: Number(itemForm.unit_price || 0),
        total_price: Number(itemForm.total_price || 0),
        actual_unit_price: Number(itemForm.actual_unit_price || 0),
        actual_total_price: Number(itemForm.actual_total_price || 0),
        actual_approved: Number(itemForm.actual_approved ? 1 : 0),
      }
    });
  }

  const sb = statusBadge(form.status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/projeler')} className="text-gray-400 hover:text-gray-700"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{form.project_name || 'Proje Detayi'}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{form.institution || '-'}</span>
            <Badge color={sb.color}>{sb.label}</Badge>
          </div>
        </div>
        <div className="ml-auto">
          <Button variant="danger" onClick={() => setDeleteProjectModal(true)}><Trash2 size={14} /> Projeyi Sil</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard label="Toplam Kalem" value={fmtNum(summary.itemCount)} icon={Save} color="blue" />
        <StatCard label="Kalem Toplami" value={fmtCur(summary.itemTotal)} icon={Save} color="purple" />
        <StatCard label="Gerceklesen Kalem Top." value={fmtCur(computed.itemActualTotal)} icon={Save} color="green" />
        <StatCard label="Kalem Fark Toplami" value={fmtCur(computed.itemVarianceTotal)} icon={Save} color={computed.itemVarianceTotal >= 0 ? 'red' : 'green'} />
        <StatCard label="Onaylanan Kalem" value={fmtNum(computed.approvedCount)} icon={Save} color="orange" />
        <StatCard label="Kar / Zarar" value={fmtCur(computed.margin)} icon={Save} color={computed.margin >= 0 ? 'green' : 'red'} />
        <StatCard label="Maliyet Sapmasi" value={fmtCur(computed.preCostDiff)} icon={Save} color="red" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700">Teklif Formu (Excel Duzeni)</h2>
          <Button onClick={saveProject} disabled={saveProjectMutation.isPending}><Save size={16} /> Kaydet</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
            <p className="text-xs font-semibold text-blue-700 mb-2">SATIS DEPARTMANI</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input label="Olusturulan Tarih" type="date" value={form.created_date || ''} onChange={(e) => updateForm('created_date', e.target.value)} />
              <Input label="Teklif Verilecek Tarih" type="date" value={form.offer_due_date || ''} onChange={(e) => updateForm('offer_due_date', e.target.value)} />
              <Input label="Teklif Turu" value={form.offer_type} onChange={(e) => updateForm('offer_type', e.target.value)} />
              <Select label="Durum" value={form.status} onChange={(e) => updateForm('status', e.target.value)}>
                <option value="offered">Teklif Verildi</option>
                <option value="pending">Beklemede</option>
                <option value="won">Onaylandi</option>
                <option value="lost">Kaybettik</option>
              </Select>
              <Input label="Proje" value={form.project_name} onChange={(e) => updateForm('project_name', e.target.value)} />
              <Input label="Ulke" value={form.country} onChange={(e) => updateForm('country', e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <p className="text-xs font-semibold text-indigo-700 mb-2">URUN / ARGE DEPARTMANI</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input label="Ustyapi" value={form.superstructure} onChange={(e) => updateForm('superstructure', e.target.value)} />
              <Input label="Arac" value={form.vehicle} onChange={(e) => updateForm('vehicle', e.target.value)} />
              <Input label="Renk" value={form.color} onChange={(e) => updateForm('color', e.target.value)} />
              <Input label="Adet" type="number" value={form.quantity} onChange={(e) => updateForm('quantity', e.target.value)} />
              <Input label="Dolar Kuru" type="number" value={form.usd_rate} onChange={(e) => updateForm('usd_rate', e.target.value)} />
              <Input label="Euro Kuru" type="number" value={form.eur_rate} onChange={(e) => updateForm('eur_rate', e.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
            <p className="text-xs font-semibold text-emerald-700 mb-2">SATIN ALMA DEPARTMANI</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input label="Kurum / Firma" value={form.institution} onChange={(e) => updateForm('institution', e.target.value)} />
              <Input label="Sheet" value={form.sheet_name} onChange={(e) => updateForm('sheet_name', e.target.value)} />
              <Input label="On Maliyet TL" type="number" value={form.pre_cost_tl} onChange={(e) => updateForm('pre_cost_tl', e.target.value)} />
              <Input label="Gerceklesen Maliyet TL" type="number" value={form.realized_cost_tl} onChange={(e) => updateForm('realized_cost_tl', e.target.value)} />
              <Input label="Gerceklesen Gelir TL" type="number" value={form.realized_revenue_tl} onChange={(e) => updateForm('realized_revenue_tl', e.target.value)} />
              <Input label="Teklif TL (kalemlerden otomatik)" type="number" value={form.quoted_tl} onChange={(e) => updateForm('quoted_tl', e.target.value)} />
              <Input label="Teklif Euro (otomatik)" type="number" value={form.quoted_eur} onChange={(e) => updateForm('quoted_eur', e.target.value)} />
              <Input label="Teklif USD (otomatik)" type="number" value={form.quoted_usd} onChange={(e) => updateForm('quoted_usd', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-3">
          <p className="text-xs text-gray-600">
            Not: Kalem ekleme/duzenleme/silme sonrasinda Teklif TL ve doviz karsiliklari otomatik yeniden hesaplanir.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Textarea label="Musteri Ozel Notu" value={form.customer_note} onChange={(e) => updateForm('customer_note', e.target.value)} />
          <Textarea label="Satin Alma Ozel Notu" value={form.purchase_note} onChange={(e) => updateForm('purchase_note', e.target.value)} />
          <Textarea label="Sonuc Notu" value={form.result_note} onChange={(e) => updateForm('result_note', e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-700">Kalemler</h2>
          <Button onClick={openCreateItem}><Plus size={16} /> Kalem Ekle</Button>
        </div>
        <Table headers={['Sira', 'Kategori', 'Parca / Urun', 'Planlanan Toplam', 'Gerceklesen Toplam', 'Fark', 'Onay', 'Islem']} empty={items.length === 0 && 'Kalem yok'}>
          {items.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50 align-top">
              <td className="px-4 py-2 text-sm text-gray-600">{row.sort_order}</td>
              <td className="px-4 py-2 text-sm text-gray-700">{row.category || '-'}</td>
              <td className="px-4 py-2 text-sm font-medium text-gray-800">{row.product_name || '-'}</td>
              <td className="px-4 py-2 text-sm font-semibold text-gray-800">{fmtCur(row.total_price)}</td>
              <td className="px-4 py-2 text-sm font-semibold text-gray-800">{fmtCur(row.actual_total_price)}</td>
              <td className={`px-4 py-2 text-sm font-semibold ${(Number(row.actual_total_price || 0) - Number(row.total_price || 0)) > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {fmtCur(Number(row.actual_total_price || 0) - Number(row.total_price || 0))}
              </td>
              <td className="px-4 py-2 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Number(row.actual_approved || 0) === 1}
                    onChange={(e) => quickItemMutation.mutate({ itemId: row.id, payload: { actual_approved: e.target.checked ? 1 : 0 } })}
                  />
                  <span className="text-xs text-gray-600">Onay</span>
                </label>
              </td>
              <td className="px-4 py-2 text-sm">
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEditItem(row)}><Pencil size={14} /> Duzenle</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteRow(row)}><Trash2 size={14} /> Sil</Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!itemModal} onClose={() => setItemModal(null)} title={itemModal?.mode === 'edit' ? 'Kalem Duzenle' : 'Yeni Kalem'} size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input label="Sira" type="number" value={itemForm.sort_order} onChange={(e) => setItemForm((f) => ({ ...f, sort_order: e.target.value }))} />
          <Input label="Kategori" value={itemForm.category} onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))} />
          <Input label="Parca / Urun Adi" value={itemForm.product_name} onChange={(e) => setItemForm((f) => ({ ...f, product_name: e.target.value }))} />
          <Input label="Marka" value={itemForm.brand} onChange={(e) => setItemForm((f) => ({ ...f, brand: e.target.value }))} />
          <Input label="Gorsel" value={itemForm.image_ref} onChange={(e) => setItemForm((f) => ({ ...f, image_ref: e.target.value }))} />
          <Input label="Olcu / Ebat / Adet" value={itemForm.size_info} onChange={(e) => setItemForm((f) => ({ ...f, size_info: e.target.value }))} />
          <Input label="Birim" value={itemForm.unit} onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))} />
          <Input label="Termin" value={itemForm.termin} onChange={(e) => setItemForm((f) => ({ ...f, termin: e.target.value }))} />
          <Input label="Birim Fiyat" type="number" value={itemForm.unit_price} onChange={(e) => setItemForm((f) => ({ ...f, unit_price: e.target.value }))} />
          <Input label="Toplam Fiyat" type="number" value={itemForm.total_price} onChange={(e) => setItemForm((f) => ({ ...f, total_price: e.target.value }))} />
          <Input label="Gerceklesen Birim Fiyat" type="number" value={itemForm.actual_unit_price} onChange={(e) => setItemForm((f) => ({ ...f, actual_unit_price: e.target.value }))} />
          <Input label="Gerceklesen Toplam Fiyat" type="number" value={itemForm.actual_total_price} onChange={(e) => setItemForm((f) => ({ ...f, actual_total_price: e.target.value }))} />
          <label className="flex items-center gap-2 mt-7 text-sm text-gray-700">
            <input type="checkbox" checked={Number(itemForm.actual_approved || 0) === 1} onChange={(e) => setItemForm((f) => ({ ...f, actual_approved: e.target.checked ? 1 : 0 }))} />
            Gerceklesen maliyet onaylandi
          </label>
          <div className="md:col-span-2">
            <Textarea label="Aciklama" value={itemForm.description} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Urun Departmani Notu" value={itemForm.product_note} onChange={(e) => setItemForm((f) => ({ ...f, product_note: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Satin Alma Notu" value={itemForm.purchase_note} onChange={(e) => setItemForm((f) => ({ ...f, purchase_note: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Gerceklesen Notu" value={itemForm.actual_note} onChange={(e) => setItemForm((f) => ({ ...f, actual_note: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setItemModal(null)}>Iptal</Button>
          <Button onClick={saveItem} disabled={saveItemMutation.isPending}><Save size={16} /> Kaydet</Button>
        </div>
      </Modal>

      <Modal open={!!deleteRow} onClose={() => setDeleteRow(null)} title="Kalem Sil" size="sm">
        <p className="text-sm text-gray-600">Bu kalemi silmek istediginize emin misiniz?</p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteRow(null)}>Iptal</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!deleteRow) return;
              const ok = window.confirm('Bu kalem kalici olarak silinecek. Emin misiniz?');
              if (!ok) return;
              deleteItemMutation.mutate(deleteRow.id);
            }}
            disabled={deleteItemMutation.isPending}
          >
            Sil
          </Button>
        </div>
      </Modal>

      <Modal open={deleteProjectModal} onClose={() => setDeleteProjectModal(false)} title="Projeyi Sil" size="sm">
        <p className="text-sm text-gray-600">
          Bu projeyi ve tum kalemlerini kalici olarak silmek istediginize emin misiniz?
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteProjectModal(false)}>Iptal</Button>
          <Button
            variant="danger"
            onClick={() => {
              const ok = window.confirm('Bu proje ve tum kalemleri kalici olarak silinecek. Emin misiniz?');
              if (!ok) return;
              deleteProjectMutation.mutate();
            }}
            disabled={deleteProjectMutation.isPending}
          >
            Projeyi Sil
          </Button>
        </div>
      </Modal>
    </div>
  );
}
