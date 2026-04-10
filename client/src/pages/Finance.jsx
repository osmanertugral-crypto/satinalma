import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFinanceKurlar, getFinanceOzet, getFinanceCariler, getFinanceCariDetay } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart, Line
} from 'recharts';
import {
  TrendingDown, TrendingUp, Clock, ArrowUpDown,
  ChevronDown, ChevronUp, Search, ArrowLeft, RefreshCw,
  DollarSign, AlertTriangle, FileText, CreditCard, Calendar
} from 'lucide-react';

// ── Helpers ──
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

function KPICard({ title, value, subtitle, icon: Icon, color }) {
  const cm = {
    red: 'from-red-500 to-red-600', green: 'from-emerald-500 to-emerald-600',
    blue: 'from-blue-500 to-blue-600', amber: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600', slate: 'from-slate-600 to-slate-700',
  };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${cm[color] || cm.blue} text-white p-5 shadow-lg`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{title}</span>
        {Icon && <Icon size={18} className="opacity-50" />}
      </div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      {subtitle && <div className="text-[11px] mt-1 opacity-70">{subtitle}</div>}
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
function OzetTab({ onSelectCari }) {
  const { data: ozet, isLoading } = useQuery({
    queryKey: ['finance-ozet'], queryFn: () => getFinanceOzet().then(r => r.data),
  });
  const { data: cariler } = useQuery({
    queryKey: ['finance-cariler-all'], queryFn: () => getFinanceCariler({}).then(r => r.data),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 gap-2 text-gray-500"><RefreshCw className="animate-spin" size={20} /> Yükleniyor...</div>;
  if (!ozet) return null;

  const b = ozet.borc;
  const a = ozet.alacak;

  // Özet tablosu verisi
  const ozetTablo = [
    { doviz: 'TL', borcUretim: b.TL.yurticiUretim.doviz, borcDiger: b.TL.diger.doviz, borcToplam: b.TL.toplam.tl, alacakUretim: a.TL.yurticiUretim.doviz, alacakDiger: a.TL.diger.doviz, alacakToplam: a.TL.toplam.tl },
    { doviz: 'USD', borcUretim: b.USD.yurticiUretim.doviz, borcDiger: b.USD.diger.doviz, borcToplam: b.USD.yurticiUretim.doviz + b.USD.diger.doviz, alacakUretim: a.USD.yurticiUretim.doviz, alacakDiger: a.USD.diger.doviz, alacakToplam: a.USD.yurticiUretim.doviz + a.USD.diger.doviz },
    { doviz: 'EUR', borcUretim: b.EUR.yurticiUretim.doviz, borcDiger: b.EUR.diger.doviz, borcToplam: b.EUR.yurticiUretim.doviz + b.EUR.diger.doviz, alacakUretim: a.EUR.yurticiUretim.doviz, alacakDiger: a.EUR.diger.doviz, alacakToplam: a.EUR.yurticiUretim.doviz + a.EUR.diger.doviz },
  ];

  // Toplam borçlu ve alacaklı sayısı
  const borcluSayisi = cariler ? cariler.filter(c => c.bakiye < 0).length : 0;
  const alacakliSayisi = cariler ? cariler.filter(c => c.bakiye > 0).length : 0;

  // KPI hesapları - TL karşılıkları
  const toplamBorcTL = Math.abs(b.TL.toplam.tl) + Math.abs(b.USD.toplam.tl || b.USD.yurticiUretim.tl + b.USD.diger.tl) + Math.abs(b.EUR.toplam.tl || b.EUR.yurticiUretim.tl + b.EUR.diger.tl);
  const toplamAlacakTL = (a.TL.toplam.tl) + (a.USD.toplam.tl || a.USD.yurticiUretim.tl + a.USD.diger.tl) + (a.EUR.toplam.tl || a.EUR.yurticiUretim.tl + a.EUR.diger.tl);

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Toplam Borcumuz (TL karş.)" value={fmtShort(toplamBorcTL) + ' ₺'} subtitle={`${borcluSayisi} cariye borçluyuz`} icon={TrendingDown} color="red" />
        <KPICard title="Toplam Alacağımız (TL karş.)" value={fmtShort(toplamAlacakTL) + ' ₺'} subtitle={`${alacakliSayisi} cariden alacağımız var`} icon={TrendingUp} color="green" />
        <KPICard title="Vadesi Gelen Toplam Tutar" value={fmtShort(toplamVadesiGelenTL) + ' ₺'} subtitle={`${vadesiGelenCariSayisi} carinin vadesi gelmiş`} icon={Calendar} color="amber" />
        <KPICard title="Toplam Cari" value={cariler ? cariler.length : '...'} subtitle="320 hesap grubu" icon={FileText} color="blue" />
      </div>

      {/* 320 RESTAR ÖZET Tablosu */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">320 RESTAR Borç / Alacak Özet</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-red-50">
                <th colSpan={5} className="p-2 text-center font-bold text-red-700 text-xs uppercase tracking-wider">BORÇ</th>
                <th className="bg-gray-100" rowSpan={2}></th>
                <th colSpan={4} className="p-2 text-center font-bold text-emerald-700 text-xs uppercase tracking-wider bg-emerald-50">ALACAK</th>
              </tr>
              <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="p-2 text-left">Döviz</th>
                <th className="p-2 text-right">Yurtiçi Üretim</th>
                <th className="p-2 text-right">Diğer</th>
                <th className="p-2 text-right font-bold">Toplam Borç</th>
                <th className="p-2 text-right">Net (Borç-Alacak)</th>
                <th className="p-2 text-left bg-emerald-50">Yurtiçi Üretim</th>
                <th className="p-2 text-right bg-emerald-50">Diğer</th>
                <th className="p-2 text-right bg-emerald-50 font-bold">Toplam Alacak</th>
              </tr>
            </thead>
            <tbody>
              {ozetTablo.map((r, i) => {
                const sym = r.doviz === 'USD' ? '$' : r.doviz === 'EUR' ? '€' : '₺';
                const net = r.borcToplam + r.alacakToplam;
                return (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-bold text-gray-700">{r.doviz} <span className="text-gray-400 font-normal text-xs">({sym})</span></td>
                    <td className="p-3 text-right text-red-600 font-medium">{fmtFull(r.borcUretim)}</td>
                    <td className="p-3 text-right text-red-600 font-medium">{fmtFull(r.borcDiger)}</td>
                    <td className="p-3 text-right text-red-700 font-bold">{fmtFull(r.borcToplam)}</td>
                    <td className={`p-3 text-right font-bold ${net < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtFull(net)} {sym}</td>
                    <td className="bg-gray-100 w-px"></td>
                    <td className="p-3 text-right text-emerald-600 font-medium bg-emerald-50/30">{fmtFull(r.alacakUretim)}</td>
                    <td className="p-3 text-right text-emerald-600 font-medium bg-emerald-50/30">{fmtFull(r.alacakDiger)}</td>
                    <td className="p-3 text-right text-emerald-700 font-bold bg-emerald-50/30">{fmtFull(r.alacakToplam)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-300 bg-gray-50">
                <td colSpan={4} className="p-3 text-right font-bold text-gray-700">Genel Toplam (TL karşılığı):</td>
                <td className={`p-3 text-right text-lg font-extrabold ${ozet.genelToplam < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtFull(ozet.genelToplam)} ₺</td>
                <td className="bg-gray-100"></td>
                <td colSpan={3}></td>
              </tr>
            </tbody>
          </table>
        </div>
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

  const filtered = useMemo(() => {
    if (!cariler) return [];
    let arr = [...cariler];
    // mode filtresi
    if (mode === 'borc') arr = arr.filter(r => r.bakiye < 0);
    else if (mode === 'alacak') arr = arr.filter(r => r.bakiye > 0);
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(r => r.cariKodu.toLowerCase().includes(s) || r.cariAdi.toLowerCase().includes(s));
    }
    arr.sort((a, b) => {
      let va = a[sortField] ?? 0, vb = b[sortField] ?? 0;
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return arr;
  }, [cariler, search, sortField, sortDir, mode]);

  // Borç/Alacak toplamları
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

  const CK_OPTIONS = ['TÜMÜ', 'YURTİÇİ ÜRETİM STOKLARI', 'DİĞER'];
  const DVZ_OPTIONS = ['TÜMÜ', 'TL', 'USD', 'EUR'];

  return (
    <div className="space-y-4">
      {/* Filtreler */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {CK_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setCariKontrol(opt)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition whitespace-nowrap ${cariKontrol === opt ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {opt === 'YURTİÇİ ÜRETİM STOKLARI' ? 'Yurtiçi Üretim' : opt === 'DİĞER' ? 'Diğer' : 'Tümü'}
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
                    { f: 'ortGun', l: 'Ort. Gün', a: 'right' },
                    { f: 'enUzakGun', l: 'En Uzak', a: 'right' },
                    { f: null, l: 'Son Ödeme', a: 'left' },
                    { f: 'sonOdemeTutar', l: 'Son Ödeme Tutarı', a: 'right' },
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
                        {r.cariKontrol === 'YURTİÇİ ÜRETİM STOKLARI' ? 'Üretim' : r.cariKontrol === 'DİĞER' ? 'Diğer' : r.cariKontrol}
                      </td>
                      <td className={`p-2.5 text-right whitespace-nowrap font-bold ${isBorc ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fmtFull(Math.abs(r.bakiye))} {sym}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${isBorc ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {r.durumu || (isBorc ? 'BORÇ' : 'ALACAK')}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        {r.ortGun != null ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${Math.abs(r.ortGun) > 90 ? 'bg-red-100 text-red-700' : Math.abs(r.ortGun) > 30 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                            {Math.abs(r.ortGun)}g
                          </span>
                        ) : '-'}
                      </td>
                      <td className="p-2.5 text-right text-xs text-gray-500">
                        {r.enUzakGun != null ? <span>{Math.abs(r.enUzakGun)}g</span> : '-'}
                      </td>
                      <td className="p-2.5 text-xs text-gray-500 whitespace-nowrap">{r.sonOdemeTarih || '-'}</td>
                      <td className="p-2.5 text-right text-xs whitespace-nowrap text-gray-600 font-medium">{r.sonOdemeTutar ? fmtFull(r.sonOdemeTutar) : '-'}</td>
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

  const [faturaFilter, setFaturaFilter] = useState('all'); // all, odenmedi, kismi, odendi

  if (isLoading) return <div className="flex items-center justify-center h-64 gap-2 text-gray-500"><RefreshCw className="animate-spin" size={20} /> Yükleniyor...</div>;
  if (!data) return null;

  const durumColor = { odendi: 'bg-emerald-500', kismi: 'bg-amber-500', odenmedi: 'bg-red-500' };
  const durumLabel = { odendi: 'Ödendi', kismi: 'Kısmi', odenmedi: 'Ödenmedi' };
  const durumBg = { odendi: 'bg-emerald-50 text-emerald-700 border-emerald-200', kismi: 'bg-amber-50 text-amber-700 border-amber-200', odenmedi: 'bg-red-50 text-red-700 border-red-200' };

  const filteredFaturalar = data.faturalar.filter(f => faturaFilter === 'all' || f.durum === faturaFilter);

  const odendiSayisi = data.faturalar.filter(f => f.durum === 'odendi').length;
  const kismiSayisi = data.faturalar.filter(f => f.durum === 'kismi').length;
  const odenmediSayisi = data.faturalar.filter(f => f.durum === 'odenmedi').length;

  // Aylık grafik verisi (son 24 ay)
  const aylikGrafik = data.aylikOzet.slice(-24);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-200 transition"><ArrowLeft size={22} /></button>
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800">{data.cariAdi}</h2>
          <span className="text-sm text-gray-400 font-mono">{data.cariKodu}</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KPICard title="Toplam Fatura" value={fmtShort(data.toplamFatura) + ' ₺'} subtitle={`${data.faturalar.length} fatura`} icon={FileText} color="red" />
        <KPICard title="Toplam Ödeme" value={fmtShort(data.toplamOdeme) + ' ₺'} subtitle={`${data.odemeler.length} ödeme`} icon={CreditCard} color="green" />
        <KPICard title="Kalan Borç" value={fmtShort(data.kalanBorc) + ' ₺'}
          subtitle={data.kalanBorc > 0 ? 'Hala borçluyuz' : 'Borç yok'}
          icon={AlertTriangle} color={data.kalanBorc > 0 ? 'amber' : 'green'} />
        <KPICard title="Vade Süresi" value={data.ortVade + ' gün'} subtitle="Ortalama fatura vadesi" icon={Calendar} color="purple" />
        <KPICard title="Ödenmemiş Gün" value={data.odenmeGunSayisi + ' gün'}
          subtitle="En eski ödenmemiş fatura"
          icon={Clock} color={data.odenmeGunSayisi > 90 ? 'red' : 'slate'} />
        <KPICard title="Son Ödeme"
          value={data.sonOdeme ? fmtFull(data.sonOdeme.tutar) + ' ₺' : '-'}
          subtitle={data.sonOdeme ? data.sonOdeme.tarih : 'Ödeme yok'}
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">Faturalar</h3>
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
        </div>
        <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
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
              {filteredFaturalar.map((f, i) => (
                <tr key={i} className={`border-t border-gray-50 transition ${f.durum === 'odenmedi' ? 'bg-red-50/30 hover:bg-red-50' : f.durum === 'kismi' ? 'bg-amber-50/30 hover:bg-amber-50' : 'hover:bg-emerald-50/30'}`}>
                  <td className="p-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${durumBg[f.durum]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${durumColor[f.durum]}`} />
                      {durumLabel[f.durum]}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap text-gray-600">{f.tarih || '-'}</td>
                  <td className="p-2.5 whitespace-nowrap text-gray-500">{f.vadeTarihi || '-'}</td>
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
              ))}
            </tbody>
          </table>
          {filteredFaturalar.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">Bu filtreye uygun fatura yok</div>
          )}
        </div>
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
  const [activeTab, setActiveTab] = useState('ozet');
  const [selectedCari, setSelectedCari] = useState(null);

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
        <KurBand />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${activeTab === t.key ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
            <span className="mr-1.5">{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'ozet' && <OzetTab onSelectCari={handleSelectCari} />}
      {activeTab === 'borc' && <CarilerTab onSelectCari={handleSelectCari} mode="borc" />}
      {activeTab === 'alacak' && <CarilerTab onSelectCari={handleSelectCari} mode="alacak" />}
      {activeTab === 'detay' && selectedCari && <CariDetayTab cariKodu={selectedCari} onBack={handleBack} />}
    </div>
  );
}
