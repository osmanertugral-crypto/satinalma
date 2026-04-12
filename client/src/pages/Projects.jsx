import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FolderKanban, Save, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { deleteProject, getProjects, importProjects, updateProject } from '../api';
import { Badge, Button, Card, Input, Modal, PageHeader, Select, Spinner, StatCard, Table, Textarea } from '../components/UI';

function fmtCur(v) {
  return Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('tr-TR');
}

function exportExcel(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Projeler');
  XLSX.writeFile(wb, name);
}

function statusBadge(status) {
  const s = String(status || 'offered');
  if (s === 'won') return { label: 'Onaylandi', color: 'green' };
  if (s === 'lost') return { label: 'Kaybettik', color: 'red' };
  if (s === 'pending') return { label: 'Beklemede', color: 'yellow' };
  return { label: 'Teklif Verildi', color: 'blue' };
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ search: '', status: '', year: '' });
  const [editRow, setEditRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [editForm, setEditForm] = useState({ status: 'offered', pre_cost_tl: '', realized_cost_tl: '', realized_revenue_tl: '', result_note: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => getProjects(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))).then(r => r.data),
  });

  const importMutation = useMutation({
    mutationFn: importProjects,
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      alert(resp?.message || 'Proje teklifleri ice aktarıldı.');
    },
    onError: (err) => alert(err?.response?.data?.error || err.message || 'Yukleme hatasi')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateProject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditRow(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (rowId) => deleteProject(rowId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setDeleteRow(null);
    },
  });

  const rows = data?.rows || [];
  const summary = data?.summary || {};
  const years = data?.years || [];

  const viewRows = useMemo(() => rows.map((r) => {
    const margin = Number(r.realized_revenue_tl || 0) - Number(r.realized_cost_tl || 0);
    const diffCost = Number(r.realized_cost_tl || 0) - Number(r.pre_cost_tl || 0);
    return {
      id: r.id,
      created_date: r.created_date,
      project_name: r.project_name,
      institution: r.institution,
      quantity: r.quantity,
      quoted_tl: r.quoted_tl,
      status: r.status,
      pre_cost_tl: r.pre_cost_tl,
      realized_cost_tl: r.realized_cost_tl,
      realized_revenue_tl: r.realized_revenue_tl,
      result_note: r.result_note,
      item_count: r.item_count,
      margin,
      diffCost,
    };
  }), [rows]);

  const exportRows = useMemo(() => viewRows.map((r) => ({
    Tarih: r.created_date || '',
    Proje: r.project_name,
    Kurum: r.institution,
    Adet: r.quantity,
    TeklifTL: r.quoted_tl,
    Durum: r.status,
    OnMaliyetTL: r.pre_cost_tl,
    GerceklesenMaliyetTL: r.realized_cost_tl,
    GerceklesenGelirTL: r.realized_revenue_tl,
    KarZararTL: r.margin,
    MaliyetSapmasiTL: r.diffCost,
    Not: r.result_note || '',
  })), [viewRows]);

  function onUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importMutation.mutate(file);
    e.target.value = '';
  }

  function openEdit(row) {
    setEditRow(row);
    setEditForm({
      status: row.status || 'offered',
      pre_cost_tl: row.pre_cost_tl ?? '',
      realized_cost_tl: row.realized_cost_tl ?? '',
      realized_revenue_tl: row.realized_revenue_tl ?? '',
      result_note: row.result_note || '',
    });
  }

  function saveEdit() {
    if (!editRow?.id) return;
    updateMutation.mutate({
      id: editRow.id,
      payload: {
        status: editForm.status,
        pre_cost_tl: Number(editForm.pre_cost_tl || 0),
        realized_cost_tl: Number(editForm.realized_cost_tl || 0),
        realized_revenue_tl: Number(editForm.realized_revenue_tl || 0),
        result_note: editForm.result_note,
      }
    });
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Projeler"
        subtitle="Teklif verdigimiz projelerin sonuc ve maliyet karsilastirma paneli"
        action={(
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50">
              <Upload size={16} />
              {importMutation.isPending ? 'Yukleniyor...' : 'Excel Yukle'}
              <input type="file" accept=".xls,.xlsx" className="hidden" onChange={onUpload} />
            </label>
            <Button variant="secondary" onClick={() => exportExcel(`projeler-${new Date().toISOString().slice(0, 10)}.xlsx`, exportRows)}>
              <Download size={16} /> Excel Indir
            </Button>
          </div>
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            label="Arama"
            placeholder="Proje, kurum, arac"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
          <Select label="Durum" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">Tumu</option>
            <option value="offered">Teklif Verildi</option>
            <option value="pending">Beklemede</option>
            <option value="won">Onaylandi</option>
            <option value="lost">Kaybettik</option>
          </Select>
          <Select label="Yil" value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}>
            <option value="">Tumu</option>
            {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
          </Select>
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => setFilters({ search: '', status: '', year: '' })}>Filtreyi Temizle</Button>
          </div>
        </div>
      </Card>

      {isLoading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Toplam Proje" value={fmtNum(summary.total)} icon={FolderKanban} color="blue" />
            <StatCard label="Onaylanan Is" value={fmtNum(summary.won)} icon={FolderKanban} color="green" />
            <StatCard label="Kaybedilen" value={fmtNum(summary.lost)} icon={FolderKanban} color="red" />
            <StatCard label="Toplam Teklif" value={fmtCur(summary.quotedTlTotal)} icon={FolderKanban} color="purple" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="On Maliyet Toplam" value={fmtCur(summary.preCostTlTotal)} icon={FolderKanban} color="orange" />
            <StatCard label="Gerceklesen Maliyet" value={fmtCur(summary.realizedCostTlTotal)} icon={FolderKanban} color="red" />
            <StatCard label="Gerceklesen Gelir" value={fmtCur(summary.realizedRevenueTlTotal)} icon={FolderKanban} color="green" />
          </div>

          <Card className="overflow-auto">
            <Table headers={['Tarih', 'Proje', 'Kurum', 'Adet', 'Kalem', 'Teklif', 'Durum', 'On Maliyet', 'Gerceklesen Maliyet', 'Gerceklesen Gelir', 'Kar/Zarar', 'Islem']} empty={viewRows.length === 0 && 'Kayit yok'}>
              {viewRows.map((r) => {
                const sb = statusBadge(r.status);
                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-600">{r.created_date || '-'}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-800">
                      <button type="button" className="text-left hover:text-blue-700 hover:underline" onClick={() => navigate(`/projeler/${r.id}`)}>
                        {r.project_name}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{r.institution || '-'}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{fmtNum(r.quantity)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{fmtNum(r.item_count)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{fmtCur(r.quoted_tl)}</td>
                    <td className="px-4 py-2 text-sm"><Badge color={sb.color}>{sb.label}</Badge></td>
                    <td className="px-4 py-2 text-sm text-gray-700">{fmtCur(r.pre_cost_tl)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{fmtCur(r.realized_cost_tl)}</td>
                    <td className="px-4 py-2 text-sm text-gray-700">{fmtCur(r.realized_revenue_tl)}</td>
                    <td className={`px-4 py-2 text-sm font-semibold ${Number(r.margin) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCur(r.margin)}</td>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => navigate(`/projeler/${r.id}`)}>Detay</Button>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>Hizli Duzenle</Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteRow(r)}><Trash2 size={14} /> Sil</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        </>
      )}

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title="Proje Sonuc ve Maliyet Guncelle" size="lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Durum" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
            <option value="offered">Teklif Verildi</option>
            <option value="pending">Beklemede</option>
            <option value="won">Onaylandi</option>
            <option value="lost">Kaybettik</option>
          </Select>
          <Input label="On Maliyet (TL)" type="number" value={editForm.pre_cost_tl} onChange={(e) => setEditForm((f) => ({ ...f, pre_cost_tl: e.target.value }))} />
          <Input label="Gerceklesen Maliyet (TL)" type="number" value={editForm.realized_cost_tl} onChange={(e) => setEditForm((f) => ({ ...f, realized_cost_tl: e.target.value }))} />
          <Input label="Gerceklesen Gelir (TL)" type="number" value={editForm.realized_revenue_tl} onChange={(e) => setEditForm((f) => ({ ...f, realized_revenue_tl: e.target.value }))} />
          <div className="md:col-span-2">
            <Textarea label="Sonuc Notu" value={editForm.result_note} onChange={(e) => setEditForm((f) => ({ ...f, result_note: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setEditRow(null)}>Iptal</Button>
          <Button onClick={saveEdit} disabled={updateMutation.isPending}><Save size={16} /> Kaydet</Button>
        </div>
      </Modal>

      <Modal open={!!deleteRow} onClose={() => setDeleteRow(null)} title="Projeyi Sil" size="sm">
        <p className="text-sm text-gray-600">
          <strong>{deleteRow?.project_name}</strong> projesini silmek istediginize emin misiniz?
          Bu islem proje kalemlerini de kalici olarak siler.
        </p>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="secondary" onClick={() => setDeleteRow(null)}>Iptal</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!deleteRow) return;
              const ok = window.confirm('Bu proje kalici olarak silinecek. Emin misiniz?');
              if (!ok) return;
              deleteMutation.mutate(deleteRow.id);
            }}
            disabled={deleteMutation.isPending}
          >
            Sil
          </Button>
        </div>
      </Modal>
    </div>
  );
}
