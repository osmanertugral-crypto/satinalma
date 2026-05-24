import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, FolderKanban, Image, Plus, Trash2, Upload } from 'lucide-react';
import { createSvcProject, deleteSvcProject, getSvcCoverUrl, getSvcProjects, importSvcFromExcel } from '../api';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, StatCard, Textarea } from '../components/UI';

export const SVC_STATUS = {
  draft:              { label: 'Taslak',         color: 'gray' },
  submitted:          { label: 'İletildi',        color: 'blue' },
  reviewing:          { label: 'İnceleniyor',     color: 'indigo' },
  costing:            { label: 'Maliyetlendirme', color: 'yellow' },  // eski projeler için
  offer_ready:        { label: 'Teklif Hazır',    color: 'purple' },  // eski projeler için
  offered:            { label: 'Teklif Verildi',  color: 'blue' },    // eski projeler için
  pending:            { label: 'Beklemede',        color: 'orange' },
  revision_requested: { label: 'Revize Edilen',   color: 'yellow' },
  won:                { label: 'İş Alındı',        color: 'green' },
  lost:               { label: 'İş Alınamadı',    color: 'red' },
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
  superstructure: '', quantity: 1, country: 'Yurtiçi',
  consultant_name: '', created_date: new Date().toISOString().slice(0, 10),
  offer_due_date: '', usd_rate: '', eur_rate: '', notes_consultant: '',
};

// Kart görünümünde proje
function ProjectCard({ r, svcRole, onDelete, onClick }) {
  const st = SVC_STATUS[r.status] || { label: r.status, color: 'gray' };
  const canSeePrice = ['purchasing', 'manager', 'management'].includes(svcRole);
  const canSeeOffer = ['manager', 'management'].includes(svcRole);
  const overdue = r.offer_due_date && new Date(r.offer_due_date) < new Date() && !['won','lost'].includes(r.status);
  const days = daysDiff(r.created_date);

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col"
      onClick={onClick}
    >
      {/* Kapak görseli */}
      <div className="relative h-36 rounded-t-xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
        {r.cover_image ? (
          <img
            src={`${getSvcCoverUrl(r.id)}?v=${encodeURIComponent(r.updated_at || r.cover_image)}`}
            alt={r.project_name}
            className="w-full h-full object-cover"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <FolderKanban size={40} className="text-slate-300" />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <Badge color={st.color}>{st.label}</Badge>
        </div>
        {overdue && (
          <div className="absolute top-2 left-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
            ⚠ Gecikmiş
          </div>
        )}
      </div>

      {/* İçerik */}
      <div className="p-4 flex-1 flex flex-col gap-1">
        <div className="font-semibold text-gray-800 group-hover:text-blue-700 line-clamp-2">
          {r.project_name || '(İsimsiz)'}
        </div>
        {r.institution && <div className="text-xs text-gray-500">{r.institution}</div>}
        {r.vehicle && <div className="text-xs text-gray-400">{r.vehicle}</div>}

        <div className="flex items-center gap-2 mt-auto pt-2 text-xs text-gray-400 border-t border-gray-100">
          {r.consultant_name && <span>👤 {r.consultant_name}</span>}
          <span className="ml-auto">{r.created_date}</span>
          {days != null && <span>({days}g)</span>}
        </div>

        {r.offer_due_date && (
          <div className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
            Teklif: {r.offer_due_date}
          </div>
        )}

        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-400">{r.item_count ?? 0} kalem</span>
        </div>

        {(canSeePrice || canSeeOffer) && (
          <div className="grid grid-cols-3 gap-1 mt-2 pt-2 border-t border-gray-100">
            {canSeePrice && (
              <div>
                <div className="text-xs text-gray-400">Maliyet</div>
                <div className="text-xs font-mono font-semibold text-gray-700 truncate">{r.cost_total_tl > 0 ? fmtCur(r.cost_total_tl) : '—'}</div>
              </div>
            )}
            {canSeeOffer && (
              <div>
                <div className="text-xs text-gray-400">Teklif</div>
                <div className="text-xs font-mono font-bold text-blue-700 truncate">{r.offer_price_tl > 0 ? fmtCur(r.offer_price_tl) : '—'}</div>
              </div>
            )}
            {canSeeOffer && (
              <div>
                <div className="text-xs text-gray-400">Marj</div>
                <div className="text-xs font-semibold text-purple-700">{r.margin_rate > 0 ? `%${Number(r.margin_rate).toFixed(1)}` : '—'}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alt işlem */}
      {onDelete && (
        <div className="px-4 pb-3 pt-0">
          <button
            type="button"
            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={e => { e.stopPropagation(); onDelete(r); }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function SvcTakipPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ search: '', status: '', year: '' });
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
  const excelInputRef = useRef();
  const specInputRef = useRef();

  // Arama debounce — 300ms bekle, sonra filtrele
  useEffect(() => {
    const t = setTimeout(() => setFilters(f => ({ ...f, search: searchInput })), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const svcRole = user?.svc_role || (user?.role === 'admin' ? 'management' : 'none');
  const canSeePrice = ['purchasing', 'manager', 'management'].includes(svcRole);
  const canSeeOffer = ['manager', 'management'].includes(svcRole);
  const canCreate = svcRole !== 'none';
  const canDelete = canSeeOffer || user?.role === 'admin';

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

  function setF(k, v) { setFilters(f => ({ ...f, [k]: v })); }

  function openNewModal() {
    setNewMode('excel');
    setExcelFile(null);
    setSpecFiles([]);
    setImportError('');
    setForm(EMPTY_FORM);
    setNewModal(true);
  }

  async function handleImport() {
    if (!excelFile) { setImportError('Excel dosyası seçin.'); return; }
    setImporting(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('excel', excelFile);
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Toplam" value={summary.total ?? 0} icon={FolderKanban} color="blue"
          active={filters.status === ''} onClick={() => { setF('status', ''); setSearchInput(''); }} />
        <StatCard label="Teklif Verildi" value={summary.offered ?? 0} icon={FolderKanban} color="blue"
          active={filters.status === 'offered'} onClick={() => setF('status', filters.status === 'offered' ? '' : 'offered')} />
        <StatCard label="Beklemede" value={summary.pending ?? 0} icon={FolderKanban} color="orange"
          active={filters.status === 'pending'} onClick={() => setF('status', filters.status === 'pending' ? '' : 'pending')} />
        <StatCard label="Revize Edilen" value={summary.revision_requested ?? 0} icon={FolderKanban} color="yellow"
          active={filters.status === 'revision_requested'} onClick={() => setF('status', filters.status === 'revision_requested' ? '' : 'revision_requested')} />
        <StatCard label="İş Alındı" value={summary.won ?? 0} icon={FolderKanban} color="green"
          active={filters.status === 'won'} onClick={() => setF('status', filters.status === 'won' ? '' : 'won')} />
        <StatCard label="İş Alınamadı" value={summary.lost ?? 0} icon={FolderKanban} color="red"
          active={filters.status === 'lost'} onClick={() => setF('status', filters.status === 'lost' ? '' : 'lost')} />
      </div>

      {/* Filtreler */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input label="Arama" placeholder="Proje adı, kurum, araç, danışman..." value={searchInput}
            onChange={e => setSearchInput(e.target.value)} />
          <Select label="Durum" value={filters.status} onChange={e => setF('status', e.target.value)}>
            <option value="">Tüm Durumlar</option>
            {Object.entries(SVC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select label="Yıl" value={filters.year} onChange={e => setF('year', e.target.value)}>
            <option value="">Tüm Yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={() => { setSearchInput(''); setFilters({ search: '', status: '', year: '' }); }}>Temizle</Button>
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
                      {r.cover_image
                        ? <img src={`${getSvcCoverUrl(r.id)}?v=${encodeURIComponent(r.updated_at || r.cover_image)}`} alt="" className="w-12 h-9 object-cover rounded border border-gray-200" />
                        : <div className="w-12 h-9 bg-gray-100 rounded border border-gray-200 flex items-center justify-center"><Image size={14} className="text-gray-300" /></div>
                      }
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
            <Select label="Ülke" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
              <option>Yurtiçi</option><option>Yurtdışı</option>
            </Select>
            {svcRole !== 'consultant' && (
              <Input label="Danışman Adı" value={form.consultant_name} onChange={e => setForm(f => ({ ...f, consultant_name: e.target.value }))} />
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
              <Button onClick={() => createMut.mutate(form)} disabled={createMut.isPending || !form.project_name.trim()}>
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
