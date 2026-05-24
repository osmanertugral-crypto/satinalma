import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckSquare, Download, FileDown, FileText, Plus, Save, Square, Trash2, Upload,
} from 'lucide-react';
import {
  applySvcMargin, changeSvcStatus, createSvcItem, deleteSvcFile, deleteSvcItem,
  deleteSvcProject, downloadSvcProformaPdf, downloadSvcTeklifPdf, getSvcFileDownloadUrl, getSvcProject,
  submitConsultantOffer, updateSvcItem, updateSvcProject, uploadSvcFile,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Input, Modal, Select, Spinner, Textarea } from '../components/UI';
import { SVC_STATUS } from './SvcTakip';

function fmtCur(v) {
  if (v == null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}
function fmtNum(v) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(v) { return v ? `%${Number(v).toFixed(1)}` : '—'; }

const NOT_OFFERED_GROUP = ['draft', 'submitted', 'reviewing', 'costing', 'offer_ready'];
const OFFERED_GROUP     = ['offered', 'pending', 'revision_requested'];

function statusGroup(status) {
  if (NOT_OFFERED_GROUP.includes(status)) return 'not_offered';
  if (OFFERED_GROUP.includes(status))     return 'offered';
  return status; // 'won' | 'lost'
}

function StatusFlow({ status, svcRole, offerPrice, onChangeStatus }) {
  const canMgmt = ['manager', 'management'].includes(svcRole);
  const hasPrice = Number(offerPrice) > 0;
  const grp = statusGroup(status);

  const STATES = [
    {
      id: 'not_offered',
      label: 'Teklif Verilmedi',
      isActive: grp === 'not_offered',
      activeBg: '#FEE2E2', activeText: '#991B1B', activeBorder: '#FECACA',
      canClick: canMgmt && grp === 'offered',
      target: 'reviewing',
    },
    {
      id: 'offered',
      label: 'Teklif Verildi',
      isActive: grp === 'offered',
      activeBg: '#D1FAE5', activeText: '#065F46', activeBorder: '#6EE7B7',
      canClick: canMgmt && grp === 'not_offered' && hasPrice,
      target: 'offered',
    },
    {
      id: 'won',
      label: 'Proje Alındı',
      isActive: grp === 'won',
      activeBg: '#DBEAFE', activeText: '#1E40AF', activeBorder: '#93C5FD',
      canClick: canMgmt && (grp === 'not_offered' || grp === 'offered'),
      target: 'won',
    },
    {
      id: 'lost',
      label: 'Proje Alınamadı',
      isActive: grp === 'lost',
      activeBg: '#F3F4F6', activeText: '#4B5563', activeBorder: '#D1D5DB',
      canClick: canMgmt && (grp === 'not_offered' || grp === 'offered'),
      target: 'lost',
    },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {STATES.map(s => {
        const clickable = !s.isActive && s.canClick;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => clickable && onChangeStatus(s.target)}
            style={{
              background:   s.isActive ? s.activeBg   : '#F9FAFB',
              color:        s.isActive ? s.activeText  : '#9CA3AF',
              border:       `2px solid ${s.isActive ? s.activeBorder : '#E5E7EB'}`,
              cursor:       clickable ? 'pointer' : 'default',
              opacity:      !s.isActive && !s.canClick ? 0.45 : 1,
              fontWeight:   s.isActive ? 700 : 500,
              transition:   'all 0.15s',
            }}
            className="px-6 py-3 rounded-xl text-sm whitespace-nowrap"
            onMouseEnter={e => { if (clickable) e.currentTarget.style.filter = 'brightness(0.95)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = ''; }}
          >
            {s.label}
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

// ─── Inline düzenlenebilir satır ──────────────────────────────────────────────
function InlineItemRow({ item, canEdit, canPrice, onUpdate, onDelete }) {
  const [activeField, setActiveField] = useState(null);
  const [fieldVal, setFieldVal] = useState('');

  function startEdit(field) {
    setActiveField(field);
    setFieldVal(String(item[field] ?? ''));
  }

  function commit() {
    const field = activeField;
    if (!field) return;
    const raw = fieldVal;
    setActiveField(null);
    if (String(item[field] ?? '') === raw) return;

    let payload;
    if (field === 'unit_price') {
      const uP = Number(raw) || 0;
      payload = { unit_price: uP, total_price: +(uP * Number(item.quantity || 1)).toFixed(4) };
    } else if (field === 'quantity') {
      const qty = Number(raw) || 1;
      payload = { quantity: qty, total_price: +(Number(item.unit_price || 0) * qty).toFixed(4) };
    } else {
      payload = { [field]: raw };
    }
    onUpdate(item.id, payload);
  }

  const C = ({ field, type = 'text', align = '', mono = false, wide = false }) => {
    const isActive = activeField === field;
    const rawVal = item[field];
    const display = rawVal != null && rawVal !== '' ? String(rawVal) : null;

    return (
      <td
        className={[
          'px-2 py-2 text-xs align-middle max-w-[160px]',
          align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '',
          mono ? 'font-mono' : '',
          canEdit ? 'cursor-text' : '',
          isActive
            ? 'bg-blue-50 outline outline-1 outline-inset outline-blue-300'
            : canEdit ? 'hover:bg-blue-50/50' : '',
          wide ? 'min-w-[120px]' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => canEdit && !isActive && startEdit(field)}
      >
        {isActive ? (
          <input
            autoFocus
            type={type}
            value={fieldVal}
            onChange={e => setFieldVal(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') setActiveField(null);
            }}
            className={[
              'w-full bg-transparent border-0 outline-none ring-0 p-0 text-xs',
              mono ? 'font-mono' : '',
              align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '',
            ].filter(Boolean).join(' ')}
          />
        ) : display != null ? (
          <span className="block truncate">{display}</span>
        ) : (
          canEdit
            ? <span className="text-gray-200 select-none text-[10px]">—</span>
            : <span className="text-gray-400">—</span>
        )}
      </td>
    );
  };

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50/30 group">
      <td className="px-2 py-2 text-xs text-gray-400 text-center w-8 select-none">{item.sort_order}</td>
      <C field="category" />
      <C field="product_name" wide />
      <C field="brand" />
      <C field="description" wide />
      <C field="tech_spec" wide />
      <C field="size_info" />
      <C field="quantity" type="number" align="center" />
      <C field="unit" align="center" />
      {canPrice && <>
        <C field="purchase_note" wide />
        <C field="termin" />
        <C field="unit_price" type="number" align="right" mono />
        <C field="total_price" type="number" align="right" mono />
      </>}
      <td className="px-2 py-2 w-8 text-center">
        {canEdit && (
          <button
            type="button"
            onClick={() => onDelete(item.id)}
            className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Gerçekleşen satırı ───────────────────────────────────────────────────────
function ActualRow({ item, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [approved, setApproved] = useState(!!Number(item.actual_approved));
  const [unitP, setUnitP] = useState(item.actual_unit_price ?? '');
  const [note, setNote] = useState(item.actual_note || '');

  function handleToggle() {
    const newApproved = !approved;
    setApproved(newApproved);
    if (newApproved) {
      onSave(item.id, { actual_approved: 1, actual_unit_price: item.unit_price, actual_total_price: item.total_price, actual_note: note });
    } else {
      onSave(item.id, { actual_approved: 0 });
    }
  }

  function handleSave() {
    const qty = Number(item.quantity || 1);
    const uP = Number(unitP || 0);
    onSave(item.id, { actual_approved: 0, actual_unit_price: uP, actual_total_price: uP * qty, actual_note: note });
    setEditing(false);
  }

  const diff = Number(item.actual_total_price || 0) - Number(item.total_price || 0);

  return (
    <tr className={`border-b border-gray-100 hover:bg-gray-50 ${approved ? 'bg-emerald-50' : ''}`}>
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
          <input type="number" value={unitP} onChange={e => setUnitP(e.target.value)}
            className="w-24 border border-gray-300 rounded px-2 py-1 text-xs" />
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
          <input value={note} onChange={e => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
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
            <button type="button" onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-blue-100 text-blue-600"><Save size={13} /></button>
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
  const location = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const svcRole = user?.role === 'admin' ? 'management' : (user?.svc_role || 'none');
  const isConsultant = svcRole === 'consultant';
  const isReadonly = svcRole === 'readonly';
  const canPrice = ['purchasing', 'manager', 'management', 'readonly'].includes(svcRole);
  const canOffer = ['manager', 'management', 'readonly'].includes(svcRole);
  const canEdit = svcRole !== 'none' && !isReadonly;

  // Tekliflerim sayfasından açıldığında consultant mode
  const consultantMode = isConsultant && location.pathname.startsWith('/tekliflerim/');
  const backPath = consultantMode ? '/tekliflerim' : '/svc-takip';

  const [tab, setTab] = useState(() => consultantMode ? 'general' : isConsultant ? 'costing' : 'general');
  const [consultantOfferPrice, setConsultantOfferPrice] = useState('');
  const [consultantChecked, setConsultantChecked] = useState({});
  const [consultantFields, setConsultantFields] = useState({ nihai_musteri: '', is_turu: '', teklif_tarihi: '', validity_date: '', offer_notes: [] });
  const [noteInput, setNoteInput] = useState('');
  const [genEditing, setGenEditing] = useState(false);
  const [genForm, setGenForm] = useState(null);
  const [itemModal, setItemModal] = useState(false);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); setItemModal(false); setItemForm(EMPTY_ITEM); },
    onError: e => alert(e?.response?.data?.error || 'Hata'),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ itemId, payload }) => updateSvcItem(id, itemId, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); },
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
      a.href = url; a.download = `RESTAR_SVC_Teklif_${safeName}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); window.URL.revokeObjectURL(url);
    },
    onError: e => alert(e?.response?.data?.error || 'PDF indirilemedi'),
  });

  const deleteFileMut = useMutation({
    mutationFn: (fileId) => deleteSvcFile(id, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['svc-detail', id] }),
  });

  const deleteProjMut = useMutation({
    mutationFn: () => deleteSvcProject(id),
    onSuccess: () => navigate(backPath),
  });

  const consultantOfferMut = useMutation({
    mutationFn: (payload) => submitConsultantOffer(id, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-detail', id] }); qc.invalidateQueries({ queryKey: ['tekliflerim'] }); },
    onError: e => alert(e?.response?.data?.error || 'Teklif gönderilemedi'),
  });

  const proformaPdfMut = useMutation({
    mutationFn: () => downloadSvcProformaPdf(id),
    onSuccess: (res) => {
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      const safeName = (project?.project_name || 'Proforma').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      a.href = url; a.download = `RESTAR_SVC_Proforma_${safeName}.pdf`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); window.URL.revokeObjectURL(url);
    },
    onError: e => alert(e?.response?.data?.error || 'PDF indirilemedi'),
  });

  useEffect(() => {
    if (items.length > 0 && Object.keys(consultantChecked).length === 0) {
      const init = {};
      items.forEach(it => { init[it.id] = it.include_in_offer !== 0; });
      setConsultantChecked(init);
    }
  }, [items]);

  useEffect(() => {
    if (project && consultantMode) {
      let parsedNotes = [];
      try { parsedNotes = JSON.parse(project.offer_notes || '[]'); } catch {}
      if (!Array.isArray(parsedNotes)) parsedNotes = [];
      setConsultantOfferPrice(String(project.offer_price_tl || ''));
      setConsultantFields({
        nihai_musteri: project.nihai_musteri || '',
        is_turu: project.is_turu || '',
        teklif_tarihi: project.teklif_tarihi || '',
        validity_date: project.validity_date || '',
        offer_notes: parsedNotes,
      });
    }
  }, [project?.id, consultantMode]);

  function saveItem() {
    const qty = Number(itemForm.quantity || 1);
    const uP = Number(itemForm.unit_price || 0);
    createItemMut.mutate({
      ...itemForm, quantity: qty, unit_price: uP,
      total_price: Number(itemForm.total_price || (uP * qty)),
    });
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { await uploadSvcFile(id, fd); qc.invalidateQueries({ queryKey: ['svc-detail', id] }); }
    catch (err) { alert(err?.response?.data?.error || 'Yükleme hatası'); }
    e.target.value = '';
  }

  if (isLoading) return <div className="p-8"><Spinner /></div>;
  if (!project) return <div className="p-8 text-red-600">Proje bulunamadı.</div>;

  const st = SVC_STATUS[project.status] || { label: project.status, color: 'gray' };

  const TABS = consultantMode ? [
    { key: 'general',          label: 'Genel Bilgiler' },
    { key: 'consultant_offer', label: `Teklif & Satış (${items.length})` },
    { key: 'files',            label: `Dosyalar (${files.length})` },
    { key: 'history',          label: `Tarihçe (${logs.length})` },
  ] : [
    ...(!isConsultant ? [{ key: 'general', label: 'Genel Bilgiler' }] : []),
    { key: 'costing', label: `Maliyetlendirme (${items.length})` },
    ...(canPrice ? [{ key: 'actuals', label: 'Gerçekleşen' }] : []),
    ...(canOffer ? [{ key: 'offer', label: 'Teklif & Satış' }] : []),
    ...(!isConsultant ? [{ key: 'files', label: `Dosyalar (${files.length})` }] : []),
    ...(!isConsultant ? [{ key: 'history', label: `Tarihçe (${logs.length})` }] : []),
  ];

  // Maliyetlendirme tablosundaki sütun sayısı
  const COL_COUNT = canPrice ? 14 : 10;

  return (
    <div className="p-6 space-y-5">
      {/* ── Başlık ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => navigate(backPath)}
          className="shrink-0 w-28 h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-500 hover:text-blue-600 transition-all"
        >
          <ArrowLeft size={22} />
          <span className="text-xs font-medium">Geri Dön</span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-gray-800">{project.project_name}</h1>
                <Badge color={st.color}>{st.label}</Badge>
              </div>
              <div className="text-sm text-gray-500 mt-1 ml-1">
                {project.institution && <span>{project.institution} · </span>}
                {project.consultant_name && <span>Danışman: {project.consultant_name} · </span>}
                {project.created_date && <span>Oluşturma: {project.created_date}</span>}
                {project.offer_due_date && <span> · Teklif: {project.offer_due_date}</span>}
                {project.vehicle && <span> · {project.vehicle}</span>}
              </div>
            </div>

            {canOffer && (
              <Button size="sm" variant="danger" onClick={() => setDeleteModal(true)}>
                <Trash2 size={13} /> Sil
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Durum Seçici ────────────────────────────────────────────────────── */}
      {!isConsultant && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
          <div className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-3">Proje Durumu</div>
          <StatusFlow
            status={project.status}
            svcRole={svcRole}
            offerPrice={project.offer_price_tl}
            onChangeStatus={s => { setStatusModal(s); setStatusNote(''); }}
          />
        </div>
      )}

      {/* ── Sekmeler ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${tab === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Revize uyarısı: Teklif Verildi aşamasındayken fiyat güncellenebilir ── */}
      {OFFERED_GROUP.includes(project.status) && canOffer && tab !== 'offer' && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-sm text-emerald-800 font-medium">Teklif verildi. Fiyatı güncellemek için</span>
          </div>
          <button type="button" onClick={() => setTab('offer')}
            className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors">
            Teklif &amp; Satış
          </button>
        </div>
      )}

      {/* ── GENEL BİLGİLER ──────────────────────────────────────────────────── */}
      {tab === 'general' && (!isConsultant || consultantMode) && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">Proje Bilgileri</h2>
            {canEdit && !genEditing && (
              <Button size="sm" variant="secondary" onClick={() => { setGenForm({ ...project }); setGenEditing(true); }}>
                Düzenle
              </Button>
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
              {canOffer && <>
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
              </>}
              <div className="md:col-span-2 flex justify-end gap-2 mt-2">
                <Button variant="secondary" onClick={() => setGenEditing(false)}>İptal</Button>
                <Button onClick={() => updateMut.mutate(genForm)} disabled={updateMut.isPending}><Save size={14} /> Kaydet</Button>
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

      {/* ── MALİYETLENDİRME (ürünler + maliyet özeti) ───────────────────────── */}
      {tab === 'costing' && (
        <div className="space-y-4">
          {/* Özet kartlar — sadece fiyat görebilenlere */}
          {canPrice && (
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
          )}

          {/* Ürün tablosu */}
          <Card>
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700">Maliyetlendirme</h2>
              {canEdit && (
                <Button size="sm" onClick={() => { setItemForm(EMPTY_ITEM); setItemModal(true); }}>
                  <Plus size={14} /> Kalem Ekle
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-2 py-2 text-center w-8">#</th>
                    <th className="px-2 py-2 text-left">Kategori</th>
                    <th className="px-2 py-2 text-left">Ürün</th>
                    <th className="px-2 py-2 text-left">Marka</th>
                    <th className="px-2 py-2 text-left">Açıklama</th>
                    <th className="px-2 py-2 text-left">Teknik İster</th>
                    <th className="px-2 py-2 text-left">Boyut</th>
                    <th className="px-2 py-2 text-center">Miktar</th>
                    <th className="px-2 py-2 text-center">Birim</th>
                    {canPrice && <>
                      <th className="px-2 py-2 text-left">SA Notu</th>
                      <th className="px-2 py-2 text-left">Termin</th>
                      <th className="px-2 py-2 text-right">Birim ₺</th>
                      <th className="px-2 py-2 text-right">Toplam ₺</th>
                    </>}
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={COL_COUNT} className="px-3 py-8 text-center text-gray-400">Henüz kalem yok</td>
                    </tr>
                  ) : items.map(item => (
                    <InlineItemRow
                      key={item.id}
                      item={item}
                      canEdit={canEdit}
                      canPrice={canPrice}
                      onUpdate={(itemId, payload) => updateItemMut.mutate({ itemId, payload })}
                      onDelete={(itemId) => { if (window.confirm('Kalem silinsin mi?')) deleteItemMut.mutate(itemId); }}
                    />
                  ))}
                </tbody>
                {canPrice && items.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan={12} className="px-3 py-2 text-xs font-semibold text-right text-gray-600">Toplam Maliyet:</td>
                      <td className="px-3 py-2 text-sm font-bold text-gray-800 text-right">{fmtCur(summary.costTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Danışmana verilen teklif fiyatını göster */}
            {isConsultant && Number(project.offer_price_tl) > 0 && (
              <div className="mx-4 my-3 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Verilen Satış Teklifi</span>
                <span className="text-xl font-bold text-blue-700">{fmtCur(project.offer_price_tl)}</span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── GERÇEKLEŞEN ─────────────────────────────────────────────────────── */}
      {tab === 'actuals' && canPrice && (
        <Card>
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Gerçekleşen Maliyetler</h2>
              <div className="text-xs text-gray-400">
                <CheckSquare size={14} className="inline mr-1 text-emerald-600" />= Fiyat aynı
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
                  <ActualRow key={item.id} item={item} canEdit={canPrice}
                    onSave={(itemId, payload) => updateItemMut.mutate({ itemId, payload })} />
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
                  <input type="number" className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="0" defaultValue={project.realized_revenue_tl || ''}
                    onBlur={e => updateMut.mutate({ realized_revenue_tl: Number(e.target.value || 0) })} />
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

      {/* ── TEKLİF & SATIŞ ──────────────────────────────────────────────────── */}
      {tab === 'offer' && canOffer && (() => {
        const calcSale = Number(marginInput) > 0
          ? Number(project.cost_total_tl || 0) * (1 + Number(marginInput) / 100)
          : Number(project.sale_price_tl || 0);
        const regularOfferLogs = logs.filter(l => l.action?.startsWith('Teklif fiyatı onaylandı'));
        const revizeLogs = logs.filter(l => l.action?.startsWith('REVİZE TEKLİF'));

        return (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <button onClick={() => {
                const checked = {};
                items.forEach(it => { checked[it.id] = it.include_in_offer !== 0; });
                setOfferEditChecked(checked);
                setOfferEditMargin(String(project.margin_rate || ''));
                setOfferEditModal(true);
              }} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-lg">
                Düzenle
              </button>
              <button onClick={() => pdfMut.mutate()} disabled={pdfMut.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0D1B2A] hover:bg-[#162333] text-white text-sm font-medium rounded-lg border-l-4 border-[#E85004] disabled:opacity-60">
                <FileDown size={16} />
                {pdfMut.isPending ? 'Hazırlanıyor...' : 'Teklif Formu İndir (PDF)'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4"><div className="text-xs text-gray-400 uppercase">Maliyet Toplamı</div><div className="text-xl font-bold text-gray-800 mt-1">{fmtCur(project.cost_total_tl)}</div></Card>
              <Card className="p-4"><div className="text-xs text-gray-400 uppercase">Marj Oranı</div><div className="text-xl font-bold text-purple-700 mt-1">{pct(project.margin_rate)}</div></Card>
              <Card className="p-4"><div className="text-xs text-gray-400 uppercase">Hesaplanan Satış</div><div className="text-xl font-bold text-purple-700 mt-1">{fmtCur(project.sale_price_tl)}</div></Card>
              <Card className="p-4"><div className="text-xs text-gray-400 uppercase">Son Verilen Teklif</div><div className="text-xl font-bold text-blue-700 mt-1">{fmtCur(project.offer_price_tl)}</div></Card>
            </div>

            <Card className="p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Teklif Fiyatı Belirle</h3>
              <div className="flex items-center gap-3 mb-4">
                <Input label="Marj Oranı (%)" type="number" value={marginInput}
                  onChange={e => setMarginInput(e.target.value)} placeholder={project.margin_rate || '0'} className="w-40" />
                <div className="mt-5">
                  <Button variant="secondary" size="sm"
                    onClick={() => marginMut.mutate({ margin_rate: Number(marginInput) })}
                    disabled={marginMut.isPending || !marginInput}>Hesapla</Button>
                </div>
              </div>

              {Number(project.cost_total_tl) > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 p-3 bg-purple-50 rounded-xl border border-purple-100">
                    <div>
                      <div className="text-xs text-gray-500 mb-0.5">Hesaplanan Satış ({pct(marginInput || project.margin_rate)} marjla)</div>
                      <div className="text-lg font-bold text-purple-700">{fmtCur(calcSale)}</div>
                    </div>
                    <Button size="sm" onClick={() => { marginMut.mutate({ margin_rate: Number(marginInput || project.margin_rate), confirm: true }); setCustomOfferInput(''); }}
                      disabled={marginMut.isPending || calcSale <= 0}>
                      <CheckSquare size={14} /> Bu Fiyatı Onayla
                    </Button>
                  </div>

                  <div className="flex items-center gap-3 px-1">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">veya farklı bir fiyat girin</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>

                  <div className="flex items-end gap-3">
                    <Input label="Farklı Teklif Fiyatı (₺)" type="number" value={customOfferInput}
                      onChange={e => {
                        const v = e.target.value; setCustomOfferInput(v);
                        if (v && Number(project.cost_total_tl) > 0) {
                          setMarginInput((((Number(v) / Number(project.cost_total_tl)) - 1) * 100).toFixed(1));
                        }
                      }} className="flex-1" />
                    <Button onClick={() => {
                      if (!customOfferInput) return;
                      marginMut.mutate({ margin_rate: Number(marginInput || project.margin_rate), confirm: true, offer_price_tl: Number(customOfferInput) });
                      setCustomOfferInput('');
                    }} disabled={marginMut.isPending || !customOfferInput}>
                      <CheckSquare size={14} /> Onayla
                    </Button>
                  </div>
                </div>
              )}

              {marginMut.isSuccess && marginMut.variables?.confirm && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                  <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                  <div className="text-emerald-700 text-sm font-semibold">Teklif onaylandı, proje Beklemede'ye alındı.</div>
                </div>
              )}
            </Card>

            {regularOfferLogs.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-gray-700 mb-3">Teklif Verilenler</h3>
                <div className="space-y-2">
                  {regularOfferLogs.map((log, i) => (
                    <div key={log.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${i === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <div>
                          <div className={`text-sm font-medium ${i === 0 ? 'text-emerald-800' : 'text-gray-700'}`}>
                            {log.action.replace('Teklif fiyatı onaylandı: ', '')}
                          </div>
                          <div className="text-xs text-gray-400">{log.user_name} · {log.created_at?.replace('T', ' ').slice(0, 16)}</div>
                          {log.note && <div className="text-xs text-gray-500 italic mt-0.5">{log.note}</div>}
                        </div>
                      </div>
                      {i === 0 && <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Son Teklif</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {revizeLogs.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-amber-700 mb-3">Revize Teklifler</h3>
                <div className="space-y-2">
                  {revizeLogs.map((log, i) => (
                    <div key={log.id} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${i === 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-amber-500' : 'bg-gray-300'}`} />
                        <div>
                          <div className={`text-sm font-bold tracking-wide ${i === 0 ? 'text-amber-800' : 'text-gray-600'}`}>
                            {log.action.replace('REVİZE TEKLİF: ', '')}
                          </div>
                          <div className="text-xs text-gray-400">{log.user_name} · {log.created_at?.replace('T', ' ').slice(0, 16)}</div>
                          {log.note && <div className="text-xs text-gray-500 italic mt-0.5">{log.note}</div>}
                        </div>
                      </div>
                      {i === 0 && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Son Revize</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-5">
              <h3 className="font-semibold text-gray-700 mb-4">Notlar</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea label="Satın Alma Notu" rows={4} defaultValue={project.notes_purchase || ''}
                  onBlur={e => updateMut.mutate({ notes_purchase: e.target.value })} />
                <Textarea label="Yönetim Notu" rows={4} defaultValue={project.notes_management || ''}
                  onBlur={e => updateMut.mutate({ notes_management: e.target.value })} />
                <div className="md:col-span-2">
                  <Textarea label="Sonuç Notu" rows={3} defaultValue={project.result_note || ''}
                    onBlur={e => updateMut.mutate({ result_note: e.target.value })} />
                </div>
              </div>
            </Card>
          </div>
        );
      })()}

      {/* ── CONSULTANT TEKLİF & SATIŞ ───────────────────────────────────────── */}
      {tab === 'consultant_offer' && consultantMode && (() => {
        const selectedItems = items.filter(it => consultantChecked[it.id] !== false);
        const selectedCount = selectedItems.length;

        const NOTE_PRESETS = [
          'Verilen fiyatlara KDV dahil değildir.',
          'Sticker fiyatları dahil değildir.',
          'Nakliye ve kurulum ayrıca fiyatlandırılacaktır.',
          'Teklifimiz 30 gün geçerlidir.',
          'Mallar teslim tarihinde hazır olacaktır.',
        ];

        function cfSet(key, val) { setConsultantFields(prev => ({ ...prev, [key]: val })); }
        function addNote(text) {
          if (!text.trim()) return;
          cfSet('offer_notes', [...consultantFields.offer_notes, text.trim()]);
          setNoteInput('');
        }
        function removeNote(i) { cfSet('offer_notes', consultantFields.offer_notes.filter((_, idx) => idx !== i)); }

        const saveOffer = () => {
          if (!consultantOfferPrice || Number(consultantOfferPrice) <= 0) {
            alert('Lütfen teklif fiyatı girin.');
            return;
          }
          const include_in_offer = {};
          items.forEach(it => { include_in_offer[it.id] = consultantChecked[it.id] !== false; });
          consultantOfferMut.mutate({
            offer_price_tl: Number(consultantOfferPrice),
            include_in_offer,
            ...consultantFields,
          });
        };

        return (
          <div className="space-y-4">
            {/* Teklif bilgileri */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Teklif Bilgileri</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Nihai Müşteri</label>
                  <input type="text" value={consultantFields.nihai_musteri}
                    onChange={e => cfSet('nihai_musteri', e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Nihai müşteri adı..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">İş Türü</label>
                  <input type="text" value={consultantFields.is_turu}
                    onChange={e => cfSet('is_turu', e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="Proje / Toplu alım / ..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Teklif Tarihi</label>
                  <input type="date" value={consultantFields.teklif_tarihi}
                    onChange={e => cfSet('teklif_tarihi', e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Geçerlilik Tarihi</label>
                  <input type="date" value={consultantFields.validity_date}
                    onChange={e => cfSet('validity_date', e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            </Card>

            {/* Kalemler */}
            <Card>
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-700">Teklif Kalemleri</h2>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => { const a = {}; items.forEach(it => { a[it.id] = true; }); setConsultantChecked(a); }}
                    className="text-xs text-blue-600 hover:underline">Tümünü Seç</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => { const a = {}; items.forEach(it => { a[it.id] = false; }); setConsultantChecked(a); }}
                    className="text-xs text-gray-500 hover:underline">Hiçbirini Seçme</button>
                  <span className="text-xs text-gray-400">{selectedCount}/{items.length} seçili</span>
                  <button type="button" onClick={() => { setItemForm(EMPTY_ITEM); setItemModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
                    <Plus size={13} /> Kalem Ekle
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-center w-10">Dahil</th>
                      <th className="px-3 py-2 text-left">Kategori</th>
                      <th className="px-3 py-2 text-left">Ürün</th>
                      <th className="px-3 py-2 text-left">Marka</th>
                      <th className="px-3 py-2 text-left">Açıklama</th>
                      <th className="px-3 py-2 text-center">Miktar</th>
                      <th className="px-3 py-2 text-left">Birim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 ? (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Henüz kalem yok</td></tr>
                    ) : items.map((it, i) => {
                      const included = consultantChecked[it.id] !== false;
                      return (
                        <tr key={it.id}
                          onClick={() => setConsultantChecked(prev => ({ ...prev, [it.id]: !included }))}
                          className={`cursor-pointer border-b border-gray-50 transition-colors ${included ? 'hover:bg-blue-50/40' : 'opacity-50 bg-gray-50/50 hover:bg-gray-100/50'} ${i % 2 === 1 && included ? 'bg-gray-50/30' : ''}`}>
                          <td className="px-3 py-2.5 text-center">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto ${included ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                              {included && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{it.category || '—'}</td>
                          <td className="px-3 py-2.5 font-medium text-gray-800">{it.product_name || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{it.brand || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500 max-w-[180px] truncate">{it.description || '—'}</td>
                          <td className="px-3 py-2.5 text-center text-gray-700">{it.quantity || 1}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{it.unit || 'adet'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Notlar */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-700 mb-3">Notlar</h2>
              {/* Hazır notlar */}
              <div className="flex flex-wrap gap-2 mb-3">
                {NOTE_PRESETS.filter(p => !consultantFields.offer_notes.includes(p)).map(p => (
                  <button key={p} type="button" onClick={() => addNote(p)}
                    className="px-3 py-1.5 text-xs border border-dashed border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
                    + {p}
                  </button>
                ))}
              </div>
              {/* Eklenen notlar */}
              {consultantFields.offer_notes.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {consultantFields.offer_notes.map((n, i) => (
                    <li key={i} className="flex items-start gap-2 p-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                      <span className="text-blue-400 mt-0.5 text-xs">•</span>
                      <span className="flex-1 text-sm text-gray-700">{n}</span>
                      <button type="button" onClick={() => removeNote(i)} className="text-red-400 hover:text-red-600 shrink-0">
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Özel not ekle */}
              <div className="flex gap-2">
                <input type="text" value={noteInput} onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(noteInput); } }}
                  placeholder="Diğer / Özel not ekle..."
                  className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <button type="button" onClick={() => addNote(noteInput)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition-colors">
                  Ekle
                </button>
              </div>
            </Card>

            {/* Teklif fiyatı girişi */}
            <Card className="p-5">
              <h2 className="font-semibold text-gray-700 mb-4">Teklif Fiyatım</h2>
              <div className="flex items-end gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Teklifim (₺)</label>
                  <input
                    type="number"
                    value={consultantOfferPrice}
                    onChange={e => setConsultantOfferPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <Button onClick={saveOffer} disabled={consultantOfferMut.isPending || !consultantOfferPrice}>
                  <Save size={14} />
                  {consultantOfferMut.isPending ? 'Kaydediliyor...' : 'Teklifi Kaydet'}
                </Button>
                <Button variant="secondary" onClick={() => proformaPdfMut.mutate()} disabled={proformaPdfMut.isPending}>
                  <Download size={14} />
                  {proformaPdfMut.isPending ? 'Hazırlanıyor...' : 'Proforma PDF'}
                </Button>
              </div>

              {consultantOfferMut.isSuccess && (
                <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
                  <CheckSquare size={16} className="text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 text-sm font-semibold">Teklifiniz kaydedildi ve yönetime iletildi.</span>
                </div>
              )}
            </Card>
          </div>
        );
      })()}

      {/* ── DOSYALAR ────────────────────────────────────────────────────────── */}
      {tab === 'files' && (!isConsultant || consultantMode) && (
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
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {[...files].sort((a, b) => ({ spec: 0, excel: 1, other: 2 }[a.file_type] ?? 2) - ({ spec: 0, excel: 1, other: 2 }[b.file_type] ?? 2))
                .map(f => {
                  const isSpec = f.file_type === 'spec';
                  const isExcel = f.file_type === 'excel';
                  return (
                    <div key={f.id} className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 ${isSpec ? 'bg-amber-50/50' : ''}`}>
                      <div className="flex items-center gap-3">
                        <FileText size={20} className={isSpec ? 'text-amber-600' : isExcel ? 'text-emerald-600' : f.file_type === 'pdf' ? 'text-red-500' : 'text-gray-400'} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{f.original_name}</span>
                            {isSpec && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Şartname</span>}
                            {isExcel && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">Excel</span>}
                          </div>
                          <div className="text-xs text-gray-400">{f.uploaded_by_name} · {f.created_at?.slice(0, 10)} · {(f.size / 1024).toFixed(0)} KB</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <a href={getSvcFileDownloadUrl(id, f.id)} download={f.original_name}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100">
                          <Download size={14} /> İndir
                        </a>
                        {canEdit && (
                          <button type="button" onClick={() => { if (window.confirm('Dosya silinsin mi?')) deleteFileMut.mutate(f.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      )}

      {/* ── TARİHÇE ─────────────────────────────────────────────────────────── */}
      {tab === 'history' && (!isConsultant || consultantMode) && (
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
                const isRevize = log.action?.startsWith('REVİZE TEKLİF');
                return (
                  <div key={log.id} className={`px-5 py-3 hover:bg-gray-50 ${isRevize ? 'bg-amber-50/60' : ''}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge color={newSt.color}>{newSt.label || log.new_status}</Badge>
                        {isRevize ? (
                          <span className="text-sm font-bold tracking-wide text-amber-700 uppercase">{log.action}</span>
                        ) : (
                          <span className="text-sm text-gray-700 font-medium">{log.action}</span>
                        )}
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

      {/* ── Durum Değişim Modal ──────────────────────────────────────────────── */}
      <Modal open={!!statusModal} onClose={() => setStatusModal(null)}
        title={`Durumu Değiştir: ${SVC_STATUS[statusModal]?.label || statusModal}`} size="sm">
        <p className="text-sm text-gray-600 mb-3">
          Projeyi <strong>{SVC_STATUS[statusModal]?.label || statusModal}</strong> durumuna almak istediğinize emin misiniz?
        </p>
        <Textarea label="Not (isteğe bağlı)" value={statusNote} onChange={e => setStatusNote(e.target.value)}
          rows={2} placeholder="Durum değişikliği hakkında not..." />
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setStatusModal(null)}>İptal</Button>
          <Button variant={statusModal === 'won' ? 'success' : statusModal === 'lost' ? 'danger' : 'primary'}
            onClick={() => statusMut.mutate({ status: statusModal, note: statusNote })}
            disabled={statusMut.isPending}>
            {statusMut.isPending ? 'Kaydediliyor...' : 'Onayla'}
          </Button>
        </div>
      </Modal>

      {/* ── Kalem Ekle Modal ─────────────────────────────────────────────────── */}
      <Modal open={itemModal} onClose={() => setItemModal(false)} title="Yeni Kalem Ekle" size="xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Kategori" value={itemForm.category || ''} onChange={e => setItemForm(f => ({ ...f, category: e.target.value }))} />
          <Input label="Ürün Adı *" value={itemForm.product_name || ''} onChange={e => setItemForm(f => ({ ...f, product_name: e.target.value }))} />
          <Input label="Marka" value={itemForm.brand || ''} onChange={e => setItemForm(f => ({ ...f, brand: e.target.value }))} />
          <Input label="Boyut / Ebat" value={itemForm.size_info || ''} onChange={e => setItemForm(f => ({ ...f, size_info: e.target.value }))} />
          <Input label="Birim" value={itemForm.unit || 'adet'} onChange={e => setItemForm(f => ({ ...f, unit: e.target.value }))} />
          <Input label="Miktar" type="number" value={itemForm.quantity || 1} onChange={e => setItemForm(f => ({ ...f, quantity: e.target.value }))} />
          <div className="md:col-span-2">
            <Textarea label="Açıklama" value={itemForm.description || ''} rows={2}
              onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <Textarea label="Teknik İsterler" value={itemForm.tech_spec || ''} rows={2}
              onChange={e => setItemForm(f => ({ ...f, tech_spec: e.target.value }))} />
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
          <Button variant="secondary" onClick={() => setItemModal(false)}>İptal</Button>
          <Button onClick={saveItem} disabled={createItemMut.isPending || !itemForm.product_name?.trim()}>
            <Save size={14} /> Kaydet
          </Button>
        </div>
      </Modal>

      {/* ── Teklif Düzenle Modal ─────────────────────────────────────────────── */}
      {offerEditModal && (() => {
        const margin = Number(offerEditMargin) || 0;
        const selectedItems = items.filter(it => offerEditChecked[it.id] !== false);
        const selectedCost = selectedItems.reduce((s, it) => s + Number(it.total_price || 0), 0);
        const offerTotal = selectedCost * (1 + margin / 100);

        const saveOfferEdit = () => {
          Promise.all(items.map(it => updateSvcItem(id, it.id, { include_in_offer: offerEditChecked[it.id] !== false ? 1 : 0 })))
            .then(() => { marginMut.mutate({ margin_rate: margin }); setOfferEditModal(false); qc.invalidateQueries({ queryKey: ['svc-detail', id] }); });
        };

        return (
          <Modal open title="Teklif Formu Düzenle" onClose={() => setOfferEditModal(false)} size="xl">
            <div className="space-y-5">
              <div className="flex items-end gap-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teklif Marjı (%)</label>
                  <input type="number" value={offerEditMargin} onChange={e => setOfferEditMargin(e.target.value)}
                    placeholder="0" className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                <div className="flex-1 grid grid-cols-3 gap-3 text-center">
                  <div><div className="text-xs text-gray-400 mb-0.5">Seçili Maliyet</div><div className="text-base font-bold text-gray-700">{fmtCur(selectedCost)}</div></div>
                  <div><div className="text-xs text-gray-400 mb-0.5">Marj</div><div className="text-base font-bold text-purple-700">%{margin.toFixed(1)}</div></div>
                  <div><div className="text-xs text-gray-400 mb-0.5">Teklif Toplamı</div><div className="text-base font-bold text-blue-700">{fmtCur(offerTotal)}</div></div>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                  <div className="col-span-1 text-center">Dahil</div>
                  <div className="col-span-3">Kategori</div>
                  <div className="col-span-4">Ürün</div>
                  <div className="col-span-1 text-right">Adet</div>
                  <div className="col-span-2 text-right">Maliyet</div>
                  <div className="col-span-1 text-right">Teklif</div>
                </div>
                <div className="divide-y max-h-80 overflow-y-auto">
                  {items.map(it => {
                    const included = offerEditChecked[it.id] !== false;
                    const itemOffer = Number(it.total_price || 0) * (1 + margin / 100);
                    return (
                      <div key={it.id} onClick={() => setOfferEditChecked(prev => ({ ...prev, [it.id]: !included }))}
                        className={`grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer transition-colors ${included ? 'bg-white hover:bg-blue-50' : 'bg-gray-50 opacity-50 hover:bg-gray-100'}`}>
                        <div className="col-span-1 flex justify-center items-center">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${included ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                            {included && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        </div>
                        <div className="col-span-3 text-xs text-gray-500 self-center truncate">{it.category || '—'}</div>
                        <div className="col-span-4 self-center"><div className="text-sm font-medium text-gray-800 truncate">{it.product_name || '—'}</div></div>
                        <div className="col-span-1 text-xs text-gray-600 text-right self-center">{it.quantity} {it.unit}</div>
                        <div className="col-span-2 text-xs font-mono text-gray-700 text-right self-center">{fmtCur(it.total_price)}</div>
                        <div className={`col-span-1 text-xs font-mono font-semibold text-right self-center ${included ? 'text-blue-700' : 'text-gray-400'}`}>
                          {included ? fmtCur(itemOffer) : '—'}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-t">
                  <button onClick={() => { const all = {}; items.forEach(it => { all[it.id] = true; }); setOfferEditChecked(all); }} className="text-xs text-blue-600 hover:underline">Tümünü Seç</button>
                  <span className="text-gray-300">|</span>
                  <button onClick={() => { const none = {}; items.forEach(it => { none[it.id] = false; }); setOfferEditChecked(none); }} className="text-xs text-gray-500 hover:underline">Hiçbirini Seçme</button>
                  <span className="ml-auto text-xs text-gray-400">{selectedItems.length}/{items.length} kalem seçili</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setOfferEditModal(false)}>İptal</Button>
                <Button onClick={saveOfferEdit} disabled={marginMut.isPending}><Save size={14} /> Kaydet</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Proje Sil Modal ──────────────────────────────────────────────────── */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Projeyi Sil" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          <strong>{project.project_name}</strong> projesini kalıcı olarak silmek istediğinize emin misiniz?
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
