import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWarehouseSummary, getWarehouseStock, getWarehouseKartTipleri, syncWarehouse, getWarehouseStatus, refreshWarehouseExcelAndSync, getWarehouseDetail, syncWarehouseEvira } from '../api';
import { PageHeader, Card, Button, Badge, Spinner } from '../components/UI';
import { Warehouse as WarehouseIcon, RefreshCw, Search, ChevronLeft, ChevronRight, ArrowUpDown, CheckCircle, AlertCircle, Package, X, ImageOff, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from 'lucide-react';
import MultiSelectFilter from '../components/MultiSelectFilter';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function formatTRY(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);
}

function formatNum(val) {
  if (val == null) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(val);
}

function gecenGun(sonHareket) {
  if (!sonHareket) return null;
  const d = new Date(sonHareket);
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function GunBadge({ gun }) {
  if (gun == null) return <span className="text-gray-300 text-xs">—</span>;
  const cls = gun > 365
    ? 'bg-red-100 text-red-700'
    : gun > 180
    ? 'bg-orange-100 text-orange-700'
    : gun > 90
    ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${cls}`}>{gun} gün</span>;
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

function formatCurrency(val, doviz) {
  if (val == null || val === 0) return '—';
  const num = Number(val);
  if (doviz === 'USD') return '$' + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  if (doviz === 'EUR') return '€' + new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(num);
}

function DovizBadge({ doviz }) {
  if (!doviz || doviz === 'TRY') return null;
  const cls = doviz === 'USD' ? 'text-green-600 bg-green-50' : 'text-blue-600 bg-blue-50';
  return <span className={`ml-1 text-[10px] font-semibold px-1 rounded ${cls}`}>{doviz}</span>;
}

function StokDetailModal({ row, onClose }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['warehouse-detail', row.stok_kodu],
    queryFn: () => getWarehouseDetail(row.stok_kodu).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // Çıkışlar (ciro_cache) + Transferler (EVIRA) birleşik liste
  const hareketRight = useMemo(() => {
    if (!data) return [];
    const sales = (data.cikislar || []).map(h => ({
      _type: 'sale',
      tarih: h.tarih || '',
      baslik: h.cari_adi || h.is_emri_no || '—',
      fatura: h.fatura_no,
      miktar: h.miktar,
      birim: null,
      fiyat: h.fiyat,
      tutar: h.tutar,
      doviz: h.islem_dovizi || 'TRY',
    }));
    const xfers = (data.transferler || []).map(h => ({
      _type: 'transfer',
      tarih: h.TARIH || '',
      baslik: h.PROJE_KODU || h.HEDEF_AMBAR || '—',
      fatura: h.FIS_NO,
      miktar: h.MIKTAR,
      birim: h.BIRIM,
      fiyat: null,
      tutar: null,
      doviz: null,
    }));
    return [...sales, ...xfers].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''));
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* ── HEADER ── */}
        <div className="flex items-start gap-4 p-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex-shrink-0 w-20 h-20 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
            {data?.resimBase64 ? (
              <img src={`data:${data.resimMime || 'image/jpeg'};base64,${data.resimBase64}`} alt={row.stok_adi} className="object-contain w-full h-full" />
            ) : (
              <div className="flex flex-col items-center text-gray-300 gap-1">
                <ImageOff size={22} />
                <span className="text-[9px]">Resim yok</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-gray-400 mb-0.5">{row.stok_kodu}</p>
            <h2 className="font-bold text-gray-800 text-base leading-tight">{row.stok_adi}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {row.kart_tipi && <Badge color="gray">{row.kart_tipi}</Badge>}
              {data?.aciklama2 && <span className="text-xs text-gray-500">{data.aciklama2}</span>}
            </div>
            <div className="flex gap-2 mt-2">
              {[
                { label: 'Gebze', val: row.gebze_stok, color: 'text-blue-700', bg: 'bg-blue-50' },
                { label: 'E-Ticaret', val: row.eticaret_stok, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: 'Showroom', val: row.showroom_stok, color: 'text-amber-700', bg: 'bg-amber-50' },
              ].map(d => (
                <div key={d.label} className={`rounded-lg ${d.bg} px-3 py-1 text-center min-w-[60px]`}>
                  <p className="text-[10px] text-gray-500">{d.label}</p>
                  <p className={`text-sm font-bold ${d.color}`}>{formatNum(d.val)}</p>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* ── ÖZET ŞERIT ── */}
        {data?.ozet && (
          <div className="flex items-center gap-6 px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400">Son 1 Yıl Sipariş:</span>
              <span className="font-bold text-blue-700 text-sm">{data.ozet.son_yil_siparis}</span>
              {data.ozet.son_yil_miktar > 0 && (
                <span className="text-gray-400 text-xs">({formatNum(data.ozet.son_yil_miktar)} adet)</span>
              )}
            </div>
            <div className="w-px h-4 bg-gray-300 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400">Ortalama Alım Fiyatı:</span>
              <span className="font-bold text-emerald-700 text-sm">
                {data.ozet.ort_fiyat_tl > 0 ? `≈${formatTRY(data.ozet.ort_fiyat_tl)}` : '—'}
              </span>
            </div>
            <div className="w-px h-4 bg-gray-300 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-400">Toplam Sipariş:</span>
              <span className="font-bold text-gray-800 text-sm">{data.ozet.toplam_siparis}</span>
            </div>
          </div>
        )}

        {/* ── YÜKLENİYOR / HATA ── */}
        {isLoading && <div className="flex justify-center py-10 flex-shrink-0"><Spinner /></div>}
        {isError && <p className="text-center text-red-500 text-sm py-6 flex-shrink-0">Sunucuya bağlanılamadı.</p>}
        {data?.errors?.filter(e => !e.startsWith('aciklama2') && !e.startsWith('resim')).length > 0 && (
          <div className="mx-4 mt-2 flex-shrink-0 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-700">
            {data.errors.filter(e => !e.startsWith('aciklama2') && !e.startsWith('resim')).map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}

        {/* ── İKİ KOLON ── */}
        {data && (
          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* SOL: Alım Siparişleri */}
            <div className="flex-1 flex flex-col min-h-0 border-r border-gray-100">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-100 flex-shrink-0">
                <ArrowDownCircle size={14} className="text-emerald-600" />
                <span className="font-semibold text-emerald-800 text-xs">ALİM SİPARİŞLERİ</span>
                <span className="ml-auto text-[11px] text-emerald-600">{data.alimlar?.length || 0} kayıt</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {!data.alimlar?.length ? (
                  <p className="text-center text-gray-400 text-xs py-8 italic">Sipariş kaydı bulunamadı.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                      <tr className="border-b border-gray-200 text-gray-400">
                        <th className="text-left py-2 px-3 font-medium">Tarih</th>
                        <th className="text-left py-2 px-3 font-medium">Tedarikçi</th>
                        <th className="text-right py-2 px-3 font-medium">Mik / Teslim</th>
                        <th className="text-right py-2 px-3 font-medium">Birim Fiyat</th>
                        <th className="text-right py-2 px-3 font-medium">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.alimlar.map((a, i) => (
                        <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{a.TARIH}</td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-[120px] truncate" title={a.CARI_UNVANI}>{a.CARI_UNVANI || '—'}</td>
                          <td className="py-1.5 px-3 text-right">
                            <span className="font-medium text-gray-800">{formatNum(a.MIKTAR)}</span>
                            {a.TALINAN > 0 && <span className="text-gray-400 ml-1 text-[10px]">/{formatNum(a.TALINAN)}</span>}
                          </td>
                          <td className="py-1.5 px-3 text-right font-medium text-gray-700 whitespace-nowrap">
                            {formatCurrency(a.FIYAT, a.DOVIZ)}
                            <DovizBadge doviz={a.DOVIZ} />
                          </td>
                          <td className="py-1.5 px-3 text-right font-semibold text-gray-800 whitespace-nowrap">
                            {formatCurrency(a.TUTAR, a.DOVIZ)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* SAĞ: Çıkışlar + Transferler */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border-b border-orange-100 flex-shrink-0">
                <ArrowUpCircle size={14} className="text-orange-600" />
                <span className="font-semibold text-orange-800 text-xs">ÇIKIŞLAR & TRANSFERLER</span>
                <span className="ml-auto text-[11px] text-orange-600">{hareketRight.length} kayıt</span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {!hareketRight.length ? (
                  <p className="text-center text-gray-400 text-xs py-8 italic">Hareket kaydı bulunamadı.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                      <tr className="border-b border-gray-200 text-gray-400">
                        <th className="text-left py-2 px-3 font-medium">Tarih</th>
                        <th className="text-left py-2 px-2 font-medium">Tür</th>
                        <th className="text-left py-2 px-3 font-medium">Proje / Firma</th>
                        <th className="text-right py-2 px-3 font-medium">Miktar</th>
                        <th className="text-right py-2 px-3 font-medium">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hareketRight.map((h, i) => (
                        <tr key={i} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/50'}`}>
                          <td className="py-1.5 px-3 text-gray-500 whitespace-nowrap">{h.tarih}</td>
                          <td className="py-1.5 px-2">
                            {h._type === 'transfer' ? (
                              <span className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 font-medium" style={{ fontSize: 10 }}>
                                <ArrowLeftRight size={9} />TRF
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 bg-orange-100 text-orange-700 rounded px-1.5 py-0.5 font-medium" style={{ fontSize: 10 }}>
                                <ArrowUpCircle size={9} />ÇKŞ
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700 max-w-[130px] truncate" title={h.baslik}>{h.baslik}</td>
                          <td className="py-1.5 px-3 text-right font-medium text-gray-800 whitespace-nowrap">
                            {formatNum(h.miktar)}{h.birim ? <span className="text-gray-400 font-normal ml-0.5">{h.birim}</span> : null}
                          </td>
                          <td className="py-1.5 px-3 text-right whitespace-nowrap">
                            {h.tutar ? (
                              <span className="font-semibold text-gray-700">
                                {formatCurrency(h.tutar, h.doviz)}
                                <DovizBadge doviz={h.doviz} />
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default function DepoPage() {
  const qc = useQueryClient();
  const [selectedDepolar, setSelectedDepolar] = useState(['gebze', 'eticaret', 'showroom']);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [kartTipiFilter, setKartTipiFilter] = useState([]);
  const [depoFilter, setDepoFilter] = useState('');
  const [page, setPage] = useState(1);
  const [sortCol, setSortCol] = useState('stok_kodu');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedRow, setSelectedRow] = useState(null);
  const limit = 50;

  // Queries
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['warehouse-summary'],
    queryFn: () => getWarehouseSummary().then(r => r.data)
  });

  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ['warehouse-stock', search, kartTipiFilter.join(','), depoFilter, page, sortCol, sortDir],
    queryFn: () => getWarehouseStock({
      search: search || undefined,
      kart_tipi: kartTipiFilter.length > 0 ? kartTipiFilter.join(',') : undefined,
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

  const eviraRefreshMut = useMutation({
    mutationFn: syncWarehouseEvira,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse-stock'] })
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
    if (kartTipiFilter.length === 0) return summary.totals;
    const matches = summary.byType?.filter(t => kartTipiFilter.includes(t.kart_tipi)) || [];
    if (matches.length === 0) return summary.totals;
    return matches.reduce((acc, t) => ({
      urun_sayisi: (acc.urun_sayisi || 0) + (t.urun_sayisi || 0),
      gebze_adet: (acc.gebze_adet || 0) + (t.gebze_adet || 0),
      eticaret_adet: (acc.eticaret_adet || 0) + (t.eticaret_adet || 0),
      showroom_adet: (acc.showroom_adet || 0) + (t.showroom_adet || 0),
      gebze_tutar: (acc.gebze_tutar || 0) + (t.gebze_tutar || 0),
      eticaret_tutar: (acc.eticaret_tutar || 0) + (t.eticaret_tutar || 0),
      showroom_tutar: (acc.showroom_tutar || 0) + (t.showroom_tutar || 0),
      toplam_tutar: (acc.toplam_tutar || 0) + (t.toplam_tutar || 0),
      toplam_adet: (acc.toplam_adet || 0) + (t.gebze_adet || 0) + (t.eticaret_adet || 0) + (t.showroom_adet || 0),
    }), {});
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
              onClick={() => eviraRefreshMut.mutate()}
              disabled={eviraRefreshMut.isPending}
              className="bg-violet-600 hover:bg-violet-700"
              title="Açıklama 2, son hareket tarihi ve yeri EVIRA'dan çekilir"
            >
              <RefreshCw size={16} className={eviraRefreshMut.isPending ? 'animate-spin' : ''} />
              {eviraRefreshMut.isPending ? 'EVIRA çekiliyor…' : 'EVIRA Yenile'}
            </Button>
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
      {eviraRefreshMut.isSuccess && (
        <div className="mb-4 bg-violet-50 border border-violet-200 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle size={18} className="text-violet-500" />
          <span className="text-sm text-violet-700">{eviraRefreshMut.data?.data?.message}</span>
        </div>
      )}
      {eviraRefreshMut.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
          <AlertCircle size={18} className="text-red-500" />
          <span className="text-sm text-red-700">{eviraRefreshMut.error?.response?.data?.error || 'Hata oluştu'}</span>
        </div>
      )}
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
          <MultiSelectFilter
            label="Kart Tipi:"
            options={kartTipleri}
            value={kartTipiFilter}
            onChange={v => { setKartTipiFilter(v); setPage(1); }}
          />

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
                <p className="text-xs font-medium text-gray-500 mb-1">{kartTipiFilter.length > 0 ? 'Filtre Toplam Maliyet' : 'Genel Toplam Maliyet'}</p>
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
                    const isSelected = kartTipiFilter.includes(t.kart_tipi);
                    return (
                      <tr key={t.kart_tipi} className={`border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : i % 2 === 0 ? '' : 'bg-gray-50/50'}`}
                        onClick={() => { setKartTipiFilter(isSelected ? kartTipiFilter.filter(x => x !== t.kart_tipi) : [...kartTipiFilter, t.kart_tipi]); setPage(1); }}
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
                      value={searchInput}
                      onChange={e => setSearchInput(e.target.value)}
                    />
                  </div>
                </div>
                <MultiSelectFilter
                  options={kartTipleri}
                  value={kartTipiFilter}
                  onChange={v => { setKartTipiFilter(v); setPage(1); }}
                />
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
                          { key: 'aciklama2', label: 'Açıklama 2', align: 'left' },
                          { key: 'kart_tipi', label: 'Tip', align: 'left' },
                          { key: 'son_hareket', label: 'Son Hareket', align: 'left' },
                          { key: 'son_hareket_yer', label: 'Son Yer', align: 'left' },
                          { key: 'gecen_gun', label: 'Geçen Gün', align: 'right', sortKey: 'son_hareket' },
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
                            onClick={() => handleSort(col.sortKey || col.key)}
                          >
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              {sortCol === (col.sortKey || col.key) && <ArrowUpDown size={12} className="text-blue-500" />}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stockData?.rows?.map((row, i) => {
                        const toplamStok = row.gebze_stok + row.eticaret_stok + row.showroom_stok;
                        return (
                          <tr
                            key={row.id}
                            className={`border-b border-gray-100 cursor-pointer ${toplamStok === 0 ? 'opacity-40' : ''} ${i % 2 === 0 ? '' : 'bg-gray-50/50'} hover:bg-blue-50`}
                            onClick={() => setSelectedRow(row)}
                          >
                            <td className="py-2 px-3 font-mono text-xs text-gray-500">{row.stok_kodu}</td>
                            <td className="py-2 px-3 text-gray-800 max-w-[200px] truncate" title={row.stok_adi}>{row.stok_adi}</td>
                            <td className="py-2 px-3 text-gray-500 max-w-[180px] truncate text-xs" title={row.aciklama2 || ''}>{row.aciklama2 || <span className="text-gray-300">—</span>}</td>
                            <td className="py-2 px-3"><Badge color="gray">{row.kart_tipi}</Badge></td>
                            <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">
                              {row.son_hareket ? row.son_hareket : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="py-2 px-3 text-xs whitespace-nowrap">
                              {row.son_hareket_yer
                                ? <span className={`font-medium ${/^[A-Z]{2}\d/.test(row.son_hareket_yer) ? 'text-indigo-600' : 'text-gray-600'}`}>{row.son_hareket_yer}</span>
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <GunBadge gun={gecenGun(row.son_hareket)} />
                            </td>
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
                        <tr><td colSpan={12} className="py-8 text-center text-gray-400">Sonuç bulunamadı</td></tr>
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

      {selectedRow && <StokDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />}
    </div>
  );
}
