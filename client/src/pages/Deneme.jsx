import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package, ArrowLeftRight, Search, ChevronDown, ChevronUp,
  RefreshCw, Download, AlertTriangle, CheckCircle2, Clock,
  ShoppingCart, X, Loader2, ChevronRight, Layers,
  CheckSquare, Square,
} from 'lucide-react';
import * as XLSX from 'xlsx';

const API = import.meta.env.VITE_API_URL || '';

function fetchApi(url) {
  const token = localStorage.getItem('token');
  return fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => { if (!r.ok) throw new Error(`Sunucu hatası: ${r.status}`); return r.json(); });
}

function fmt(val, digits = 2) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
function fmtCur(val) {
  if (!val && val !== 0) return '—';
  return Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₺';
}
function norm(s) {
  return String(s ?? '').toLowerCase()
    .replace(/ı/g,'i').replace(/İ/g,'i').replace(/ğ/g,'g').replace(/Ğ/g,'g')
    .replace(/ş/g,'s').replace(/Ş/g,'s').replace(/ç/g,'c').replace(/Ç/g,'c')
    .replace(/ö/g,'o').replace(/Ö/g,'o').replace(/ü/g,'u').replace(/Ü/g,'u');
}

// ─── Tek proje BOM durum hesabı ──────────────────────────────────────────────
function calcStatus(row) {
  const satinalma   = Number(row.satinalma   || 0);
  const acikSiparis = Number(row.acik_satinalma_siparisleri || 0);
  const cikis       = Number(row.projelere_cikislar || 0);
  const miktar      = Number(row.miktar      || 0);
  if (satinalma   > 0) return 'satinalma';
  if (acikSiparis > 0) return 'siparis_var';
  if (miktar > 0 && cikis >= miktar) return 'tamamlandi';
  return 'yeterli';
}
const STATUS = {
  satinalma:   { label: 'Satın Al',         cls: 'bg-red-100 text-red-700',      row: 'bg-red-50' },
  siparis_var: { label: 'Sipariş Var',      cls: 'bg-yellow-100 text-yellow-700',row: 'bg-yellow-50' },
  tamamlandi:  { label: 'Çıkış Tamamlandı', cls: 'bg-blue-100 text-blue-700',   row: 'bg-blue-50/40' },
  yeterli:     { label: 'Yeterli / Stokta', cls: 'bg-green-100 text-green-700', row: '' },
};

// ─── Ortak bileşenler ─────────────────────────────────────────────────────────
function OzetKart({ label, value, color = 'slate', icon: Icon, onClick, active }) {
  const colorMap = {
    red:   'border-red-300 bg-red-50 text-red-700',
    yellow:'border-yellow-300 bg-yellow-50 text-yellow-700',
    green: 'border-green-300 bg-green-50 text-green-700',
    blue:  'border-blue-300 bg-blue-50 text-blue-700',
    amber: 'border-amber-300 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  };
  return (
    <button onClick={onClick}
      className={`rounded-xl border p-4 text-left transition shadow-sm w-full
        ${colorMap[color]}
        ${active ? 'ring-2 ring-offset-1 ring-blue-400' : 'hover:shadow-md'}`}>
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon size={15} className="shrink-0 opacity-70" />}
        <span className="text-xs font-medium opacity-80">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </button>
  );
}

function SortTh({ col, sortKey, sortDir, onSort, children, cls = '' }) {
  const active = sortKey === col;
  return (
    <th onClick={() => onSort(col)}
      className={`px-2 py-2 text-left text-xs font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap hover:bg-slate-100 transition ${cls}`}>
      <div className="flex items-center gap-1">
        {children}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={11} className="text-blue-500" /> : <ChevronDown size={11} className="text-blue-500" />)
          : <ChevronDown size={11} className="text-slate-300" />}
      </div>
    </th>
  );
}

// ─── Proje kartları (proje seçilmemişken) ────────────────────────────────────
function ProjeListPanel({ projeler, onSelect, isLoading }) {
  const [arama, setArama] = useState('');
  const filtered = useMemo(() => {
    if (!arama) return projeler;
    const s = norm(arama);
    return projeler.filter(p => norm(p.proje_kodu).includes(s) || norm(p.karavan_adi).includes(s));
  }, [projeler, arama]);

  if (isLoading) return (
    <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
      <Loader2 size={20} className="animate-spin" /> Projeler yükleniyor...
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={arama} onChange={e => setArama(e.target.value)}
            placeholder="Proje kodu veya karavan adı..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
        </div>
        <span className="text-xs text-slate-400">{filtered.length} proje</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(p => (
          <button key={p.proje_kodu} onClick={() => onSelect(p.proje_kodu)}
            className={`text-left p-4 rounded-xl border shadow-sm hover:shadow-md transition group
              ${p.satinalma_gereken > 0 ? 'border-red-200 hover:border-red-400'
              : p.siparis_bekleyen > 0   ? 'border-yellow-200 hover:border-yellow-400'
              :                            'border-slate-200 hover:border-blue-300'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-800 truncate">{p.proje_kodu}</div>
                <div className="text-xs text-slate-500 truncate mt-0.5">{p.karavan_adi || '—'}</div>
              </div>
              <ChevronRight size={14} className="shrink-0 text-slate-400 mt-0.5 group-hover:text-blue-500 transition" />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{p.malzeme_sayisi} kalem</span>
              {p.satinalma_gereken > 0 && (
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{p.satinalma_gereken} satın al</span>
              )}
              {p.siparis_bekleyen > 0 && (
                <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">{p.siparis_bekleyen} sipariş</span>
              )}
              {p.cikis_tamamlanan > 0 && (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">{p.cikis_tamamlanan} tamamlandı</span>
              )}
            </div>
            {p.satinalma_tutar > 0 && (
              <div className="mt-2 text-xs text-red-600 font-medium">{fmtCur(p.satinalma_tutar)} alınacak</div>
            )}
          </button>
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">Arama kriterine uygun proje bulunamadı.</div>
      )}
    </div>
  );
}

// ─── Tek proje BOM tablosu ───────────────────────────────────────────────────
function BomTablo({ bom, isLoading, error, durumFiltre, setDurumFiltre }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [expandedRow, setExpandedRow] = useState(null);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const rows = useMemo(() => {
    let data = bom.map(r => ({ ...r, _status: calcStatus(r) }));
    if (durumFiltre !== 'all') data = data.filter(r => r._status === durumFiltre);
    if (search) {
      const s = norm(search);
      data = data.filter(r => norm(r.alt_kod).includes(s) || norm(r.alt_adi).includes(s) ||
        norm(r.alt_stok_grup_kodu).includes(s) || norm(r.son_satinalma_cari).includes(s));
    }
    if (sortKey) {
      data = [...data].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const n = Number(av), m = Number(bv);
        if (!isNaN(n) && !isNaN(m)) return sortDir === 'asc' ? n - m : m - n;
        return sortDir === 'asc'
          ? String(av ?? '').localeCompare(String(bv ?? ''), 'tr')
          : String(bv ?? '').localeCompare(String(av ?? ''), 'tr');
      });
    }
    return data;
  }, [bom, search, sortKey, sortDir, durumFiltre]);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Stok Kodu': r.alt_kod, 'Stok Adı': r.alt_adi, 'Grup': r.alt_stok_grup_kodu,
      'Tür': r.alt_kod_tur, 'BOM Miktar': +r.miktar||0, 'Birim': r.birim,
      'Proje Çıkışı': +r.projelere_cikislar||0, 'Kalan İhtiyaç': +r.elde_kalan||0,
      'Gebze Stok': +r.gebze_stok||0, 'Üretim Depo': +r.uretim_depo||0,
      'Açık Sipariş': +r.acik_satinalma_siparisleri||0, 'Satın Alınacak': +r.satinalma||0,
      'Birim Fiyat (₺)': +r.birim_fiyatlar||0, 'Tutar (₺)': +r.tutar||0,
      'Son Tedarikçi': r.son_satinalma_cari||'', 'Durum': STATUS[r._status]?.label||'',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'BOM');
    XLSX.writeFile(wb, `bom-${bom[0]?.proje_kodu||'proje'}.xlsx`);
  }

  if (isLoading) return <div className="flex items-center justify-center py-16 text-slate-400 gap-2 p-4"><Loader2 size={18} className="animate-spin"/>BOM yükleniyor...</div>;
  if (error) return <div className="m-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error.message}</div>;

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Kod / ad / grup..." className="pl-8 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none w-60"/>
        </div>
        <div className="flex gap-1 flex-wrap">
          {[['all','Tümü','bg-slate-100 text-slate-700'],['satinalma',STATUS.satinalma.label,'bg-red-100 text-red-700'],
            ['siparis_var',STATUS.siparis_var.label,'bg-yellow-100 text-yellow-700'],
            ['yeterli',STATUS.yeterli.label,'bg-green-100 text-green-700'],
            ['tamamlandi',STATUS.tamamlandi.label,'bg-blue-100 text-blue-700']
          ].map(([key,label,cls]) => (
            <button key={key} onClick={() => setDurumFiltre(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition border
                ${durumFiltre===key ? `${cls} border-current shadow-sm` : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
        {rows.length > 0 && (
          <button onClick={exportExcel} className="ml-auto flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium transition">
            <Download size={13}/> Excel ({rows.length})
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-2 py-2 text-xs font-semibold text-slate-600 w-6">#</th>
              <SortTh col="alt_kod"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Stok Kodu</SortTh>
              <SortTh col="alt_adi"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Stok Adı</SortTh>
              <SortTh col="alt_stok_grup_kodu" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Grup</SortTh>
              <SortTh col="miktar"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">BOM Miktar</SortTh>
              <th className="px-2 py-2 text-xs font-semibold text-slate-600">Brm</th>
              <SortTh col="projelere_cikislar" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Proje Çıkışı</SortTh>
              <SortTh col="elde_kalan" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Kalan İht.</SortTh>
              <SortTh col="gebze_stok" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Gebze Stok</SortTh>
              <SortTh col="uretim_depo" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Üretim Depo</SortTh>
              <SortTh col="acik_satinalma_siparisleri" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Açık Sipariş</SortTh>
              <SortTh col="satinalma" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Satın Alınacak</SortTh>
              <SortTh col="birim_fiyatlar" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Birim Fiyat</SortTh>
              <SortTh col="tutar"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Tutar (₺)</SortTh>
              <SortTh col="son_satinalma_cari" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Son Tedarikçi</SortTh>
              <th className="px-2 py-2 text-xs font-semibold text-slate-600">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => {
              const st = STATUS[r._status];
              return (
                <React.Fragment key={i}>
                  <tr className={`hover:bg-slate-50/80 cursor-pointer transition ${st?.row||''}`}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}>
                    <td className="px-2 py-1.5 text-slate-400">{i+1}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-700 whitespace-nowrap">{r.alt_kod}</td>
                    <td className="px-2 py-1.5 text-slate-800 max-w-[180px] truncate" title={r.alt_adi}>{r.alt_adi}</td>
                    <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.alt_stok_grup_kodu||'—'}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{fmt(r.miktar)}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.birim}</td>
                    <td className={`px-2 py-1.5 text-right ${+r.projelere_cikislar>0?'text-blue-700 font-semibold':'text-slate-400'}`}>{fmt(r.projelere_cikislar)}</td>
                    <td className={`px-2 py-1.5 text-right font-medium ${+r.elde_kalan>0?'text-orange-700':'text-slate-400'}`}>{fmt(r.elde_kalan)}</td>
                    <td className={`px-2 py-1.5 text-right ${+r.gebze_stok>0?'text-slate-700':'text-slate-300'}`}>{fmt(r.gebze_stok)}</td>
                    <td className={`px-2 py-1.5 text-right ${+r.uretim_depo>0?'text-slate-700':'text-slate-300'}`}>{fmt(r.uretim_depo)}</td>
                    <td className={`px-2 py-1.5 text-right ${+r.acik_satinalma_siparisleri>0?'text-yellow-700 font-semibold':'text-slate-300'}`}>{fmt(r.acik_satinalma_siparisleri)}</td>
                    <td className={`px-2 py-1.5 text-right font-bold ${+r.satinalma>0?'text-red-700':'text-slate-300'}`}>{fmt(r.satinalma)}</td>
                    <td className="px-2 py-1.5 text-right text-slate-600">{+r.birim_fiyatlar>0?fmt(r.birim_fiyatlar,4):'—'}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{+r.tutar>0?fmtCur(r.tutar):'—'}</td>
                    <td className="px-2 py-1.5 text-slate-500 max-w-[120px] truncate" title={r.son_satinalma_cari}>{r.son_satinalma_cari||'—'}</td>
                    <td className="px-2 py-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${st?.cls}`}>{st?.label}</span>
                    </td>
                  </tr>
                  {expandedRow === i && (
                    <tr className="bg-slate-50 border-b-2 border-blue-100">
                      <td colSpan={16} className="px-4 py-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          {[
                            ['Stok Kodu',r.alt_kod,true],['Stok Adı',r.alt_adi],
                            ['Tür',r.alt_kod_tur],['Grup',r.alt_stok_grup_kodu],
                            ['BOM Miktar',`${fmt(r.miktar)} ${r.birim}`],
                            ['Proje Çıkışı',`${fmt(r.projelere_cikislar)} ${r.birim}`,false,+r.projelere_cikislar>0],
                            ['Kalan İhtiyaç',`${fmt(r.elde_kalan)} ${r.birim}`],
                            ['Gebze Depo',`${fmt(r.gebze_stok)} ${r.birim}`,false,+r.gebze_stok>0],
                            ['Üretim Depo',`${fmt(r.uretim_depo)} ${r.birim}`,false,+r.uretim_depo>0],
                            ['Açık Sipariş',`${fmt(r.acik_satinalma_siparisleri)} ${r.birim}`],
                            ['Satın Alınacak',`${fmt(r.satinalma)} ${r.birim}`],
                            ['Birim Fiyat',+r.birim_fiyatlar>0?`${fmt(r.birim_fiyatlar,4)} ₺`:'—'],
                            ['Toplam Tutar',+r.tutar>0?fmtCur(r.tutar):'—'],
                            ['Son Tedarikçi',r.son_satinalma_cari||'—'],
                          ].map(([label,value,mono,hl]) => (
                            <div key={label}>
                              <div className="text-slate-400 mb-0.5">{label}</div>
                              <div className={`font-medium ${mono?'font-mono':''} ${hl?'text-green-700':'text-slate-800'}`}>{value}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !isLoading && (
          <div className="text-center py-10 text-slate-400 text-sm">
            {search||durumFiltre!=='all' ? 'Filtreye uyan malzeme bulunamadı.' : 'Proje için malzeme verisi bulunamadı.'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Depo Hareketleri tablosu ────────────────────────────────────────────────
const ISLEM_CLS = { GIRIS:'bg-green-100 text-green-700', CIKIS:'bg-red-100 text-red-700', TRANSFER:'bg-blue-100 text-blue-700' };

function HareketlerTablo({ projeKodu, enabled }) {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['deneme-hareketler', projeKodu],
    queryFn: () => fetchApi(`/api/deneme/hareketler/${encodeURIComponent(projeKodu)}`),
    enabled: !!projeKodu && enabled,
    staleTime: 0,
  });
  const [search, setSearch] = useState('');
  const [islemFiltre, setIslemFiltre] = useState('TUMU');

  const rows = useMemo(() => {
    let all = data?.rows || [];
    if (islemFiltre !== 'TUMU') all = all.filter(r => r.ISLEMTIPI === islemFiltre);
    if (search) {
      const s = norm(search);
      all = all.filter(r => norm(r.STOK_KODU).includes(s) || norm(r.STOK_ADI).includes(s));
    }
    return all;
  }, [data, islemFiltre, search]);

  if (!enabled) return null;
  if (isFetching) return <div className="flex items-center justify-center py-16 text-slate-400 gap-2 p-4"><Loader2 size={18} className="animate-spin"/>EVIRA'dan çekiliyor...</div>;
  if (error) return <div className="m-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error.message}</div>;

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Stok kodu / adı..." className="pl-8 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none w-52"/>
        </div>
        <div className="flex gap-1">
          {['TUMU','GIRIS','CIKIS','TRANSFER'].map(t => (
            <button key={t} onClick={() => setIslemFiltre(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition
                ${islemFiltre===t?'bg-blue-600 text-white border-blue-600':'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
              {t==='TUMU'?'Tümü':t==='GIRIS'?'Giriş':t==='CIKIS'?'Çıkış':'Transfer'}
            </button>
          ))}
        </div>
        <button onClick={refetch} className="ml-auto flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium transition">
          <RefreshCw size={13}/> Yenile
        </button>
        {data && <span className="text-xs text-slate-400">{rows.length} / {data.count} hareket</span>}
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              {['Tarih','Fiş No','İşlem','Fiş Türü','Stok Kodu','Stok Adı','Miktar','Birim','Birim Fiyat','Ambar','Hedef Ambar'].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{r.TARIH}</td>
                <td className="px-2 py-1.5 font-mono text-slate-500 whitespace-nowrap">{r.TAKIP_NO||r.FIS_NO||'—'}</td>
                <td className="px-2 py-1.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ISLEM_CLS[r.ISLEMTIPI]||'bg-slate-100 text-slate-600'}`}>{r.ISLEMTIPI}</span>
                </td>
                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.FIS_TURU}</td>
                <td className="px-2 py-1.5 font-mono text-slate-700 whitespace-nowrap">{r.STOK_KODU}</td>
                <td className="px-2 py-1.5 text-slate-800 max-w-[180px] truncate" title={r.STOK_ADI}>{r.STOK_ADI}</td>
                <td className="px-2 py-1.5 text-right font-medium">{fmt(r.MIKTAR)}</td>
                <td className="px-2 py-1.5 text-slate-500">{r.BIRIM}</td>
                <td className="px-2 py-1.5 text-right text-slate-600">{+r.BIRIM_FIYAT>0?fmt(r.BIRIM_FIYAT,4):'—'}</td>
                <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.AMBAR}</td>
                <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.HEDEF_AMBAR||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="text-center py-10 text-slate-400 text-sm">Bu proje için hareket bulunamadı.</div>}
      </div>
    </div>
  );
}

// ─── TOPLU SATIN ALMA sekmesi ─────────────────────────────────────────────────
function TopluSatinalma({ tumProjeler }) {
  const [seciliProjeler, setSeciliProjeler] = useState([]);
  const [projeArama, setProjeArama]         = useState('');
  const [projeSeciciAcik, setProjeSeciciAcik] = useState(true);
  const [search, setSearch]                 = useState('');
  const [sadeceGereken, setSadeceGereken]   = useState(false);
  const [sortKey, setSortKey]               = useState('net_satinalma');
  const [sortDir, setSortDir]               = useState('desc');

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const qKey = seciliProjeler.sort().join(',');

  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['deneme-toplu', qKey],
    queryFn: () => {
      const qs = seciliProjeler.length > 0 ? `?projeler=${encodeURIComponent(qKey)}` : '';
      return fetchApi(`/api/deneme/toplu${qs}`);
    },
    staleTime: 30000,
  });

  const allRows = data?.rows || [];
  const stats   = data?.stats || {};

  const rows = useMemo(() => {
    let d = allRows;
    if (sadeceGereken) d = d.filter(r => r.net_satinalma > 0);
    if (search) {
      const s = norm(search);
      d = d.filter(r => norm(r.alt_kod).includes(s) || norm(r.alt_adi).includes(s) ||
        norm(r.alt_stok_grup_kodu).includes(s) || norm(r.son_satinalma_cari).includes(s));
    }
    if (sortKey) {
      d = [...d].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        const n = Number(av), m = Number(bv);
        if (!isNaN(n) && !isNaN(m)) return sortDir === 'asc' ? n - m : m - n;
        return sortDir === 'asc'
          ? String(av??'').localeCompare(String(bv??''),'tr')
          : String(bv??'').localeCompare(String(av??''),'tr');
      });
    }
    return d;
  }, [allRows, sadeceGereken, search, sortKey, sortDir]);

  function toggleProje(kod) {
    setSeciliProjeler(prev => prev.includes(kod) ? prev.filter(p => p !== kod) : [...prev, kod]);
  }
  function tumunuSec() { setSeciliProjeler(tumProjeler.map(p => p.proje_kodu)); }
  function temizle()   { setSeciliProjeler([]); }

  const filteredProjeler = useMemo(() => {
    if (!projeArama) return tumProjeler;
    const s = norm(projeArama);
    return tumProjeler.filter(p => norm(p.proje_kodu).includes(s) || norm(p.karavan_adi).includes(s));
  }, [tumProjeler, projeArama]);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'Stok Kodu': r.alt_kod, 'Stok Adı': r.alt_adi, 'Grup': r.alt_stok_grup_kodu, 'Tür': r.alt_kod_tur,
      'Proje Sayısı': r.proje_sayisi, 'Projeler': r.proje_listesi,
      'Toplam BOM': +r.toplam_miktar||0, 'Birim': r.birim,
      'Toplam Çıkış': +r.toplam_cikis||0,
      'Gebze Stok': +r.gebze_stok||0, 'Üretim Depo': +r.uretim_depo||0,
      'Açık Sipariş': +r.acik_siparis||0,
      'SATIN ALINACAK': r.net_satinalma,
      'Birim Fiyat (₺)': +r.birim_fiyat||0, 'Tutar (₺)': r.net_tutar,
      'Son Tedarikçi': r.son_satinalma_cari||'',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Toplu Satın Alma');
    XLSX.writeFile(wb, `toplu-satinalma-${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Proje seçici */}
      <div className="border rounded-xl overflow-hidden">
        <button
          onClick={() => setProjeSeciciAcik(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-sm font-semibold text-slate-700">
          <div className="flex items-center gap-2">
            <Layers size={15}/>
            Proje Filtresi
            {seciliProjeler.length > 0
              ? <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{seciliProjeler.length} seçili</span>
              : <span className="ml-1 text-xs font-normal text-slate-500">(tümü gösteriliyor)</span>
            }
          </div>
          {projeSeciciAcik ? <ChevronUp size={15} className="text-slate-400"/> : <ChevronDown size={15} className="text-slate-400"/>}
        </button>

        {projeSeciciAcik && (
          <div className="p-3 space-y-2">
            {/* Seçili proje chip'leri */}
            {seciliProjeler.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-2 border-b">
                {seciliProjeler.map(k => {
                  const p = tumProjeler.find(x => x.proje_kodu === k);
                  return (
                    <span key={k} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {k}{p?.karavan_adi ? ` — ${p.karavan_adi}` : ''}
                      <button onClick={() => toggleProje(k)} className="hover:text-blue-600 ml-0.5">
                        <X size={11}/>
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Arama + toplu seç/temizle */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input type="text" value={projeArama} onChange={e => setProjeArama(e.target.value)}
                  placeholder="Proje ara..."
                  className="w-full pl-7 pr-3 py-1.5 border rounded-lg text-xs focus:ring-2 focus:ring-blue-300 outline-none"/>
              </div>
              <button onClick={tumunuSec} className="flex items-center gap-1 px-3 py-1.5 border border-blue-300 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-medium transition">
                <CheckSquare size={12}/> Tümünü Seç
              </button>
              {seciliProjeler.length > 0 && (
                <button onClick={temizle} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-slate-500 bg-white hover:bg-slate-50 rounded-lg text-xs font-medium transition">
                  <X size={12}/> Temizle
                </button>
              )}
            </div>

            {/* Proje listesi */}
            <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
              {filteredProjeler.map(p => {
                const secili = seciliProjeler.includes(p.proje_kodu);
                return (
                  <button key={p.proje_kodu} onClick={() => toggleProje(p.proje_kodu)}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition text-xs
                      ${secili ? 'bg-blue-50 border border-blue-200 text-blue-800' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                    {secili
                      ? <CheckSquare size={13} className="shrink-0 text-blue-500"/>
                      : <Square      size={13} className="shrink-0 text-slate-300"/>}
                    <span className="font-medium truncate">{p.proje_kodu}</span>
                    {p.karavan_adi && <span className="text-slate-400 truncate">— {p.karavan_adi}</span>}
                    {p.satinalma_gereken > 0 && (
                      <span className="ml-auto shrink-0 px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-semibold">{p.satinalma_gereken}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Özet kartlar */}
      {!isFetching && allRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OzetKart label="Toplam Ürün Kalemi" value={stats.toplam_kalem} color="slate" icon={Package}/>
          <OzetKart label="Satın Alınacak Kalem" value={stats.satinalma_gereken} color="red" icon={ShoppingCart}
            onClick={() => setSadeceGereken(v => !v)} active={sadeceGereken}/>
          <OzetKart label="Sipariş Bekleyen" value={stats.siparis_bekleyen} color="yellow" icon={Clock}/>
          <OzetKart label="Toplam Satın Alma Tutarı" value={fmtCur(stats.toplam_satinalma_tutar)} color="amber" icon={AlertTriangle}/>
        </div>
      )}

      {/* Filtre + tablo */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Kod / ad / grup / tedarikçi..." className="pl-8 pr-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-300 outline-none w-64"/>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 select-none">
            <input type="checkbox" checked={sadeceGereken} onChange={e => setSadeceGereken(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-300"/>
            Sadece satın alınacaklar
          </label>
          <button onClick={refetch} disabled={isFetching}
            className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-60 transition">
            <RefreshCw size={13} className={isFetching?'animate-spin':''}/> Yenile
          </button>
          {rows.length > 0 && (
            <button onClick={exportExcel}
              className="ml-auto flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-medium transition">
              <Download size={13}/> Excel ({rows.length})
            </button>
          )}
        </div>

        {isFetching ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 size={18} className="animate-spin"/> Veriler hesaplanıyor...
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error.message}</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-xs font-semibold text-slate-600 w-6">#</th>
                  <SortTh col="alt_kod"            sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Stok Kodu</SortTh>
                  <SortTh col="alt_adi"            sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Stok Adı</SortTh>
                  <SortTh col="alt_stok_grup_kodu" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Grup</SortTh>
                  <SortTh col="proje_sayisi"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Proje</SortTh>
                  <SortTh col="toplam_miktar"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Toplam BOM</SortTh>
                  <th className="px-2 py-2 text-xs font-semibold text-slate-600">Brm</th>
                  <SortTh col="toplam_cikis"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Toplam Çıkış</SortTh>
                  <SortTh col="gebze_stok"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Gebze Stok</SortTh>
                  <SortTh col="uretim_depo"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Üretim Depo</SortTh>
                  <SortTh col="acik_siparis" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Açık Sipariş</SortTh>
                  <SortTh col="net_satinalma"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right bg-red-50">SATIN ALINACAK</SortTh>
                  <SortTh col="birim_fiyat"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right">Birim Fiyat</SortTh>
                  <SortTh col="net_tutar"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} cls="text-right bg-amber-50">Tutar (₺)</SortTh>
                  <SortTh col="son_satinalma_cari" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>Son Tedarikçi</SortTh>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => {
                  const satin = r.net_satinalma > 0;
                  const siparis = !satin && Number(r.acik_siparis) > 0;
                  return (
                    <tr key={i} className={`hover:bg-slate-50/80 transition ${satin?'bg-red-50':siparis?'bg-yellow-50':''}`}>
                      <td className="px-2 py-1.5 text-slate-400">{i+1}</td>
                      <td className="px-2 py-1.5 font-mono text-slate-700 whitespace-nowrap">{r.alt_kod}</td>
                      <td className="px-2 py-1.5 text-slate-800 max-w-[180px] truncate" title={r.alt_adi}>{r.alt_adi}</td>
                      <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{r.alt_stok_grup_kodu||'—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="inline-flex items-center justify-center w-5 h-5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold" title={r.proje_listesi}>
                          {r.proje_sayisi}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">{fmt(r.toplam_miktar)}</td>
                      <td className="px-2 py-1.5 text-slate-500">{r.birim}</td>
                      <td className={`px-2 py-1.5 text-right ${+r.toplam_cikis>0?'text-blue-700 font-semibold':'text-slate-300'}`}>{fmt(r.toplam_cikis)}</td>
                      <td className={`px-2 py-1.5 text-right ${+r.gebze_stok>0?'text-slate-700 font-medium':'text-slate-300'}`}>{fmt(r.gebze_stok)}</td>
                      <td className={`px-2 py-1.5 text-right ${+r.uretim_depo>0?'text-slate-700':'text-slate-300'}`}>{fmt(r.uretim_depo)}</td>
                      <td className={`px-2 py-1.5 text-right ${+r.acik_siparis>0?'text-yellow-700 font-semibold':'text-slate-300'}`}>{fmt(r.acik_siparis)}</td>
                      <td className={`px-2 py-1.5 text-right font-bold text-base ${satin?'text-red-700':'text-slate-300'}`}>
                        {satin ? fmt(r.net_satinalma) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-600">{+r.birim_fiyat>0?fmt(r.birim_fiyat,4):'—'}</td>
                      <td className={`px-2 py-1.5 text-right font-bold ${r.net_tutar>0?'text-amber-700':'text-slate-300'}`}>
                        {r.net_tutar>0?fmtCur(r.net_tutar):'—'}
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 max-w-[120px] truncate" title={r.son_satinalma_cari}>{r.son_satinalma_cari||'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200 sticky bottom-0">
                  <tr className="font-semibold text-xs">
                    <td colSpan={11} className="px-3 py-2 text-slate-600">
                      TOPLAM ({rows.filter(r=>r.net_satinalma>0).length} / {rows.length} kalem satın alınacak)
                    </td>
                    <td className="px-2 py-2 text-right text-red-700 font-bold text-sm">
                      {fmt(rows.reduce((s,r)=>s+r.net_satinalma,0))}
                    </td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right text-amber-700 font-bold text-sm">
                      {fmtCur(rows.reduce((s,r)=>s+r.net_tutar,0))}
                    </td>
                    <td className="px-2 py-2"></td>
                  </tr>
                </tfoot>
              )}
            </table>
            {rows.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">
                {search||sadeceGereken ? 'Filtreye uyan ürün bulunamadı.' : 'Veri bulunamadı.'}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Ana sayfa ────────────────────────────────────────────────────────────────
export default function Deneme() {
  const [seciliProje, setSeciliProje] = useState('');
  const [activeTab, setActiveTab]     = useState('toplu');
  const [durumFiltre, setDurumFiltre] = useState('all');

  const projelerQuery = useQuery({
    queryKey: ['deneme-projeler'],
    queryFn: () => fetchApi('/api/deneme/projeler'),
    staleTime: 60000,
  });

  const bomQuery = useQuery({
    queryKey: ['deneme-bom', seciliProje],
    queryFn: () => fetchApi(`/api/deneme/bom/${encodeURIComponent(seciliProje)}`),
    enabled: !!seciliProje && (activeTab === 'bom' || activeTab === 'hareketler'),
    staleTime: 30000,
  });

  const projeler = projelerQuery.data?.projeler || [];
  const bom      = bomQuery.data?.bom   || [];
  const stats    = bomQuery.data?.stats || {};
  const secili   = projeler.find(p => p.proje_kodu === seciliProje);

  const TABS = [
    { key: 'toplu',      label: 'Toplu Satın Alma',    icon: Layers,         always: true },
    { key: 'bom',        label: 'BOM & Stok Durumu',   icon: Package,        always: false },
    { key: 'hareketler', label: 'Depo Hareketleri',    icon: ArrowLeftRight, always: false },
  ];

  return (
    <div className="p-6 space-y-5 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Proje Bazlı Üretim Takibi</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Tiger3 malzeme ihtiyaç raporu · EVIRA depo hareketleri · Satın alma ihtiyaç analizi
          </p>
        </div>
        <button onClick={() => projelerQuery.refetch()} disabled={projelerQuery.isFetching}
          className="flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 transition">
          <RefreshCw size={14} className={projelerQuery.isFetching?'animate-spin':''}/> Yenile
        </button>
      </div>

      {/* Tabs — toplu her zaman, diğerleri proje seçince */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex border-b px-4 bg-slate-50 gap-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon, always }) => {
            const disabled = !always && !seciliProje;
            return (
              <button key={key}
                disabled={disabled}
                onClick={() => !disabled && setActiveTab(key)}
                title={disabled ? 'Önce proje seçin' : ''}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition whitespace-nowrap
                  ${activeTab === key
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : disabled
                      ? 'border-transparent text-slate-300 cursor-not-allowed'
                      : 'border-transparent text-slate-500 hover:text-slate-700 cursor-pointer'}`}>
                <Icon size={15}/>{label}
              </button>
            );
          })}

          {/* Proje seçici — sağa yaslanmış */}
          {activeTab !== 'toplu' && (
            <div className="ml-auto flex items-center gap-2 py-1.5">
              <select
                value={seciliProje}
                onChange={e => { setSeciliProje(e.target.value); setDurumFiltre('all'); }}
                className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none bg-white max-w-xs">
                <option value="">— Proje Seçin —</option>
                {projeler.map(p => (
                  <option key={p.proje_kodu} value={p.proje_kodu}>
                    {p.proje_kodu}{p.karavan_adi ? ` — ${p.karavan_adi}` : ''}
                    {p.satinalma_gereken > 0 ? ` ⚠ ${p.satinalma_gereken}` : ''}
                  </option>
                ))}
              </select>
              {seciliProje && (
                <button onClick={() => { setSeciliProje(''); setDurumFiltre('all'); }}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-700 transition">
                  <X size={14}/>
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Toplu Satın Alma sekmesi ── */}
        {activeTab === 'toplu' && (
          <TopluSatinalma tumProjeler={projeler}/>
        )}

        {/* ── BOM sekmesi (proje gerekli) ── */}
        {activeTab === 'bom' && seciliProje && (
          <>
            {/* Özet kartlar */}
            {!bomQuery.isLoading && stats.toplam > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 pb-0">
                <OzetKart label="Toplam Kalem" value={stats.toplam} color="slate" icon={Package}
                  onClick={() => setDurumFiltre('all')} active={durumFiltre==='all'}/>
                <OzetKart label="Satın Alınacak" value={stats.satinalma_gereken} color="red" icon={ShoppingCart}
                  onClick={() => setDurumFiltre(durumFiltre==='satinalma'?'all':'satinalma')} active={durumFiltre==='satinalma'}/>
                <OzetKart label="Sipariş Bekliyor" value={stats.siparis_bekleyen} color="yellow" icon={Clock}
                  onClick={() => setDurumFiltre(durumFiltre==='siparis_var'?'all':'siparis_var')} active={durumFiltre==='siparis_var'}/>
                <OzetKart label="Çıkış Tamamlandı" value={stats.cikis_tamamlanan} color="blue" icon={CheckCircle2}
                  onClick={() => setDurumFiltre(durumFiltre==='tamamlandi'?'all':'tamamlandi')} active={durumFiltre==='tamamlandi'}/>
                <OzetKart label="Satın Alma Tutarı" value={fmtCur(stats.satinalma_tutar)} color="amber" icon={AlertTriangle}/>
              </div>
            )}
            <BomTablo bom={bom} isLoading={bomQuery.isFetching} error={bomQuery.error}
              durumFiltre={durumFiltre} setDurumFiltre={setDurumFiltre}/>
          </>
        )}
        {activeTab === 'bom' && !seciliProje && (
          <div className="p-6">
            <ProjeListPanel projeler={projeler} onSelect={p => { setSeciliProje(p); }} isLoading={projelerQuery.isLoading}/>
          </div>
        )}

        {/* ── Hareketler sekmesi ── */}
        {activeTab === 'hareketler' && (
          <HareketlerTablo projeKodu={seciliProje} enabled={activeTab==='hareketler'}/>
        )}
      </div>

      {projelerQuery.error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          Projeler yüklenemedi: {projelerQuery.error.message}
        </div>
      )}
    </div>
  );
}
