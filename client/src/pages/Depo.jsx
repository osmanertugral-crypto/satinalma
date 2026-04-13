import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWarehouseSummary, getWarehouseStock, getWarehouseKartTipleri, syncWarehouse, getWarehouseStatus, refreshWarehouseExcelAndSync } from '../api';
import { PageHeader, Card, Button, Badge, Spinner } from '../components/UI';
import { Warehouse as WarehouseIcon, RefreshCw, Search, ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle, AlertCircle, Clock, Package, X, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function formatTRY(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);
}

function formatNum(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(val);
}

const DEPO_COLORS = {
  gebze: '#1E40AF',
  eticaret: '#059669',
  showroom: '#D97706',
};

const DEPO_LABELS = {
  gebze: 'Gebze Depo',
  eticaret: 'E-Ticaret Depo',
  showroom: 'Showroom',
};

const TYPE_COLORS = ['#1F4E79', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0891B2'];

export default function DepoPage() {
  const qc = useQueryClient();
  const [selectedDepolar, setSelectedDepolar] = useState(['gebze', 'eticaret', 'showroom']);
  const [search, setSearch] = useState('');
  const [kartTipiFilter, setKartTipiFilter] = useState('');
  const [depoFilter, setDepoFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('stok_kodu');
  const [sortDir, setSortDir] = useState('asc');
  const limit = 50;

  // Queries
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['warehouse-summary'],
    queryFn: () => getWarehouseSummary().then(r => r.data)
  });

  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['warehouse-stock', search, kartTipiFilter, depoFilter, page, sortCol, sortDir],
    queryFn: () => getWarehouseStock({
      search: search || undefined,
      kart_tipi: kartTipiFilter || undefined,
      depo: depoFilter || undefined,
      page, limit, sort: sortCol, order: sortDir
    }).then(r => r.data),
    keepPreviousData: true
  });

  const { data: kartTipleri = [] } = useQuery({
    queryKey: ['warehouse-kart-tipleri'],
    queryFn: () => getWarehouseKartTipleri().then(r => r.data)
  });

  const { data: status } = useQuery({
    queryKey: ['warehouse-status'],
    queryFn: () => getWarehouseStatus().then(r => r.data)
  });

  const syncMut = useMutation({
    mutationFn: syncWarehouse,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse-summary'] });
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] });
      qc.invalidateQueries({ queryKey: ['warehouse-status'] });
      qc.invalidateQueries({ queryKey: ['warehouse-kart-tipleri'] });
    }
  });

  const sqlRefreshMut = useMutation({
    mutationFn: refreshWarehouseExcelAndSync,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse-summary'] });
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] });
      qc.invalidateQueries({ queryKey: ['warehouse-status'] });
      qc.invalidateQueries({ queryKey: ['warehouse-kart-tipleri'] });
    }
  });

  // Depo seçim toggle
  function toggleDepo(d) {
    setSelectedDepolar(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    );
  }

  // Kart tipi filtresine göre toplamlar
  const filteredTotals = useMemo(() => {
    if (!summary?.totals) return null;
    if (!kartTipiFilter) return summary.totals;
    const match = summary.byType?.find(t => t.kart_tipi === kartTipiFilter);
    if (!match) return summary.totals;
    return {
      urun_sayisi: match.urun_sayisi,
      gebze_adet: match.gebze_adet,
      eticaret_adet: match.eticaret_adet,
      showroom_adet: match.showroom_adet,
      gebze_tutar: match.gebze_tutar,
      eticaret_tutar: match.eticaret_tutar,
      showroom_tutar: match.showroom_tutar,
      toplam_tutar: match.toplam_tutar,
      toplam_adet: (match.gebze_adet || 0) + (match.eticaret_adet || 0) + (match.showroom_adet || 0),
    };
  }, [summary, kartTipiFilter]);

  // Seçili depolara göre hesaplanan toplamlar
  const computedTotals = useMemo(() => {
    if (!filteredTotals) return null;
    const t = filteredTotals;
    let adet = 0, tutar = 0;
    if (selectedDepolar.includes('gebze')) { adet += t.gebze_adet; tutar += t.gebze_tutar; }
    if (selectedDepolar.includes('eticaret')) { adet += t.eticaret_adet; tutar += t.eticaret_tutar; }
    if (selectedDepolar.includes('showroom')) { adet += t.showroom_adet; tutar += t.showroom_tutar; }
    return { adet, tutar };
  }, [filteredTotals, selectedDepolar]);

  // Kart tipi chart data
  const typeChartData = useMemo(() => {
    if (!summary?.byType) return [];
    return summary.byType.map(t => {
      let tutar = 0;
      if (selectedDepolar.includes('gebze')) tutar += t.gebze_tutar;
      if (selectedDepolar.includes('eticaret')) tutar += t.eticaret_tutar;
      if (selectedDepolar.includes('showroom')) tutar += t.showroom_tutar;
      return { name: t.kart_tipi || 'Belirsiz', tutar, urun: t.urun_sayisi };
    }).filter(t => t.tutar > 0);
  }, [summary, selectedDepolar]);

  // Depo dağılım pie data
  const depoPieData = useMemo(() => {
    if (!summary?.totals) return [];
    const t = summary.totals;
    return [
      { name: 'Gebze', value: t.gebze_tutar, color: DEPO_COLORS.gebze },
      { name: 'E-Ticaret', value: t.eticaret_tutar, color: DEPO_COLORS.eticaret },
      { name: 'Showroom', value: t.showroom_tutar, color: DEPO_COLORS.showroom },
    ].filter(d => d.value > 0);
  }, [summary]);

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  }

  const totalPages = stockData ? Math.ceil(stockData.total / limit) : 0;

  return (
    <div className="p-6">
      <PageHeader
        title="Depo Stok"
        subtitle={summary?.lastSync ? `Son güncelleme: ${new Date(summary.lastSync).toLocaleString('tr-TR')}` : 'Henüz senkronize edilmedi'}
        action={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => sqlRefreshMut.mutate()}
              disabled={sqlRefreshMut.isPending || syncMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <RefreshCw size={16} className={sqlRefreshMut.isPending ? 'animate-spin' : ''} />
              {sqlRefreshMut.isPending ? 'SQL sorgulanıyor…' : "SQL'den Yenile"}
            </Button>
            <Button
              onClick={() => syncMut.mutate()}
              disabled={syncMut.isPending || sqlRefreshMut.isPending}
            >
              <RefreshCw size={16} className={syncMut.isPending ? 'animate-spin' : ''} />
              {syncMut.isPending ? 'Aktarılıyor...' : "Excel'den Aktar"}
            </Button>
          </div>
        }
      />

      {/* Sync sonucu */}
      {(syncMut.isSuccess || sqlRefreshMut.isSuccess) && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle size={18} className="text-emerald-500" />
          <span className="text-sm text-emerald-700">{(sqlRefreshMut.data || syncMut.data)?.data?.message}</span>
        </div>
      )}
      {(syncMut.isError || sqlRefreshMut.isError) && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-500" />
          <span className="text-sm text-red-700">{(sqlRefreshMut.error || syncMut.error)?.response?.data?.error || 'Hata oluştu'}</span>
        </div>
      )}

      {summaryLoading ? <Spinner /> : summary?.totals ? (
        <div className="space-y-6">
          {/* ── KART TİPİ FİLTRESİ ── */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-500" />
              <span className="text-sm font-medium text-gray-600">Kart Tipi:</span>
            </div>
            <button
              onClick={() => { setKartTipiFilter(''); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                !kartTipiFilter
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Tümü
            </button>
            {kartTipleri.map(t => (
              <button
                key={t}
                onClick={() => { setKartTipiFilter(kartTipiFilter === t ? '' : t); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  kartTipiFilter === t
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
            {kartTipiFilter && (
              <button
                onClick={() => { setKartTipiFilter(''); setPage(1); }}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded-full transition-all"
                title="Filtreyi temizle"
              >
                <X size={14} />
                Temizle
              </button>
            )}
          </div>

          {/* ── DEPO SEÇİM KARTLARI ── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['gebze', 'eticaret', 'showroom'].map(d => {
              const t = filteredTotals;
              const adet = d === 'gebze' ? t.gebze_adet : d === 'eticaret' ? t.eticaret_adet : t.showroom_adet;
              const tutar = d === 'gebze' ? t.gebze_tutar : d === 'eticaret' ? t.eticaret_tutar : t.showroom_tutar;
              const active = selectedDepolar.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleDepo(d)}
                  className={`text-left rounded-xl p-5 border-2 transition-all ${
                    active
                      ? 'border-blue-500 bg-white shadow-md ring-2 ring-blue-100'
                      : 'border-gray-200 bg-gray-50 opacity-60 hover:opacity-80'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg" style={{ backgroundColor: DEPO_COLORS[d] + '20' }}>
                      <WarehouseIcon size={20} style={{ color: DEPO_COLORS[d] }} />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{DEPO_LABELS[d]}</p>
                      <p className="text-xs text-gray-400">{active ? 'Seçili' : 'Tıkla seç'}</p>
                    </div>
                    <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      active ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {active && <CheckCircle size={14} className="text-white" />}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Stok Adet</p>
                      <p className="text-lg font-bold text-gray-800">{formatNum(adet)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Maliyet</p>
                      <p className="text-lg font-bold" style={{ color: DEPO_COLORS[d] }}>{formatTRY(tutar)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── SEÇİLİ TOPLAM ÖZET ── */}
          {computedTotals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Toplam Ürün</p>
                <p className="text-2xl font-bold text-gray-800">{formatNum(filteredTotals.urun_sayisi)}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Seçili Toplam Adet</p>
                <p className="text-2xl font-bold text-blue-700">{formatNum(computedTotals.adet)}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">Seçili Toplam Maliyet</p>
                <p className="text-2xl font-bold text-emerald-700">{formatTRY(computedTotals.tutar)}</p>
              </Card>
              <Card className="p-4 text-center">
                <p className="text-xs font-medium text-gray-500 mb-1">{kartTipiFilter ? 'Filtre Toplam Maliyet' : 'Genel Toplam Maliyet'}</p>
                <p className="text-2xl font-bold text-gray-800">{formatTRY(filteredTotals.toplam_tutar)}</p>
              </Card>
            </div>
          )}

          {/* ── GRAFİKLER ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kart tipi bar chart */}
            <Card className="p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Kart Tipi Bazlı Maliyet</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={typeChartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => formatTRY(v)} />
                  <Bar dataKey="tutar" name="Maliyet" radius={[4, 4, 0, 0]}>
                    {typeChartData.map((_, idx) => (
                      <Cell key={idx} fill={TYPE_COLORS[idx % TYPE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Depo dağılım pie */}
            <Card className="p-4">
              <h3 className="font-semibold text-gray-700 mb-4">Depo Maliyet Dağılımı</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={depoPieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={110} label={({ name, percent }) => `${name} %${(percent * 100).toFixed(0)}`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {depoPieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={val => formatTRY(val)} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* ── KART TİPİ BAZLI TABLO ── */}
          <Card className="p-4">
            <h3 className="font-semibold text-gray-700 mb-4">Kart Tipi Bazlı Stok Özeti</h3>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-2.5 px-3 font-medium text-gray-500">Kart Tipi</th>
                    <th className="text-right py-2.5 px-3 font-medium text-gray-500">Ürün</th>
                    {selectedDepolar.includes('gebze') && <>
                      <th className="text-right py-2.5 px-3 font-medium text-blue-600">Gebze Adet</th>
                      <th className="text-right py-2.5 px-3 font-medium text-blue-600">Gebze Tutar</th>
                    </>}
                    {selectedDepolar.includes('eticaret') && <>
                      <th className="text-right py-2.5 px-3 font-medium text-emerald-600">E-Tic. Adet</th>
                      <th className="text-right py-2.5 px-3 font-medium text-emerald-600">E-Tic. Tutar</th>
                    </>}
                    {selectedDepolar.includes('showroom') && <>
                      <th className="text-right py-2.5 px-3 font-medium text-amber-600">Show. Adet</th>
                      <th className="text-right py-2.5 px-3 font-medium text-amber-600">Show. Tutar</th>
                    </>}
                    <th className="text-right py-2.5 px-3 font-bold text-gray-700">Toplam</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byType.map((t, i) => {
                    let toplam = 0;
                    if (selectedDepolar.includes('gebze')) toplam += t.gebze_tutar;
                    if (selectedDepolar.includes('eticaret')) toplam += t.eticaret_tutar;
                    if (selectedDepolar.includes('showroom')) toplam += t.showroom_tutar;
                    const isSelected = kartTipiFilter === t.kart_tipi;
                    return (
                      <tr key={t.kart_tipi} className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                        onClick={() => { setKartTipiFilter(isSelected ? '' : t.kart_tipi); setPage(1); }}
                      >
                        <td className="py-2 px-3 font-medium text-gray-800">{t.kart_tipi || 'Belirsiz'}</td>
                        <td className="py-2 px-3 text-right text-gray-600">{formatNum(t.urun_sayisi)}</td>
                        {selectedDepolar.includes('gebze') && <>
                          <td className="py-2 px-3 text-right text-gray-600">{formatNum(t.gebze_adet)}</td>
                          <td className="py-2 px-3 text-right text-blue-700">{formatTRY(t.gebze_tutar)}</td>
                        </>}
                        {selectedDepolar.includes('eticaret') && <>
                          <td className="py-2 px-3 text-right text-gray-600">{formatNum(t.eticaret_adet)}</td>
                          <td className="py-2 px-3 text-right text-emerald-700">{formatTRY(t.eticaret_tutar)}</td>
                        </>}
                        {selectedDepolar.includes('showroom') && <>
                          <td className="py-2 px-3 text-right text-gray-600">{formatNum(t.showroom_adet)}</td>
                          <td className="py-2 px-3 text-right text-amber-700">{formatTRY(t.showroom_tutar)}</td>
                        </>}
                        <td className="py-2 px-3 text-right font-bold text-gray-800">{formatTRY(toplam)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-blue-50">
                    <td className="py-2.5 px-3 font-bold text-gray-800">TOPLAM</td>
                    <td className="py-2.5 px-3 text-right font-bold">{formatNum(filteredTotals.urun_sayisi)}</td>
                    {selectedDepolar.includes('gebze') && <>
                      <td className="py-2.5 px-3 text-right font-bold">{formatNum(filteredTotals.gebze_adet)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-blue-800">{formatTRY(filteredTotals.gebze_tutar)}</td>
                    </>}
                    {selectedDepolar.includes('eticaret') && <>
                      <td className="py-2.5 px-3 text-right font-bold">{formatNum(filteredTotals.eticaret_adet)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-800">{formatTRY(filteredTotals.eticaret_tutar)}</td>
                    </>}
                    {selectedDepolar.includes('showroom') && <>
                      <td className="py-2.5 px-3 text-right font-bold">{formatNum(filteredTotals.showroom_adet)}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-amber-800">{formatTRY(filteredTotals.showroom_tutar)}</td>
                    </>}
                    <td className="py-2.5 px-3 text-right font-bold text-blue-800">{formatTRY(computedTotals?.tutar)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* ── DETAYLI ÜRÜN LİSTESİ ── */}
          <Card>
            <div className="p-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-700 mb-3">Ürün Detay Listesi</h3>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Stok kodu veya adı ara..."
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                  </div>
                </div>
                <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={kartTipiFilter} onChange={e => { setKartTipiFilter(e.target.value); setPage(1); }}
                >
                  <option value="">Tüm Kart Tipleri</option>
                  {kartTipleri.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={depoFilter} onChange={e => { setDepoFilter(e.target.value); setPage(1); }}
                >
                  <option value="">Tüm Depolar</option>
                  <option value="gebze">Gebze Stok {'>'} 0</option>
                  <option value="eticaret">E-Ticaret Stok {'>'} 0</option>
                  <option value="showroom">Showroom Stok {'>'} 0</option>
                </select>
                <span className="text-sm text-gray-400">{stockData?.total || 0} sonuç</span>
              </div>
            </div>

            {stockLoading ? <div className="p-8"><Spinner /></div> : (
              <>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {[
                          { key: 'stok_kodu', label: 'Stok Kodu', align: 'left' },
                          { key: 'stok_adi', label: 'Stok Adı', align: 'left' },
                          { key: 'kart_tipi', label: 'Tip', align: 'left' },
                          { key: 'gebze_stok', label: 'Gebze', align: 'right', color: 'text-blue-600' },
                          { key: 'eticaret_stok', label: 'E-Ticaret', align: 'right', color: 'text-emerald-600' },
                          { key: 'showroom_stok', label: 'Showroom', align: 'right', color: 'text-amber-600' },
                          { key: 'birim_fiyat', label: 'Birim Fiyat', align: 'right' },
                          { key: 'gebze_tutar', label: 'Gebze ₺', align: 'right', color: 'text-blue-600' },
                          { key: 'eticaret_tutar', label: 'E-Tic. ₺', align: 'right', color: 'text-emerald-600' },
                          { key: 'showroom_tutar', label: 'Show. ₺', align: 'right', color: 'text-amber-600' },
                        ].map(col => (
                          <th
                            key={col.key}
                            className={`${col.align === 'right' ? 'text-right' : 'text-left'} py-2.5 px-3 font-medium cursor-pointer hover:bg-gray-100 ${col.color || 'text-gray-500'}`}
                            onClick={() => handleSort(col.key)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              {sortCol === col.key && <ArrowUpDown size={12} className="text-blue-500" />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stockData?.rows?.map((row, i) => {
                        const toplamStok = row.gebze_stok + row.eticaret_stok + row.showroom_stok;
                        return (
                          <tr key={row.id} className={`border-b border-gray-100 ${toplamStok === 0 ? 'opacity-40' : ''} ${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50`}>
                            <td className="py-2 px-3 font-mono text-xs text-gray-500">{row.stok_kodu}</td>
                            <td className="py-2 px-3 text-gray-800 max-w-[220px] truncate" title={row.stok_adi}>{row.stok_adi}</td>
                            <td className="py-2 px-3"><Badge color="gray">{row.kart_tipi}</Badge></td>
                            <td className="py-2 px-3 text-right font-medium text-blue-700">{row.gebze_stok > 0 ? formatNum(row.gebze_stok) : '—'}</td>
                            <td className="py-2 px-3 text-right font-medium text-emerald-700">{row.eticaret_stok > 0 ? formatNum(row.eticaret_stok) : '—'}</td>
                            <td className="py-2 px-3 text-right font-medium text-amber-700">{row.showroom_stok > 0 ? formatNum(row.showroom_stok) : '—'}</td>
                            <td className="py-2 px-3 text-right text-gray-600">{formatTRY(row.birim_fiyat)}</td>
                            <td className="py-2 px-3 text-right text-blue-700">{row.gebze_tutar > 0 ? formatTRY(row.gebze_tutar) : '—'}</td>
                            <td className="py-2 px-3 text-right text-emerald-700">{row.eticaret_tutar > 0 ? formatTRY(row.eticaret_tutar) : '—'}</td>
                            <td className="py-2 px-3 text-right text-amber-700">{row.showroom_tutar > 0 ? formatTRY(row.showroom_tutar) : '—'}</td>
                          </tr>
                        );
                      })}
                      {(!stockData?.rows || stockData.rows.length === 0) && (
                        <tr><td colSpan={10} className="py-8 text-center text-gray-400">Sonuç bulunamadı</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Sayfalama */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-4 border-t border-gray-100">
                    <span className="text-sm text-gray-500">
                      Sayfa {page}/{totalPages} — Toplam {stockData.total} ürün
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      ) : (
        <Card className="p-10 text-center">
          <Package size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium mb-2">Henüz depo verisi yok</p>
          <p className="text-sm text-gray-400 mb-4">Excel dosyasını senkronize etmek için yukarıdaki "Excel'den Yenile" butonuna tıklayın.</p>
          <Button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}>
            <RefreshCw size={16} className={syncMut.isPending ? 'animate-spin' : ''} />
            {syncMut.isPending ? 'Yenileniyor...' : 'Şimdi Senkronize Et'}
          </Button>
        </Card>
      )}
    </div>
  );
}
