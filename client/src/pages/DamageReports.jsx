import React, { useMemo, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getDamageReports, importDamageReports } from '../api';
import { PageHeader, Card, Button, Input, Select, Spinner, Table, StatCard } from '../components/UI';
import { AlertTriangle, Upload, Download, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

function fmtCur(v) {
  return Number(v || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function fmtNum(v) {
  return Number(v || 0).toLocaleString('tr-TR');
}

function exportExcel(name, rows) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tutanak');
  XLSX.writeFile(wb, name);
}

export default function DamageReportsPage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({
    start_year: '',
    start_month: '',
    end_year: '',
    end_month: '',
    q: '',
    problem_source: '',
    reported_by: '',
    approved_by: '',
    purchase_action: '',
    min_cost: '',
    max_cost: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['damage-reports', filters],
    queryFn: () => getDamageReports(Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))).then(r => r.data),
  });

  const importMutation = useMutation({
    mutationFn: importDamageReports,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['damage-reports'] });
      alert('Tutanak dosyasi sisteme aktarildi.');
    },
    onError: (err) => {
      alert(err?.response?.data?.error || err.message || 'Yukleme hatasi');
    }
  });

  const rows = data?.rows || [];
  const summary = data?.summary || {};
  const filterOptions = data?.filterOptions || { sources: [], reporters: [], approvers: [], actions: [] };
  const yearOptions = filterOptions.years || [];
  const yearMonths = filterOptions.yearMonths || {};
  const monthOptions = [
    { value: '1', label: 'Ocak' },
    { value: '2', label: 'Subat' },
    { value: '3', label: 'Mart' },
    { value: '4', label: 'Nisan' },
    { value: '5', label: 'Mayis' },
    { value: '6', label: 'Haziran' },
    { value: '7', label: 'Temmuz' },
    { value: '8', label: 'Agustos' },
    { value: '9', label: 'Eylul' },
    { value: '10', label: 'Ekim' },
    { value: '11', label: 'Kasim' },
    { value: '12', label: 'Aralik' },
  ];

  const startMonthOptions = filters.start_year
    ? monthOptions.filter(m => (yearMonths[String(filters.start_year)] || []).includes(Number(m.value)))
    : monthOptions;
  const endMonthOptions = filters.end_year
    ? monthOptions.filter(m => (yearMonths[String(filters.end_year)] || []).includes(Number(m.value)))
    : monthOptions;

  useEffect(() => {
    if (!filters.start_month) return;
    if (startMonthOptions.some(m => m.value === filters.start_month)) return;
    updateFilter('start_month', '');
  }, [filters.start_year]);

  useEffect(() => {
    if (!filters.end_month) return;
    if (endMonthOptions.some(m => m.value === filters.end_month)) return;
    updateFilter('end_month', '');
  }, [filters.end_year]);

  const detailsExcelRows = useMemo(() => rows.map(r => ({
    Tarih: r.report_date,
    UrunKodu: r.product_code,
    Urun: r.product_name,
    Problem: r.problem,
    Adet: r.quantity,
    ProblemKaynagi: r.problem_source,
    ProblemiBildiren: r.reported_by,
    ProblemiOnaylayan: r.approved_by,
    ProblemCozumu: r.resolution,
    SatinAlma: r.purchase_action,
    ToplamMaliyet: r.total_cost,
    KaynakDosya: r.source_file,
  })), [rows]);

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function onUploadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importMutation.mutate(file);
    e.target.value = '';
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Hasar Tutanakları"
        subtitle="Kirilan, bozulan, kaybolan ve garanti degisim sureclerinin takip paneli"
        action={(
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer hover:bg-gray-50">
              <Upload size={16} />
              {importMutation.isPending ? 'Yukleniyor...' : 'Tutanak Yukle'}
              <input type="file" accept=".xls,.xlsx" className="hidden" onChange={onUploadFile} />
            </label>
            <Button variant="secondary" onClick={() => exportExcel(`hasar-tutanaklari-${new Date().toISOString().slice(0, 10)}.xlsx`, detailsExcelRows)}>
              <Download size={16} /> Excel Indir
            </Button>
          </div>
        )}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Select label="Baslangic Yil" value={filters.start_year} onChange={e => updateFilter('start_year', e.target.value)}>
            <option value="">Tumu</option>
            {yearOptions.map(y => <option key={`sy-${y}`} value={String(y)}>{y}</option>)}
          </Select>
          <Select label="Baslangic Ay" value={filters.start_month} onChange={e => updateFilter('start_month', e.target.value)}>
            <option value="">Tumu</option>
            {startMonthOptions.map(m => <option key={`sm-${m.value}`} value={m.value}>{m.label}</option>)}
          </Select>
          <Select label="Bitis Yil" value={filters.end_year} onChange={e => updateFilter('end_year', e.target.value)}>
            <option value="">Tumu</option>
            {yearOptions.map(y => <option key={`ey-${y}`} value={String(y)}>{y}</option>)}
          </Select>
          <Select label="Bitis Ay" value={filters.end_month} onChange={e => updateFilter('end_month', e.target.value)}>
            <option value="">Tumu</option>
            {endMonthOptions.map(m => <option key={`em-${m.value}`} value={m.value}>{m.label}</option>)}
          </Select>
          <Input label="Arama" placeholder="Urun kodu, urun, problem..." value={filters.q} onChange={e => updateFilter('q', e.target.value)} />
          <Select label="Problem Kaynagi" value={filters.problem_source} onChange={e => updateFilter('problem_source', e.target.value)}>
            <option value="">Tumu</option>
            {filterOptions.sources.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Satin Alma Karari" value={filters.purchase_action} onChange={e => updateFilter('purchase_action', e.target.value)}>
            <option value="">Tumu</option>
            {filterOptions.actions.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Problemi Bildiren" value={filters.reported_by} onChange={e => updateFilter('reported_by', e.target.value)}>
            <option value="">Tumu</option>
            {filterOptions.reporters.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Select label="Problemi Onaylayan" value={filters.approved_by} onChange={e => updateFilter('approved_by', e.target.value)}>
            <option value="">Tumu</option>
            {filterOptions.approvers.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
          <Input label="Min Maliyet" type="number" value={filters.min_cost} onChange={e => updateFilter('min_cost', e.target.value)} />
          <Input label="Maks Maliyet" type="number" value={filters.max_cost} onChange={e => updateFilter('max_cost', e.target.value)} />
          <div className="flex items-end">
            <Button variant="secondary" onClick={() => setFilters({ start_year: '', start_month: '', end_year: '', end_month: '', q: '', problem_source: '', reported_by: '', approved_by: '', purchase_action: '', min_cost: '', max_cost: '' })}>
              <Filter size={16} /> Filtreyi Temizle
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Toplam Kayit" value={fmtNum(summary.totalRecords)} icon={AlertTriangle} color="orange" />
            <StatCard label="Toplam Tutar" value={fmtCur(summary.totalCost)} icon={AlertTriangle} color="red" />
            <StatCard label="Garanti Degisimi" value={fmtCur(summary.guaranteeCost)} icon={AlertTriangle} color="blue" />
            <StatCard label="Kullanici Hatasi" value={fmtCur(summary.userErrorCost)} icon={AlertTriangle} color="purple" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card className="p-4 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">Problem Kaynagina Gore Ozet</h3>
                <Button size="sm" variant="secondary" onClick={() => exportExcel('problem-kaynagi-ozet.xlsx', (data?.groupedBySource || []).map(x => ({ Kaynak: x.label, Kayit: x.count, ToplamTutar: x.totalCost })))}>
                  <Download size={14} /> Excel
                </Button>
              </div>
              <Table headers={['Kaynak', 'Kayit', 'Toplam Tutar']} empty={(data?.groupedBySource || []).length === 0 && 'Veri yok'}>
                {(data?.groupedBySource || []).map(row => (
                  <tr key={row.label} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-sm text-gray-700">{row.label}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{fmtNum(row.count)}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-gray-800">{fmtCur(row.totalCost)}</td>
                  </tr>
                ))}
              </Table>
            </Card>

            <Card className="p-4 overflow-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">Satin Alma Kararina Gore Ozet</h3>
                <Button size="sm" variant="secondary" onClick={() => exportExcel('satin-alma-karari-ozet.xlsx', (data?.groupedByAction || []).map(x => ({ Karar: x.label, Kayit: x.count, ToplamTutar: x.totalCost })))}>
                  <Download size={14} /> Excel
                </Button>
              </div>
              <Table headers={['Karar', 'Kayit', 'Toplam Tutar']} empty={(data?.groupedByAction || []).length === 0 && 'Veri yok'}>
                {(data?.groupedByAction || []).map(row => (
                  <tr key={row.label} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-sm text-gray-700">{row.label}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{fmtNum(row.count)}</td>
                    <td className="px-4 py-2 text-sm font-semibold text-gray-800">{fmtCur(row.totalCost)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>

          <Card className="overflow-auto">
            <Table
              headers={['Tarih', 'Urun Kodu', 'Urun', 'Problem', 'Adet', 'Kaynak', 'Bildiren', 'Onaylayan', 'Satin Alma', 'Maliyet']}
              empty={rows.length === 0 && 'Filtreye uygun tutanak kaydi yok'}
            >
              {rows.map(r => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-600">{r.report_date}</td>
                  <td className="px-4 py-2 text-sm font-mono text-gray-600">{r.product_code}</td>
                  <td className="px-4 py-2 text-sm text-gray-800">{r.product_name}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.problem}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{fmtNum(r.quantity)}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.problem_source || '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.reported_by || '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.approved_by || '-'}</td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.purchase_action || '-'}</td>
                  <td className="px-4 py-2 text-sm font-semibold text-gray-800">{fmtCur(r.total_cost)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
