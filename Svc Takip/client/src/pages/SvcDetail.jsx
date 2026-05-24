import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckSquare, Download, FileDown, FileText, Image, Pencil, Plus, Save, Square, Trash2, Upload,
} from 'lucide-react';
import {
  applySvcMargin, changeSvcStatus, createSvcItem, deleteSvcFile, deleteSvcItem,
  deleteSvcProject, downloadSvcTeklifPdf, getSvcCoverUrl, getSvcFileDownloadUrl, getSvcProject,
  updateSvcItem, updateSvcProject, uploadSvcCover, uploadSvcFile,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, Textarea } from '../components/UI';
import { SVC_STATUS } from './SvcTakip';

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function fmtCur(v) {
  if (v == null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}
function fmtNum(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v) { return v ? `%${Number(v).toFixed(1)}` : '—'; }

function StatusFlow({ status, svcRole, offerPrice, onChangeStatus }) {
  const transitions = {
    draft:              ['submitted'],
    submitted:          ['reviewing', 'draft'],
    reviewing:          ['offered', 'draft'],
    // eski projeler için geriye dönük uyumluluk
    costing:            ['offered', 'reviewing'],
    offer_ready:        ['offered'],
    offered:            ['pending'],
    pending:            ['revision_requested', 'offered', 'won', 'lost'],
    revision_requested: ['offered', 'won', 'lost'],
    won:                [],
    lost:               [],
  };
  const restricted = ['offered', 'won', 'lost', 'revision_requested'];
  const canMgmt = ['manager', 'management'].includes(svcRole);
  const canPurchase = ['purchasing', 'manager', 'management'].includes(svcRole);
  const hasPrice = Number(offerPrice) > 0;

  const next = (transitions[status] || []).filter(s => {
    if (restricted.includes(s) && !canMgmt) return false;
    if (s === 'costing' && !canPurchase) return false;
    // Teklif Verildi butonu: fiyat yoksa gösterme
    if (s === 'offered' && !hasPrice) return false;
    return true;
  });

  if (!next.length) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500 font-medium">Durumu Değiştir:</span>
      {next.map(s => {
        const st = SVC_STATUS[s] || { label: s, color: 'gray' };
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChangeStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
              ${s === 'won'     ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' :
                s === 'lost'    ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' :
                s === 'offered' ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' :
                'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
          >
            → {st.label}
          </button>
        );
      })}
    </div>
  );
}

const EMPTY_ITEM = {
  category: '', product_name: '', description: '', brand: '', size_info: '',
  unit: 'adet', quantity: 1, tech_spec: '', purchase_note: '', termin: '',
  unit_price: '', total_price: '',
};

function ItemRow({ item, canEdit, canPrice, onEdit, onDelete }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 group">
      <td className="px-3 py-2 text-xs text-gray-400">{item.sort_order}</td>
      <td className="px-3 py-2 text-xs text-gray-500">{item.category || '—'}</td>
      <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px]">
        <div className="truncate">{item.product_name || '—'}</div>
        {item.brand && <div className="text-xs text-gray-400">{item.brand}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px]">
        <div className="line-clamp-2">{item.description || '—'}</div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600 max-w-[180px]">
        <div className="line-clamp-2 text-blue-700">{item.tech_spec || '—'}</div>
      </td>
      <td className="px-3 py-2 text-xs text-gray-600">{item.size_info || '—'}</td>
      <td className="px-3 py-2 text-xs text-gray-600 text-center">{item.quantity} {item.unit}</td>
      {canPrice && <td className="px-3 py-2 text-xs text-right font-mono text-gray-700">{fmtNum(item.unit_price)}</td>}
      {canPrice && <td className="px-3 py-2 text-xs text-right font-mono font-semibold text-gray-800">{fmtNum(item.total_price)}</td>}
      {canPrice && <td className="px-3 py-2 text-xs text-gray-500">{item.termin || '—'}</td>}
      <td className="px-3 py-2">
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          {canEdit && (
            <button type="button" onClick={() => onEdit(item)} className="p-1 rounded hover:bg-blue-100 text-blue-600">
              <Pencil size={13} />
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => onDelete(item.id)} className="p-1 rounded hover:bg-red-100 text-red-600">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function ActualRow({ item, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [approved, setApproved] = useState(!!Number(item.actual_approved));
  const [unitP, setUnitP] = useState(item.actual_unit_price ?? '');
  const [note, setNote] = useState(item.actual_note || '');

  function handleToggle() {
    const newApproved = !approved;
    setApproved(newApproved);
    if (newApproved) {
      onSave(item.id, {
        actual_approved: 1,
        actual_unit_price: item.unit_price,
        actual_total_price: item.total_price,
        actual_note: note,
      });
    } else {
      onSave(item.id, { actual_approved: 0 });
    }
  }

  function handleSave() {
    const qty = Number(item.quantity || 1);
    const uP = Number(unitP || 0);
    onSave(item.id, {
      actual_approved: 0,
      actual_unit_price: uP,
      actual_total_price: uP * qty,
      actual_note: note,
    });
    setEditing(false);
  }

  const diff = Number(item.actual_total_price || 0) - Number(item.total_price || 0);
  const approvedClass = approved ? 'bg-emerald-50' : '';

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 ${approvedClass}`}>
      <td className="px-3 py-2 text-xs text-gray-400">{item.sort_order}</td>
      <td className="px-3 py-2 font-medium text-gray-800 max-w-[160px]">
        <div className="truncate">{item.product_name || '—'}</div>
        {item.category && <div className="text-xs text-gray-400">{item.category}</div>}
      </td>
      <td className="px-3 py-2 text-xs text-right font-mono text-gray-600">{fmtNum(item.unit_price)}</td>
      <td className="px-3 py-2 text-xs text-right font-mono text-gray-600">{fmtNum(item.total_price)}</td>
      <td className="px-3 py-2 text-center">
        {canEdit && (
          <button type="button" onClick={handleToggle} className="text-emerald-600 hover:text-emerald-800">
            {approved ? <CheckSquare size={18} /> : <Square size={18} className="text-gray-300" />}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-right font-mono">
        {editing ? (
          <Input type="number" value={unitP} onChange={e => setUnitP(e.target.value)} className="w-24" />
        ) : (
          <span className={approved ? 'text-emerald-700' : 'text-orange-700'}>{fmtNum(item.actual_unit_price)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-right font-mono">
        <span className={diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-gray-500'}>
          {diff !== 0 ? (diff > 0 ? '+' : '') + fmtNum(diff) : '—'}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 max-w-[100px]">
        {editing ? (
          <Input value={note} onChange={e => setNote(e.target.value)} />
        ) : (
          <span>{item.actual_note || '—'}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {canEdit && !approved && (
          editing ? (
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave}><Save size={12} /></Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>İptal</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="p-1 rounded hover:bg-blue-100 text-blue-600">
              <Pencil size={13} />
            </button>
          )
        )}
      </td>
    </tr>
  );
}

// ─── Ana Bileşen ──────────────────────────────────────────────────────────────
export default function SvcDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const svcRole = user?.svc_role || (user?.role === 'admin' ? 'management' : 'none');
  const canPrice = ['purchasing', 'manager', 'management'].includes(svcRole);
  const canOffer = ['manager', 'management'].includes(svcRole);
  const canEdit = svcRole !== 'none';

  const [tab, setTab] = useState('general');
  const [genEditing, setGenEditing] = useState(false);
  const [genForm, setGenForm] = useState(null);
  const [itemModal, setItemModal] = useState(null); // null | 'new' | item
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [statusNote, setStatusNote] = useState('');
  const [statusModal, setStatusModal] = useState(null);
  const [marginInput, setMarginInput] = useState('');
  const [customOfferInput, setCustomOfferInput] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [offerEditModal, setOfferEditModal] = useState(false);
  const [offerEditMargin, setOfferEditMargin] = useState('');
  const [offerEditChecked, setOfferEditChecked] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['svc-detail', id],
    queryFn: () => getSvcProject(id).then(r => r.data),
  });

  const project = data?.project;
  const items = data?.items || [];
  const files = data?.files || [];
  const logs = data?.logs || [];
  const summary = data?.summary || {};

  const updateMut = useMutation({
    mutationFn: (payload) => updateSvcProject(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); setGenEditing(false); },
    onError: e => alert(e?.response?.data?.error || 'Hata'),
  });

  const statusMut = useMutation({
    mutationFn: (payload) => changeSvcStatus(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); qc.invalidateQueries({ queryKey: ['svc-projects'] }); setStatusModal(null); },
    onError: e => alert(e?.response?.data?.error || 'Hata'),
  });

  const createItemMut = useMutation({
    mutationFn: (payload) => createSvcItem(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); setItemModal(null); setItemForm(EMPTY_ITEM); },
    onError: e => alert(e?.response?.data?.error || 'Hata'),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ itemId, payload }) => updateSvcItem(id, itemId, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); setItemModal(null); },
    onError: e => alert(e?.response?.data?.error || 'Hata'),
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId) => deleteSvcItem(id, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['svc-detail', id] }),
    onError: e => alert(e?.response?.data?.error || 'Silinemedi'),
  });

  const marginMut = useMutation({
    mutationFn: (payload) => applySvcMargin(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); },
    onError: e => alert(e?.response?.data?.error || 'Hata'),
  });

  const pdfMut = useMutation({
    mutationFn: () => downloadSvcTeklifPdf(id),
    onSuccess: (res) => {
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      const safeName = (project?.project_name || 'Teklif').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      a.href = url;
      a.download = `RESTAR_SVC_Teklif_${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    },
    onError: e => alert(e?.response?.data?.error || 'PDF indirilemedi'),
  });

  const deleteFileMut = useMutation({
    mutationFn: (fileId) => deleteSvcFile(id, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['svc-detail', id] }),
  });

  const deleteProjMut = useMutation({
    mutationFn: () => deleteSvcProject(id),
    onSuccess: () => navigate('/svc-takip'),
  });

  function startEdit() {
    setGenForm({ ...project });
    setGenEditing(true);
  }

  function saveGen() {
    updateMut.mutate(genForm);
  }

  function openItemEdit(item) {
    setItemForm({ ...item, unit_price: item.unit_price ?? '', total_price: item.total_price ?? '' });
    setItemModal(item);
  }

  function saveItem() {
    const qty = Number(itemForm.quantity || 1);
    const uP = Number(itemForm.unit_price || 0);
    const payload = {
      ...itemForm,
      quantity: qty,
      unit_price: uP,
      total_price: Number(itemForm.total_price || (uP * qty)),
    };
    if (itemModal === 'new') {
      createItemMut.mutate(payload);
    } else {
      updateItemMut.mutate({ itemId: itemModal.id, payload });
    }
  }

  function handleActualSave(itemId, payload) {
    updateItemMut.mutate({ itemId, payload });
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      await uploadSvcFile(id, fd);
      qc.invalidateQueries({ queryKey: ['svc-detail', id] });
    } catch(err) {
      alert(err?.response?.data?.error || 'Yükleme hatası');
    }
    e.target.value = '';
  }

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('cover', file);
    try {
      await uploadSvcCover(id, fd);
      qc.invalidateQueries({ queryKey: ['svc-detail', id] });
      qc.invalidateQueries({ queryKey: ['svc-projects'] });
    } catch(err) {
      alert(err?.response?.data?.error || 'Kapak görseli yüklenemedi');
    }
    e.target.value = '';
  }

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!project) return <div className="p-8 text-red-600">Proje bulunamadı.</div>;

  const st = SVC_STATUS[project.status] || { label: project.status, color: 'gray' };

  const TABS = [
    { key: 'general', label: 'Genel Bilgiler' },
    { key: 'items', label: `Ürünler (${items.length})` },
    ...(canPrice ? [{ key: 'costing', label: 'Maliyetlendirme' }] : []),
    ...(canPrice ? [{ key: 'actuals', label: 'Gerçekleşen' }] : []),
    ...(canOffer ? [{ key: 'offer', label: 'Teklif & Satış' }] : []),
    { key: 'files', label: `Dosyalar (${files.length})` },
    { key: 'history', label: `Tarihçe (${logs.length})` },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Başlık — kapak görselli */}
      <div className="flex items-start gap-4 flex-wrap">
        {/* Kapak görseli */}
        <div className="relative shrink-0 group">
          <div className="w-28 h-20 rounded-xl overflow-hidden border border-gray-200 bg-gradient-to-br from-slate-100 to-slate-200">
            {project.cover_image ? (
              <img
                src={`${getSvcCoverUrl(id)}?t=${Date.now()}`}
                alt="Kapak"
                key={project.cover_image}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <Image size={28} className="text-slate-300" />
              </div>
            )}
          </div>
          {canEdit && (
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-xl cursor-pointer transition-opacity">
              <div className="text-white text-center">
                <Upload size={16} className="mx-auto" />
                <span className="text-xs">Değiştir</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
            </label>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" onClick={() => navigate('/svc-takip')} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ArrowLeft size={18} />
                </button>
                <h1 className="text-xl font-bold text-gray-800">{project.project_name}</h1>
                <Badge color={st.color}>{st.label}</Badge>
              </div>
              <div className="text-sm text-gray-500 mt-1 ml-9">
                {project.institution && <span>{project.institution} · </span>}
                {project.consultant_name && <span>Danışman: {project.consultant_name} · </span>}
                {project.created_date && <span>Oluşturma: {project.created_date}</span>}
                {project.offer_due_date && <span> · Teklif: {project.offer_due_date}</span>}
                {project.vehicle && <span> · {project.vehicle}</span>}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <StatusFlow
                status={project.status}
                svcRole={svcRole}
                offerPrice={project.offer_price_tl}
                onChangeStatus={s => { setStatusModal(s); setStatusNote(''); }}
              />
              {canOffer && (
                <Button size="sm" variant="danger" onClick={() => setDeleteModal(true)}>
                  <Trash2 size={13} /> Sil
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── REVİZE UYARISI ───────────────────────────────────────────────────── */}
      {project.status === 'revision_requested' && canOffer && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-300 rounded-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-amber-800">Revize Talebi Var</div>
              <div className="text-xs text-amber-700">Müşteri fiyat revizyonu talep etti. Teklif fiyatını güncelleyip yeni teklif verebilirsiniz.</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTab('offer')}
            className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Revize Fiyat Düzelt
          </button>
        </div>
      )}

      {/* ── GENEL BİLGİLER ────────────────────────────────────────────────────── */}
      {tab === 'general' && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Proje Bilgileri</h2>
            {canEdit && !genEditing && (
              <Button size="sm" variant="secondary" onClick={startEdit}><Pencil size={14} /> Düzenle</Button>
            )}
          </div>
          {genEditing && genForm ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Proje Adı" value={genForm.project_name || ''} onChange={e => setGenForm(f => ({ ...f, project_name: e.target.value }))} />
              <Input label="Kurum" value={genForm.institution || ''} onChange={e => setGenForm(f => ({ ...f, institution: e.target.value }))} />
              <Input label="Araç" value={genForm.vehicle || ''} onChange={e => setGenForm(f => ({ ...f, vehicle: e.target.value }))} />
              <Input label="Üstyapı" value={genForm.superstructure || ''} onChange={e => setGenForm(f => ({ ...f, superstructure: e.target.value }))} />
              <Input label="Adet" type="number" value={genForm.quantity || ''} onChange={e => setGenForm(f => ({ ...f, quantity: e.target.value }))} />
              <Select label="Ülke" value={genForm.country || 'Yurtiçi'} onChange={e => setGenForm(f => ({ ...f, country: e.target.value }))}>
                <option>Yurtiçi</option><option>Yurtdışı</option>
              </Select>
              <Input label="Danışman" value={genForm.consultant_name || ''} onChange={e => setGenForm(f => ({ ...f, consultant_name: e.target.value }))} />
              <Input label="Oluşturma Tarihi" type="date" value={genForm.created_date || ''} onChange={e => setGenForm(f => ({ ...f, created_date: e.target.value }))} />
              <Input label="Teklif Tarihi" type="date" value={genForm.offer_due_date || ''} onChange={e => setGenForm(f => ({ ...f, offer_due_date: e.target.value }))} />
              {canPrice && <>
                <Input label="USD Kuru" type="number" value={genForm.usd_rate || ''} onChange={e => setGenForm(f => ({ ...f, usd_rate: e.target.value }))} />
                <Input label="EUR Kuru" type="number" value={genForm.eur_rate || ''} onChange={e => setGenForm(f => ({ ...f, eur_rate: e.target.value }))} />
              </>}
              <div className="md:col-span-2">
                <Textarea label="Açıklama / Şartname" value={genForm.description || ''} rows={3}
                  onChange={e => setGenForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <Textarea label="Danışman Notu" value={genForm.notes_consultant || ''} rows={2}
                  onChange={e => setGenForm(f => ({ ...f, notes_consultant: e.target.value }))} />
              </div>
              {canPrice && (
                <div className="md:col-span-2">
                  <Textarea label="Satın Alma Notu" value={genForm.notes_purchase || ''} rows={2}
                    onChange={e => setGenForm(f => ({ ...f, notes_purchase: e.target.value }))} />
                </div>
              )}
              {canOffer && (
                <>
                  <div className="md:col-span-2">
                    <Textarea label="Yönetim Notu" value={genForm.notes_management || ''} rows={2}
                      onChange={e => setGenForm(f => ({ ...f, notes_management: e.target.value }))} />
                  </div>
                  <Input label="Teklif Gönderim Tarihi" type="date" value={genForm.offer_sent_date || ''} onChange={e => setGenForm(f => ({ ...f, offer_sent_date: e.target.value }))} />
                  <Input label="Karar Tarihi" type="date" value={genForm.decision_date || ''} onChange={e => setGenForm(f => ({ ...f, decision_date: e.target.value }))} />
                  <div className="md:col-span-2">
                    <Textarea label="Sonuç Notu" value={genForm.result_note || ''} rows={2}
                      onChange={e => setGenForm(f => ({ ...f, result_note: e.target.value }))} />
                  </div>
                </>
              )}
              <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                <Button variant="secondary" onClick={() => setGenEditing(false)}>İptal</Button>
                <Button onClick={saveGen} disabled={updateMut.isPending}><Save size={14} /> Kaydet</Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
              {[
                ['Proje Adı', project.project_name],
                ['Kurum / Firma', project.institution],
                ['Araç', project.vehicle],
                ['Üstyapı', project.superstructure],
                ['Adet', project.quantity],
                ['Ülke', project.country],
                ['Danışman', project.consultant_name],
                ['Oluşturma Tarihi', project.created_date],
                ['Teklif Tarihi', project.offer_due_date],
                ...(canPrice ? [['USD Kuru', project.usd_rate], ['EUR Kuru', project.eur_rate]] : []),
                ...(canOffer ? [['Teklif Gönderim', project.offer_sent_date], ['Karar Tarihi', project.decision_date]] : []),
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</div>
                  <div className="text-sm text-gray-800 mt-0.5">{value || '—'}</div>
                </div>
              ))}
              {project.description && (
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Açıklama</div>
                  <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{project.description}</div>
                </div>
              )}
              {project.notes_consultant && (
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Danışman Notu</div>
                  <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{project.notes_consultant}</div>
                </div>
              )}
              {canPrice && project.notes_purchase && (
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Satın Alma Notu</div>
                  <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{project.notes_purchase}</div>
                </div>
              )}
              {canOffer && project.notes_management && (
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Yönetim Notu</div>
                  <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{project.notes_management}</div>
                </div>
              )}
              {canOffer && project.result_note && (
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="text-xs text-gray-400 font-medium uppercase tracking-wide">Sonuç Notu</div>
                  <div className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{project.result_note}</div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── ÜRÜNLER ───────────────────────────────────────────────────────────── */}
      {tab === 'items' && (
        <Card>
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Ürünler & Teknik İsterler</h2>
            {canEdit && (
              <Button size="sm" onClick={() => { setItemForm(EMPTY_ITEM); setItemModal('new'); }}>
                <Plus size={14} /> Kalem Ekle
              </Button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Kategori</th>
                  <th className="px-3 py-2 text-left">Ürün / Marka</th>
                  <th className="px-3 py-2 text-left">Açıklama</th>
                  <th className="px-3 py-2 text-left">Teknik İster</th>
                  <th className="px-3 py-2 text-left">Boyut</th>
                  <th className="px-3 py-2 text-center">Miktar</th>
                  {canPrice && <th className="px-3 py-2 text-right">Birim ₺</th>}
                  {canPrice && <th className="px-3 py-2 text-right">Toplam ₺</th>}
                  {canPrice && <th className="px-3 py-2 text-left">Termin</th>}
                  <th className="px-3 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={canPrice ? 11 : 8} className="px-3 py-8 text-center text-gray-400">Henüz kalem yok</td></tr>
                ) : items.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    canEdit={canEdit}
                    canPrice={canPrice}
                    onEdit={openItemEdit}
                    onDelete={itemId => { if (window.confirm('Kalem silinsin mi?')) deleteItemMut.mutate(itemId); }}
                  />
                ))}
              </tbody>
              {canPrice && items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={8} className="px-3 py-2 text-xs text-gray-500 font-medium text-right">Toplam Maliyet:</td>
                    <td className="px-3 py-2 text-sm font-bold text-gray-800 text-right">{fmtCur(summary.costTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* ── MALİYETLENDİRME ───────────────────────────────────────────────────── */}
      {tab === 'costing' && canPrice && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wide">Toplam Kalem Maliyeti</div>
              <div className="text-2xl font-bold text-gray-800 mt-1">{fmtCur(project.cost_total_tl)}</div>
            </Card>
            {canOffer && <>
              <Card className="p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Satış Fiyatı (Marj Sonrası)</div>
                <div className="text-2xl font-bold text-purple-700 mt-1">{fmtCur(project.sale_price_tl)}</div>
                <div className="text-xs text-gray-400 mt-1">Marj: {pct(project.margin_rate)}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide">Teklif Fiyatı</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">{fmtCur(project.offer_price_tl)}</div>
              </Card>
            </>}
          </div>

          <Card>
            <div className="p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Kalem Detayları</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Kategori</th>
                    <th className="px-3 py-2 text-left">Ürün</th>
                    <th className="px-3 py-2 text-left">Marka</th>
                    <th className="px-3 py-2 text-center">Miktar</th>
                    <th className="px-3 py-2 text-right">Birim ₺</th>
                    <th className="px-3 py-2 text-right">Toplam ₺</th>
                    <th className="px-3 py-2 text-left">SA Notu</th>
                    <th className="px-3 py-2 text-left">Termin</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-400">{item.sort_order}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.category || '—'}</td>
                      <td className="px-3 py-2 font-medium text-gray-800">{item.product_name || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.brand || '—'}</td>
                      <td className="px-3 py-2 text-center text-xs">{item.quantity} {item.unit}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{fmtNum(item.unit_price)}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{fmtNum(item.total_price)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.purchase_note || '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{item.termin || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={6} className="px-3 py-2 text-xs font-semibold text-right text-gray-600">Toplam:</td>
                    <td className="px-3 py-2 text-sm font-bold text-gray-800 text-right">{fmtCur(summary.costTotal)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── GERÇEKLEŞEN ───────────────────────────────────────────────────────── */}
      {tab === 'actuals' && canPrice && (
        <Card>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Gerçekleşen Maliyetler</h2>
              <div className="text-xs text-gray-400">
                <CheckSquare size={14} className="inline mr-1 text-emerald-600" />
                = Fiyat aynı (tekrar giriş gerekmez)
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase">
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left">Ürün</th>
                  <th className="px-3 py-2 text-right">Plan Birim</th>
                  <th className="px-3 py-2 text-right">Plan Toplam</th>
                  <th className="px-3 py-2 text-center">Aynı</th>
                  <th className="px-3 py-2 text-right">Gerçekleşen Birim</th>
                  <th className="px-3 py-2 text-right">Fark</th>
                  <th className="px-3 py-2 text-left">Not</th>
                  <th className="px-3 py-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Kalem yok</td></tr>
                ) : items.map(item => (
                  <ActualRow key={item.id} item={item} canEdit={canPrice} onSave={handleActualSave} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-right text-gray-600">Plan Toplam:</td>
                  <td className="px-3 py-2 text-sm font-bold text-gray-700 text-right">{fmtCur(summary.costTotal)}</td>
                  <td></td>
                  <td className="px-3 py-2 text-sm font-bold text-right text-blue-700">{fmtCur(summary.actualTotal)}</td>
                  <td className="px-3 py-2 text-sm font-bold text-right">
                    <span className={Number(summary.actualTotal) - Number(summary.costTotal) > 0 ? 'text-red-600' : 'text-emerald-600'}>
                      {fmtCur(Number(summary.actualTotal) - Number(summary.costTotal))}
                    </span>
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {canOffer && (
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">Gerçekleşen Gelir:</div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-40"
                    placeholder="0"
                    defaultValue={project.realized_revenue_tl || ''}
                    onBlur={e => updateMut.mutate({ realized_revenue_tl: Number(e.target.value || 0) })}
                  />
                  <span className="text-xs text-gray-400">₺</span>
                </div>
                <div className="text-sm text-gray-600 ml-4">
                  Kar/Zarar:
                  <span className={`ml-2 font-bold ${Number(project.realized_revenue_tl || 0) - Number(summary.actualTotal) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {fmtCur(Number(project.realized_revenue_tl || 0) - Number(summary.actualTotal))}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── TEKLİF & SATIŞ ────────────────────────────────────────────────────── */}
      {tab === 'offer' && canOffer && (() => {
        const calcSale = Number(marginInput) > 0
          ? Number(project.cost_total_tl || 0) * (1 + Number(marginInput) / 100)
          : Number(project.sale_price_tl || 0);
        const finalOffer = customOfferInput ? Number(customOfferInput) : calcSale;
        const offerLogs = logs.filter(l => l.action?.includes('Teklif fiyatı onaylandı'));

        return (
          <div className="space-y-4">
            {/* İndirme + Düzenle butonları */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  const checked = {};
                  items.forEach(it => { checked[it.id] = it.include_in_offer !== 0; });
                  setOfferEditChecked(checked);
                  setOfferEditMargin(String(project.margin_rate || ''));
                  setOfferEditModal(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                <Pencil size={15} />
                Düzenle
              </button>
              <button
                onClick={() => pdfMut.mutate()}
                disabled={pdfMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D1B2A] hover:bg-[#162333] text-white text-sm font-medium rounded-lg transition-colors border-l-4 border-[#E85004] disabled:opacity-60"
              >
                <FileDown size={16} />
                {pdfMut.isPending ? 'Hazırlanıyor...' : 'Teklif Formu İndir (PDF)'}
              </button>
            </div>

            {/* Özet kartlar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-xs text-gray-400 uppercase">Maliyet Toplamı</div>
                <div className="text-xl font-bold text-gray-800 mt-1">{fmtCur(project.cost_total_tl)}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-gray-400 uppercase">Marj Oranı</div>
                <div className="text-xl font-bold text-purple-700 mt-1">{pct(project.margin_rate)}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-gray-400 uppercase">Hesaplanan Satış</div>
                <div className="text-xl font-bold text-purple-700 mt-1">{fmtCur(project.sale_price_tl)}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-gray-400 uppercase">Son Verilen Teklif</div>
                <div className="text-xl font-bold text-blue-700 mt-1">{fmtCur(project.offer_price_tl)}</div>
              </Card>
            </div>

            {/* Teklif Fiyatı Belirle */}
            <Card className="p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Teklif Fiyatı Belirle</h3>

              {/* Marj satırı */}
              <div className="flex items-center gap-3 mb-4">
                <Input
                  label="Marj Oranı (%)"
                  type="number"
                  value={marginInput}
                  onChange={e => { setMarginInput(e.target.value); }}
                  placeholder={project.margin_rate || '0'}
                  className="w-40"
                />
                <div className="mt-5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => marginMut.mutate({ margin_rate: Number(marginInput) })}
                    disabled={marginMut.isPending || !marginInput}
                  >
                    Hesapla
                  </Button>
                </div>
              </div>

              {/* Hesaplanan satış önizleme */}
              {Number(project.cost_total_tl) > 0 && (
                <div className="space-y-3">
                  {/* Hesaplanan fiyat satırı + Onayla butonu */}
                  <div className="flex items-center justify-between gap-4 p-3 bg-purple-50 rounded-xl border border-purple-100">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Hesaplanan Satış ({pct(marginInput || project.margin_rate)} marjla)</div>
                      <div className="text-lg font-bold text-purple-700">{fmtCur(calcSale)}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        marginMut.mutate({ margin_rate: Number(marginInput || project.margin_rate), confirm: true });
                        setCustomOfferInput('');
                      }}
                      disabled={marginMut.isPending || calcSale <= 0}
                    >
                      <CheckSquare size={14} /> Bu Fiyatı Onayla
                    </Button>
                  </div>

                  {/* Farklı fiyat girişi */}
                  <div className="flex items-center gap-3 px-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">veya farklı bir fiyat girin</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <div className="flex items-end gap-3">
                    <Input
                      label="Farklı Teklif Fiyatı (₺)"
                      type="number"
                      value={customOfferInput}
                      onChange={e => {
                        const v = e.target.value;
                        setCustomOfferInput(v);
                        if (v && Number(project.cost_total_tl) > 0) {
                          const implied = ((Number(v) / Number(project.cost_total_tl)) - 1) * 100;
                          setMarginInput(implied.toFixed(1));
                        }
                      }}
                      placeholder={fmtCur(calcSale).replace(' ₺', '')}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => {
                        if (!customOfferInput) return;
                        marginMut.mutate({
                          margin_rate: Number(marginInput || project.margin_rate),
                          confirm: true,
                          offer_price_tl: Number(customOfferInput),
                        });
                        setCustomOfferInput('');
                      }}
                      disabled={marginMut.isPending || !customOfferInput}
                    >
                      <CheckSquare size={14} /> Onayla
                    </Button>
                  </div>
                </div>
              )}

              {marginMut.isSuccess && marginMut.variables?.confirm && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                  <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-emerald-700 text-sm font-semibold">Teklif onaylandı, proje Beklemede'ye alındı.</div>
                    <div className="text-emerald-600 text-xs">Proje durumu otomatik olarak güncellendi.</div>
                  </div>
                </div>
              )}
            </Card>

            {/* Verilen Teklifler geçmişi */}
            {offerLogs.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-gray-700 mb-3">Verilen Teklifler</h3>
                <div className="space-y-2">
                  {offerLogs.map((log, i) => (
                    <div key={log.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${i === 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                        <div>
                          <div className={`text-sm font-medium ${i === 0 ? 'text-blue-800' : 'text-gray-700'}`}>
                            {log.action.replace('Teklif fiyatı onaylandı: ', '')}
                          </div>
                          <div className="text-xs text-gray-400">{log.user_name} · {log.created_at?.replace('T', ' ').slice(0, 16)}</div>
                        </div>
                      </div>
                      {i === 0 && <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Son Teklif</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Notlar */}
            <Card className="p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Notlar</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea
                  label="Satın Alma Notu"
                  rows={4}
                  defaultValue={project.notes_purchase || ''}
                  onBlur={e => updateMut.mutate({ notes_purchase: e.target.value })}
                />
                <Textarea
                  label="Yönetim Notu"
                  rows={4}
                  defaultValue={project.notes_management || ''}
                  onBlur={e => updateMut.mutate({ notes_management: e.target.value })}
                />
                <div className="md:col-span-2">
                  <Textarea
                    label="Sonuç Notu"
                    rows={3}
                    defaultValue={project.result_note || ''}
                    onBlur={e => updateMut.mutate({ result_note: e.target.value })}
                  />
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ── DOSYALAR ──────────────────────────────────────────────────────────── */}
      {tab === 'files' && (
        <Card>
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Dosyalar</h2>
            {canEdit && (
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50 font-medium text-gray-700">
                <Upload size={15} /> Dosya Yükle
                <input type="file" className="hidden" onChange={handleFileUpload} />
              </label>
            )}
          </div>
          {files.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <FileText size={32} className="mx-auto mb-2 opacity-30" />
              <p>Henüz dosya yok</p>
              <p className="text-xs mt-1">Excel şablonu veya şartnameyi buraya yükleyin</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* Şartnameler önce */}
              {[...files].sort((a, b) => {
                const order = { spec: 0, excel: 1, other: 2 };
                return (order[a.file_type] ?? 2) - (order[b.file_type] ?? 2);
              }).map(f => {
                const isSpec  = f.file_type === 'spec';
                const isExcel = f.file_type === 'excel';
                return (
                  <div key={f.id} className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 ${isSpec ? 'bg-amber-50/50' : ''}`}>
                    <div className="flex items-center gap-3">
                      <FileText size={20} className={
                        isSpec  ? 'text-amber-600' :
                        isExcel ? 'text-emerald-600' :
                        f.file_type === 'pdf' ? 'text-red-500' : 'text-gray-400'
                      } />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{f.original_name}</span>
                          {isSpec && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Şartname</span>
                          )}
                          {isExcel && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Excel</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {f.uploaded_by_name} · {f.created_at?.slice(0, 10)} · {(f.size / 1024).toFixed(0)} KB
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={getSvcFileDownloadUrl(id, f.id)}
                        download={f.original_name}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100"
                      >
                        <Download size={14} /> İndir
                      </a>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => { if (window.confirm('Dosya silinsin mi?')) deleteFileMut.mutate(f.id); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── TARİHÇE ───────────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <Card>
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-700">Durum Tarihçesi</h2>
          </div>
          {logs.length === 0 ? (
            <div className="p-10 text-center text-gray-400">Kayıt yok</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {logs.map(log => {
                const newSt = SVC_STATUS[log.new_status] || { label: log.new_status, color: 'gray' };
                return (
                  <div key={log.id} className="px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge color={newSt.color}>{newSt.label || log.new_status}</Badge>
                        <span className="text-sm text-gray-700 font-medium">{log.action}</span>
                      </div>
                      <div className="text-xs text-gray-400">{log.created_at?.replace('T', ' ').slice(0, 16)}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      <span className="font-medium">{log.user_name}</span>
                      {log.note && <span className="ml-2 italic text-gray-400">— {log.note}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── Durum Değişim Modal ───────────────────────────────────────────────── */}
      <Modal
        open={!!statusModal}
        onClose={() => setStatusModal(null)}
        title={`Durumu Değiştir: ${SVC_STATUS[statusModal]?.label || statusModal}`}
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-3">
          Projeyi <strong>{SVC_STATUS[statusModal]?.label || statusModal}</strong> durumuna almak istediğinize emin misiniz?
        </p>
        <Textarea
          label="Not (isteğe bağlı)"
          value={statusNote}
          onChange={e => setStatusNote(e.target.value)}
          rows={2}
          placeholder="Durum değişikliği hakkında not..."
        />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setStatusModal(null)}>İptal</Button>
          <Button
            variant={statusModal === 'won' ? 'success' : statusModal === 'lost' ? 'danger' : 'primary'}
            onClick={() => statusMut.mutate({ status: statusModal, note: statusNote })}
            disabled={statusMut.isPending}
          >
            {statusMut.isPending ? 'Kaydediliyor...' : 'Onayla'}
          </Button>
        </div>
      </Modal>

      {/* ── Kalem Modal ──────────────────────────────────────────────────────── */}
      <Modal
        open={!!itemModal}
        onClose={() => setItemModal(null)}
        title={itemModal === 'new' ? 'Yeni Kalem Ekle' : 'Kalem Düzenle'}
        size="xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Kategori" value={itemForm.category || ''} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} />
          <Input label="Ürün Adı *" value={itemForm.product_name || ''} onChange={e => setItemForm(f => ({ ...f, product_name: e.target.value }))} />
          <Input label="Marka" value={itemForm.brand || ''} onChange={e => setItemForm(f => ({ ...f, brand: e.target.value }))} />
          <Input label="Boyut / Ebat" value={itemForm.size_info || ''} onChange={e => setItemForm(f => ({ ...f, size_info: e.target.value }))} />
          <Input label="Birim" value={itemForm.unit || 'adet'} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} />
          <Input label="Miktar" type="number" value={itemForm.quantity || 1} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} />
          <div className="md:col-span-2">
            <Textarea label="Açıklama" value={itemForm.description || ''} rows={3}
              onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Teknik İsterler" value={itemForm.tech_spec || ''} rows={3}
              onChange={e => setItemForm(f => ({ ...f, tech_spec: e.target.value }))}
              placeholder="Şartnameden gelen teknik gereksinimler..." />
          </div>
          {canPrice && <>
            <Input label="Birim Fiyat (₺)" type="number" value={itemForm.unit_price || ''} onChange={e => {
              const uP = e.target.value;
              setItemForm(f => ({ ...f, unit_price: uP, total_price: (Number(uP) * Number(f.quantity || 1)).toFixed(2) }));
            }} />
            <Input label="Toplam Fiyat (₺)" type="number" value={itemForm.total_price || ''}
              onChange={e => setItemForm(f => ({ ...f, total_price: e.target.value }))} />
            <Input label="Satın Alma Notu" value={itemForm.purchase_note || ''}
              onChange={e => setItemForm(f => ({ ...f, purchase_note: e.target.value }))} />
            <Input label="Termin" value={itemForm.termin || ''}
              onChange={e => setItemForm(f => ({ ...f, termin: e.target.value }))} />
          </>}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="secondary" onClick={() => setItemModal(null)}>İptal</Button>
          <Button
            onClick={saveItem}
            disabled={createItemMut.isPending || updateItemMut.isPending || !itemForm.product_name?.trim()}
          >
            <Save size={14} /> Kaydet
          </Button>
        </div>
      </Modal>

      {/* ── Teklif Düzenle Modal ──────────────────────────────────────────────── */}
      {offerEditModal && (() => {
        const margin = Number(offerEditMargin) || 0;
        const selectedItems = items.filter(it => offerEditChecked[it.id] !== false);
        const selectedCost = selectedItems.reduce((s, it) => s + Number(it.total_price || 0), 0);
        const scaleFactor = 1 + margin / 100;
        const offerTotal = selectedCost * scaleFactor;

        const saveOfferEdit = () => {
          const updates = items.map(it =>
            updateSvcItem(id, it.id, { include_in_offer: offerEditChecked[it.id] !== false ? 1 : 0 })
          );
          Promise.all(updates).then(() => {
            marginMut.mutate({ margin_rate: margin });
            setOfferEditModal(false);
            qc.invalidateQueries({ queryKey: ['svc-detail', id] });
          });
        };

        return (
          <Modal open title="Teklif Formu Düzenle" onClose={() => setOfferEditModal(false)} size="xl">
            <div className="space-y-5">
              {/* Marj girişi */}
              <div className="flex items-end gap-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teklif Marjı (%)</label>
                  <input
                    type="number"
                    value={offerEditMargin}
                    onChange={e => setOfferEditMargin(e.target.value)}
                    placeholder="0"
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div className="flex-1 grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Seçili Maliyet</div>
                    <div className="text-base font-bold text-gray-700">{fmtCur(selectedCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Marj</div>
                    <div className="text-base font-bold text-purple-700">%{margin.toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">Teklif Toplamı</div>
                    <div className="text-base font-bold text-blue-700">{fmtCur(offerTotal)}</div>
                  </div>
                </div>
              </div>

              {/* Kalem listesi */}
              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                  <div className="col-span-1 text-center">Dahil</div>
                  <div className="col-span-3">Kategori</div>
                  <div className="col-span-4">Ürün / Hizmet</div>
                  <div className="col-span-1 text-right">Adet</div>
                  <div className="col-span-2 text-right">Maliyet</div>
                  <div className="col-span-1 text-right">Teklif</div>
                </div>
                <div className="divide-y max-h-80 overflow-y-auto">
                  {items.length === 0 && (
                    <div className="text-center text-gray-400 py-8 text-sm">Kalem bulunamadı.</div>
                  )}
                  {items.map(it => {
                    const included = offerEditChecked[it.id] !== false;
                    const itemOffer = Number(it.total_price || 0) * scaleFactor;
                    return (
                      <div
                        key={it.id}
                        onClick={() => setOfferEditChecked(prev => ({ ...prev, [it.id]: !included }))}
                        className={`grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer transition-colors ${included ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 opacity-50 hover:bg-gray-100'}`}
                      >
                        <div className="col-span-1 flex justify-center items-center">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${included ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                            {included && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </div>
                        <div className="col-span-3 text-xs text-gray-500 self-center truncate">{it.category || '—'}</div>
                        <div className="col-span-4 self-center">
                          <div className="text-sm font-medium text-gray-800 truncate">{it.product_name || '—'}</div>
                          {it.brand && <div className="text-xs text-gray-400 truncate">{it.brand}</div>}
                        </div>
                        <div className="col-span-1 text-xs text-gray-600 text-right self-center">{it.quantity} {it.unit}</div>
                        <div className="col-span-2 text-xs font-mono text-gray-700 text-right self-center">{fmtCur(it.total_price)}</div>
                        <div className={`col-span-1 text-xs font-mono font-semibold text-right self-center ${included ? 'text-blue-700' : 'text-gray-400'}`}>
                          {included ? fmtCur(itemOffer) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Seçim kısayolları */}
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-t">
                  <button onClick={() => { const all = {}; items.forEach(it => { all[it.id] = true; }); setOfferEditChecked(all); }} className="text-xs text-blue-600 hover:underline">Tümünü Seç</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => { const none = {}; items.forEach(it => { none[it.id] = false; }); setOfferEditChecked(none); }} className="text-xs text-gray-500 hover:underline">Hiçbirini Seçme</button>
                  <span className="ml-auto text-xs text-gray-400">{selectedItems.length}/{items.length} kalem seçili</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setOfferEditModal(false)}>İptal</Button>
                <Button onClick={saveOfferEdit} disabled={marginMut.isPending}>
                  <Save size={14} /> Kaydet
                </Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Proje Sil Modal ───────────────────────────────────────────────────── */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Projeyi Sil" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          <strong>{project.project_name}</strong> projesini ve tüm kalemlerini/dosyalarını kalıcı olarak silmek istediğinize emin misiniz?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>İptal</Button>
          <Button variant="danger" onClick={() => deleteProjMut.mutate()} disabled={deleteProjMut.isPending}>
            {deleteProjMut.isPending ? 'Siliniyor...' : 'Evet, Sil'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
