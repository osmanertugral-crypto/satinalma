import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCiroDashboard, getCiroRaporu } from '../api';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  LineChart, Line, ComposedChart,
} from 'recharts';
import {
  RefreshCw, TrendingUp, BarChart2, Users, Package,
  ChevronDown, ChevronUp, ChevronsUpDown, Calendar, Layers,
  AlertTriangle, Clock,
} from 'lucide-react';

const AY_ADI = ['', 'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const AY_TAM = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const RESTAR_COLOR = '#3b82f6';
const RETECH_COLOR = '#10b981';
const PIE_COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function fmtTL(v, short = false) {
  if (!v && v !== 0) return '—';
  if (short) {
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B ₺';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M ₺';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K ₺';
    return v.toFixed(0) + ' ₺';
  }
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' ₺';
}
function fmtEUR(v, short = false) {
  if (!v && v !== 0) return '—';
  if (short) {
    const abs = Math.abs(v);
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M €';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K €';
    return v.toFixed(0) + ' €';
  }
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + ' €';
}
function fmtDate(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return isoStr; }
}

// ── KPI Kartı ─────────────────────────────────────────────────────────────────
function KPI({ title, value, sub, icon: Icon, gradient }) {
  return (
    <div className={`rounded-2xl p-5 text-white shadow-lg bg-gradient-to-br ${gradient}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-70">{title}</span>
        {Icon && <Icon size={18} className="opacity-40" />}
      </div>
      <div className="text-2xl font-extrabold leading-tight">{value}</div>
      {sub && <div className="text-[11px] mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ChartTT({ active, payload, label, euro }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs min-w-[160px]">
      <div className="font-bold text-gray-700 mb-2 border-b pb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-3 mb-0.5">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-bold text-gray-800">{euro ? fmtEUR(p.value, true) : fmtTL(p.value, true)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Yıl Karşılaştırma çizelgesi ─────────────────────────────────────────────
function YilKarsilastirmaChart({ monthlyTotals, firma, selectedYears }) {
  const data = useMemo(() => {
    const byMonth = {};
    for (let m = 1; m <= 12; m++) byMonth[m] = { ay: AY_ADI[m] };
    (monthlyTotals || []).filter(r => r.firma === firma && selectedYears.includes(r.yil)).forEach(r => {
      if (!byMonth[r.ay]) byMonth[r.ay] = { ay: AY_ADI[r.ay] };
      byMonth[r.ay][String(r.yil)] = r.toplam_tl;
    });
    return Array.from({ length: 12 }, (_, i) => byMonth[i + 1]);
  }, [monthlyTotals, firma, selectedYears]);

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="ay" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => fmtTL(v, true)} tick={{ fontSize: 10 }} width={60} />
        <Tooltip content={<ChartTT />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {selectedYears.map((y, i) => (
          <Line key={y} type="monotone" dataKey={String(y)} name={String(y)}
            stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── RESTAR vs RETECH bar chart ──────────────────────────────────────────────
function FirmaKarsilastirmaChart({ monthlyTotals, yil }) {
  const data = useMemo(() => {
    const byMonth = {};
    for (let m = 1; m <= 12; m++) byMonth[m] = { ay: AY_ADI[m], RESTAR: 0, RETECH: 0 };
    (monthlyTotals || []).filter(r => r.yil === yil).forEach(r => {
      if (byMonth[r.ay]) byMonth[r.ay][r.firma] = r.toplam_tl;
    });
    return Array.from({ length: 12 }, (_, i) => byMonth[i + 1]).filter(d => d.RESTAR > 0 || d.RETECH > 0);
  }, [monthlyTotals, yil]);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="ay" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => fmtTL(v, true)} tick={{ fontSize: 10 }} width={60} />
        <Tooltip content={<ChartTT />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="RESTAR" fill={RESTAR_COLOR} radius={[3, 3, 0, 0]} />
        <Bar dataKey="RETECH" fill={RETECH_COLOR} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Kategori Pie chart ───────────────────────────────────────────────────────
function KategoriChart({ kategoriler, firma, yil }) {
  const data = useMemo(() => {
    return (kategoriler || [])
      .filter(r => r.firma === firma && r.yil === yil && r.toplam > 0)
      .sort((a, b) => b.toplam - a.toplam)
      .slice(0, 8)
      .map(r => ({ name: r.tur || 'Diğer', value: r.toplam }));
  }, [kategoriler, firma, yil]);

  if (!data.length) return <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Veri yok</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
          dataKey="value" nameKey="name" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={v => fmtTL(v, true)} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Yıllık Alan Grafiği ──────────────────────────────────────────────────────
function YillikTrendChart({ yilToplam, firma }) {
  const data = useMemo(() =>
    (yilToplam || []).filter(r => r.firma === firma).map(r => ({
      yil: String(r.yil), TL: r.toplam_tl, EUR: r.toplam_eur,
    })), [yilToplam, firma]);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <ComposedChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="yil" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="tl" tickFormatter={v => fmtTL(v, true)} tick={{ fontSize: 10 }} width={64} />
        <YAxis yAxisId="eur" orientation="right" tickFormatter={v => fmtEUR(v, true)} tick={{ fontSize: 10 }} width={52} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          return (
            <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-xs">
              <div className="font-bold text-gray-700 mb-1">{label}</div>
              {payload.map((p, i) => (
                <div key={i} className="flex justify-between gap-3">
                  <span style={{ color: p.color }}>{p.name}</span>
                  <span className="font-bold">{p.name === 'EUR' ? fmtEUR(p.value, true) : fmtTL(p.value, true)}</span>
                </div>
              ))}
            </div>
          );
        }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="tl" dataKey="TL" fill={firma === 'RESTAR' ? RESTAR_COLOR : RETECH_COLOR} radius={[3, 3, 0, 0]} opacity={0.85} name="TL Ciro" />
        <Line yAxisId="eur" type="monotone" dataKey="EUR" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} name="EUR Ciro" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Top Cariler tablosu ──────────────────────────────────────────────────────
function TopCarilerTable({ topCariler, firma, maxYil }) {
  const [sort, setSort] = useState('toplam');
  const [dir, setDir] = useState('desc');
  const rows = useMemo(() => {
    const f = (topCariler || []).filter(r => r.firma === firma);
    return [...f].sort((a, b) => dir === 'desc' ? b[sort] - a[sort] : a[sort] - b[sort]).slice(0, 15);
  }, [topCariler, firma, sort, dir]);

  function toggle(col) {
    if (sort === col) setDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSort(col); setDir('desc'); }
  }
  function SortIco({ col }) {
    if (sort !== col) return <ChevronsUpDown size={11} className="opacity-30 inline ml-1" />;
    return dir === 'desc' ? <ChevronDown size={11} className="inline ml-1 text-blue-400" /> : <ChevronUp size={11} className="inline ml-1 text-blue-400" />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="p-3 text-left text-[11px] font-semibold text-gray-400 uppercase w-8">#</th>
            <th className="p-3 text-left text-[11px] font-semibold text-gray-500 uppercase">Cari Adı</th>
            <th className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => toggle('toplam')}>
              TL Ciro <SortIco col="toplam" />
            </th>
            <th className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => toggle('toplam_eur')}>
              EUR <SortIco col="toplam_eur" />
            </th>
            <th className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => toggle('fatura_sayisi')}>
              Fatura <SortIco col="fatura_sayisi" />
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-gray-50 hover:bg-blue-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
              <td className="p-3 text-[11px] text-gray-300 text-center">{i + 1}</td>
              <td className="p-3 font-medium text-gray-800 max-w-[240px] truncate" title={r.cari_adi}>{r.cari_adi}</td>
              <td className="p-3 text-right font-bold text-blue-700 tabular-nums">{fmtTL(r.toplam, true)}</td>
              <td className="p-3 text-right text-amber-600 tabular-nums text-sm">{r.toplam_eur > 0 ? fmtEUR(r.toplam_eur, true) : '—'}</td>
              <td className="p-3 text-right text-gray-500 tabular-nums">{r.fatura_sayisi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Top Ürünler tablosu ──────────────────────────────────────────────────────
function TopUrunlerTable({ topUrunler, firma }) {
  const rows = useMemo(() =>
    (topUrunler || []).filter(r => r.firma === firma).slice(0, 15),
    [topUrunler, firma]);
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="p-3 text-left text-[11px] font-semibold text-gray-400 uppercase w-8">#</th>
            <th className="p-3 text-left text-[11px] font-semibold text-gray-500 uppercase">Ürün Adı</th>
            <th className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase">TL Ciro</th>
            <th className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase">EUR</th>
            <th className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase">Miktar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-gray-50 hover:bg-emerald-50/40 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
              <td className="p-3 text-[11px] text-gray-300 text-center">{i + 1}</td>
              <td className="p-3 font-medium text-gray-800 max-w-[260px] truncate" title={r.stok_adi}>{r.stok_adi}</td>
              <td className="p-3 text-right font-bold text-emerald-700 tabular-nums">{fmtTL(r.toplam, true)}</td>
              <td className="p-3 text-right text-amber-600 tabular-nums text-sm">{r.toplam_eur > 0 ? fmtEUR(r.toplam_eur, true) : '—'}</td>
              <td className="p-3 text-right text-gray-500 tabular-nums">{r.miktar ? (+r.miktar).toFixed(0) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pivot Tablo (özet) ───────────────────────────────────────────────────────
function PivotBlock({ firma, label, color }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ciro-pivot', firma],
    queryFn: () => getCiroRaporu().then(r => r.data),
    staleTime: 5 * 60_000,
  });
  const pivot = data?.pivot;
  const [selectedYear, setSelectedYear] = useState(null);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const years = pivot ? [...new Set(pivot.columns.filter(c => c.type === 'yearTotal' && c.year).map(c => c.year))].sort((a, b) => a - b) : [];
  const activeYear = selectedYear ?? (years.length ? String(years[years.length - 1]) : 'all');

  const visibleCols = pivot
    ? (activeYear === 'all' ? pivot.columns : pivot.columns.filter(c => c.type === 'grandTotal' || String(c.year) === activeYear))
    : [];
  const monthCols = visibleCols.filter(c => c.type === 'month' || c.type === 'yearTotal');
  const baseRows = (pivot?.categories || []).filter(c => !c.isGrandTotal && monthCols.some(col => (c.values[col.label] || 0) !== 0));
  const grandTotal = pivot?.categories?.find(c => c.isGrandTotal);

  const dataRows = useMemo(() => {
    if (!sortCol) return baseRows;
    return [...baseRows].sort((a, b) => {
      const av = a.values[sortCol] || 0, bv = b.values[sortCol] || 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });
  }, [baseRows, sortCol, sortDir]);

  if (isLoading) return <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="animate-spin" size={18} /></div>;
  if (!pivot) return <div className="text-gray-400 text-sm p-4">Veri yok</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-sm font-bold ${color}`}>{label} — Satış Özeti</h3>
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-1.5">
          <Calendar size={13} className="text-gray-400" />
          <select value={activeYear} onChange={e => setSelectedYear(e.target.value)}
            className="text-xs bg-transparent focus:outline-none text-gray-700 font-medium cursor-pointer">
            <option value="all">Tüm Yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-700 text-white uppercase tracking-wide">
              <th className="px-3 py-2.5 text-left font-semibold min-w-[160px] sticky left-0 bg-slate-700 z-10">Kategori</th>
              {visibleCols.map(col => (
                <th key={col.label} onClick={() => { if (sortCol === col.label) setSortDir(d => d === 'desc' ? 'asc' : 'desc'); else { setSortCol(col.label); setSortDir('desc'); } }}
                  className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap min-w-[110px] cursor-pointer select-none hover:brightness-125 transition-all
                    ${col.type === 'grandTotal' ? 'bg-slate-900' : col.type === 'yearTotal' ? 'bg-slate-600' : ''}`}>
                  {col.label}
                  {sortCol === col.label ? (sortDir === 'desc' ? <ChevronDown size={11} className="inline ml-1 text-yellow-300" /> : <ChevronUp size={11} className="inline ml-1 text-yellow-300" />) : <ChevronsUpDown size={11} className="inline ml-1 opacity-30" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dataRows.map((row, idx) => (
              <tr key={row.name} className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-3 py-2 font-medium text-gray-700 sticky left-0 bg-inherit z-10">{row.name}</td>
                {visibleCols.map(col => (
                  <td key={col.label} className={`px-3 py-2 text-right tabular-nums
                    ${col.type === 'yearTotal' ? 'font-semibold text-blue-700 bg-blue-50/60' : col.type === 'grandTotal' ? 'font-semibold text-slate-700 bg-slate-100' : 'text-gray-600'}`}>
                    {fmtTL(row.values[col.label])}
                  </td>
                ))}
              </tr>
            ))}
            {grandTotal && (
              <tr className="bg-slate-800 text-white font-bold border-t-2 border-slate-500">
                <td className="px-3 py-2.5 sticky left-0 bg-slate-800 z-10">{grandTotal.name}</td>
                {visibleCols.map(col => (
                  <td key={col.label} className={`px-3 py-2.5 text-right tabular-nums ${col.type === 'grandTotal' ? 'bg-slate-900 text-yellow-300' : ''}`}>
                    {fmtTL(grandTotal.values[col.label])}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════ Ana Bileşen ══════════════════════════════════════════════════════
export default function CiroRaporuPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('ozet');
  const [firmaTab, setFirmaTab] = useState('RESTAR');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState(null);
  const intervalRef = useRef(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['ciro-dashboard'],
    queryFn: () => getCiroDashboard().then(r => r.data),
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000, // 10 dakikada bir otomatik yenile
  });

  // Temizle
  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  async function handleYenile() {
    setIsRefreshing(true);
    setRefreshErr(null);
    try {
      const res = await getCiroDashboard(true);
      qc.setQueryData(['ciro-dashboard'], res.data);
      qc.invalidateQueries({ queryKey: ['ciro-pivot'] });
    } catch (err) {
      setRefreshErr(err?.response?.data?.error || err.message || 'Yenileme başarısız');
    } finally {
      setIsRefreshing(false);
    }
  }

  const d = data || {};
  const maxYil = d.maxYil;

  // KPI hesapla
  const kpiRestar = useMemo(() => {
    const rows = (d.yilToplam || []).filter(r => r.firma === 'RESTAR');
    const ytd = rows.find(r => r.yil === maxYil);
    const prev = rows.find(r => r.yil === (maxYil - 1));
    const degisim = ytd && prev && prev.toplam_tl > 0 ? ((ytd.toplam_tl - prev.toplam_tl) / prev.toplam_tl * 100) : null;
    return { ytd, prev, degisim };
  }, [d.yilToplam, maxYil]);

  const kpiRetech = useMemo(() => {
    const rows = (d.yilToplam || []).filter(r => r.firma === 'RETECH');
    const ytd = rows.find(r => r.yil === maxYil);
    const prev = rows.find(r => r.yil === (maxYil - 1));
    const degisim = ytd && prev && prev.toplam_tl > 0 ? ((ytd.toplam_tl - prev.toplam_tl) / prev.toplam_tl * 100) : null;
    return { ytd, prev, degisim };
  }, [d.yilToplam, maxYil]);

  const toplamCiro = (kpiRestar.ytd?.toplam_tl || 0) + (kpiRetech.ytd?.toplam_tl || 0);
  const toplamEur = (kpiRestar.ytd?.toplam_eur || 0) + (kpiRetech.ytd?.toplam_eur || 0);
  const toplamFatura = (kpiRestar.ytd?.fatura_sayisi || 0) + (kpiRetech.ytd?.fatura_sayisi || 0);
  const toplamCari = (kpiRestar.ytd?.cari_sayisi || 0) + (kpiRetech.ytd?.cari_sayisi || 0);

  const tabs = [
    { key: 'ozet', label: 'Genel Özet' },
    { key: 'restar', label: 'RESTAR' },
    { key: 'retech', label: 'RETECH' },
    { key: 'pivot', label: 'Pivot Detay' },
  ];

  const busy = isLoading || isRefreshing;

  return (
    <div className="p-5 space-y-5">
      {/* Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 flex items-center gap-2">
            <BarChart2 size={24} className="text-blue-500" /> Ciro Raporu
          </h1>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <Clock size={11} />
            {d.lastUpdated ? `Son güncelleme: ${fmtDate(d.lastUpdated)}` : 'TIGER3 verisi'}
            {maxYil && <span className="ml-1">· {maxYil} yılı gösteriliyor</span>}
          </p>
        </div>
        <button onClick={handleYenile} disabled={busy}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition-colors shadow-sm shrink-0">
          <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
          {isRefreshing ? 'TIGER3 sorgulanıyor…' : 'TIGER3\'ten Yenile'}
        </button>
      </div>

      {(error || refreshErr) && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>{refreshErr || error?.message}</span>
        </div>
      )}

      {busy && !d.yilToplam && (
        <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
          <RefreshCw className="animate-spin" size={20} /><span>TIGER3'ten veri çekiliyor…</span>
        </div>
      )}

      {d.yilToplam && (
        <>
          {/* Üst KPI'lar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI title={`${maxYil} Toplam Ciro`} value={fmtTL(toplamCiro, true)} sub={fmtEUR(toplamEur, true) + ' EUR'} icon={TrendingUp} gradient="from-blue-500 to-blue-700" />
            <KPI title="RESTAR Ciro" value={fmtTL(kpiRestar.ytd?.toplam_tl, true)}
              sub={kpiRestar.degisim != null ? `Geçen yıla göre ${kpiRestar.degisim >= 0 ? '+' : ''}${kpiRestar.degisim.toFixed(1)}%` : ''}
              icon={BarChart2} gradient="from-indigo-500 to-indigo-700" />
            <KPI title="RETECH Ciro" value={fmtTL(kpiRetech.ytd?.toplam_tl, true)}
              sub={kpiRetech.degisim != null ? `Geçen yıla göre ${kpiRetech.degisim >= 0 ? '+' : ''}${kpiRetech.degisim.toFixed(1)}%` : ''}
              icon={Layers} gradient="from-emerald-500 to-emerald-700" />
            <KPI title="Fatura / Müşteri" value={`${toplamFatura} / ${toplamCari}`} sub={`${maxYil} yılı`} icon={Users} gradient="from-violet-500 to-violet-700" />
          </div>

          {/* Tab seçimi */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
            {tabs.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* GENEL ÖZET */}
          {activeTab === 'ozet' && (
            <div className="space-y-5">
              {/* Firma karşılaştırma + aylık trend */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <BarChart2 size={15} className="text-blue-500" /> RESTAR vs RETECH — {maxYil} Aylık
                  </h3>
                  <FirmaKarsilastirmaChart monthlyTotals={d.monthlyTotals} yil={maxYil} />
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <TrendingUp size={15} className="text-emerald-500" /> Yıllık Ciro Trendi — Tüm Zamanlar
                  </h3>
                  <div className="flex gap-2 mb-3">
                    {['RESTAR', 'RETECH'].map(f => (
                      <button key={f} onClick={() => setFirmaTab(f)}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${firmaTab === f ? (f === 'RESTAR' ? 'bg-blue-500 text-white' : 'bg-emerald-500 text-white') : 'bg-gray-100 text-gray-500 hover:text-gray-700'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                  <YillikTrendChart yilToplam={d.yilToplam} firma={firmaTab} />
                </div>
              </div>

              {/* Yıllık özet tablo */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h3 className="text-sm font-bold text-gray-700 mb-4">Yıllık Özet Karşılaştırma</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="p-3 text-left text-[11px] font-semibold text-gray-500 uppercase">Firma</th>
                        {[...(new Set((d.yilToplam || []).map(r => r.yil)))].sort().map(y => (
                          <th key={y} className="p-3 text-right text-[11px] font-semibold text-gray-500 uppercase">{y}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['RESTAR', 'RETECH'].map(firma => (
                        <tr key={firma} className="border-b border-gray-50">
                          <td className="p-3 font-bold text-gray-800">{firma}</td>
                          {[...(new Set((d.yilToplam || []).map(r => r.yil)))].sort().map(y => {
                            const row = (d.yilToplam || []).find(r => r.firma === firma && r.yil === y);
                            return (
                              <td key={y} className={`p-3 text-right font-semibold tabular-nums ${y === maxYil ? 'text-blue-700 bg-blue-50/40' : 'text-gray-600'}`}>
                                {row ? fmtTL(row.toplam_tl, true) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* RESTAR veya RETECH tab */}
          {(activeTab === 'restar' || activeTab === 'retech') && (() => {
            const firma = activeTab.toUpperCase();
            const color = firma === 'RESTAR' ? 'text-blue-700' : 'text-emerald-700';
            const allYears = [...new Set((d.monthlyTotals || []).filter(r => r.firma === firma).map(r => r.yil))].sort();
            const recentYears = allYears.slice(-3);
            return (
              <div className="space-y-5">
                {/* Yıl karşılaştırma */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className={`text-sm font-bold mb-4 ${color}`}>{firma} — Son {recentYears.length} Yıl Aylık Karşılaştırma</h3>
                    <YilKarsilastirmaChart monthlyTotals={d.monthlyTotals} firma={firma} selectedYears={recentYears} />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className={`text-sm font-bold mb-4 ${color}`}>{firma} — Kategori Dağılımı ({maxYil})</h3>
                    <KategoriChart kategoriler={d.kategoriler} firma={firma} yil={maxYil} />
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${color}`}>
                      <Users size={14} /> Top Müşteriler — {firma} {maxYil}
                    </h3>
                    <TopCarilerTable topCariler={d.topCariler} firma={firma} maxYil={maxYil} />
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${color}`}>
                      <Package size={14} /> Top Ürünler — {firma} {maxYil}
                    </h3>
                    <TopUrunlerTable topUrunler={d.topUrunler} firma={firma} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* PİVOT DETAY */}
          {activeTab === 'pivot' && (
            <div className="space-y-5">
              {['RESTAR', 'RETECH'].map(firma => (
                <div key={firma} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <PivotBlock firma={firma} label={firma} color={firma === 'RESTAR' ? 'text-blue-700' : 'text-emerald-700'} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
