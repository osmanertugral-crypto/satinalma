import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCiroRaporu, getCiroRaporuForce } from '../api';
import { RefreshCw, BarChart2, AlertTriangle, FileSpreadsheet, Calendar, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// ── Yardımcılar ─────────────────────────────────────────────────────────────
function fmtTL(val) {
  if (!val || val === 0) return '—';
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val) + ' ₺';
}

function fmtShortTL(val) {
  if (!val || val === 0) return '—';
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M ₺';
  if (val >= 1_000) return (val / 1_000).toFixed(1) + 'K ₺';
  return val.toFixed(2) + ' ₺';
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── KPI Kart ─────────────────────────────────────────────────────────────────
function KPICard({ title, value, sub, color }) {
  const cm = {
    blue: 'from-blue-500 to-blue-700',
    emerald: 'from-emerald-500 to-emerald-700',
    violet: 'from-violet-500 to-violet-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${cm[color] || cm.blue} text-white p-5 shadow`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-1">{title}</div>
      <div className="text-xl font-extrabold truncate">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

// ── Pivot Tablo ──────────────────────────────────────────────────────────────
function PivotTable({ columns, categories, selectedYear }) {
  const [sortCol, setSortCol] = useState(null);   // sütun label
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  const visibleCols = selectedYear === 'all'
    ? columns
    : columns.filter(c =>
        c.type === 'grandTotal' ||
        c.year === parseInt(selectedYear)
      );

  // Seçili yılda hiç verisi olmayan kategorileri gizle
  const monthCols = visibleCols.filter(c => c.type === 'month' || c.type === 'yearTotal');
  const baseRows = categories.filter(c =>
    !c.isGrandTotal &&
    monthCols.some(col => (c.values[col.label] || 0) !== 0)
  );
  const grandTotal = categories.find(c => c.isGrandTotal);

  // Sıralama
  const dataRows = useMemo(() => {
    if (!sortCol) return baseRows;
    return [...baseRows].sort((a, b) => {
      const av = a.values[sortCol] || 0;
      const bv = b.values[sortCol] || 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [baseRows, sortCol, sortDir]);

  function handleSort(colLabel) {
    if (sortCol === colLabel) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(colLabel);
      setSortDir('desc');
    }
  }

  function SortIcon({ label }) {
    if (sortCol !== label) return <ChevronsUpDown size={12} className="opacity-40 ml-1 inline" />;
    return sortDir === 'desc'
      ? <ChevronDown size={12} className="ml-1 inline text-yellow-300" />
      : <ChevronUp size={12} className="ml-1 inline text-yellow-300" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-slate-700 text-white text-xs uppercase tracking-wide">
            <th className="px-4 py-3 text-left font-semibold min-w-[180px] sticky left-0 bg-slate-700 z-10">
              Kategori
            </th>
            {visibleCols.map(col => (
              <th
                key={col.label}
                onClick={() => handleSort(col.label)}
                className={`px-4 py-3 text-right font-semibold whitespace-nowrap min-w-[130px] cursor-pointer select-none
                  hover:brightness-125 transition-all
                  ${col.type === 'grandTotal' ? 'bg-slate-900' : ''}
                  ${col.type === 'yearTotal' ? 'bg-slate-600' : ''}
                  ${sortCol === col.label ? 'ring-1 ring-inset ring-yellow-400' : ''}`}
              >
                {col.label}
                <SortIcon label={col.label} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, idx) => (
            <tr
              key={row.name}
              className={`border-b border-gray-100 hover:bg-blue-50 transition-colors
                ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
            >
              <td className="px-4 py-2.5 font-medium text-gray-800 sticky left-0 bg-inherit z-10">
                {row.name}
              </td>
              {visibleCols.map(col => (
                <td
                  key={col.label}
                  className={`px-4 py-2.5 text-right tabular-nums text-sm
                    ${col.type === 'month' ? 'text-gray-700' : ''}
                    ${col.type === 'yearTotal' ? 'font-semibold text-blue-700 bg-blue-50' : ''}
                    ${col.type === 'grandTotal' ? 'font-semibold text-slate-700 bg-slate-100' : ''}
                    ${sortCol === col.label ? 'bg-yellow-50/60' : ''}`}
                >
                  {fmtTL(row.values[col.label])}
                </td>
              ))}
            </tr>
          ))}

          {grandTotal && (
            <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-500">
              <td className="px-4 py-3 sticky left-0 bg-slate-800 z-10 text-sm">
                {grandTotal.name}
              </td>
              {visibleCols.map(col => (
                <td
                  key={col.label}
                  className={`px-4 py-3 text-right tabular-nums text-sm
                    ${col.type === 'grandTotal' ? 'bg-slate-900 text-yellow-300' : ''}`}
                >
                  {fmtTL(grandTotal.values[col.label])}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────────────
export default function CiroRaporuPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null); // null = en son yıl (ilk yüklemede set edilir)
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['ciro-raporu'],
    queryFn: () => getCiroRaporu().then(r => r.data),
    staleTime: 5 * 60_000,
  });

  async function handleYenile() {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const res = await getCiroRaporuForce();
      queryClient.setQueryData(['ciro-raporu'], res.data);
    } catch (err) {
      setRefreshError(err?.response?.data?.error || err.message || 'Yenileme başarısız');
    } finally {
      setIsRefreshing(false);
    }
  }

  const pivot = data?.pivot || null;

  // Mevcut yılları pivot sütunlarından çıkar
  const availableYears = pivot
    ? [...new Set(pivot.columns.filter(c => c.type === 'yearTotal' && c.year).map(c => c.year))].sort((a, b) => a - b)
    : [];

  // İlk yüklemede en son yılı seç
  const activeYear = selectedYear !== null
    ? selectedYear
    : (availableYears.length ? String(availableYears[availableYears.length - 1]) : 'all');

  // KPI — seçili yıl veya genel toplam label'ına göre hesapla
  const grandTotalRow = pivot?.categories?.find(c => c.isGrandTotal);
  const grandTotalCol = pivot?.columns?.find(c => c.type === 'grandTotal');
  const yearTotalCol = pivot?.columns?.find(c => c.type === 'yearTotal' && String(c.year) === activeYear);
  const kpiCol = (activeYear === 'all' ? grandTotalCol : (yearTotalCol || grandTotalCol));
  const toplamCiro = grandTotalRow && kpiCol ? (grandTotalRow.values[kpiCol.label] || 0) : 0;
  const dataRows = pivot?.categories?.filter(c => !c.isGrandTotal && c.name !== 'Belirtilmemiş') || [];
  const enBuyuk = dataRows.length && kpiCol
    ? dataRows.reduce((a, b) => (b.values[kpiCol.label] || 0) > (a.values[kpiCol.label] || 0) ? b : a)
    : null;

  const busy = isLoading || isRefreshing;

  return (
    <div className="p-6 space-y-5">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 rounded-xl shrink-0">
            <BarChart2 size={22} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ciro Raporu</h1>
            <p className="text-xs text-gray-500 mt-0.5">RESTAR PİVOT (SATIŞ ÖZET)</p>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5">
                Son yükleme: <span className="font-medium text-gray-600">{fmtDate(data.lastUpdated)}</span>
                {' · '}
                Dosya: <span className="font-medium text-gray-600">{fmtDate(data.fileModifiedAt)}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Yıl Filtresi */}
          {availableYears.length > 0 && (
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
              <Calendar size={15} className="text-gray-400 shrink-0" />
              <select
                value={activeYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="text-sm bg-transparent focus:outline-none text-gray-700 font-medium cursor-pointer"
              >
                <option value="all">Tüm Yıllar</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={handleYenile}
            disabled={busy}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-sm shrink-0"
          >
            <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
            {isRefreshing ? 'Excel sorguları çalışıyor…' : 'Excel\'i Yenile'}
          </button>
        </div>
      </div>

      {/* Hata */}
      {(error || refreshError) && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Hata</div>
            <div>{refreshError || error?.message}</div>
          </div>
        </div>
      )}

      {/* Yükleniyor */}
      {isLoading && (
        <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
          <RefreshCw className="animate-spin" size={20} />
          <span>Excel okunuyor…</span>
        </div>
      )}

      {pivot && (
        <>
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              title={activeYear === 'all' ? 'Genel Ciro Toplamı' : `${activeYear} Ciro Toplamı`}
              value={fmtShortTL(toplamCiro)}
              color="blue"
            />
            <KPICard
              title="Kategori Sayısı"
              value={dataRows.length}
              color="emerald"
            />
            <KPICard
              title="En Yüksek Kategori"
              value={enBuyuk?.name || '—'}
              sub={enBuyuk && grandTotalCol ? fmtShortTL(enBuyuk.values[grandTotalCol.label]) : ''}
              color="violet"
            />
          </div>

          {/* Tablo */}
          <div className="relative">
            {isRefreshing && (
              <div className="absolute inset-0 bg-white/75 rounded-xl flex items-center justify-center z-20 gap-2 text-blue-600 font-medium text-sm">
                <RefreshCw className="animate-spin" size={18} /> Excel sorguları çalıştırılıyor, lütfen bekleyin…
              </div>
            )}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-800">
                Satış Özeti
                {activeYear !== 'all' && <span className="ml-2 text-sm font-normal text-blue-600">— {activeYear}</span>}
              </h2>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <FileSpreadsheet size={12} />
                RESTAR PİVOT (SATIŞ ÖZET) sheet
              </span>
            </div>
            <PivotTable columns={pivot.columns} categories={pivot.categories} selectedYear={activeYear} />
          </div>
        </>
      )}
    </div>
  );
}
