import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight,
  Search, ChevronDown, X, CheckSquare, Square, Loader2
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';

function getDefaultDates() {
  const end = new Date();
  const start = new Date(end - 30 * 24 * 60 * 60 * 1000);
  return {
    baslangic: start.toISOString().split('T')[0],
    bitis: end.toISOString().split('T')[0],
  };
}

const ISLEM_RENK = {
  GIRIS:    'bg-green-100 text-green-800',
  CIKIS:    'bg-red-100 text-red-800',
  TRANSFER: 'bg-blue-100 text-blue-800',
};

function norm(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u');
}

const COLS = [
  { key: 'TARIH',       label: 'Tarih',         cls: 'whitespace-nowrap' },
  { key: 'TAKIP_NO',    label: 'Fiş No (Logo)',  cls: 'font-mono whitespace-nowrap' },
  { key: 'ISLEMTIPI',   label: 'İşlem',          cls: '' },
  { key: 'FIS_TURU',    label: 'Fiş Türü',       cls: '',                 multi: true },
  { key: 'STOK_KODU',   label: 'Stok Kodu',      cls: 'font-mono whitespace-nowrap' },
  { key: 'STOK_ADI',    label: 'Stok Adı',       cls: 'max-w-xs truncate' },
  { key: 'MIKTAR',      label: 'Miktar',          cls: 'text-right' },
  { key: 'BIRIM',       label: 'Birim',           cls: '' },
  { key: 'AMBAR_KODU',  label: 'Ambar',           cls: 'whitespace-nowrap' },
  { key: 'HEDEF_AMBAR', label: 'Hedef Ambar',     cls: 'whitespace-nowrap' },
  { key: 'PROJE_KODU',  label: 'Proje',           cls: '',                 multi: true },
  { key: 'KULLANICI',   label: 'Kullanıcı',       cls: 'whitespace-nowrap' },
];

// Portal dropdown — tıklanan başlık hücresinin hemen altında açılır
function MultiDropdown({ colKey, label, anchor, queryParams, selected, onChange, onClose }) {
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const token = localStorage.getItem('token');

  // Benzersiz değerleri API'den çek (limitsiz)
  const { data, isFetching } = useQuery({
    queryKey: ['hareketler-distinct', colKey, queryParams.baslangic, queryParams.bitis, queryParams.islem_tipi],
    queryFn: async () => {
      const p = new URLSearchParams({
        kolon:      colKey,
        baslangic:  queryParams.baslangic,
        bitis:      queryParams.bitis,
        islem_tipi: queryParams.islem_tipi,
      });
      const r = await fetch(`${API}/api/hareketler/distinct?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Veri alınamadı');
      return r.json();
    },
    staleTime: 60000,
  });

  const allValues = data?.values || [];
  const filtered  = allValues.filter(v => norm(v).includes(norm(search)));
  const allChecked = filtered.length > 0 && filtered.every(v => selected.has(v));

  // Dışarı tıklanınca kapat
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  function toggleAll() {
    const next = new Set(selected);
    if (allChecked) filtered.forEach(v => next.delete(v));
    else filtered.forEach(v => next.add(v));
    onChange(next);
  }

  function toggle(v) {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  }

  // Portal: position:fixed, anchor'ın hemen altına
  const style = {
    position: 'fixed',
    top:  anchor.bottom + 4,
    left: Math.min(anchor.left, window.innerWidth - 288),
    zIndex: 9999,
    width: 280,
  };

  return createPortal(
    <div ref={ref} style={style}
      className="bg-white border border-blue-200 rounded-xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={() => onChange(new Set())}
              className="text-xs text-red-500 hover:text-red-700">Temizle</button>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      </div>

      <input autoFocus type="text" value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Ara..."
        className="w-full border rounded-lg px-2 py-1.5 text-xs mb-2 focus:ring-2 focus:ring-blue-300 outline-none" />

      {isFetching ? (
        <div className="flex items-center justify-center py-4 gap-2 text-slate-400">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Yükleniyor...</span>
        </div>
      ) : (
        <>
          <div onClick={toggleAll}
            className="flex items-center gap-2 px-1 py-1 border-b mb-1 cursor-pointer hover:bg-slate-50 rounded">
            {allChecked
              ? <CheckSquare size={14} className="text-blue-500 shrink-0" />
              : <Square size={14} className="text-slate-400 shrink-0" />}
            <span className="text-xs text-slate-600 font-medium">
              Tümünü Seç ({filtered.length})
            </span>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 py-2 text-center">Sonuç bulunamadı</p>
            )}
            {filtered.map(v => (
              <div key={v} onClick={() => toggle(v)}
                className="flex items-center gap-2 px-1 py-1 rounded cursor-pointer hover:bg-blue-50">
                {selected.has(v)
                  ? <CheckSquare size={14} className="text-blue-500 shrink-0" />
                  : <Square size={14} className="text-slate-300 shrink-0" />}
                <span className="text-xs text-slate-700 truncate" title={v}>{v || '(Boş)'}</span>
              </div>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="mt-2 pt-2 border-t text-xs text-blue-600 font-medium">
              {selected.size} seçili
            </div>
          )}
        </>
      )}
    </div>,
    document.body
  );
}

export default function Hareketler() {
  const defaults = getDefaultDates();
  const [baslangic, setBaslangic] = useState(defaults.baslangic);
  const [bitis, setBitis]         = useState(defaults.bitis);
  const [islemTipi, setIslemTipi] = useState('TUMU');
  const [stok, setStok]           = useState('');
  const [queryParams, setQueryParams] = useState({ ...defaults, islem_tipi: 'TUMU', stok: '' });

  const [colFilters,   setColFilters]   = useState({});   // text filtreler
  const [multiFilters, setMultiFilters] = useState({});   // { FIS_TURU: Set, PROJE_KODU: Set }
  const [openFilter,   setOpenFilter]   = useState(null); // açık metin filtre
  const [openMulti,    setOpenMulti]    = useState(null); // açık multi kolonu
  const [anchorRect,   setAnchorRect]   = useState(null); // dropdown pozisyonu

  const { data, isFetching, error } = useQuery({
    queryKey: ['hareketler', queryParams],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const p = new URLSearchParams({
        baslangic:  queryParams.baslangic,
        bitis:      queryParams.bitis,
        islem_tipi: queryParams.islem_tipi,
        stok:       queryParams.stok,
      });
      const r = await fetch(`${API}/api/hareketler?${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || 'Sunucu hatası');
      }
      return r.json();
    },
    staleTime: 0,
  });

  function handleSorgula() {
    setQueryParams({ baslangic, bitis, islem_tipi: islemTipi, stok });
    setColFilters({});
    setMultiFilters({});
    setOpenFilter(null);
    setOpenMulti(null);
  }

  function handleMultiHeaderClick(key, e) {
    if (openMulti === key) {
      setOpenMulti(null);
      setAnchorRect(null);
    } else {
      setAnchorRect(e.currentTarget.getBoundingClientRect());
      setOpenMulti(key);
      setOpenFilter(null);
    }
  }

  const rows = data?.rows || [];

  const filteredRows = useMemo(() => {
    return rows.filter(row => {
      for (const { key, multi } of COLS) {
        if (multi) {
          const sel = multiFilters[key];
          if (sel && sel.size > 0 && !sel.has(row[key] || '')) return false;
        } else {
          const f = colFilters[key];
          if (f && !norm(row[key]).includes(norm(f))) return false;
        }
      }
      return true;
    });
  }, [rows, colFilters, multiFilters]);

  const activeFilterCount =
    Object.values(colFilters).filter(Boolean).length +
    Object.values(multiFilters).filter(s => s?.size > 0).length;

  const closeMulti = useCallback(() => { setOpenMulti(null); setAnchorRect(null); }, []);

  return (
    <div className="p-6 space-y-5">
      <h1 className="text-2xl font-bold text-slate-800">Hareketler</h1>
      <p className="text-sm text-slate-500 -mt-3">9,1 Üretime Transfer Raporu · EVIRA</p>

      {/* Ana Filtreler */}
      <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Başlangıç</label>
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Bitiş</label>
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">İşlem Tipi</label>
          <select value={islemTipi} onChange={e => setIslemTipi(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none">
            <option value="TUMU">Tümü</option>
            <option value="GIRIS">Giriş</option>
            <option value="CIKIS">Çıkış</option>
            <option value="TRANSFER">Transfer</option>
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-slate-500 mb-1">Stok Kodu / Adı / Proje</label>
          <input type="text" value={stok} onChange={e => setStok(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSorgula()}
            placeholder="courier, msb12, proje adı..."
            className="w-full border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-300 outline-none" />
        </div>
        <button onClick={handleSorgula} disabled={isFetching}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 transition">
          <Search size={15} />
          {isFetching ? 'Yükleniyor...' : 'Sorgula'}
        </button>
      </div>

      {/* KPI Kartları */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border shadow-sm p-4">
            <p className="text-xs text-slate-500">Görüntülenen</p>
            <p className="text-2xl font-bold text-slate-800">
              {filteredRows.length.toLocaleString('tr-TR')}
              {activeFilterCount > 0 && (
                <span className="text-sm text-slate-400 ml-1">/ {data.count.toLocaleString('tr-TR')}</span>
              )}
            </p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <ArrowDownCircle size={22} className="text-green-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Giriş</p>
              <p className="text-2xl font-bold text-green-700">{data.giris.toLocaleString('tr-TR')}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <ArrowUpCircle size={22} className="text-red-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Çıkış</p>
              <p className="text-2xl font-bold text-red-700">{data.cikis.toLocaleString('tr-TR')}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3">
            <ArrowLeftRight size={22} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-xs text-slate-500">Transfer</p>
              <p className="text-2xl font-bold text-blue-700">{data.transfer.toLocaleString('tr-TR')}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error.message}</div>
      )}

      {/* Tablo */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isFetching ? (
          <div className="p-10 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" /> EVIRA'dan veriler yükleniyor...
          </div>
        ) : rows.length === 0 && data ? (
          <div className="p-10 text-center text-slate-400 text-sm">Seçilen kriterlere uygun hareket bulunamadı.</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Filtreleri doldurup Sorgula butonuna basın.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase">
                <tr>
                  {COLS.map(({ key, label, multi }) => {
                    const hasText  = !!colFilters[key];
                    const hasMulti = multiFilters[key]?.size > 0;
                    const isActive = hasText || hasMulti;
                    const isOpen   = openFilter === key || openMulti === key;

                    return (
                      <th key={key}
                        onClick={multi
                          ? e => handleMultiHeaderClick(key, e)
                          : () => { setOpenFilter(p => p === key ? null : key); setOpenMulti(null); }
                        }
                        className={`px-3 py-2.5 text-left cursor-pointer select-none hover:bg-slate-100 transition
                          ${isActive ? 'bg-blue-50 text-blue-700' : ''}`}>
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {label}
                          {isActive ? (
                            <span onClick={e => {
                              e.stopPropagation();
                              if (multi) setMultiFilters(p => { const n = { ...p }; delete n[key]; return n; });
                              else setColFilters(p => { const n = { ...p }; delete n[key]; return n; });
                            }} className="text-blue-500 hover:text-red-500"><X size={12} /></span>
                          ) : (
                            <ChevronDown size={12} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          )}
                          {hasMulti && (
                            <span className="bg-blue-500 text-white text-[10px] rounded-full px-1.5 py-0.5 leading-none">
                              {multiFilters[key].size}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>

                {/* Metin filtre satırı */}
                <tr>
                  {COLS.map(({ key, multi }) => (
                    <th key={key} className="px-2 py-1">
                      {!multi && (openFilter === key || colFilters[key]) ? (
                        <input
                          autoFocus={openFilter === key}
                          type="text"
                          value={colFilters[key] || ''}
                          onChange={e => setColFilters(prev => ({ ...prev, [key]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          placeholder="Filtrele..."
                          className="w-full border border-blue-300 rounded px-2 py-1 text-xs font-normal normal-case focus:ring-1 focus:ring-blue-400 outline-none"
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{r.TARIH}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-700">{r.TAKIP_NO || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ISLEM_RENK[r.ISLEMTIPI] || 'bg-slate-100 text-slate-700'}`}>
                        {r.ISLEMTIPI}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.FIS_TURU}</td>
                    <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{r.STOK_KODU}</td>
                    <td className="px-3 py-2 text-slate-800 max-w-xs truncate" title={r.STOK_ADI}>{r.STOK_ADI}</td>
                    <td className="px-3 py-2 text-right font-medium">{r.MIKTAR != null ? Number(r.MIKTAR).toLocaleString('tr-TR') : '-'}</td>
                    <td className="px-3 py-2 text-slate-500">{r.BIRIM}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.AMBAR_KODU}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{r.HEDEF_AMBAR}</td>
                    <td className="px-3 py-2 text-slate-600">{r.PROJE_KODU}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.KULLANICI}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRows.length === 0 && rows.length > 0 && (
              <div className="text-center py-6 text-sm text-slate-400">
                Kolon filtreleriyle eşleşen sonuç bulunamadı.
              </div>
            )}
            {rows.length >= 5000 && (
              <div className="text-center py-3 text-xs text-slate-400 border-t">
                Maksimum 5000 satır gösteriliyor. Tarih aralığını daraltın.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portal dropdown — tablo scroll'unu geçmez, sabit pozisyonlanır */}
      {openMulti && anchorRect && (
        <MultiDropdown
          colKey={openMulti}
          label={COLS.find(c => c.key === openMulti)?.label}
          anchor={anchorRect}
          queryParams={queryParams}
          selected={multiFilters[openMulti] || new Set()}
          onChange={sel => setMultiFilters(prev => ({ ...prev, [openMulti]: sel }))}
          onClose={closeMulti}
        />
      )}
    </div>
  );
}
