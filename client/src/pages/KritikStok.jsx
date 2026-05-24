import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCriticalStock, getKritikStokIsaretliler, isaretle, isaretiKaldir,
  kritikStokAyarlarGuncelle, topluIsaretle, topluIsaretiKaldir, getAbcAnalysis,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { PageHeader, Card, Spinner } from '../components/UI';
import {
  AlertTriangle, CheckCircle, Search, Download, RefreshCw,
  TrendingDown, Clock, ShoppingCart, Package,
  ChevronUp, ChevronDown, X, Bookmark, BookmarkCheck, Settings2, BookmarkPlus,
  BarChart2, BookmarkX,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';

// ── Yardımcılar ───────────────────────────────────────────────────────────────
function fmtNum(v, dec = 0) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: dec }).format(v);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR');
}
function fmtTRY(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v);
}

// ── Kritik Stok yapılandırması ────────────────────────────────────────────────
const DURUM_CONFIG = {
  kritik:   { label: 'Kritik', bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-300',    row: 'bg-red-50',       dot: 'bg-red-500',    order: 0 },
  uyari:    { label: 'Uyarı',  bg: 'bg-orange-100',  text: 'text-orange-700', border: 'border-orange-300', row: 'bg-orange-50/60', dot: 'bg-orange-400', order: 1 },
  dikkat:   { label: 'Dikkat', bg: 'bg-yellow-100',  text: 'text-yellow-700', border: 'border-yellow-300', row: 'bg-yellow-50/40', dot: 'bg-yellow-400', order: 2 },
  normal:   { label: 'Normal', bg: 'bg-emerald-100', text: 'text-emerald-700',border: 'border-emerald-200',row: '',                dot: 'bg-emerald-400',order: 3 },
  belirsiz: { label: '—',      bg: 'bg-gray-100',    text: 'text-gray-500',   border: 'border-gray-200',   row: '',                dot: 'bg-gray-300',   order: 4 },
};

// ── ABC yapılandırması ────────────────────────────────────────────────────────
const ABC_COLORS = { A: '#3b82f6', B: '#10b981', C: '#9ca3af' };
const ABC_CFG = {
  A: { label: 'A Sınıfı', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',    desc: 'Yüksek değer — Öncelikli izlem' },
  B: { label: 'B Sınıfı', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', desc: 'Orta değer — Düzenli kontrol' },
  C: { label: 'C Sınıfı', color: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-200',    desc: 'Düşük değer — Periyodik gözden geçir' },
};

// ── Ortak Bileşenler ──────────────────────────────────────────────────────────
function DurumBadge({ durum }) {
  const c = DURUM_CONFIG[durum] || DURUM_CONFIG.belirsiz;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function AbcBadge({ sinif }) {
  const c = ABC_CFG[sinif];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${c.bg} ${c.color} border ${c.border}`}>
      {sinif}
    </span>
  );
}

function TukenmeBar({ mevcut, kritik }) {
  if (kritik == null || kritik <= 0) return <span className="text-gray-300 text-xs">—</span>;
  const pct = Math.min(100, Math.round((mevcut / (kritik * 2.5)) * 100));
  const color = pct <= 40 ? 'bg-red-500' : pct <= 60 ? 'bg-orange-400' : pct <= 80 ? 'bg-yellow-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden" style={{ minWidth: 60 }}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ── Detay Modal ───────────────────────────────────────────────────────────────
function DetailModal({ product: p, onClose }) {
  const cfg = DURUM_CONFIG[p.durum] || DURUM_CONFIG.belirsiz;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <p className="font-mono text-xs text-gray-400 mb-0.5">{p.kod}</p>
            <h2 className="font-bold text-gray-800 text-base leading-snug">{p.adi}</h2>
            {p.kart_tipi && <span className="text-xs text-gray-400">{p.kart_tipi}</span>}
          </div>
          <div className="flex items-center gap-3">
            <DurumBadge durum={p.durum} />
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-xl border p-3 text-center ${cfg.bg} ${cfg.border}`}>
              <p className="text-[11px] text-gray-500 mb-0.5">Mevcut Stok</p>
              <p className={`text-2xl font-black ${cfg.text}`}>{fmtNum(p.mevcut_stok, 1)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
              <p className="text-[11px] text-gray-500 mb-0.5">Kritik Eşik</p>
              <p className="text-2xl font-black text-gray-700">{fmtNum(p.kritik_esik)}</p>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
              <p className="text-[11px] text-blue-600 mb-0.5">Sipariş Önerisi</p>
              <p className="text-2xl font-black text-blue-700">{fmtNum(p.siparis_oneri)}</p>
            </div>
          </div>
          {(p.gebze_stok > 0 || p.eticaret_stok > 0 || p.showroom_stok > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Gebze',     val: p.gebze_stok,    color: 'text-blue-600' },
                { label: 'E-Ticaret', val: p.eticaret_stok, color: 'text-emerald-600' },
                { label: 'Showroom',  val: p.showroom_stok, color: 'text-amber-600' },
              ].map(d => (
                <div key={d.label} className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-center">
                  <p className="text-[10px] text-gray-400">{d.label}</p>
                  <p className={`text-sm font-bold ${d.color}`}>{fmtNum(d.val, 1)}</p>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Stok / Kritik Eşik Oranı</span>
              <span className="font-semibold">{p.oran != null ? `${(p.oran * 100).toFixed(0)}%` : '—'}</span>
            </div>
            <TukenmeBar mevcut={p.mevcut_stok} kritik={p.kritik_esik} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Tahmini Tükenme', value: p.tahmini_tukenme != null ? `${fmtNum(p.tahmini_tukenme)} gün` : '—', sub: p.tahmini_tukenme != null ? fmtDate(new Date(Date.now() + p.tahmini_tukenme * 86400000).toISOString()) : '' },
              { label: 'Ort. Alım Aralığı', value: `${fmtNum(p.ort_alim_arasi)} gün`, sub: 'Temin süresi' },
              { label: 'Günlük Tüketim',   value: fmtNum(p.gunluk_tuketim, 3), sub: 'adet/gün' },
              { label: 'Devir Hızı',        value: p.devir_hizi != null ? `${fmtNum(p.devir_hizi, 1)}x/yıl` : '—', sub: '2025-2026 bazlı' },
            ].map(k => (
              <div key={k.label} className="rounded-xl border border-gray-100 bg-white p-3">
                <p className="text-[11px] text-gray-400">{k.label}</p>
                <p className="text-lg font-bold text-gray-800">{k.value}</p>
                {k.sub && <p className="text-[10px] text-gray-400">{k.sub}</p>}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold text-gray-600 mb-3">2025-2026 Alım Özeti</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div><p className="text-[10px] text-gray-400">Alım Sayısı</p><p className="font-bold text-gray-800">{p.alim_sayisi}</p></div>
              <div><p className="text-[10px] text-gray-400">Toplam Alınan</p><p className="font-bold text-gray-800">{fmtNum(p.toplam_miktar, 1)}</p></div>
              <div><p className="text-[10px] text-gray-400">Dönem</p><p className="font-bold text-gray-800">{fmtNum(p.donem_gun)} gün</p></div>
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-3 pt-2 border-t border-gray-200">
              <span>İlk alım: {fmtDate(p.ilk_alim)}</span>
              <span>Son alım: {fmtDate(p.son_alim)}</span>
            </div>
          </div>
          {p.birim_fiyat > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-600">Birim Fiyat (depoda)</span>
              <span className="font-bold text-gray-800">{fmtTRY(p.birim_fiyat)}</span>
            </div>
          )}
          {p.siparis_oneri > 0 && p.birim_fiyat > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <span className="text-sm text-blue-700">Tahmini Sipariş Tutarı</span>
              <span className="font-bold text-blue-800">{fmtTRY(p.siparis_oneri * p.birim_fiyat)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ayarlar Modal ─────────────────────────────────────────────────────────────
function AyarlarModal({ product, isaretliData, onClose, onSave }) {
  const [form, setForm] = useState({
    kritik_esik_manuel: isaretliData?.kritik_esik_manuel ?? '',
    uyari_esik_manuel:  isaretliData?.uyari_esik_manuel ?? '',
    hedef_stok:         isaretliData?.hedef_stok ?? '',
    aciklama:           isaretliData?.aciklama ?? '',
  });
  function handleChange(e) { setForm(f => ({ ...f, [e.target.name]: e.target.value })); }
  function handleSave() {
    onSave({
      kritik_esik_manuel: form.kritik_esik_manuel !== '' ? Number(form.kritik_esik_manuel) : null,
      uyari_esik_manuel:  form.uyari_esik_manuel  !== '' ? Number(form.uyari_esik_manuel)  : null,
      hedef_stok:         form.hedef_stok         !== '' ? Number(form.hedef_stok)         : null,
      aciklama:           form.aciklama || null,
    });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-800 text-base">Kritik Stok Ayarları</h2>
            <p className="text-xs text-gray-400 font-mono mt-0.5">{product.kod} — {product.adi}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700">
            Otomatik hesaplanan değerler: <strong>Kritik Eşik {fmtNum(product.kritik_esik)}</strong>.
            Boş bırakırsanız otomatik değer kullanılır.
          </div>
          {[
            { name: 'kritik_esik_manuel', label: 'Kritik Eşik (Manuel)', placeholder: `Otomatik: ${fmtNum(product.kritik_esik)}` },
            { name: 'uyari_esik_manuel',  label: 'Uyarı Eşiği (Manuel)', placeholder: 'Boş = varsayılan' },
            { name: 'hedef_stok',         label: 'Hedef Stok',           placeholder: 'Boş = sipariş önerisi' },
          ].map(f => (
            <div key={f.name}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label} <span className="text-gray-400 font-normal">— adet</span></label>
              <input type="number" name={f.name} value={form[f.name]} onChange={handleChange} placeholder={f.placeholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama / Not</label>
            <textarea name="aciklama" value={form.aciklama} onChange={handleChange} rows={2}
              placeholder="Bu ürüne özel not..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">İptal</button>
          <button onClick={handleSave} className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700">Kaydet</button>
        </div>
      </div>
    </div>
  );
}

// ── ABC Pareto Tooltip ────────────────────────────────────────────────────────
function ParetoTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs max-w-[220px]">
      <div className="font-mono text-gray-400 mb-0.5">{d.kod}</div>
      <div className="font-medium text-gray-800 mb-2 leading-tight">{d.adi}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4"><span className="text-gray-500">Tutar</span><span className="font-semibold">{fmtTRY(d.tutar)}</span></div>
        <div className="flex justify-between gap-4"><span className="text-gray-500">Pay</span><span>{fmtNum(d.pay, 2)}%</span></div>
        <div className="flex justify-between gap-4"><span className="text-gray-500">Kümülatif</span><span className="font-semibold">{fmtNum(d.kumulatif, 1)}%</span></div>
      </div>
      <div className="mt-2 pt-2 border-t border-gray-100"><AbcBadge sinif={d.abc} /></div>
    </div>
  );
}

// ── ABC Analizi Sekmesi ───────────────────────────────────────────────────────
function AbcAnalizi({ kritikMap }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['abc-analysis'],
    queryFn: () => getAbcAnalysis().then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const [abcFilter, setAbcFilter]       = useState('all');
  const [grupFilter, setGrupFilter]     = useState([]);
  const [search, setSearch]             = useState('');
  const [showFullChart, setShowFullChart] = useState(false);
  const [sortCol, setSortCol]           = useState('sira');
  const [sortDir, setSortDir]           = useState('asc');

  const products = data?.products || [];
  const ozet     = data?.ozet     || {};

  // Benzersiz gruplar
  const availableGroups = useMemo(() => {
    const s = new Set();
    for (const p of products) if (p.stok_grup) s.add(p.stok_grup);
    return [...s].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [products]);

  function toggleGrup(g) {
    setGrupFilter(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  }

  // Filtre + sıralama
  const filtered = useMemo(() => {
    let list = products.filter(p => {
      if (abcFilter !== 'all' && p.abc !== abcFilter) return false;
      if (grupFilter.length > 0 && !grupFilter.includes(p.stok_grup)) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.kod.toLowerCase().includes(q) || p.adi.toLowerCase().includes(q);
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let av, bv;
      if (sortCol === 'tutar')     { av = a.toplam_tutar;  bv = b.toplam_tutar; }
      else if (sortCol === 'pay')  { av = a.harcama_pay;   bv = b.harcama_pay; }
      else if (sortCol === 'kum')  { av = a.kumulatif_pay; bv = b.kumulatif_pay; }
      else if (sortCol === 'alim') { av = a.alim_sayisi;   bv = b.alim_sayisi; }
      else                         { av = a.sira;          bv = b.sira; }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [products, abcFilter, grupFilter, search, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir(col === 'sira' ? 'asc' : 'desc'); }
  }

  function SortBtn({ col, children }) {
    const active = sortCol === col;
    const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : null;
    return (
      <button onClick={() => toggleSort(col)} className={`inline-flex items-center gap-0.5 hover:text-gray-800 ${active ? 'text-blue-600' : ''}`}>
        {children}{Icon && <Icon size={11} />}
      </button>
    );
  }

  // Pareto grafik verisi
  const chartLimit = showFullChart ? products.length : 60;
  const chartData  = products.slice(0, chartLimit).map(p => ({
    kod: p.kod, adi: p.adi,
    tutar: p.toplam_tutar, pay: p.harcama_pay,
    kumulatif: p.kumulatif_pay, abc: p.abc,
  }));

  function exportExcel() {
    const rows = filtered.map(p => ({
      'Sıra': p.sira, 'ABC': p.abc,
      'Stok Kodu': p.kod, 'Ürün Adı': p.adi, 'Grup': p.stok_grup,
      'Toplam Tutar (₺)': p.toplam_tutar,
      'Harcama Payı (%)': p.harcama_pay,
      'Kümülatif (%)': p.kumulatif_pay,
      'Alım Sayısı': p.alim_sayisi,
      'Toplam Miktar': p.toplam_miktar,
      'Son Alım': p.son_alim,
      'Kritik Durum': kritikMap[p.kod]?.durum || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ABC Analizi');
    XLSX.writeFile(wb, `abc-analizi-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (isLoading) return <div className="p-16 text-center"><Spinner /></div>;

  return (
    <div className="space-y-5">
      {/* Üst aksiyonlar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          2025-2026 alım harcamalarına göre Pareto / ABC sınıflandırması &mdash; <strong>{ozet.toplam_urun || 0}</strong> ürün
        </p>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Yenile
          </button>
          <button onClick={exportExcel} className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 border border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">Toplam Harcama</p>
          <p className="text-xl font-black text-gray-800">{fmtTRY(ozet.toplam_harcama)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{ozet.toplam_urun} ürün · 2025-2026</p>
        </Card>
        {['A', 'B', 'C'].map(s => {
          const cfg = ABC_CFG[s];
          const d   = ozet[s.toLowerCase()] || {};
          const pct = ozet.toplam_harcama > 0 ? Math.round((d.tutar / ozet.toplam_harcama) * 100) : 0;
          return (
            <Card key={s} className={`p-4 border ${cfg.border} ${cfg.bg}`}>
              <div className="flex items-center justify-between mb-1">
                <AbcBadge sinif={s} />
                <span className={`text-xs font-semibold ${cfg.color}`}>{d.sayi} ürün</span>
              </div>
              <p className={`text-xl font-black ${cfg.color}`}>{fmtTRY(d.tutar)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Harcamanın %{pct}'i &mdash; {cfg.desc}</p>
            </Card>
          );
        })}
      </div>

      {/* Pareto grafiği */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Pareto Grafiği</p>
            <p className="text-xs text-gray-400">
              İlk {chartLimit} ürün &middot; Çubuklar: ürün harcaması &middot;
              Turuncu çizgi: kümülatif % &middot; Eşikler: <span className="text-red-500">%70</span> A/B &middot; <span className="text-amber-500">%90</span> B/C
            </p>
          </div>
          <button onClick={() => setShowFullChart(v => !v)} className="text-xs text-blue-600 hover:underline shrink-0">
            {showFullChart ? `İlk 60'ı göster` : 'Tümünü göster'}
          </button>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 50, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="kod" tick={false} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="tutar"
              tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v}
              tick={{ fontSize: 10 }} width={48}
            />
            <YAxis
              yAxisId="pct" orientation="right"
              domain={[0, 100]} tickFormatter={v => `${v}%`}
              tick={{ fontSize: 10 }} width={38}
            />
            <RechartsTooltip content={<ParetoTooltip />} />
            <ReferenceLine yAxisId="pct" y={70} stroke="#ef4444" strokeDasharray="5 3"
              label={{ value: '%70', position: 'insideRight', fontSize: 10, fill: '#ef4444', dy: -6 }} />
            <ReferenceLine yAxisId="pct" y={90} stroke="#f59e0b" strokeDasharray="5 3"
              label={{ value: '%90', position: 'insideRight', fontSize: 10, fill: '#f59e0b', dy: -6 }} />
            <Bar yAxisId="tutar" dataKey="tutar" name="Tutar" radius={[2, 2, 0, 0]} maxBarSize={20}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={ABC_COLORS[d.abc]} fillOpacity={0.82} />
              ))}
            </Bar>
            <Line yAxisId="pct" type="monotone" dataKey="kumulatif" stroke="#f97316"
              strokeWidth={2} dot={false} name="Kümülatif %" />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Açıklama */}
        <div className="flex flex-wrap items-center gap-5 justify-center mt-3 pt-3 border-t border-gray-100">
          {Object.entries(ABC_CFG).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: ABC_COLORS[k] }} />
              <span className="text-xs text-gray-500">{v.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-6 border-t-2 border-orange-400" style={{ borderStyle: 'solid' }} />
            <span className="text-xs text-gray-500">Kümülatif %</span>
          </div>
        </div>
      </Card>

      {/* Filtreler + tablo */}
      <Card className="p-4 space-y-3">
        {/* Filtre satırı */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* ABC tab */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key: 'all', label: `Tümü (${products.length})`, color: 'text-gray-600' },
              { key: 'A',   label: `A Sınıfı (${ozet.a?.sayi || 0})`,   color: 'text-blue-600' },
              { key: 'B',   label: `B Sınıfı (${ozet.b?.sayi || 0})`,   color: 'text-emerald-600' },
              { key: 'C',   label: `C Sınıfı (${ozet.c?.sayi || 0})`,   color: 'text-gray-500' },
            ].map(t => (
              <button key={t.key} onClick={() => setAbcFilter(t.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  abcFilter === t.key ? `bg-white shadow-sm ${t.color}` : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Arama */}
          <div className="flex-1 min-w-[180px] relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input type="text" placeholder="Kod veya ürün adı..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <span className="text-xs text-gray-400">{filtered.length} ürün</span>
        </div>

        {/* Grup filtresi */}
        {availableGroups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center pt-1 border-t border-gray-100">
            <span className="text-[11px] text-gray-400 font-medium shrink-0">Grup:</span>
            {availableGroups.map(g => (
              <button key={g} onClick={() => toggleGrup(g)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                  grupFilter.includes(g)
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                }`}>
                {g}
              </button>
            ))}
            {grupFilter.length > 0 && (
              <button onClick={() => setGrupFilter([])} className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-0.5 ml-1">
                <X size={11} /> Temizle
              </button>
            )}
          </div>
        )}

        {/* Tablo */}
        <div className="overflow-auto mt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                <th className="px-3 py-3 text-right font-medium w-10"><SortBtn col="sira">#</SortBtn></th>
                <th className="px-3 py-3 text-center font-medium w-16">ABC</th>
                <th className="px-3 py-3 text-left font-medium">Ürün</th>
                <th className="px-3 py-3 text-right font-medium"><SortBtn col="tutar">Toplam Tutar</SortBtn></th>
                <th className="px-3 py-3 text-right font-medium"><SortBtn col="pay">Pay %</SortBtn></th>
                <th className="px-3 py-3 text-right font-medium w-44"><SortBtn col="kum">Kümülatif %</SortBtn></th>
                <th className="px-3 py-3 text-right font-medium"><SortBtn col="alim">Alım</SortBtn></th>
                <th className="px-3 py-3 text-right font-medium">Miktar</th>
                <th className="px-3 py-3 text-left font-medium">Grup</th>
                <th className="px-3 py-3 text-center font-medium">Kritik</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const kritik = kritikMap[p.kod];
                return (
                  <tr key={p.kod} className="border-b border-gray-100 hover:bg-gray-50/70">
                    <td className="px-3 py-2.5 text-right text-gray-400 font-mono">{p.sira}</td>
                    <td className="px-3 py-2.5 text-center"><AbcBadge sinif={p.abc} /></td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-gray-800 max-w-[220px] truncate">{p.adi}</div>
                      <div className="text-gray-400 font-mono">{p.kod}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmtTRY(p.toplam_tutar)}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {fmtNum(p.harcama_pay, 2)}%
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${p.abc === 'A' ? 'bg-blue-500' : p.abc === 'B' ? 'bg-emerald-500' : 'bg-gray-400'}`}
                            style={{ width: `${Math.min(100, p.kumulatif_pay)}%` }}
                          />
                        </div>
                        <span className="text-gray-600 w-10 text-right">{fmtNum(p.kumulatif_pay, 1)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{p.alim_sayisi}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{fmtNum(p.toplam_miktar, 1)}</td>
                    <td className="px-3 py-2.5">
                      {p.stok_grup ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">{p.stok_grup}</span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {kritik ? <DurumBadge durum={kritik.durum} /> : <span className="text-gray-300 text-[10px]">—</span>}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="py-12 text-center text-gray-400">Sonuç bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bilgi */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-700 font-semibold mb-1">ABC Analizi Hakkında</p>
        <p className="text-xs text-blue-600">
          <strong>A Sınıfı</strong> (0–%70): Az ürün, yüksek harcama. Stok kesintisi en fazla zarar verir — sıkı takip edilmeli. &nbsp;|&nbsp;
          <strong>B Sınıfı</strong> (%70–90): Orta önem. Düzenli gözden geçirme yeterli. &nbsp;|&nbsp;
          <strong>C Sınıfı</strong> (%90–100): Çok sayıda ürün, düşük toplam değer. Basit stok politikası uygulanabilir. &nbsp;|&nbsp;
          Hesaplama: 2025-2026 toplam alım tutarı (TRY bazlı, iade hariç).
        </p>
      </Card>
    </div>
  );
}

// ── Ana Sayfa ─────────────────────────────────────────────────────────────────
export default function KritikStokPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'admin' || (user?.extra_permissions?.includes('kritik_stok_duzenle') ?? false);

  const qc = useQueryClient();
  const [mainTab, setMainTab]         = useState('kritik'); // 'kritik' | 'abc'
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [sortBy, setSortBy]           = useState('durum');
  const [sortDir, setSortDir]         = useState('asc');
  const [selected, setSelected]       = useState(null);
  const [ayarlarProduct, setAyarlarProduct] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['critical-stock', search, statusFilter],
    queryFn: () => getCriticalStock({
      search: search || undefined,
      status: (statusFilter !== 'all' && statusFilter !== 'isaretlenenler') ? statusFilter : undefined,
    }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
  });

  const { data: isaretliListesi = [], isLoading: isaretliIsLoading } = useQuery({
    queryKey: ['kritik-stok-isaretli'],
    queryFn: () => getKritikStokIsaretliler().then(r => r.data),
    staleTime: 30 * 1000,
  });

  const isaretliMap = useMemo(() => {
    const m = {};
    for (const item of isaretliListesi) m[item.stok_kodu] = item;
    return m;
  }, [isaretliListesi]);

  const isaretMutation = useMutation({
    mutationFn: ({ stok_kodu, isaret }) => isaret ? isaretle(stok_kodu) : isaretiKaldir(stok_kodu),
    onSuccess: () => qc.invalidateQueries(['kritik-stok-isaretli']),
  });

  const topluIsaretleMutation = useMutation({
    mutationFn: (kodlar) => topluIsaretle(kodlar),
    onSuccess: () => qc.invalidateQueries(['kritik-stok-isaretli']),
  });

  const ayarlarMutation = useMutation({
    mutationFn: ({ stok_kodu, data }) => kritikStokAyarlarGuncelle(stok_kodu, data),
    onSuccess: () => { qc.invalidateQueries(['kritik-stok-isaretli']); setAyarlarProduct(null); },
  });

  const topluKaldirMutation = useMutation({
    mutationFn: (kodlar) => topluIsaretiKaldir(kodlar),
    onSuccess: () => qc.invalidateQueries(['kritik-stok-isaretli']),
  });

  const products = data?.products || [];
  const ozet     = data?.ozet     || {};

  // Kritik Map (ABC sekmesi için çapraz referans)
  const kritikMap = useMemo(() => {
    const m = {};
    for (const p of products) m[p.kod] = p;
    return m;
  }, [products]);

  // Sıralama
  const sorted = useMemo(() => {
    const list = [...products];
    list.sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case 'durum':   av = (DURUM_CONFIG[a.durum] || DURUM_CONFIG.belirsiz).order; bv = (DURUM_CONFIG[b.durum] || DURUM_CONFIG.belirsiz).order; break;
        case 'oran':    av = a.oran ?? 999;   bv = b.oran ?? 999;   break;
        case 'tukenme': av = a.tahmini_tukenme ?? 9999; bv = b.tahmini_tukenme ?? 9999; break;
        case 'stok':    av = a.mevcut_stok;   bv = b.mevcut_stok;   break;
        case 'kritik':  av = a.kritik_esik;   bv = b.kritik_esik;   break;
        case 'devir':   av = a.devir_hizi ?? 0; bv = b.devir_hizi ?? 0; break;
        case 'siparis': av = a.siparis_oneri; bv = b.siparis_oneri; break;
        default:        return a.kod.localeCompare(b.kod, 'tr');
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [products, sortBy, sortDir]);

  // Benzersiz gruplar
  function normKey(s) {
    return (s || '').toUpperCase()
      .replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/Ş/g, 'S').replace(/ş/g, 'S')
      .replace(/Ğ/g, 'G').replace(/ğ/g, 'G').replace(/Ü/g, 'U').replace(/ü/g, 'U')
      .replace(/Ö/g, 'O').replace(/ö/g, 'O').replace(/Ç/g, 'C').replace(/ç/g, 'C');
  }

  const availableGroups = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const raw = (p.stok_grup || '').trim();
      if (!raw) continue;
      const key = normKey(raw);
      if (!map.has(key)) map.set(key, raw);
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [products]);

  function toggleGroup(g) {
    const key = normKey(g);
    setSelectedGroups(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  }

  // İşaretlenenler modunda: isaretliListesi'ndeki TÜM ürünler, kritikMap ile zenginleştirilmiş
  const isaretlenenlerList = useMemo(() => {
    let list = isaretliListesi.map(item => {
      const kritik = kritikMap[item.stok_kodu];
      if (kritik) return kritik;
      return {
        kod: item.stok_kodu,
        adi: item.stok_adi || item.stok_kodu,
        kart_tipi: item.kart_tipi || '',
        stok_grup: '',
        alim_sayisi: 0,
        toplam_miktar: 0,
        ilk_alim: null,
        son_alim: null,
        donem_gun: 0,
        ort_alim_arasi: 0,
        gunluk_tuketim: 0,
        devir_hizi: null,
        kritik_esik: item.kritik_esik_manuel ?? 0,
        mevcut_stok: item.mevcut_stok ?? 0,
        gebze_stok: item.gebze_stok ?? 0,
        eticaret_stok: item.eticaret_stok ?? 0,
        showroom_stok: item.showroom_stok ?? 0,
        tahmini_tukenme: null,
        siparis_oneri: 0,
        birim_fiyat: item.birim_fiyat ?? 0,
        son_hareket: null,
        durum: 'belirsiz',
        oran: null,
      };
    });

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.kod.toLowerCase().includes(q) || p.adi.toLowerCase().includes(q));
    }
    if (selectedGroups.length > 0) {
      list = list.filter(p => selectedGroups.includes(normKey(p.stok_grup)));
    }

    list = [...list].sort((a, b) => {
      let av, bv;
      switch (sortBy) {
        case 'durum':   av = (DURUM_CONFIG[a.durum] || DURUM_CONFIG.belirsiz).order; bv = (DURUM_CONFIG[b.durum] || DURUM_CONFIG.belirsiz).order; break;
        case 'oran':    av = a.oran ?? 999;   bv = b.oran ?? 999;   break;
        case 'stok':    av = a.mevcut_stok;   bv = b.mevcut_stok;   break;
        case 'tukenme': av = a.tahmini_tukenme ?? 9999; bv = b.tahmini_tukenme ?? 9999; break;
        case 'devir':   av = a.devir_hizi ?? 0; bv = b.devir_hizi ?? 0; break;
        case 'siparis': av = a.siparis_oneri; bv = b.siparis_oneri; break;
        default:        return a.kod.localeCompare(b.kod, 'tr');
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });

    return list;
  }, [isaretliListesi, kritikMap, search, selectedGroups, sortBy, sortDir]);

  // Filtreli liste
  const filtered = useMemo(() => {
    if (statusFilter === 'isaretlenenler') return isaretlenenlerList;
    let list = sorted;
    if (selectedGroups.length > 0) list = list.filter(p => selectedGroups.includes(normKey(p.stok_grup)));
    return list;
  }, [sorted, statusFilter, selectedGroups, isaretlenenlerList]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortBtn({ col, children }) {
    const active = sortBy === col;
    const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : null;
    return (
      <button onClick={() => toggleSort(col)} className={`inline-flex items-center gap-0.5 hover:text-gray-800 ${active ? 'text-blue-600' : ''}`}>
        {children}{Icon && <Icon size={11} />}
      </button>
    );
  }

  function handleTopluIsaretle() {
    const eksikKodlar = products.map(p => p.kod).filter(kod => !isaretliMap[kod]);
    if (eksikKodlar.length === 0) return;
    topluIsaretleMutation.mutate(eksikKodlar);
  }

  function exportExcel() {
    const rows = filtered.map(p => ({
      'Durum': DURUM_CONFIG[p.durum]?.label || p.durum,
      'İşaretli': isaretliMap[p.kod] ? 'Evet' : 'Hayır',
      'Stok Kodu': p.kod, 'Ürün Adı': p.adi,
      'Mevcut Stok': p.mevcut_stok, 'Kritik Eşik': p.kritik_esik,
      'Sipariş Önerisi': p.siparis_oneri, 'Tahmini Tükenme (Gün)': p.tahmini_tukenme,
      'Ort. Alım Aralığı (Gün)': p.ort_alim_arasi, 'Günlük Tüketim': p.gunluk_tuketim,
      'Devir Hızı (yıl)': p.devir_hizi, 'Alım Sayısı': p.alim_sayisi,
      'Toplam Alınan': p.toplam_miktar, 'İlk Alım': p.ilk_alim, 'Son Alım': p.son_alim,
      'Birim Fiyat': p.birim_fiyat,
      'Gebze Stok': p.gebze_stok, 'E-Ticaret Stok': p.eticaret_stok, 'Showroom Stok': p.showroom_stok,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'KritikStok');
    XLSX.writeFile(wb, `kritik-stok-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportSiparis() {
    const kritikler = filtered.filter(p => ['kritik', 'uyari'].includes(p.durum));
    const rows = kritikler.map(p => ({
      'Stok Kodu': p.kod, 'Ürün Adı': p.adi,
      'Durum': DURUM_CONFIG[p.durum]?.label || p.durum,
      'Mevcut Stok': p.mevcut_stok, 'Kritik Eşik': p.kritik_esik,
      'Önerilen Sipariş': p.siparis_oneri, 'Tahmini Tükenme (Gün)': p.tahmini_tukenme,
      'Son Alım': p.son_alim, 'Birim Fiyat': p.birim_fiyat,
      'Tahmini Tutar': p.siparis_oneri > 0 && p.birim_fiyat > 0 ? Math.round(p.siparis_oneri * p.birim_fiyat) : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SiparisListesi');
    XLSX.writeFile(wb, `siparis-listesi-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const STATUS_TABS = [
    { key: 'all',           label: `Tümü (${ozet.toplam || 0})`,         color: 'text-gray-600' },
    { key: 'kritik',        label: `Kritik (${ozet.kritik || 0})`,        color: 'text-red-600' },
    { key: 'uyari',         label: `Uyarı (${ozet.uyari || 0})`,          color: 'text-orange-600' },
    { key: 'dikkat',        label: `Dikkat (${ozet.dikkat || 0})`,        color: 'text-yellow-600' },
    { key: 'normal',        label: `Normal (${ozet.normal || 0})`,        color: 'text-emerald-600' },
    { key: 'isaretlenenler',label: `İşaretlenenler (${isaretliListesi.length})`, color: 'text-blue-600' },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Ana sekme çubuğu */}
      <div className="flex gap-0 border-b border-gray-200 -mb-2">
        {[
          { key: 'kritik', label: 'Kritik Stok & Devir Hızı', icon: AlertTriangle },
          { key: 'abc',    label: 'ABC Analizi',               icon: BarChart2 },
        ].map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setMainTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                mainTab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── KRİTİK STOK SEKMESİ ─────────────────────────────────────── */}
      {mainTab === 'kritik' && (
        <>
          <PageHeader
            title="Kritik Stok & Devir Hızı"
            subtitle="2025-2026 alım verilerinden hesaplanan tüketim analizi ve stok uyarı sistemi"
            action={
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Yenile
                </button>
                {canEdit && statusFilter === 'isaretlenenler' && isaretliListesi.length > 0 && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`${isaretliListesi.length} ürünün işaretini kaldırmak istediğinizden emin misiniz?`)) return;
                      topluKaldirMutation.mutate(isaretliListesi.map(i => i.stok_kodu));
                    }}
                    disabled={topluKaldirMutation.isPending}
                    className="inline-flex items-center gap-1.5 border border-red-300 text-red-700 rounded-lg px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-50">
                    <BookmarkX size={14} /> Tümünü Kaldır ({isaretliListesi.length})
                  </button>
                )}
                {canEdit && statusFilter !== 'isaretlenenler' && products.length > 0 && products.some(p => !isaretliMap[p.kod]) && (
                  <button onClick={handleTopluIsaretle} disabled={topluIsaretleMutation.isPending}
                    className="inline-flex items-center gap-1.5 border border-blue-300 text-blue-700 rounded-lg px-3 py-2 text-sm hover:bg-blue-50 disabled:opacity-50">
                    <BookmarkPlus size={14} /> Tümünü İşaretle
                  </button>
                )}
                <button onClick={exportSiparis} className="inline-flex items-center gap-1.5 bg-red-600 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-red-700">
                  <ShoppingCart size={14} /> Sipariş Listesi
                </button>
                <button onClick={exportExcel} className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <Download size={14} /> Excel
                </button>
              </div>
            }
          />

          {/* Özet Kartlar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Analiz Edilen', value: ozet.toplam || 0, icon: Package,       color: 'bg-gray-50 text-gray-600 border-gray-200' },
              { label: 'Kritik',        value: ozet.kritik || 0, icon: AlertTriangle,  color: 'bg-red-50 text-red-600 border-red-200' },
              { label: 'Uyarı',         value: ozet.uyari  || 0, icon: TrendingDown,   color: 'bg-orange-50 text-orange-600 border-orange-200' },
              { label: 'Dikkat',        value: ozet.dikkat || 0, icon: Clock,          color: 'bg-yellow-50 text-yellow-600 border-yellow-200' },
              { label: 'Normal',        value: ozet.normal || 0, icon: CheckCircle,    color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
            ].map(k => {
              const Icon = k.icon;
              return (
                <Card key={k.label} className={`p-4 border ${k.color}`}>
                  <div className="flex items-center gap-3">
                    <Icon size={20} />
                    <div><p className="text-2xl font-black">{k.value}</p><p className="text-xs opacity-70">{k.label}</p></div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Filtreler */}
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-wrap">
                {STATUS_TABS.map(t => (
                  <button key={t.key} onClick={() => setStatusFilter(t.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      statusFilter === t.key ? `bg-white shadow-sm ${t.color}` : 'text-gray-500 hover:text-gray-700'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 min-w-[200px] relative">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input type="text" placeholder="Stok kodu veya ürün adı..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <span className="text-xs text-gray-400">{filtered.length} ürün</span>
            </div>

            {availableGroups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center pt-1 border-t border-gray-100">
                <span className="text-[11px] text-gray-400 font-medium shrink-0">Grup:</span>
                {availableGroups.map(g => (
                  <button key={g} onClick={() => toggleGroup(g)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                      selectedGroups.includes(normKey(g))
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600'
                    }`}>
                    {g}
                  </button>
                ))}
                {selectedGroups.length > 0 && (
                  <button onClick={() => setSelectedGroups([])} className="ml-1 text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-0.5">
                    <X size={11} /> Temizle
                  </button>
                )}
              </div>
            )}
          </Card>

          {/* Tablo */}
          <Card className="overflow-auto">
            {(statusFilter === 'isaretlenenler' ? isaretliIsLoading : isLoading) ? (
              <div className="p-12"><Spinner /></div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500">
                    <th className="px-3 py-3 text-left font-medium w-20"><SortBtn col="durum">Durum</SortBtn></th>
                    <th className="px-3 py-3 text-left font-medium">Ürün</th>
                    <th className="px-3 py-3 text-right font-medium"><SortBtn col="stok">Mevcut</SortBtn></th>
                    <th className="px-3 py-3 text-right font-medium"><SortBtn col="kritik">Kritik Eşik</SortBtn></th>
                    <th className="px-3 py-3 text-right font-medium"><SortBtn col="siparis">Sipariş Önerisi</SortBtn></th>
                    <th className="px-3 py-3 text-center font-medium w-28">Stok Oranı</th>
                    <th className="px-3 py-3 text-right font-medium"><SortBtn col="tukenme">Tükenme</SortBtn></th>
                    <th className="px-3 py-3 text-right font-medium">Alım Aralığı</th>
                    <th className="px-3 py-3 text-right font-medium"><SortBtn col="devir">Devir Hızı</SortBtn></th>
                    <th className="px-3 py-3 text-right font-medium">Son Alım</th>
                    {canEdit && <th className="px-3 py-3 text-center font-medium w-20">İzle</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const cfg = DURUM_CONFIG[p.durum] || DURUM_CONFIG.belirsiz;
                    const marked = !!isaretliMap[p.kod];
                    const isaretliData = isaretliMap[p.kod];
                    return (
                      <tr key={p.kod}
                        className={`border-b border-gray-100 hover:brightness-95 transition-all ${cfg.row} ${marked ? 'ring-1 ring-inset ring-blue-200' : ''}`}>
                        <td className="px-3 py-2.5 cursor-pointer" onClick={() => setSelected(p)}><DurumBadge durum={p.durum} /></td>
                        <td className="px-3 py-2.5 cursor-pointer" onClick={() => setSelected(p)}>
                          <div className="font-medium text-gray-800 leading-tight max-w-[220px] truncate">{p.adi}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-gray-400 font-mono text-[11px]">{p.kod}</span>
                            {p.stok_grup && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100">{p.stok_grup}</span>
                            )}
                          </div>
                          {isaretliData?.aciklama && (
                            <div className="text-blue-500 text-[10px] mt-0.5 truncate max-w-[220px]">{isaretliData.aciklama}</div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-800 cursor-pointer" onClick={() => setSelected(p)}>{fmtNum(p.mevcut_stok, 1)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600 cursor-pointer" onClick={() => setSelected(p)}>
                          {isaretliData?.kritik_esik_manuel != null ? (
                            <span className="text-blue-600 font-semibold" title={`Manuel: ${fmtNum(isaretliData.kritik_esik_manuel)} (Otomatik: ${fmtNum(p.kritik_esik)})`}>
                              {fmtNum(isaretliData.kritik_esik_manuel)}<span className="text-[9px] text-blue-400 ml-0.5">M</span>
                            </span>
                          ) : fmtNum(p.kritik_esik)}
                        </td>
                        <td className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSelected(p)}>
                          {p.siparis_oneri > 0 ? <span className="font-semibold text-blue-700">{fmtNum(p.siparis_oneri)}</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 cursor-pointer" onClick={() => setSelected(p)}>
                          <TukenmeBar mevcut={p.mevcut_stok} kritik={p.kritik_esik} />
                        </td>
                        <td className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSelected(p)}>
                          {p.tahmini_tukenme != null ? (
                            <span className={`font-semibold ${p.tahmini_tukenme <= p.ort_alim_arasi ? 'text-red-600' : p.tahmini_tukenme <= p.ort_alim_arasi * 1.5 ? 'text-orange-500' : 'text-gray-700'}`}>
                              {fmtNum(p.tahmini_tukenme)} g
                            </span>
                          ) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600 cursor-pointer" onClick={() => setSelected(p)}>{fmtNum(p.ort_alim_arasi)} g</td>
                        <td className="px-3 py-2.5 text-right cursor-pointer" onClick={() => setSelected(p)}>
                          {p.devir_hizi != null ? <span className="text-gray-700">{fmtNum(p.devir_hizi, 1)}x</span> : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500 cursor-pointer" onClick={() => setSelected(p)}>{fmtDate(p.son_alim)}</td>
                        {canEdit && (
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                title={marked ? 'Kritik stok listesinden çıkar' : 'Kritik stok listesine ekle'}
                                onClick={() => isaretMutation.mutate({ stok_kodu: p.kod, isaret: !marked })}
                                className={`p-1 rounded hover:bg-gray-100 transition-colors ${marked ? 'text-blue-600' : 'text-gray-300 hover:text-blue-400'}`}>
                                {marked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                              </button>
                              {marked && (
                                <button title="Kritik stok ayarları" onClick={() => setAyarlarProduct(p)}
                                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                                  <Settings2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={canEdit ? 11 : 10} className="py-16 text-center text-gray-400">
                        {search ? `"${search}" için sonuç bulunamadı` :
                         statusFilter === 'isaretlenenler' ? 'Henüz işaretlenmiş ürün yok' : 'Veri bulunamadı'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </Card>

          {/* Bilgi kutusu */}
          <Card className="p-4 bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-700 font-semibold mb-1">Hesaplama Yöntemi</p>
            <p className="text-xs text-blue-600">
              <strong>Günlük Tüketim</strong> = Toplam alınan ÷ Dönem &nbsp;|&nbsp;
              <strong>Alım Aralığı</strong> = Dönem ÷ (Alım sayısı − 1) &nbsp;|&nbsp;
              <strong>Kritik Eşik</strong> = Günlük tüketim × Alım aralığı &nbsp;|&nbsp;
              <strong>Sipariş Önerisi</strong> = Kritik eşik × 2.5 − Mevcut stok &nbsp;|&nbsp;
              En az 2 alımı olan ürünler ({ozet.toplam || 0} ürün)
            </p>
          </Card>
        </>
      )}

      {/* ── ABC ANALİZİ SEKMESİ ─────────────────────────────────────── */}
      {mainTab === 'abc' && <AbcAnalizi kritikMap={kritikMap} />}

      {/* Modallar */}
      {selected && <DetailModal product={selected} onClose={() => setSelected(null)} />}
      {ayarlarProduct && (
        <AyarlarModal
          product={ayarlarProduct}
          isaretliData={isaretliMap[ayarlarProduct.kod]}
          onClose={() => setAyarlarProduct(null)}
          onSave={(formData) => ayarlarMutation.mutate({ stok_kodu: ayarlarProduct.kod, data: formData })}
        />
      )}
    </div>
  );
}
