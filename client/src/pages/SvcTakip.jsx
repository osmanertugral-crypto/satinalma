import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, FolderKanban, Image, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { createSvcProject, deleteSvcProject, getSvcCoverUrl, getSvcProjects, importSvcFromExcel } from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, StatCard, Textarea } from '../components/UI';

export const SVC_STATUS = {
  // Teklif Verilmedi grubu (tüm ön-aşama statüler)
  draft:              { label: 'Teklif Verilmedi', color: 'red' },
  submitted:          { label: 'Teklif Verilmedi', color: 'red' },
  reviewing:          { label: 'Teklif Verilmedi', color: 'red' },
  costing:            { label: 'Teklif Verilmedi', color: 'red' },
  offer_ready:        { label: 'Teklif Verilmedi', color: 'red' },
  // Teklif Verildi grubu
  offered:            { label: 'Teklif Verildi',   color: 'green' },
  pending:            { label: 'Teklif Verildi',   color: 'green' },
  revision_requested: { label: 'Teklif Verildi',   color: 'green' },
  // Sonuç
  won:                { label: 'Proje Alındı',      color: 'blue' },
  lost:               { label: 'Proje Alınamadı',  color: 'gray' },
};

function fmtCur(v) {
  if (v == null || v === '' || Number(v) === 0) return '—';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₺';
}

function daysDiff(dateStr) {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const EMPTY_FORM = {
  project_name: '', institution: '', description: '', vehicle: '',
  superstructure: '', quantity: 1, country: '', division: 'SVC',
  consultant_name: '', created_date: new Date().toISOString().slice(0, 10),
  offer_due_date: '', usd_rate: '', eur_rate: '', notes_consultant: '',
};

function fmtShort(v) {
  if (!v || Number(v) === 0) return '—';
  const n = Number(v);
  if (n >= 1_000_000) return (n / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' M₺';
  if (n >= 1_000)     return (n / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' K₺';
  return Math.round(n).toLocaleString('tr-TR') + ' ₺';
}

function institutionLogo(r) {
  const hay = [r.institution, r.vehicle, r.superstructure, r.project_name]
    .filter(Boolean).join(' ')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/Ğ/g, 'ğ').replace(/Ü/g, 'ü')
    .replace(/Ş/g, 'ş').replace(/Ö/g, 'ö').replace(/Ç/g, 'ç')
    .toLowerCase();
  if (hay.includes('dmo')) return '/logo-dmo.png';
  if (hay.includes('jandarma')) return '/logo-jandarma.png';
  if (hay.includes('karayol') || hay.includes('kgm')) return '/logo-karayollari.png';
  if (hay.includes('msb') || hay.includes('milli savunma') || hay.includes('guvenlik reaksiyon') || hay.includes('polis tim')) return '/logo-msb.png';
  if (hay.includes('emniyet')) return '/logo-emniyet.png';
  return null;
}

function offerDaysElapsed(dateStr) {
  if (!dateStr) return null;
  const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

// Kart görünümünde proje
function ProjectCard({ r, svcRole, onDelete, onClick }) {
  const st = SVC_STATUS[r.status] || { label: r.status, color: 'gray' };
  const canSeePrice = ['purchasing', 'manager', 'management'].includes(svcRole);
  const canSeeOffer = ['manager', 'management'].includes(svcRole);
  const overdue = r.offer_due_date && new Date(r.offer_due_date) < new Date() && !['won', 'lost'].includes(r.status);
  const isAbroad = r.country === 'Yurtdışı';
  const logo = institutionLogo(r);
  const offeredDays = offerDaysElapsed(r.offer_sent_date);
  const isOffered = ['offered', 'pending', 'revision_requested'].includes(r.status);

  return (
    <div
      className="rounded-xl border cursor-pointer group flex flex-col overflow-hidden transition-all duration-150 hover:shadow-md hover:-translate-y-0.5"
      style={{ background: '#F5FAFF', borderColor: '#C8E2F4', boxShadow: '0 1px 3px rgba(26,143,216,0.07)' }}
      onClick={onClick}
    >
      {/* ── Üst şerit: ana başlık (Üstyapı) ───────────────────────────── */}
      <div className="px-3 pt-2.5 pb-2" style={{ background: '#EBF5FC', borderBottom: '1px solid #C8E2F4' }}>
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-extrabold uppercase leading-tight line-clamp-2"
              style={{ color: '#0D3E61', letterSpacing: '0.01em' }}>
              {r.superstructure || r.project_name || '(İsimsiz)'}
            </div>
            {r.superstructure && r.project_name && r.project_name !== r.superstructure && (
              <div className="text-[10px] text-gray-400 mt-0.5 truncate">{r.project_name}</div>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <Badge color={st.color}>{st.label}</Badge>
            {isAbroad && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                style={{ background: '#EDE9FE', color: '#5B21B6' }}>Yurtdışı</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Logo / Kapak alanı ──────────────────────────────────────────── */}
      {logo ? (
        <div className="flex items-center justify-center py-3" style={{ background: '#F0F7FF', borderBottom: '1px solid #D4E9F7', minHeight: 72 }}>
          <img src={logo} alt="" className="h-12 max-w-[80%] object-contain"
            onError={e => { e.target.style.display = 'none'; }} />
        </div>
      ) : r.cover_image ? (
        <div className="h-20 overflow-hidden">
          <img
            src={`${getSvcCoverUrl(r.id)}?v=${encodeURIComponent(r.updated_at || r.cover_image)}`}
            alt={r.project_name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.style.display = 'none'; }}
          />
        </div>
      ) : null}

      {/* ── Bilgi alanı ─────────────────────────────────────────────── */}
      <div className="px-3 py-2 flex-1 flex flex-col gap-1.5">
        {r.institution && (
          <div className="text-[11px] font-semibold truncate" style={{ color: '#1E3A5F' }}>{r.institution}</div>
        )}

        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
          {r.vehicle && <span>🚗 {r.vehicle}{Number(r.quantity) > 1 ? ` ×${r.quantity}` : ''}</span>}
          {r.consultant_name && <span>👤 {r.consultant_name}</span>}
        </div>

        {/* ── Fiyat bilgileri ─────────────────────────────────────── */}
        {(canSeePrice || canSeeOffer) && (
          <div className="grid grid-cols-3 gap-1.5 pt-2 mt-auto" style={{ borderTop: '1px solid #D4E9F7' }}>
            {canSeePrice && (
              <div>
                <div className="text-[9px] uppercase tracking-wide mb-0.5 font-semibold" style={{ color: '#7BA7C4' }}>Maliyet</div>
                <div className="text-[12px] font-bold font-mono leading-tight" style={{ color: '#374151' }}>
                  {fmtShort(r.cost_total_tl)}
                </div>
              </div>
            )}
            {canSeeOffer && (
              <div>
                <div className="text-[9px] uppercase tracking-wide mb-0.5 font-semibold" style={{ color: '#7BA7C4' }}>Teklif</div>
                <div className="text-[15px] font-extrabold font-mono leading-tight" style={{ color: '#1A8FD8' }}>
                  {fmtShort(r.offer_price_tl)}
                </div>
              </div>
            )}
            {canSeeOffer && (
              <div>
                <div className="text-[9px] uppercase tracking-wide mb-0.5 font-semibold" style={{ color: '#7BA7C4' }}>Marj</div>
                <div className="text-[15px] font-extrabold leading-tight" style={{ color: '#7C3AED' }}>
                  {r.margin_rate > 0 ? `%${Math.round(Number(r.margin_rate))}` : '—'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Alt bilgi ───────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[10px]"
        style={{ borderTop: '1px solid #D4E9F7', background: '#EBF5FC' }}>
        <div className="flex items-center gap-1.5 text-gray-400">
          <span>{r.created_date}</span>
          {overdue && (
            <span className="font-semibold" style={{ color: '#DC2626' }}>· ⚠ Gecikmiş</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isOffered && offeredDays !== null && (
            <span className="font-semibold" style={{ color: offeredDays > 30 ? '#DC2626' : offeredDays > 14 ? '#D97706' : '#059669' }}>
              {offeredDays}g
            </span>
          )}
          <span style={{ color: '#94A3B8' }}>{r.item_count ?? 0}k</span>
          {onDelete && (
            <button type="button"
              className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={e => { e.stopPropagation(); onDelete(r); }}>
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SvcTakipPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: '', status: '', year: '', group: '', country: '', division: '' });
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'
  const [newModal, setNewModal] = useState(false);
  const [newMode, setNewMode] = useState('excel'); // 'excel' | 'manual'
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteRow, setDeleteRow] = useState(null);

  // Excel import state
  const [excelFile, setExcelFile] = useState(null);
  const [specFiles, setSpecFiles] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [selectedConsultantId, setSelectedConsultantId] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('SVC');
  const excelInputRef = useRef();
  const specInputRef = useRef();

  // Arama debounce — 300ms bekle, sonra filtrele
  useEffect(() => {
    const t = setTimeout(() => setFilters(f => ({ ...f, search: searchInput })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const svcRole = user?.role === 'admin' ? 'management' : (user?.svc_role || 'none');
  const isReadonly = svcRole === 'readonly';
  const canSeePrice = ['purchasing', 'manager', 'management', 'readonly'].includes(svcRole);
  const canSeeOffer = ['manager', 'management', 'readonly'].includes(svcRole);
  const canCreate = svcRole !== 'none' && !isReadonly;
  const canDelete = (canSeeOffer && !isReadonly) || user?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['svc-projects', filters],
    queryFn: () => getSvcProjects(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))).then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: createSvcProject,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['svc-projects'] });
      setNewModal(false);
      setForm(EMPTY_FORM);
      navigate(`/svc-takip/${res.data.id}`);
    },
    onError: (e) => alert(e?.response?.data?.error || 'Hata oluştu'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteSvcProject,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['svc-projects'] }); setDeleteRow(null); },
    onError: (e) => alert(e?.response?.data?.error || 'Silinemedi'),
  });

  const rows = data?.rows || [];
  const summary = data?.summary || {};
  const years = data?.years || [];

  function setF(k, v) {
    setFilters(f => {
      const next = { ...f, [k]: v };
      if (k === 'group' && v) next.status = '';
      if (k === 'status' && v) next.group = '';
      return next;
    });
  }

  function openNewModal() {
    setNewMode('excel');
    setExcelFile(null);
    setSpecFiles([]);
    setImportError('');
    setSelectedConsultantId('');
    setSelectedCountry('');
    setSelectedDivision('SVC');
    setForm(EMPTY_FORM);
    setNewModal(true);
  }

  async function handleImport() {
    if (!excelFile) { setImportError('Excel dosyası seçin.'); return; }
    if (svcRole !== 'consultant' && !selectedConsultantId) { setImportError('Satış danışmanı seçin.'); return; }
    if (!selectedCountry) { setImportError('Yurtiçi / Yurtdışı seçin.'); return; }
    setImporting(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('excel', excelFile);
      fd.append('consultant_id', selectedConsultantId);
      fd.append('country', selectedCountry);
      fd.append('division', selectedDivision);
      for (const sf of specFiles) fd.append('spec', sf);
      const res = await importSvcFromExcel(fd);
      qc.invalidateQueries({ queryKey: ['svc-projects'] });
      setNewModal(false);
      navigate(`/svc-takip/${res.data.firstId}`);
    } catch (e) {
      setImportError(e?.response?.data?.error || 'Excel içe aktarılamadı.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="SVC Takip"
        subtitle="Satış danışmanı projelerinin maliyetlendirme ve teklif takip paneli"
        action={canCreate && (
          <Button onClick={openNewModal}>
            <Plus size={16} /> Yeni Proje
          </Button>
        )}
      />

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <StatCard label="Toplam" value={summary.total ?? 0} icon={FolderKanban} color="blue"
          active={!filters.status && !filters.group}
          onClick={() => { setFilters({ search: '', status: '', year: '', group: '' }); setSearchInput(''); }} />

        <StatCard label="Teklif Verilmedi" value={summary.not_offered ?? 0} icon={FolderKanban} color="red"
          active={filters.group === 'not_offered'}
          onClick={() => {
            if ((summary.not_offered ?? 0) === 1 && summary.not_offered_id) {
              navigate(`/svc-takip/${summary.not_offered_id}`);
            } else {
              setF('group', filters.group === 'not_offered' ? '' : 'not_offered');
            }
          }} />

        <StatCard label="Teklif Verilenler" value={summary.teklif_verilenler ?? 0} icon={FolderKanban} color="green"
          active={filters.group === 'teklif_verilenler'}
          onClick={() => setF('group', filters.group === 'teklif_verilenler' ? '' : 'teklif_verilenler')} />

        <StatCard label="Revize Edilenler" value={summary.revize ?? 0} icon={RefreshCw} color="yellow"
          active={filters.group === 'revize'}
          onClick={() => setF('group', filters.group === 'revize' ? '' : 'revize')} />

        <StatCard label="Bekleyen" value={summary.bekleyen ?? 0} icon={FolderKanban} color="orange"
          active={filters.group === 'bekleyen'}
          onClick={() => setF('group', filters.group === 'bekleyen' ? '' : 'bekleyen')} />

        <StatCard label="Proje Alındı" value={summary.won ?? 0} icon={FolderKanban} color="green"
          active={filters.status === 'won'}
          onClick={() => setF('status', filters.status === 'won' ? '' : 'won')} />

        <StatCard label="Proje Alınamadı" value={summary.lost ?? 0} icon={FolderKanban} color="gray"
          active={filters.status === 'lost'}
          onClick={() => setF('status', filters.status === 'lost' ? '' : 'lost')} />
      </div>

      {/* Filtreler */}
      <Card className="p-4">
        {/* Bölüm filtresi — üst satır */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-gray-500 shrink-0">Bölüm:</span>
          {[{ v: '', l: 'Tümü' }, { v: 'SVC', l: 'SVC' }, { v: 'Retech', l: 'Retech' }].map(({ v, l }) => (
            <button
              key={v}
              type="button"
              onClick={() => setF('division', v)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold border-2 transition-all"
              style={{
                borderColor: filters.division === v ? '#1A8FD8' : '#E5E7EB',
                background: filters.division === v ? '#1A8FD8' : '#F9FAFB',
                color: filters.division === v ? '#fff' : '#6B7280',
              }}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Alt filtreler */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Input label="Arama" placeholder="Proje adı, kurum, araç, danışman..." value={searchInput}
            onChange={e => setSearchInput(e.target.value)} />
          <Select label="Durum" value={filters.group || filters.status} onChange={e => {
            const v = e.target.value;
            if (!v) { setFilters(f => ({ ...f, status: '', group: '' })); return; }
            if (['won', 'lost'].includes(v)) setF('status', v);
            else setF('group', v);
          }}>
            <option value="">Toplam</option>
            <option value="teklif_verilenler">Teklif Verildi</option>
            <option value="bekleyen">Beklemede</option>
            <option value="revize">Revize Edilen</option>
            <option value="won">Proje Alındı</option>
            <option value="lost">Proje Alınamadı</option>
          </Select>
          <Select label="Yıl" value={filters.year} onChange={e => setF('year', e.target.value)}>
            <option value="">Tüm Yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Konum" value={filters.country} onChange={e => setF('country', e.target.value)}>
            <option value="">Yurtiçi + Yurtdışı</option>
            <option value="Yurtiçi">Yurtiçi</option>
            <option value="Yurtdışı">Yurtdışı</option>
          </Select>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => { setSearchInput(''); setFilters({ search: '', status: '', year: '', group: '', country: '', division: '' }); }}>Temizle</Button>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              <button type="button" onClick={() => setViewMode('cards')}
                className={`px-3 py-2 text-sm ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Kart
              </button>
              <button type="button" onClick={() => setViewMode('table')}
                className={`px-3 py-2 text-sm ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                Liste
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* İçerik */}
      {isLoading ? <Spinner /> : rows.length === 0 ? (
        <Card>
          <div className="p-16 text-center text-gray-400">
            <FolderKanban size={48} className="mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">Henüz proje yok</p>
            {canCreate && <p className="text-sm mt-1">Excel dosyanızı yükleyerek yeni proje oluşturun</p>}
          </div>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map(r => (
            <ProjectCard
              key={r.id}
              r={r}
              svcRole={svcRole}
              onDelete={canDelete ? setDeleteRow : null}
              onClick={() => navigate(`/svc-takip/${r.id}`)}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Kapak</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Proje</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Kurum</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Danışman</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Durum</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Oluşturma</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Teklif Tarihi</th>
                {canSeePrice && <th className="px-4 py-3 text-right font-semibold text-gray-600">Maliyet</th>}
                {canSeeOffer && <th className="px-4 py-3 text-right font-semibold text-gray-600">Teklif</th>}
                {canSeeOffer && <th className="px-4 py-3 text-right font-semibold text-gray-600">Marj</th>}
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Kalem</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const st = SVC_STATUS[r.status] || { label: r.status, color: 'gray' };
                const overdue = r.offer_due_date && new Date(r.offer_due_date) < new Date() && !['won','lost'].includes(r.status);
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                    <td className="px-3 py-2">
                      {(() => {
                        const logo = institutionLogo(r);
                        if (logo) return (
                          <div className="w-12 h-9 bg-white rounded border border-gray-200 flex items-center justify-center p-1">
                            <img src={logo} alt="" className="max-w-full max-h-full object-contain"
                              onError={e => { e.target.style.display = 'none'; }} />
                          </div>
                        );
                        if (r.cover_image) return (
                          <img src={`${getSvcCoverUrl(r.id)}?v=${encodeURIComponent(r.updated_at || r.cover_image)}`} alt="" className="w-12 h-9 object-cover rounded border border-gray-200" />
                        );
                        return <div className="w-12 h-9 bg-gray-100 rounded border border-gray-200 flex items-center justify-center"><Image size={14} className="text-gray-300" /></div>;
                      })()}
                    </td>
                    <td className="px-4 py-2.5">
                      <button type="button" className="text-left font-medium text-blue-700 hover:underline"
                        onClick={() => navigate(`/svc-takip/${r.id}`)}>
                        {r.project_name || '(İsimsiz)'}
                      </button>
                      {r.vehicle && <div className="text-xs text-gray-400">{r.vehicle}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{r.institution || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-700">{r.consultant_name || '—'}</td>
                    <td className="px-4 py-2.5"><Badge color={st.color}>{st.label}</Badge></td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{r.created_date || '—'}</td>
                    <td className="px-4 py-2.5">
                      {r.offer_due_date
                        ? <span className={overdue ? 'text-red-600 font-medium text-xs' : 'text-gray-600 text-xs'}>{r.offer_due_date}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    {canSeePrice && <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-700">{fmtCur(r.cost_total_tl)}</td>}
                    {canSeeOffer && <td className="px-4 py-2.5 text-right font-mono text-xs font-bold text-blue-700">{fmtCur(r.offer_price_tl)}</td>}
                    {canSeeOffer && <td className="px-4 py-2.5 text-right text-xs font-semibold text-purple-700">{r.margin_rate > 0 ? `%${Number(r.margin_rate).toFixed(1)}` : '—'}</td>}
                    <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{r.item_count ?? 0}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/svc-takip/${r.id}`)}>Aç</Button>
                        {canDelete && (
                          <Button size="sm" variant="danger" onClick={() => setDeleteRow(r)}><Trash2 size={13} /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Yeni Proje Modal ──────────────────────────────────────────────────── */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="Yeni SVC Projesi" size="xl">
        {/* Mod seçimi */}
        <div className="flex gap-3 mb-5 p-1 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => setNewMode('excel')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all
              ${newMode === 'excel' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <FileSpreadsheet size={16} /> Excel'den Oluştur
          </button>
          <button
            type="button"
            onClick={() => setNewMode('manual')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-all
              ${newMode === 'manual' ? 'bg-white shadow text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Plus size={16} /> Manuel Gir
          </button>
        </div>

        {newMode === 'excel' ? (
          <div className="space-y-5">
            <p className="text-sm text-gray-600">
              Doldurduğunuz Excel şablonunu yükleyin. Proje bilgileri, araç, kurum ve tüm kalemler otomatik olarak içe aktarılacak.
              Excel içindeki görsel varsa proje kapağı olarak kullanılacak.
            </p>

            {/* Excel Yükle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maliyet Excel'i * <span className="text-xs text-gray-400 font-normal">(Hava Yangın Lojistik Aracı Maliyet.xlsx formatı)</span>
              </label>
              {excelFile ? (
                <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <FileSpreadsheet size={20} className="text-emerald-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-emerald-800 truncate">{excelFile.name}</div>
                    <div className="text-xs text-emerald-600">{(excelFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <button type="button" onClick={() => setExcelFile(null)} className="text-emerald-600 hover:text-red-600 text-lg leading-none font-bold">×</button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all">
                  <Upload size={24} className="text-gray-400 mb-1" />
                  <span className="text-sm text-gray-500">Excel dosyasını sürükleyin veya tıklayın</span>
                  <span className="text-xs text-gray-400 mt-0.5">.xlsx, .xls</span>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={e => setExcelFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>

            {/* Şartname Yükle */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Şartname / Teknik Döküman <span className="text-xs text-gray-400 font-normal">(isteğe bağlı — PDF, Word, vs.)</span>
              </label>
              {specFiles.length > 0 ? (
                <div className="space-y-2">
                  {specFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                      <Upload size={16} className="text-blue-600 shrink-0" />
                      <span className="text-sm text-blue-800 flex-1 truncate">{f.name}</span>
                      <button type="button" onClick={() => setSpecFiles(prev => prev.filter((_, j) => j !== i))}
                        className="text-blue-600 hover:text-red-600 font-bold leading-none">×</button>
                    </div>
                  ))}
                  <label className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 cursor-pointer">
                    <Plus size={14} /> Dosya ekle
                    <input type="file" className="hidden" multiple onChange={e => setSpecFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:bg-blue-50/50 transition-all">
                  <Upload size={18} className="text-gray-300 mb-1" />
                  <span className="text-xs text-gray-400">Şartname veya teknik döküman yükleyin</span>
                  <input type="file" className="hidden" multiple onChange={e => setSpecFiles(Array.from(e.target.files || []))} />
                </label>
              )}
            </div>

            {/* SVC / Retech filtresi */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Birim <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {['SVC', 'Retech'].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDivision(d)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all"
                    style={{
                      borderColor: selectedDivision === d ? '#1A8FD8' : '#E5E7EB',
                      background: selectedDivision === d ? '#EFF8FF' : '#F9FAFB',
                      color: selectedDivision === d ? '#1A8FD8' : '#6B7280',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Satış Danışmanı */}
            {svcRole !== 'consultant' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Satış Danışmanı <span className="text-red-500">*</span>
                </label>
                <Select value={selectedConsultantId} onChange={e => setSelectedConsultantId(e.target.value)}>
                  <option value="">— Seçiniz —</option>
                  {(data?.consultants || []).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* Yurtiçi / Yurtdışı */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Yurtiçi / Yurtdışı <span className="text-red-500">*</span>
              </label>
              <Select value={selectedCountry} onChange={e => setSelectedCountry(e.target.value)}>
                <option value="">— Seçiniz —</option>
                <option value="Yurtiçi">Yurtiçi</option>
                <option value="Yurtdışı">Yurtdışı</option>
              </Select>
            </div>

            {importError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {importError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setNewModal(false)}>İptal</Button>
              <Button onClick={handleImport} disabled={importing || !excelFile}>
                {importing
                  ? <><Spinner />  İçe aktarılıyor...</>
                  : <><FileSpreadsheet size={16} /> İçe Aktar ve Aç</>}
              </Button>
            </div>
          </div>
        ) : (
          /* Manuel Form */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Proje Adı *" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} />
            <Input label="Kurum / Firma" value={form.institution} onChange={e => setForm(f => ({ ...f, institution: e.target.value }))} />
            <Input label="Araç" value={form.vehicle} onChange={e => setForm(f => ({ ...f, vehicle: e.target.value }))} />
            <Input label="Üstyapı" value={form.superstructure} onChange={e => setForm(f => ({ ...f, superstructure: e.target.value }))} />
            <Input label="Adet" type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
            {/* SVC / Retech filtresi */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1.5" style={{ color: '#3C3C3C' }}>Birim *</label>
              <div className="flex gap-2">
                {['SVC', 'Retech'].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, division: d }))}
                    className="flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all"
                    style={{
                      borderColor: form.division === d ? '#1A8FD8' : '#E5E7EB',
                      background: form.division === d ? '#EFF8FF' : '#F9FAFB',
                      color: form.division === d ? '#1A8FD8' : '#6B7280',
                    }}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <Select label="Yurtiçi / Yurtdışı *" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
              <option value="">— Seçiniz —</option>
              <option value="Yurtiçi">Yurtiçi</option>
              <option value="Yurtdışı">Yurtdışı</option>
            </Select>
            {svcRole !== 'consultant' && (
              <Select label="Satış Danışmanı *" value={form.consultant_name} onChange={e => setForm(f => ({ ...f, consultant_name: e.target.value }))}>
                <option value="">— Seçiniz —</option>
                {(data?.consultants || []).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </Select>
            )}
            <Input label="Oluşturma Tarihi" type="date" value={form.created_date} onChange={e => setForm(f => ({ ...f, created_date: e.target.value }))} />
            <Input label="Teklif Tarihi" type="date" value={form.offer_due_date} onChange={e => setForm(f => ({ ...f, offer_due_date: e.target.value }))} />
            {canSeePrice && (
              <>
                <Input label="USD Kuru" type="number" value={form.usd_rate} onChange={e => setForm(f => ({ ...f, usd_rate: e.target.value }))} />
                <Input label="EUR Kuru" type="number" value={form.eur_rate} onChange={e => setForm(f => ({ ...f, eur_rate: e.target.value }))} />
              </>
            )}
            <div className="md:col-span-2">
              <Textarea label="Açıklama / Şartname Özeti" value={form.description} rows={3}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex justify-end gap-3 mt-2">
              <Button variant="secondary" onClick={() => setNewModal(false)}>İptal</Button>
              <Button
                onClick={() => createMut.mutate(form)}
                disabled={createMut.isPending || !form.project_name.trim() || !form.country || !form.division || (svcRole !== 'consultant' && !form.consultant_name)}
              >
                {createMut.isPending ? 'Oluşturuluyor...' : 'Oluştur ve Aç'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Silme Modal */}
      <Modal open={!!deleteRow} onClose={() => setDeleteRow(null)} title="Proje Sil" size="sm">
        <p className="text-sm text-gray-600 mb-4">
          <strong className="text-gray-800">{deleteRow?.project_name}</strong> projesini ve tüm kalemlerini/dosyalarını kalıcı olarak silmek istiyor musunuz?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteRow(null)}>İptal</Button>
          <Button variant="danger" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(deleteRow.id)}>
            {deleteMut.isPending ? 'Siliniyor...' : 'Evet, Sil'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
