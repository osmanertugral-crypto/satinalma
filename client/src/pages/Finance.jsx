import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFinanceKurlar, getFinanceOzet, getFinanceCariler, getFinanceCariDetay, refreshFinanceExcel, getFinanceRefreshStatus, downloadCariExtresiBD, sendCariExtresiByMail } from '../api';
import { normSearch } from '../utils/searchUtils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import {
  TrendingDown, TrendingUp, Clock, ArrowUpDown,
  ChevronDown, ChevronUp, Search, ArrowLeft, RefreshCw,
  DollarSign, AlertTriangle, FileText, CreditCard, Calendar,
  Copy, CheckSquare, Square, X, ClipboardCheck, Download, Mail, MoreVertical
} from 'lucide-react';

// ── Helpers ──
const TR_AYLAR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function fmtTarih(dateStr) {
  if (!dateStr) return '-';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const d = parseInt(parts[2], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[0], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 0 && m < 12)
        return `${d} ${TR_AYLAR[m]} ${y}`;
    }
    const dt = new Date(dateStr);
    if (!isNaN(dt)) return `${dt.getDate()} ${TR_AYLAR[dt.getMonth()]} ${dt.getFullYear()}`;
  } catch (_) {}
  return dateStr;
}
function fmt(val, doviz) {
  if (val == null || isNaN(val)) return '-';
  const sym = doviz === 'USD' ? '$' : doviz === 'EUR' ? '€' : '₺';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ' + sym;
}
function fmtShort(val) {
  if (val == null || isNaN(val)) return '-';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  return sign + abs.toFixed(0);
}
function fmtFull(val) {
  if (val == null || isNaN(val)) return '-';
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
}

function KPICard({ title, value, subtitle, icon: Icon, color, onClick, pastel }) {
  if (pastel) {
    const bg = {
      red: 'bg-red-50 border-red-200', green: 'bg-emerald-50 border-emerald-200',
      blue: 'bg-blue-50 border-blue-200', amber: 'bg-amber-50 border-amber-200',
      purple: 'bg-purple-50 border-purple-200', slate: 'bg-slate-50 border-slate-200',
      rose: 'bg-rose-50 border-rose-200',
    };
    const tc = {
      red: 'text-red-700', green: 'text-emerald-700', blue: 'text-blue-700',
      amber: 'text-amber-700', purple: 'text-purple-700', slate: 'text-slate-700',
      rose: 'text-rose-700',
    };
    const ic = {
      red: 'text-red-400', green: 'text-emerald-400', blue: 'text-blue-400',
      amber: 'text-amber-400', purple: 'text-purple-400', slate: 'text-slate-400',
      rose: 'text-rose-400',
    };
    return (
      <div
        className={`rounded-xl border p-2.5 shadow-sm ${bg[color] || bg.slate} transition-all ${onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''}`}
        onClick={onClick}
      >
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{title}</span>
          {Icon && <Icon size={12} className={ic[color] || ic.slate} />}
        </div>
        <div className={`text-base font-extrabold leading-tight ${tc[color] || tc.slate}`}>{value}</div>
        {subtitle && <div className="text-[9px] mt-0.5 text-gray-400 leading-tight">{subtitle}</div>}
      </div>
    );
  }
  const cm = {
    red: 'from-red-500 to-red-600', green: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600', amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600', slate: 'from-slate-600 to-slate-700',
  };
  return (
    <div
      className={`rounded-xl bg-gradient-to-br ${cm[color] || cm.blue} text-white p-5 shadow-lg transition-all ${onClick ? 'cursor-pointer hover:scale-[1.02] hover:shadow-xl active:scale-[0.99]' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{title}</span>
        {Icon && <Icon size={18} className="opacity-50" />}
      </div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      {subtitle && <div className="text-[11px] mt-1 opacity-70">{subtitle}</div>}
      {onClick && <div className="text-[10px] mt-1.5 opacity-50">Tıkla → Detay</div>}
    </div>
  );
}

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <div className="font-semibold mb-1 text-gray-700">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-medium">{fmtFull(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Döviz bazlı cari drill-down paneli ──
function CariDrillDown({ doviz, mode, cariler, onSelectCari, onClose }) {
  const [sortKey, setSortKey] = useState('enUzakGun');
  const [sortDir, setSortDir] = useState('desc');

  const sym = doviz === 'USD' ? '$' : doviz === 'EUR' ? '€' : doviz === 'GBP' ? '£' : '₺';
  const isFx = doviz !== 'TL';
  const isBorc = mode === 'borc';

  const rows = useMemo(() => {
    const base = (cariler || []).filter(r => r.doviz === doviz && (isBorc ? r.bakiye < 0 : r.bakiye > 0));
    return [...base].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'enUzakGun') return dir * ((a.enUzakGun ?? -1) - (b.enUzakGun ?? -1));
      if (sortKey === 'bakiye') return dir * (Math.abs(isFx ? (a.bakiyeDoviz ?? a.bakiye) : a.bakiye) - Math.abs(isFx ? (b.bakiyeDoviz ?? b.bakiye) : b.bakiye));
      if (sortKey === 'vadesiGelen') return dir * ((a.vadesiGelen ?? 0) - (b.vadesiGelen ?? 0));
      if (sortKey === 'cariAdi') return dir * (a.cariAdi || '').localeCompare(b.cariAdi || '', 'tr');
      if (sortKey === 'sonOdemeTutar') return dir * ((a.sonOdemeTutar ?? 0) - (b.sonOdemeTutar ?? 0));
      return 0;
    });
  }, [cariler, doviz, isBorc, isFx, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function SortIco({ col }) {
    if (sortKey !== col) return <span className="text-gray-300 ml-0.5 text-[10px]">↕</span>;
    return <span className="text-blue-400 ml-0.5 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const totalDoviz = rows.reduce((s, r) => s + Math.abs(isFx ? (r.bakiyeDoviz ?? r.bakiye) : r.bakiye), 0);
  const totalTL    = rows.reduce((s, r) => s + Math.abs(r.bakiye), 0);
  const vadesiGelenTotalDoviz = rows.reduce((s, r) => s + Math.abs(isFx ? (r.vadesiGelenDoviz ?? r.vadesiGelen ?? 0) : (r.vadesiGelen ?? 0)), 0);

  const thSort = 'p-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap';
  const thPlain = 'p-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap';

  return (
    <div className={`rounded-2xl border shadow-md overflow-hidden mt-3 ${isBorc ? 'border-red-200' : 'border-emerald-200'}`}>
      <div className={`flex items-center justify-between px-5 py-3 border-b ${isBorc ? 'bg-red-50/60 border-red-100' : 'bg-emerald-50/60 border-emerald-100'}`}>
        <div>
          <h3 className="font-bold text-gray-800 text-sm">
            {doviz} {isBorc ? 'Borçlu' : 'Alacaklı'} Cariler
            <span className="ml-2 text-xs font-normal text-gray-400">({rows.length} cari)</span>
          </h3>
          <div className="flex gap-4 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-500">
              Toplam:{' '}
              <span className={`font-bold ${isBorc ? 'text-red-600' : 'text-emerald-600'}`}>
                {fmtFull(totalDoviz)} {sym}
              </span>
              {isFx && <span className="ml-1 text-gray-400">≈ {fmtFull(totalTL)} ₺</span>}
            </span>
            {isBorc && vadesiGelenTotalDoviz > 0 && (
              <span className="text-xs text-gray-500">
                Vadesi Geçmiş: <span className="font-bold text-amber-600">{fmtFull(vadesiGelenTotalDoviz)} {sym}</span>
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2 py-0.5">×</button>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-gray-400 text-sm bg-white">Bu kategoride cari bulunamadı</div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto bg-white" style={{ maxHeight: '72vh' }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50/90 sticky top-0 z-10">
              <tr>
                <th className="text-left p-2.5 text-[11px] font-semibold text-gray-400 w-8">#</th>
                <th className={`text-left ${thPlain}`}>Cari Kodu</th>
                <th className={`text-left ${thSort}`} onClick={() => toggleSort('cariAdi')}>
                  Cari Adı <SortIco col="cariAdi" />
                </th>
                <th className={`text-right ${thSort}`} onClick={() => toggleSort('bakiye')}>
                  Bakiye ({sym}) <SortIco col="bakiye" />
                </th>
                {isFx && <th className={`text-right ${thPlain} text-gray-400`}>TL Karş.</th>}
                {isBorc && <>
                  <th className={`text-right ${thSort} text-amber-600 hover:text-amber-700`} onClick={() => toggleSort('vadesiGelen')}>
                    Vadesi Geçmiş ({sym}) <SortIco col="vadesiGelen" />
                  </th>
                  <th className={`text-right ${thSort} text-red-500 hover:text-red-700`} onClick={() => toggleSort('enUzakGun')}>
                    Ödenmemiş Gün <SortIco col="enUzakGun" />
                  </th>
                  <th className={`text-left ${thPlain}`}>Son Fatura Dönemi</th>
                  <th className={`text-right ${thPlain}`}>En Uzak Fatura Tutarı</th>
                  <th className={`text-right ${thSort}`} onClick={() => toggleSort('sonOdemeTutar')}>
                    Son Ödeme <SortIco col="sonOdemeTutar" />
                  </th>
                </>}
                <th className={`text-right ${thPlain}`}>Fatura</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const dovizBakiye = isFx ? Math.abs(r.bakiyeDoviz ?? r.bakiye) : Math.abs(r.bakiye);
                const vadesiGelenDoviz = isFx ? Math.abs(r.vadesiGelenDoviz ?? r.vadesiGelen ?? 0) : Math.abs(r.vadesiGelen ?? 0);
                const gun = r.enUzakGun;
                const gunColor = gun > 180 ? 'bg-red-100 text-red-700' : gun > 90 ? 'bg-orange-100 text-orange-700' : gun > 30 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-50 text-yellow-700';
                return (
                  <tr key={i}
                    className={`border-t border-gray-50 cursor-pointer transition ${isBorc ? 'hover:bg-red-50/30' : 'hover:bg-emerald-50/30'}`}
                    onClick={() => onSelectCari(r.cariKodu)}
                  >
                    <td className="p-2.5 text-[11px] text-gray-300 text-center">{i + 1}</td>
                    <td className="p-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{r.cariKodu}</td>
                    <td className="p-2.5 font-medium text-gray-800 max-w-[220px] truncate" title={r.cariAdi}>{r.cariAdi}</td>
                    <td className={`p-2.5 text-right font-bold whitespace-nowrap ${isBorc ? 'text-red-600' : 'text-emerald-600'}`}>
                      {fmtFull(dovizBakiye)} {sym}
                    </td>
                    {isFx && (
                      <td className="p-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
                        ≈ {fmtFull(Math.abs(r.bakiye))} ₺
                      </td>
                    )}
                    {isBorc && <>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {vadesiGelenDoviz > 0
                          ? <span className="text-amber-600 font-semibold text-xs">{fmtFull(vadesiGelenDoviz)} {sym}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {gun != null && gun > 0
                          ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${gunColor}`}>{gun} gün</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-2.5 whitespace-nowrap">
                        {r.sonFaturaDonem
                          ? <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px] text-gray-700">{r.sonFaturaDonem}</span>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap text-xs text-gray-600">
                        {r.enUzakFaturaTutar ? fmtFull(r.enUzakFaturaTutar) + ' ' + sym : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {r.sonOdemeTutar ? (
                          <div>
                            <div className="font-semibold text-emerald-600 text-xs">{fmtFull(r.sonOdemeTutar)} {sym}</div>
                            {r.sonOdemeTarih && <div className="text-[10px] text-gray-400">{fmtTarih(r.sonOdemeTarih)}</div>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </>}
                    <td className="p-2.5 text-right text-xs text-gray-400 whitespace-nowrap">
                      {(r.faturaSayisi || 0) > 0 ? `${r.faturaSayisi} fatura` : '—'}
                    </td>
                    <td className="p-2.5 text-center text-blue-500 text-xs font-bold">→</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Döviz Kuru Bandı ──
function KurBand() {
  const { data } = useQuery({ queryKey: ['finance-kurlar'], queryFn: () => getFinanceKurlar().then(r => r.data), staleTime: 3600_000 });
  if (!data || (!data.usd && !data.eur)) return null;
  return (
    <div className="flex items-center gap-4 bg-slate-800 text-white px-4 py-2 rounded-xl text-sm font-medium shadow">
      <span className="text-[10px] uppercase tracking-wider text-slate-400">TCMB Efektif Satış</span>
      {data.usd && <span className="flex items-center gap-1"><DollarSign size={14} className="text-green-400" /> USD: <b>{data.usd.toFixed(4)}</b> ₺</span>}
      {data.eur && <span className="flex items-center gap-1"><span className="text-blue-400 font-bold text-xs">€</span> EUR: <b>{data.eur.toFixed(4)}</b> ₺</span>}
      {data.tarih && <span className="text-[10px] text-slate-400 ml-2">{data.tarih}</span>}
    </div>
  );
}

// ══════════ TAB 1: GENEL ÖZET ══════════
function OzetTab({ onSelectCari, onNavigateTab }) {
  const { data: ozet, isLoading } = useQuery({
    queryKey: ['finance-ozet'], queryFn: () => getFinanceOzet().then(r => r.data),
  });
  const { data: cariler } = useQuery({
    queryKey: ['finance-cariler-all'], queryFn: () => getFinanceCariler({}).then(r => r.data),
  });
  const { data: kurlar } = useQuery({
    queryKey: ['finance-kurlar'],
    queryFn: () => getFinanceKurlar().then(r => r.data),
    staleTime: 3600_000,
  });
  const [drillDown, setDrillDown] = useState(null); // { doviz, mode }

  function toggleDrill(doviz, mode) {
    setDrillDown(d => d?.doviz === doviz && d?.mode === mode ? null : { doviz, mode });
  }

  if (isLoading) return <div className="flex items-center justify-center h-64 gap-2 text-gray-500"><RefreshCw className="animate-spin" size={20} /> Yükleniyor...</div>;
  if (!ozet) return null;

  const b = ozet.borc;
  const a = ozet.alacak;

  // Borç TL karşılıkları (güncel kurla)
  const borcTL_TL  = b.TL.toplam.doviz;
  const borcTL_USD = b.USD.toplam.doviz * (kurlar?.usd || 0);
  const borcTL_EUR = b.EUR.toplam.doviz * (kurlar?.eur || 0);
  const toplamBorcTL_kur = borcTL_TL + borcTL_USD + borcTL_EUR;

  // Özet tablosu verisi — doviz cinsinden toplamlar
  const ozetTablo = [
    { doviz: 'TL',  borcToplam: b.TL.toplam.doviz,  alacakToplam: a.TL.toplam.doviz  },
    { doviz: 'USD', borcToplam: b.USD.toplam.doviz, alacakToplam: a.USD.toplam.doviz },
    { doviz: 'EUR', borcToplam: b.EUR.toplam.doviz, alacakToplam: a.EUR.toplam.doviz },
  ];

  // Toplam borçlu ve alacaklı sayısı
  const borcluSayisi = cariler ? cariler.filter(c => c.bakiye < 0).length : 0;
  const alacakliSayisi = cariler ? cariler.filter(c => c.bakiye > 0).length : 0;

  // KPI hesapları - TL karşılıkları
  const toplamBorcTL    = b.TL.toplam.tl + b.USD.toplam.tl + b.EUR.toplam.tl;
  const toplamAlacakTL  = a.TL.toplam.tl + a.USD.toplam.tl + a.EUR.toplam.tl;

  // Vadesi gelen toplam tutar (TL cinsinden – sütun zaten TL, kur çarpımı YOK)
  // Aynı cari birden fazla satır çıkabileceğinden cariKodu bazında tekilleştir, sadece borçlular
  const vadesiGelenByCari = new Map();
  if (cariler) {
    cariler.filter(c => c.bakiye < 0 && c.vadesiGelen).forEach(c => {
      const key = c.cariKodu;
      const existing = vadesiGelenByCari.get(key) || 0;
      const v = Math.abs(c.vadesiGelen);
      if (v > existing) vadesiGelenByCari.set(key, v);
    });
  }
  const toplamVadesiGelenTL = Array.from(vadesiGelenByCari.values()).reduce((s, v) => s + v, 0);
  const vadesiGelenCariSayisi = vadesiGelenByCari.size;

  // En çok borçlu 10 cari
  const topBorc = cariler
    ? [...cariler].filter(c => c.bakiye < 0).sort((x, y) => x.bakiye - y.bakiye).slice(0, 10)
    : [];

  // Pie chart
  const pieData = [
    { name: 'Borcumuz (TL karş.)', value: toplamBorcTL, color: '#ef4444' },
    { name: 'Alacağımız (TL karş.)', value: toplamAlacakTL > 0 ? toplamAlacakTL : 0, color: '#10b981' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard pastel title="Toplam Borcumuz (TL karş.)" value={fmtShort(toplamBorcTL) + ' ₺'} subtitle={`${borcluSayisi} cariye borçluyuz`} icon={TrendingDown} color="red" onClick={() => onNavigateTab('borc')} />
        <KPICard pastel title="Toplam Alacağımız (TL karş.)" value={fmtShort(toplamAlacakTL) + ' ₺'} subtitle={`${alacakliSayisi} cariden alacağımız var`} icon={TrendingUp} color="green" onClick={() => onNavigateTab('alacak')} />
        <KPICard pastel title="Vadesi Gelen Toplam Tutar" value={fmtShort(toplamVadesiGelenTL) + ' ₺'} subtitle={`${vadesiGelenCariSayisi} carinin vadesi gelmiş`} icon={Calendar} color="amber" onClick={() => onNavigateTab('borc')} />
        <KPICard pastel title="Toplam Cari" value={cariler ? cariler.length : '...'} subtitle="320 hesap grubu" icon={FileText} color="blue" />
      </div>

      {/* 320 RESTAR ÖZET Tablosu */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">320 RESTAR Borç / Alacak Özet</h3>
          <span className="text-[11px] text-gray-400">Borç / Alacak sütunlarına tıklayarak cariler görüntülenebilir</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-200">
                <th className="p-3 text-left">Para Birimi</th>
                <th className="p-3 text-right font-bold text-red-600">Toplam Borç ▾</th>
                <th className="p-3 text-right text-gray-400">TL Karşılığı</th>
                <th className="p-3 text-right font-bold text-emerald-600">Toplam Alacak ▾</th>
              </tr>
            </thead>
            <tbody>
              {ozetTablo.map((r, i) => {
                const sym = r.doviz === 'USD' ? '$' : r.doviz === 'EUR' ? '€' : '₺';
                const kur = r.doviz === 'USD' ? (kurlar?.usd || 0) : r.doviz === 'EUR' ? (kurlar?.eur || 0) : 1;
                const borcTLKarsilik = r.borcToplam * kur;
                const borcActive = drillDown?.doviz === r.doviz && drillDown?.mode === 'borc';
                const alacakActive = drillDown?.doviz === r.doviz && drillDown?.mode === 'alacak';
                return (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="p-3 font-bold text-gray-700">
                      {r.doviz}
                      <span className="ml-1.5 text-gray-400 font-normal text-xs">({sym})</span>
                      {r.doviz !== 'TL' && kur > 0 && (
                        <span className="ml-2 text-[10px] text-gray-300">kur: {kur.toFixed(4)}</span>
                      )}
                    </td>
                    <td
                      className={`p-3 text-right font-bold cursor-pointer select-none transition rounded-lg ${borcActive ? 'bg-red-100 text-red-800 shadow-inner' : 'text-red-700 hover:bg-red-50'}`}
                      onClick={() => toggleDrill(r.doviz, 'borc')}
                      title={`${r.doviz} borçlu carileri göster`}
                    >
                      {fmtFull(r.borcToplam)} {sym}
                      <span className="ml-1 text-[10px] opacity-60">{borcActive ? '▲' : '▼'}</span>
                    </td>
                    <td className="p-3 text-right text-xs text-gray-400 whitespace-nowrap">
                      {r.doviz !== 'TL'
                        ? kur > 0
                          ? <span>≈ {fmtFull(borcTLKarsilik)} <span className="text-gray-300">₺</span></span>
                          : <span className="text-gray-300">kur bekleniyor</span>
                        : '—'}
                    </td>
                    <td
                      className={`p-3 text-right font-bold cursor-pointer select-none transition rounded-lg ${alacakActive ? 'bg-emerald-100 text-emerald-800 shadow-inner' : 'text-emerald-700 hover:bg-emerald-50'}`}
                      onClick={() => toggleDrill(r.doviz, 'alacak')}
                      title={`${r.doviz} alacaklı carileri göster`}
                    >
                      {fmtFull(r.alacakToplam)} {sym}
                      <span className="ml-1 text-[10px] opacity-60">{alacakActive ? '▲' : '▼'}</span>
                    </td>
                  </tr>
                );
              })}
              {/* Toplam TL Borç — güncel kurdan çevrilmiş */}
              <tr className="border-t-2 border-red-200 bg-red-50/70">
                <td className="p-3 font-bold text-red-800 text-sm">
                  Toplam TL Borç
                  <div className="text-[10px] font-normal text-red-400 mt-0.5">Güncel kurdan hesaplanmış</div>
                </td>
                <td className="p-3 text-right text-xl font-extrabold text-red-700 whitespace-nowrap">
                  {fmtFull(toplamBorcTL_kur)} ₺
                </td>
                <td className="p-3 text-right">
                  <div className="text-[10px] text-red-400 leading-relaxed whitespace-nowrap">
                    {borcTL_TL > 0 && <div>TL: {fmtFull(borcTL_TL)} ₺</div>}
                    {borcTL_USD > 0 && kurlar?.usd && <div>USD × {kurlar.usd.toFixed(4)}: {fmtFull(borcTL_USD)} ₺</div>}
                    {borcTL_EUR > 0 && kurlar?.eur && <div>EUR × {kurlar.eur.toFixed(4)}: {fmtFull(borcTL_EUR)} ₺</div>}
                  </div>
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Drill-down panel */}
        {drillDown && (
          <div className="px-4 pb-4">
            <CariDrillDown
              doviz={drillDown.doviz}
              mode={drillDown.mode}
              cariler={cariler}
              onSelectCari={onSelectCari}
              onClose={() => setDrillDown(null)}
            />
          </div>
        )}
      </div>

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">Borç / Alacak Dağılımı (TL karşılığı)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="value" paddingAngle={3}>
                {pieData.map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
              </Pie>
              <Tooltip formatter={v => fmtFull(v) + ' ₺'} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-2 text-sm">
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" /> Borç</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Alacak</span>
          </div>
        </div>

        {/* Top 10 Borçlu */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">En Çok Borçlu Olduğumuz 10 Cari</h3>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={topBorc.map(r => ({ name: r.cariAdi.substring(0, 25), borç: Math.abs(r.bakiye), doviz: r.doviz }))} layout="vertical" barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 10, fill: '#999' }} />
              <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 10, fill: '#555' }} />
              <Tooltip content={<TT />} />
              <Bar dataKey="borç" fill="#ef4444" radius={[0, 6, 6, 0]} cursor="pointer"
                onClick={(data) => { if (topBorc[data.index]) onSelectCari(topBorc[data.index].cariKodu); }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ══════════ TAB 2 & 3: CARİLER ══════════
// mode: 'borc' | 'alacak'
function CarilerTab({ onSelectCari, mode }) {
  const [cariKontrol, setCariKontrol] = useState('TÜMÜ');
  const [doviz, setDoviz] = useState('TÜMÜ');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('bakiye');
  const [sortDir, setSortDir] = useState('asc');

  const { data: cariler, isLoading } = useQuery({
    queryKey: ['finance-cariler', cariKontrol, doviz],
    queryFn: () => getFinanceCariler({ cariKontrol, doviz }).then(r => r.data),
  });

  const { data: kurlar } = useQuery({
    queryKey: ['finance-kurlar'],
    queryFn: () => getFinanceKurlar().then(r => r.data),
    staleTime: 3600_000,
  });

  const filtered = useMemo(() => {
    if (!cariler) return [];
    let arr = [...cariler];
    // mode filtresi
    if (mode === 'borc') arr = arr.filter(r => r.bakiye < 0);
    else if (mode === 'alacak') arr = arr.filter(r => r.bakiye > 0);
    if (search) {
      const s = normSearch(search);
      arr = arr.filter(r => normSearch(r.cariKodu).includes(s) || normSearch(r.cariAdi).includes(s));
    }
    arr.sort((a, b) => {
      let va = a[sortField] ?? 0, vb = b[sortField] ?? 0;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [cariler, search, sortField, sortDir, mode]);

  // Döviz bazlı toplamlar — USD/EUR için bakiyeDoviz (native para) kullanılır,
  // yoksa TL karşılığı kullanılır; tlGenel'de kur çarpımı yapılır (çift çevrim önlenir)
  const dovizToplam = useMemo(() => {
    if (!cariler) return { TL: 0, USD: 0, EUR: 0 };
    const isBorc = mode === 'borc';
    const rows = cariler.filter(r => isBorc ? r.bakiye < 0 : r.bakiye > 0);
    const TL  = rows.filter(r => r.doviz === 'TL').reduce((s, r) => s + Math.abs(r.bakiye), 0);
    const USD = rows.filter(r => r.doviz === 'USD').reduce((s, r) => s + Math.abs(r.bakiyeDoviz ?? r.bakiye), 0);
    const EUR = rows.filter(r => r.doviz === 'EUR').reduce((s, r) => s + Math.abs(r.bakiyeDoviz ?? r.bakiye), 0);
    return { TL, USD, EUR };
  }, [cariler, mode]);

  const tlGenel = useMemo(() => {
    const usd = kurlar?.usd || 0;
    const eur = kurlar?.eur || 0;
    return dovizToplam.TL + dovizToplam.USD * usd + dovizToplam.EUR * eur;
  }, [dovizToplam, kurlar]);

  // Borç/Alacak sayısı
  const borcSayisi = filtered.filter(r => r.bakiye < 0).length;
  const alacakSayisi = filtered.filter(r => r.bakiye > 0).length;

  function toggleSort(f) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(f); setSortDir('asc'); }
  }
  function SortIcon({ field }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-20" />;
    return sortDir === 'asc' ? <ChevronUp size={14} className="text-blue-600" /> : <ChevronDown size={14} className="text-blue-600" />;
  }

  // cariKontrol filtresi: API'dan gelen distinct değerler + TÜMÜ
  const CK_OPTIONS = useMemo(() => {
    if (!cariler) return ['TÜMÜ'];
    const vals = [...new Set(cariler.map(r => r.cariKontrol || '').filter(Boolean))].sort();
    return ['TÜMÜ', ...vals];
  }, [cariler]);
  const DVZ_OPTIONS = ['TÜMÜ', 'TL', 'USD', 'EUR'];

  return (
    <div className="space-y-4">

      {/* ── Özet Dashboard (sadece borç/alacak modunda) ── */}
      {mode && cariler && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* TL Borç */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">TL Toplam {mode === 'borc' ? 'Borç' : 'Alacak'}</div>
            <div className="text-xl font-extrabold text-gray-800 tabular-nums">
              {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(dovizToplam.TL)}
              <span className="text-sm font-semibold text-gray-400 ml-1">₺</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{(cariler || []).filter(r => r.doviz === 'TL' && (mode === 'borc' ? r.bakiye < 0 : r.bakiye > 0)).length} cari</div>
          </div>
          {/* USD Borç */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">USD Toplam {mode === 'borc' ? 'Borç' : 'Alacak'}</div>
            <div className="text-xl font-extrabold text-green-700 tabular-nums">
              {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(dovizToplam.USD)}
              <span className="text-sm font-semibold text-green-400 ml-1">$</span>
            </div>
            {kurlar?.usd ? (
              <div className="text-xs text-gray-400 mt-1">≈ {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(dovizToplam.USD * kurlar.usd)} ₺</div>
            ) : <div className="text-xs text-gray-300 mt-1">kur bekleniyor</div>}
          </div>
          {/* EUR Borç */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">EUR Toplam {mode === 'borc' ? 'Borç' : 'Alacak'}</div>
            <div className="text-xl font-extrabold text-blue-700 tabular-nums">
              {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(dovizToplam.EUR)}
              <span className="text-sm font-semibold text-blue-400 ml-1">€</span>
            </div>
            {kurlar?.eur ? (
              <div className="text-xs text-gray-400 mt-1">≈ {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(dovizToplam.EUR * kurlar.eur)} ₺</div>
            ) : <div className="text-xs text-gray-300 mt-1">kur bekleniyor</div>}
          </div>
          {/* TL Genel Toplam */}
          <div className={`rounded-2xl p-4 shadow-sm border ${mode === 'borc' ? 'bg-red-600 border-red-700 text-white' : 'bg-emerald-600 border-emerald-700 text-white'}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide opacity-80 mb-1">TL Genel Toplam {mode === 'borc' ? 'Borç' : 'Alacak'}</div>
            <div className="text-xl font-extrabold tabular-nums">
              {new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(tlGenel)}
              <span className="text-sm font-semibold opacity-70 ml-1">₺</span>
            </div>
            {kurlar?.usd && kurlar?.eur ? (
              <div className="text-[10px] opacity-60 mt-1">TL + USD×{kurlar.usd.toFixed(2)} + EUR×{kurlar.eur.toFixed(2)}</div>
            ) : <div className="text-[10px] opacity-50 mt-1">TCMB kuru bekleniyor</div>}
          </div>
        </div>
      )}

      {/* Filtreler */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {CK_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setCariKontrol(opt)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${cariKontrol === opt ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {opt === 'TÜMÜ' ? 'Tümü' : opt.length > 15 ? opt.substring(0, 15) + '…' : opt}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {DVZ_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setDoviz(opt)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition ${doviz === opt
                ? (opt === 'USD' ? 'bg-green-500 text-white' : opt === 'EUR' ? 'bg-blue-500 text-white' : opt === 'TL' ? 'bg-slate-700 text-white' : 'bg-white shadow text-gray-800')
                : 'text-gray-500 hover:text-gray-700'}`}>
              {opt === 'TÜMÜ' ? 'Hepsi' : opt}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input type="text" placeholder="Cari ara..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-300 focus:border-blue-400 outline-none" />
        </div>
      </div>

      <div className="flex gap-3 text-xs text-gray-500">
        <span>{filtered.length} kayıt</span>
        <span className="text-red-500">{borcSayisi} borçlu</span>
        <span className="text-emerald-500">{alacakSayisi} alacaklı</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw className="animate-spin" size={20} /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-300px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur">
                <tr>
                  {[
                    { f: 'cariKodu', l: 'Cari Kodu', a: 'left' },
                    { f: null, l: 'Cari Adı', a: 'left' },
                    { f: null, l: 'Döviz', a: 'left' },
                    { f: null, l: 'Tür', a: 'left' },
                    { f: 'bakiye', l: 'Bakiye (Döviz)', a: 'right' },
                    { f: null, l: 'Durum', a: 'center' },
                    { f: 'enUzakGun', l: 'Ödenmemiş Gün', a: 'right' },
                    { f: null, l: 'En Uzak Fatura', a: 'right' },
                    { f: null, l: 'Son Fatura Dönemi', a: 'left' },
                    { f: 'sonOdemeTutar', l: 'Son Ödeme', a: 'right' },
                    { f: null, l: '', a: 'center' },
                  ].map((c, i) => (
                    <th key={i}
                      className={`text-${c.a} p-2.5 font-semibold text-gray-500 text-[11px] uppercase tracking-wide ${c.f ? 'cursor-pointer select-none hover:text-gray-700' : ''}`}
                      onClick={c.f ? () => toggleSort(c.f) : undefined}>
                      <span className="inline-flex items-center gap-1">{c.l}{c.f && <SortIcon field={c.f} />}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const isBorc = r.bakiye < 0;
                  const sym = r.doviz === 'USD' ? '$' : r.doviz === 'EUR' ? '€' : '₺';
                  return (
                    <tr key={i} className={`border-t border-gray-50 cursor-pointer transition ${isBorc ? 'hover:bg-red-50/40' : 'hover:bg-emerald-50/40'}`}
                      onClick={() => onSelectCari(r.cariKodu)}>
                      <td className="p-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{r.cariKodu}</td>
                      <td className="p-2.5 max-w-[250px] truncate font-medium text-gray-800" title={r.cariAdi}>{r.cariAdi}</td>
                      <td className="p-2.5">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${r.doviz === 'USD' ? 'bg-green-100 text-green-700' : r.doviz === 'EUR' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{r.doviz}</span>
                      </td>
                      <td className="p-2.5 text-[11px] text-gray-500 truncate max-w-[120px]" title={r.cariKontrol}>
                        {r.cariKontrol || '-'}
                      </td>
                      <td className={`p-2.5 text-right whitespace-nowrap font-bold ${isBorc ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fmtFull(Math.abs(r.bakiye))} {sym}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${isBorc ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {r.durumu || (isBorc ? 'BORÇ' : 'ALACAK')}
                        </span>
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {r.enUzakGun != null && r.enUzakGun > 0 ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold
                            ${r.enUzakGun > 180 ? 'bg-red-100 text-red-700' : r.enUzakGun > 90 ? 'bg-orange-100 text-orange-700' : r.enUzakGun > 30 ? 'bg-amber-100 text-amber-700' : 'bg-yellow-50 text-yellow-700'}`}>
                            {r.enUzakGun} gün
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-2.5 text-right text-xs whitespace-nowrap text-gray-600">
                        {r.enUzakFaturaTutar ? fmtFull(r.enUzakFaturaTutar) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="p-2.5 text-xs whitespace-nowrap">
                        {r.sonFaturaDonem
                          ? <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-[11px] text-gray-700">{r.sonFaturaDonem}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="p-2.5 text-right whitespace-nowrap">
                        {r.sonOdemeTutar ? (
                          <div>
                            <div className="text-xs font-semibold text-emerald-600">{fmtFull(r.sonOdemeTutar)}</div>
                            {r.sonOdemeTarih && <div className="text-[10px] text-gray-400">{fmtTarih(r.sonOdemeTarih)}</div>}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="p-2.5 text-center"><span className="text-blue-600 text-xs font-semibold">→</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════ TAB 3: CARİ DETAY ══════════
function CariDetayTab({ cariKodu, onBack }) {
  const { data, isLoading } = useQuery({
    queryKey: ['finance-cari-detay', cariKodu],
    queryFn: () => getFinanceCariDetay({ code: cariKodu }).then(r => r.data),
    enabled: !!cariKodu,
  });

  const [faturaFilter, setFaturaFilter] = useState('odenmedi');
  const [secilenIdx, setSecilenIdx] = useState(new Set());
  const [kopyalandiBilgi, setKopyalandiBilgi] = useState(false);
  const [showMenuId, setShowMenuId] = useState(null);

  const pdfMut = useMutation({
    mutationFn: () => downloadCariExtresiBD(cariKodu),
    onSuccess: (blob) => {
      const url = window.URL.createObjectURL(blob.data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Ekstre_${cariKodu}_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      setShowMenuId(null);
    },
    onError: (err) => alert('PDF indirme hatası: ' + (err?.response?.data?.error || err.message)),
  });

  const mailMut = useMutation({
    mutationFn: () => sendCariExtresiByMail(cariKodu),
    onSuccess: () => {
      setShowMenuId(null);
      alert('Outlook açıldı — PDF ek olarak hazırlandı. Alıcıyı girin ve gönderin.');
    },
    onError: (err) => alert('Outlook açma hatası: ' + (err?.response?.data?.error || err.message)),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 gap-2 text-gray-500"><RefreshCw className="animate-spin" size={20} /> Yükleniyor...</div>;
  if (!data) return null;

  const durumColor = { odendi: 'bg-emerald-500', kismi: 'bg-amber-500', odenmedi: 'bg-red-500' };
  const durumLabel = { odendi: 'Ödendi', kismi: 'Kısmi', odenmedi: 'Ödenmedi' };
  const durumBg = { odendi: 'bg-emerald-50 text-emerald-700 border-emerald-200', kismi: 'bg-amber-50 text-amber-700 border-amber-200', odenmedi: 'bg-red-50 text-red-700 border-red-200' };

  const filteredFaturalar = data.faturalar
    .map((f, origIdx) => ({ ...f, origIdx }))
    .filter(f => faturaFilter === 'all' || f.durum === faturaFilter);

  // Seçim yardımcıları
  function toggleSecilen(origIdx) {
    setSecilenIdx(prev => {
      const next = new Set(prev);
      next.has(origIdx) ? next.delete(origIdx) : next.add(origIdx);
      return next;
    });
  }
  function selectAllVisible() {
    const selectableIdx = filteredFaturalar
      .filter(f => f.durum === 'odenmedi' || f.durum === 'kismi')
      .map(f => f.origIdx);
    const allSelected = selectableIdx.every(i => secilenIdx.has(i));
    if (allSelected) {
      setSecilenIdx(prev => {
        const next = new Set(prev);
        selectableIdx.forEach(i => next.delete(i));
        return next;
      });
    } else {
      setSecilenIdx(prev => new Set([...prev, ...selectableIdx]));
    }
  }
  const secilenFaturalar = data.faturalar.filter((_, i) => secilenIdx.has(i));
  const secilenToplamKalan = secilenFaturalar.reduce((s, f) => s + (f.kalanBorc || 0), 0);
  const secilenToplamFatura = secilenFaturalar.reduce((s, f) => s + (f.tutar || 0), 0);

  function handleKopyala() {
    if (secilenFaturalar.length === 0) return;
    const baslik = 'Belge No\tTarih\tVade Tarihi\tFatura Tutarı\tÖdenen\tKalan Borç\tDöviz\tDurum';
    const satirlar = secilenFaturalar.map(f =>
      [
        f.belgeNo || f.fisNo || '-',
        f.tarih || '-',
        f.vadeTarihi || '-',
        (f.tutar || 0).toFixed(2),
        (f.odpiranMiktar || 0).toFixed(2),
        (f.kalanBorc || 0).toFixed(2),
        f.doviz || 'TL',
        f.durum === 'odenmedi' ? 'Ödenmedi' : f.durum === 'kismi' ? 'Kısmi' : 'Ödendi',
      ].join('\t')
    );
    const toplam = `\nTOPLAM\t\t\t${secilenToplamFatura.toFixed(2)}\t\t${secilenToplamKalan.toFixed(2)}`;
    const metin = [baslik, ...satirlar, toplam].join('\n');
    navigator.clipboard.writeText(metin).then(() => {
      setKopyalandiBilgi(true);
      setTimeout(() => setKopyalandiBilgi(false), 2000);
    });
  }

  const odendiSayisi = data.faturalar.filter(f => f.durum === 'odendi').length;
  const kismiSayisi = data.faturalar.filter(f => f.durum === 'kismi').length;
  const odenmediSayisi = data.faturalar.filter(f => f.durum === 'odenmedi').length;

  // Aylık grafik verisi (son 24 ay)
  const aylikGrafik = data.aylikOzet.slice(-24);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-200 transition"><ArrowLeft size={22} /></button>
          <div>
            <h2 className="text-2xl font-extrabold text-gray-800">{data.cariAdi}</h2>
            <span className="text-sm text-gray-400 font-mono">{data.cariKodu}</span>
          </div>
        </div>
        
        {/* Ekstre Menüsü */}
        <div className="relative">
          <button
            onClick={() => setShowMenuId(showMenuId === 'ekstre' ? null : 'ekstre')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition border border-blue-200 font-medium text-sm"
            title="Ekstresini PDF veya Mail olarak al"
          >
            <FileText size={16} />
            Ekstre
            <ChevronDown size={14} className={`transition ${showMenuId === 'ekstre' ? 'rotate-180' : ''}`} />
          </button>
          
          {showMenuId === 'ekstre' && (
            <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50 min-w-[200px]">
              <button
                onClick={() => pdfMut.mutate()}
                disabled={pdfMut.isPending}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-blue-50 text-blue-600 font-medium transition text-sm border-b border-gray-100 disabled:opacity-50"
              >
                <Download size={16} />
                PDF İndir
                {pdfMut.isPending && <RefreshCw size={14} className="animate-spin ml-auto" />}
              </button>
              <button
                onClick={() => mailMut.mutate()}
                disabled={mailMut.isPending}
                className="flex items-center gap-3 w-full px-4 py-3 hover:bg-blue-50 text-blue-600 font-medium transition text-sm disabled:opacity-50"
              >
                <Mail size={16} />
                Outlook ile Gönder
                {mailMut.isPending && <RefreshCw size={14} className="animate-spin ml-auto" />}
              </button>
            </div>
          )}
        </div>
      </div>


      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        <KPICard pastel title="Toplam Fatura" value={fmtShort(data.toplamFatura) + ' ₺'} subtitle={`${data.faturalar.length} fatura`} icon={FileText} color="red" />
        <KPICard pastel title="Toplam Ödeme" value={fmtShort(data.toplamOdeme) + ' ₺'} subtitle={`${data.odemeler.length} ödeme`} icon={CreditCard} color="green" />
        <KPICard pastel title="Toplam Borç" value={fmtShort(data.kalanBorc) + ' ₺'}
          subtitle={data.kalanBorc > 0 ? 'Ödenmeyen tüm faturalar' : 'Borç yok'}
          icon={AlertTriangle} color={data.kalanBorc > 0 ? 'amber' : 'green'} />
        {/* Vadesi gelen borç — anlaşma yoksa tüm borç, henüz gelmemişse toplam borç göster */}
        {(() => {
          const noAgreement = !data.ortVade || data.ortVade === 0;
          const vg = noAgreement ? (data.kalanBorc ?? 0) : (data.vadesiGelenBorc ?? 0);
          const hasDebt = vg > 0;
          const notYetDue = !noAgreement && vg === 0 && (data.kalanBorc ?? 0) > 0;
          const displayVal = notYetDue ? (data.kalanBorc ?? 0) : vg;
          return (
            <div className={`rounded-xl border p-3 shadow-sm transition-all ${notYetDue ? 'bg-blue-50 border-blue-200' : hasDebt ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Vadesi Gelen Borç</span>
                <AlertTriangle size={13} className={notYetDue ? 'text-blue-400' : hasDebt ? 'text-rose-400' : 'text-slate-400'} />
              </div>
              <div className={`text-lg font-extrabold leading-tight ${notYetDue ? 'text-blue-600' : hasDebt ? 'text-rose-700' : 'text-slate-600'}`}>
                {fmtShort(displayVal)} ₺
              </div>
              <div className="text-[10px] mt-0.5 leading-tight text-gray-500">
                {noAgreement
                  ? 'Anlaşma yok · tüm borç'
                  : notYetDue
                    ? 'Vadesi henüz gelmedi'
                    : `Toplam: ${fmtShort(data.kalanBorc)} ₺`}
              </div>
            </div>
          );
        })()}
        <KPICard pastel title="Vade Süresi"
          value={(data.ortVade > 0 ? data.ortVade : 0) + ' gün'}
          subtitle={data.ortVade > 0 ? 'Firma anlaşması' : (data.ortOdemeGun > 0 ? `Ort. ${data.ortOdemeGun} gün` : 'Veri yok')}
          icon={Calendar} color="purple" />
        <KPICard pastel title="Vadesi Geçen Gün" value={data.odenmeGunSayisi + ' gün'}
          subtitle="Vade tarihinden bu yana"
          icon={Clock} color={data.odenmeGunSayisi > 90 ? 'red' : 'slate'} />
        <KPICard pastel title="Son Ödeme"
          value={data.sonOdeme ? fmtShort(data.sonOdeme.tutar) + ' ₺' : '-'}
          subtitle={data.sonOdeme
            ? `${fmtTarih(data.sonOdeme.tarih)}${data.sonOdemeGunOnce != null ? ` · ${data.sonOdemeGunOnce} gün önce` : ''}`
            : 'Ödeme yok'}
          icon={TrendingUp} color="blue" />
      </div>

      {/* Son 1 Yıl Özet */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-800 mb-3">Son 1 Yıl Özet</h3>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 text-sm">
          <div className="bg-red-50 rounded-xl p-3"><div className="text-[10px] text-red-500 uppercase font-semibold">Fatura Toplamı</div><div className="text-lg font-bold text-red-700">{fmtFull(data.sonBirYilOzet.toplamFatura)} ₺</div><div className="text-xs text-red-400">{data.sonBirYilOzet.faturaSayisi} adet</div></div>
          <div className="bg-emerald-50 rounded-xl p-3"><div className="text-[10px] text-emerald-500 uppercase font-semibold">Ödeme Toplamı</div><div className="text-lg font-bold text-emerald-700">{fmtFull(data.sonBirYilOzet.toplamOdeme)} ₺</div><div className="text-xs text-emerald-400">{data.sonBirYilOzet.odemeSayisi} adet</div></div>
          <div className="bg-blue-50 rounded-xl p-3"><div className="text-[10px] text-blue-500 uppercase font-semibold">Ort. Aylık Ödeme</div><div className="text-lg font-bold text-blue-700">{fmtFull(data.sonBirYilOzet.ortAylikOdeme)} ₺</div></div>
          <div className="bg-purple-50 rounded-xl p-3"><div className="text-[10px] text-purple-500 uppercase font-semibold">Fatura Sayısı</div><div className="text-lg font-bold text-purple-700">{data.faturalar.length}</div></div>
          <div className="bg-gray-50 rounded-xl p-3"><div className="text-[10px] text-gray-500 uppercase font-semibold">Toplam İşlem</div><div className="text-lg font-bold text-gray-700">{data.islemSayisi}</div></div>
        </div>
      </div>

      {/* Grafikler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Aylık Fatura/Ödeme */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">Aylık Fatura / Ödeme Akışı</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={aylikGrafik}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="ay" tick={{ fontSize: 9, fill: '#999' }} angle={-45} textAnchor="end" height={60} />
              <YAxis yAxisId="left" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 9, fill: '#999' }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtShort(v)} tick={{ fontSize: 9, fill: '#999' }} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="fatura" name="Fatura" fill="#ef4444" radius={[3, 3, 0, 0]} opacity={0.8} />
              <Bar yAxisId="left" dataKey="odeme" name="Ödeme" fill="#10b981" radius={[3, 3, 0, 0]} opacity={0.8} />
              <Line yAxisId="right" type="monotone" dataKey="kalanBorc" name="Kümülatif Borç" stroke="#6366f1" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Fatura Durumu Dağılımı */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-800 mb-4">Fatura Ödeme Durumu</h3>
          <div className="flex gap-4 mb-6">
            <div className="flex-1 bg-emerald-50 rounded-xl p-4 text-center"><div className="text-3xl font-extrabold text-emerald-600">{odendiSayisi}</div><div className="text-xs text-emerald-500 font-medium mt-1">Ödendi</div></div>
            <div className="flex-1 bg-amber-50 rounded-xl p-4 text-center"><div className="text-3xl font-extrabold text-amber-600">{kismiSayisi}</div><div className="text-xs text-amber-500 font-medium mt-1">Kısmi Ödeme</div></div>
            <div className="flex-1 bg-red-50 rounded-xl p-4 text-center"><div className="text-3xl font-extrabold text-red-600">{odenmediSayisi}</div><div className="text-xs text-red-500 font-medium mt-1">Ödenmedi</div></div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={[
                { name: 'Ödendi', value: odendiSayisi, color: '#10b981' },
                { name: 'Kısmi', value: kismiSayisi, color: '#f59e0b' },
                { name: 'Ödenmedi', value: odenmediSayisi, color: '#ef4444' },
              ].filter(d => d.value > 0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                {[
                  { color: '#10b981' }, { color: '#f59e0b' }, { color: '#ef4444' },
                ].map((e, i) => <Cell key={i} fill={e.color} stroke="none" />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Fatura Listesi */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-2">
          <h3 className="font-bold text-gray-800">Faturalar</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
              {[
                { k: 'all', l: `Tümü (${data.faturalar.length})` },
                { k: 'odenmedi', l: `Ödenmedi (${odenmediSayisi})` },
                { k: 'kismi', l: `Kısmi (${kismiSayisi})` },
                { k: 'odendi', l: `Ödendi (${odendiSayisi})` },
              ].map(f => (
                <button key={f.k} onClick={() => setFaturaFilter(f.k)}
                  className={`px-3 py-1 rounded-md text-[11px] font-medium transition ${faturaFilter === f.k ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}>
                  {f.l}
                </button>
              ))}
            </div>
            {secilenIdx.size > 0 && (
              <button onClick={() => setSecilenIdx(new Set())} className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-500 px-2 py-1 rounded border border-gray-200 hover:border-red-300">
                <X size={11} /> Seçimi Temizle ({secilenIdx.size})
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="p-2.5 w-8 text-center">
                  <button onClick={selectAllVisible} title="Ödenmemiş/Kısmi tümünü seç/kaldır" className="opacity-60 hover:opacity-100">
                    {filteredFaturalar
                      .filter(f => f.durum === 'odenmedi' || f.durum === 'kismi')
                      .every(f => secilenIdx.has(f.origIdx)) && filteredFaturalar.some(f => f.durum === 'odenmedi' || f.durum === 'kismi')
                      ? <CheckSquare size={14} className="text-blue-600" />
                      : <Square size={14} className="text-gray-400" />}
                  </button>
                </th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Durum</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Fatura Tarihi</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Vade Tarihi</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Vade (gün)</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Belge No</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">İşlem Tipi</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Fatura Tutarı</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Ödenen</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Kalan Borç</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Döviz</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Döviz Tutarı</th>
              </tr>
            </thead>
            <tbody>
              {filteredFaturalar.map((f, i) => {
                const isSelectable = f.durum === 'odenmedi' || f.durum === 'kismi';
                const isSecili = secilenIdx.has(f.origIdx);
                return (
                <tr
                  key={i}
                  onClick={() => isSelectable && toggleSecilen(f.origIdx)}
                  className={`border-t border-gray-50 transition ${
                    isSecili ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' :
                    f.durum === 'odenmedi' ? 'bg-red-50/30 hover:bg-red-50' :
                    f.durum === 'kismi' ? 'bg-amber-50/30 hover:bg-amber-50' : 'hover:bg-emerald-50/30'
                  } ${isSelectable ? 'cursor-pointer' : ''}`}
                >
                  <td className="p-2.5 text-center" onClick={e => { if (isSelectable) { e.stopPropagation(); toggleSecilen(f.origIdx); } }}>
                    {isSelectable
                      ? isSecili
                        ? <CheckSquare size={14} className="text-blue-600 mx-auto" />
                        : <Square size={14} className="text-gray-300 hover:text-gray-500 mx-auto" />
                      : null}
                  </td>
                  <td className="p-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${durumBg[f.durum]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${durumColor[f.durum]}`} />
                      {durumLabel[f.durum]}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-gray-600">{fmtTarih(f.tarih)}</td>
                  <td className="p-2.5 whitespace-nowrap text-gray-500">{fmtTarih(f.vadeTarihi)}</td>
                  <td className="p-2.5 text-right text-gray-500">{f.vadeSuresi || '-'}</td>
                  <td className="p-2.5 font-mono whitespace-nowrap text-gray-500">{f.belgeNo || f.fisNo || '-'}</td>
                  <td className="p-2.5 text-gray-500 truncate max-w-[150px]" title={f.tip}>{f.tip}</td>
                  <td className="p-2.5 text-right font-medium text-gray-800 whitespace-nowrap">{fmtFull(f.tutar)} ₺</td>
                  <td className="p-2.5 text-right text-emerald-600 font-medium whitespace-nowrap">{f.odpiranMiktar > 0 ? fmtFull(f.odpiranMiktar) : '-'}</td>
                  <td className={`p-2.5 text-right font-bold whitespace-nowrap ${f.kalanBorc > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {f.kalanBorc > 0 ? fmtFull(f.kalanBorc) + ' ₺' : '✓'}
                  </td>
                  <td className="p-2.5 text-gray-500">{f.doviz}</td>
                  <td className="p-2.5 text-right text-gray-500 whitespace-nowrap">{f.dovizTutarAbs ? fmtFull(f.dovizTutarAbs) : '-'}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {filteredFaturalar.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">Bu filtreye uygun fatura yok</div>
          )}
        </div>

        {/* Seçim özet barı */}
        {secilenIdx.size > 0 && (
          <div className="sticky bottom-0 left-0 right-0 bg-blue-700 text-white px-5 py-3 flex items-center gap-4 flex-wrap justify-between shadow-lg z-20">
            <div className="flex items-center gap-6">
              <span className="text-sm font-bold">{secilenIdx.size} fatura seçili</span>
              <span className="text-[11px] opacity-80">Toplam Fatura: <b>{fmtFull(secilenToplamFatura)} ₺</b></span>
              <span className="text-[11px] font-bold bg-white/20 px-2 py-0.5 rounded">Ödenecek Toplam: <b>{fmtFull(secilenToplamKalan)} ₺</b></span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleKopyala}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition ${
                  kopyalandiBilgi ? 'bg-emerald-500 text-white' : 'bg-white text-blue-700 hover:bg-blue-50'
                }`}
              >
                {kopyalandiBilgi ? <ClipboardCheck size={14} /> : <Copy size={14} />}
                {kopyalandiBilgi ? 'Kopyalandı!' : 'Excel için Kopyala'}
              </button>
              <button onClick={() => setSecilenIdx(new Set())} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] bg-white/10 hover:bg-white/20">
                <X size={12} /> Temizle
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ödemeler */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Ödeme Geçmişi ({data.odemeler.length})</h3>
        </div>
        <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left p-2.5 font-semibold text-gray-500">Tarih</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Tutar (₺)</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Döviz</th>
                <th className="text-right p-2.5 font-semibold text-gray-500">Döviz Tutarı</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Tip</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Belge No</th>
                <th className="text-left p-2.5 font-semibold text-gray-500">Açıklama</th>
              </tr>
            </thead>
            <tbody>
              {data.odemeler.map((o, i) => (
                <tr key={i} className="border-t border-gray-50 hover:bg-emerald-50/30">
                  <td className="p-2.5 whitespace-nowrap text-gray-600">{o.tarih || '-'}</td>
                  <td className="p-2.5 text-right font-bold text-emerald-600 whitespace-nowrap">{fmtFull(o.tutar)}</td>
                  <td className="p-2.5 text-gray-500">{o.doviz}</td>
                  <td className="p-2.5 text-right text-gray-500 whitespace-nowrap">{o.dovizTutar ? fmtFull(o.dovizTutar) : '-'}</td>
                  <td className="p-2.5 text-gray-500 truncate max-w-[120px]">{o.tip}</td>
                  <td className="p-2.5 font-mono text-gray-500">{o.belgeNo || o.fisNo || '-'}</td>
                  <td className="p-2.5 text-gray-500 truncate max-w-[250px]" title={o.aciklama}>{o.aciklama || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════ ANA SAYFA ══════════
export default function FinancePage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('ozet');
  const [selectedCari, setSelectedCari] = useState(null);
  const [refreshMsg, setRefreshMsg] = useState(null); // { type: 'info'|'success'|'error', text }
  const pollRef = useRef(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling() {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await getFinanceRefreshStatus();
        const s = res.data;
        if (s.status === 'done') {
          stopPolling();
          setRefreshMsg({ type: 'success', text: `✓ ${s.message || 'Excel güncellendi'} — ${new Date(s.finishedAt).toLocaleTimeString('tr-TR')}` });
          qc.invalidateQueries({ queryKey: ['finance-ozet'] });
          qc.invalidateQueries({ queryKey: ['finance-cariler'] });
          qc.invalidateQueries({ queryKey: ['finance-cariler-all'] });
        } else if (s.status === 'error') {
          stopPolling();
          setRefreshMsg({ type: 'error', text: s.error || 'Yenileme hatası' });
        }
      } catch (_) {}
    }, 4000);
  }

  useEffect(() => () => stopPolling(), []);

  const refreshMut = useMutation({
    mutationFn: refreshFinanceExcel,
    onSuccess: (res) => {
      const d = res.data;
      if (d.running) {
        setRefreshMsg({ type: 'info', text: 'SQL sorguları çalışıyor, veriler hazır olduğunda otomatik yenilenecek…' });
        startPolling();
      } else {
        setRefreshMsg({ type: 'success', text: d.message || 'Tamamlandı' });
      }
    },
    onError: (err) => {
      setRefreshMsg({ type: 'error', text: err?.response?.data?.error || 'Bağlantı hatası' });
    },
  });

  function handleSelectCari(code) {
    setSelectedCari(code);
    setActiveTab('detay');
  }
  function handleBack() {
    setSelectedCari(null);
    setActiveTab('borc');
  }

  const tabs = [
    { key: 'ozet', label: 'Genel Özet', emoji: '📊' },
    { key: 'borc', label: 'Borç', emoji: '📕' },
    { key: 'alacak', label: 'Alacak', emoji: '📗' },
  ];
  if (selectedCari) tabs.push({ key: 'detay', label: selectedCari, emoji: '🔍' });

  return (
    <div className="p-6 bg-gray-50/50 min-h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800">Finans</h1>
          <p className="text-sm text-gray-400 mt-1">RESTAR — Cari hesap borç/alacak takibi</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          <button
            onClick={() => { setRefreshMsg(null); refreshMut.mutate(); }}
            disabled={refreshMut.isPending || refreshMsg?.type === 'info'}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-sm"
          >
            <RefreshCw size={15} className={(refreshMut.isPending || refreshMsg?.type === 'info') ? 'animate-spin' : ''} />
            {refreshMut.isPending ? 'Başlatılıyor…' : refreshMsg?.type === 'info' ? 'Sorgulanıyor…' : "Excel'i Yenile"}
          </button>
          <KurBand />
        </div>
      </div>

      {/* Tabs */}
      {refreshMsg && (
        <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm mb-4 ${
          refreshMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          : refreshMsg.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700'
          : 'bg-blue-50 border border-blue-200 text-blue-700'
        }`}>
          {refreshMsg.type === 'info'
            ? <RefreshCw size={14} className="animate-spin shrink-0" />
            : refreshMsg.type === 'success'
            ? <RefreshCw size={14} className="shrink-0" />
            : <AlertTriangle size={14} className="shrink-0" />}
          <span>{refreshMsg.text}</span>
          <button onClick={() => setRefreshMsg(null)} className="ml-auto text-current opacity-50 hover:opacity-100 text-lg leading-none">×</button>
        </div>
      )}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${activeTab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            <span className="mr-1.5">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'ozet' && <OzetTab onSelectCari={handleSelectCari} onNavigateTab={setActiveTab} />}
      {activeTab === 'borc' && <CarilerTab onSelectCari={handleSelectCari} mode="borc" />}
      {activeTab === 'alacak' && <CarilerTab onSelectCari={handleSelectCari} mode="alacak" />}
      {activeTab === 'detay' && selectedCari && <CariDetayTab cariKodu={selectedCari} onBack={handleBack} />}
    </div>
  );
}
