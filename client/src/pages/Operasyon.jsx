import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  Wrench, ChevronDown, ChevronRight, Plus, Pencil, Trash2,
  RefreshCw, Download, Search, X, Package, Clock,
  Users, Layers, CheckSquare, Square,
  Info, AlertCircle, Palette, Settings, Car, Warehouse, ArrowRight
} from 'lucide-react';
import {
  getOperasyonMeta, getOperasyonlar, createOperasyon,
  updateOperasyon, deleteOperasyon, syncOperasyonExcel,
  getWarehouseStock,
} from '../api';

// ── Ürün grup renkleri ───────────────────────────────────────────────────────
const PRODUCT_COLORS = {
  'Atlas Camper Topper':    { color: '#1E40AF', bg: '#EFF6FF', abbr: 'ACT' },
  'Gladiator USA Size':     { color: '#92400E', bg: '#FFF7ED', abbr: 'GUS' },
  'Gladiator EU Size':      { color: '#065F46', bg: '#ECFDF5', abbr: 'GES' },
  'Cyberglad':              { color: '#4C1D95', bg: '#F5F3FF', abbr: 'CG'  },
  'Urban Badger Roof Tent': { color: '#7C3AED', bg: '#F5F3FF', abbr: 'UBRT'},
  'Reviva(Without Car)':    { color: '#0369A1', bg: '#F0F9FF', abbr: 'RWC' },
  'Reviva (With Car)':      { color: '#0891B2', bg: '#ECFEFF', abbr: 'RCC' },
};

function prodColor(name) {
  return PRODUCT_COLORS[name] || { color: '#6B7280', bg: '#F9FAFB', abbr: name.substring(0,3).toUpperCase() };
}

// Package adından araç görselini çöz
function imageForPackage(product, pkg) {
  if (product === 'Cyberglad') return '/CYBERGLAD.png';
  if (product === 'Gladiator USA Size') {
    if (pkg.includes('XLE') || pkg.includes('KLE')) return '/GLADIATOR_XLE.png';
    if (pkg.includes('XL'))                         return '/GLADIATOR_XL.png';
    if (pkg.includes('Gladiator L') || pkg.includes('L UAE') || pkg.includes('Life')) return '/GLADIATOR_L.png';
    return '/GLADIATOR_L.png';
  }
  if (product === 'Gladiator EU Size') {
    if (pkg.includes('SH'))  return '/GLADIATOR_SH.png';
    if (pkg.includes('SE'))  return '/GLADIATOR_SE.png';
    if (pkg.includes('SM'))  return '/GLADIATOR_SM.png';
    return '/GLADIATOR_S.png';
  }
  return null;
}

// Package adından kısa model etiketi çıkar
function pkgLabel(pkg) {
  // "Light Edition / Gladiator L" → "Gladiator L"
  const slash = pkg.lastIndexOf('/');
  if (slash > -1) return pkg.substring(slash + 1).trim();
  return pkg;
}

function durStr(val, unit) {
  if (!val) return '-';
  if (unit === 'minute') return `${val} dk`;
  if (unit === 'hour')   return `${val} sa`;
  return `${val} ${unit}`;
}
function numFmt(v) {
  if (!v || v === 0) return '-';
  return Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
}

// ── Depo Stok Seçici Modal ───────────────────────────────────────────────────
function StokSeciciModal({ onSelect, onClose }) {
  const [search, setSearch]               = useState('');
  const [kartTipi, setKartTipi]           = useState('Ham Madde');
  const [debouncedSearch, setDebounced]   = useState('');
  const timerRef = useRef(null);

  function handleSearch(v) {
    setSearch(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebounced(v), 300);
  }

  const stockQ = useQuery({
    queryKey: ['wh-picker', debouncedSearch, kartTipi],
    queryFn: () =>
      getWarehouseStock({ search: debouncedSearch || undefined, kart_tipi: kartTipi || undefined, limit: 100 })
        .then(r => r.data?.items || r.data || []),
    staleTime: 60000,
  });
  const items = stockQ.data || [];
  const TYPES = ['Ham Madde', 'Yarı Mamül', 'Ticari Mal', 'Mamül'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Warehouse size={18} className="text-emerald-600" /> Depo Stok'tan Malzeme Seç
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-3 border-b shrink-0 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={search} onChange={e => handleSearch(e.target.value)}
              placeholder="Stok kodu veya adı ara..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            {search && <button onClick={() => { setSearch(''); setDebounced(''); }} className="absolute right-2.5 top-1/2 -translate-y-1/2"><X size={13} className="text-gray-400" /></button>}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {TYPES.map(t => (
              <button key={t} onClick={() => setKartTipi(t === kartTipi ? '' : t)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${kartTipi === t ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'}`}>
                {t}
              </button>
            ))}
            {kartTipi && <button onClick={() => setKartTipi('')} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">Tümü</button>}
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {stockQ.isLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400"><RefreshCw size={20} className="animate-spin mr-2" /> Yükleniyor...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
              <Info size={24} className="mb-2 opacity-50" />
              {debouncedSearch ? 'Eşleşen stok bulunamadı.' : 'Aramak için yukarıya yazın.'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b z-10">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Stok Kodu</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Stok Adı</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500">Tip</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-500">Stok</th>
                  <th className="w-16 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.stok_kodu || i}
                    className={`border-t border-gray-100 hover:bg-emerald-50 cursor-pointer group ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                    onClick={() => onSelect(item)}>
                    <td className="px-4 py-2 font-mono text-gray-600 font-medium">{item.stok_kodu}</td>
                    <td className="px-4 py-2 text-gray-800">{item.stok_adi}{item.aciklama2 ? <span className="text-gray-400 ml-1">({item.aciklama2})</span> : null}</td>
                    <td className="px-4 py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">{item.kart_tipi}</span></td>
                    <td className="px-4 py-2 text-right font-medium text-gray-700">{item.gebze_stok != null ? Number(item.gebze_stok).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity font-medium">Ekle <ArrowRight size={12} /></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-5 py-3 border-t shrink-0 text-xs text-gray-400 text-right">
          {items.length > 0 && `${items.length} sonuç — seçmek için satıra tıklayın`}
        </div>
      </div>
    </div>
  );
}

// ── Satır Ekle / Düzenle Modal ───────────────────────────────────────────────
const EMPTY_FORM = {
  product: '', product_package: '', operation: '',
  duration: '', duration_unit: 'minute',
  material_code: '', material_name: '', material: '',
  is_important: 'No', quantity: '', unit: 'adet',
  production_quantity: '', production_quantity_unit: 'adet',
  color: '', concept: '', half_product: '', is_important_material: 'No',
  equipments: '', standard_features: '', half_products: '',
  role: '', relevant_staff: '', total_staff: '', notes: ''
};

function RowModal({ initial, meta, onSave, onClose, openStokInitially = false }) {
  const [form, setForm]             = useState(() => initial ? { ...EMPTY_FORM, ...initial } : { ...EMPTY_FORM });
  const [showStok, setShowStok]     = useState(openStokInitially);

  function set(k, v) {
    setForm(f => {
      const n = { ...f, [k]: v };
      n.material = [n.material_code, n.material_name].filter(Boolean).join(' - ');
      return n;
    });
  }

  function handleStokSec(item) {
    setForm(f => ({
      ...f,
      material_code: item.stok_kodu || '',
      material_name: item.stok_adi  || '',
      material: [item.stok_kodu, item.stok_adi].filter(Boolean).join(' - '),
    }));
    setShowStok(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      duration: Number(form.duration) || 0,
      quantity: Number(form.quantity) || 0,
      production_quantity: Number(form.production_quantity) || 0,
      total_staff: Number(form.total_staff) || 0,
      material: [form.material_code, form.material_name].filter(Boolean).join(' - '),
    });
  }

  const allProducts = meta.productTree?.map(g => g.product) || [];
  const pkgsForProduct = meta.productTree?.find(g => g.product === form.product)?.packages || [];

  const Field = ({ label, children }) => (
    <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>{children}</div>
  );
  const Inp = ({ k, type = 'text', ...rest }) => (
    <input type={type} value={form[k]} onChange={e => set(k, e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" {...rest} />
  );
  const Sel = ({ k, options }) => (
    <select value={form[k]} onChange={e => set(k, e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Wrench size={18} className="text-blue-600" />
            {initial?.id ? 'Satırı Düzenle' : 'Yeni Satır Ekle'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ürün *">
              <Sel k="product" options={[{ value: '', label: '— Seç —' }, ...allProducts.map(p => ({ value: p, label: p }))]} />
            </Field>
            <Field label="Paket / Varyant *">
              <Sel k="product_package" options={[{ value: '', label: '— Seç —' }, ...pkgsForProduct.map(p => ({ value: p, label: p }))]} />
            </Field>
          </div>
          <Field label="Operasyon *">
            <input list="op-list" value={form.operation} onChange={e => set('operation', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            <datalist id="op-list">{meta.operations?.map(o => <option key={o} value={o} />)}</datalist>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Süre"><Inp k="duration" type="number" min="0" step="any" /></Field>
            <Field label="Süre Birimi"><Sel k="duration_unit" options={['minute','hour','day']} /></Field>
            <Field label="Rol"><Sel k="role" options={[{ value:'', label:'— Seç —' }, ...(meta.roles||[]).map(r=>({value:r,label:r}))]} /></Field>
          </div>

          {/* Malzeme */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase">Malzeme</p>
              <button type="button" onClick={() => setShowStok(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100">
                <Warehouse size={12} /> Depodan Seç
              </button>
            </div>
            {form.material_code && (
              <div className="mb-2 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">
                <Package size={13} className="text-emerald-600 shrink-0" />
                <span className="font-mono font-medium">{form.material_code}</span>
                <span className="text-emerald-600">—</span>
                <span className="truncate">{form.material_name}</span>
                <button type="button" onClick={() => { set('material_code',''); set('material_name',''); }} className="ml-auto shrink-0">
                  <X size={12} className="text-emerald-500 hover:text-red-500" />
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Malzeme Kodu"><Inp k="material_code" placeholder="KRXX0099H114" /></Field>
              <Field label="Malzeme Adı"><Inp k="material_name" placeholder="KAUÇUK TAKOZ CİVATALI" /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <Field label="Miktar"><Inp k="quantity" type="number" min="0" step="any" /></Field>
              <Field label="Birim"><Sel k="unit" options={['adet','kilogram','metre','m2','litre','m3','piece']} /></Field>
              <Field label="Önemli"><Sel k="is_important_material" options={['No','Yes']} /></Field>
            </div>
          </div>

          {/* Opsiyon */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Opsiyon</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Renk">
                <input list="color-list" value={form.color} onChange={e => set('color', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <datalist id="color-list">{meta.colors?.map(c=><option key={c} value={c}/>)}</datalist>
              </Field>
              <Field label="Konsept">
                <input list="concept-list" value={form.concept} onChange={e => set('concept', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <datalist id="concept-list">{meta.concepts?.map(c=><option key={c} value={c}/>)}</datalist>
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Ekipman / Araç">
                <input list="eq-list" value={form.equipments} onChange={e => set('equipments', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <datalist id="eq-list">{meta.equipments?.map(eq=><option key={eq} value={eq}/>)}</datalist>
              </Field>
            </div>
          </div>

          <Field label="Notlar">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </Field>
        </form>
        <div className="flex justify-end gap-2 px-5 py-4 border-t shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">İptal</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
            {initial?.id ? 'Kaydet' : 'Ekle'}
          </button>
        </div>
      </div>
      {showStok && <StokSeciciModal onSelect={handleStokSec} onClose={() => setShowStok(false)} />}
    </div>
  );
}

// ── Operasyon grubu ──────────────────────────────────────────────────────────
function OperationGroup({ opName, rows, onEdit, onDelete, onSelect, selected }) {
  const [open, setOpen] = useState(false);
  const duration   = rows[0]?.duration || 0;
  const durUnit    = rows[0]?.duration_unit || 'minute';
  const role       = [...new Set(rows.map(r => r.role).filter(Boolean))].join(', ');
  const staff      = rows[0]?.total_staff || 0;
  const hasColor   = rows.some(r => r.color);
  const hasConcept = rows.some(r => r.concept);
  const hasEquip   = rows.some(r => r.equipments);
  const allSel     = rows.every(r => selected.has(r.id));
  const someSel    = rows.some(r => selected.has(r.id));

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}>
        <button className="shrink-0" onClick={e => { e.stopPropagation(); rows.forEach(r => onSelect(r.id, !allSel)); }}>
          {allSel ? <CheckSquare size={15} className="text-blue-600" /> : someSel ? <CheckSquare size={15} className="text-blue-300" /> : <Square size={15} className="text-gray-400" />}
        </button>
        {open ? <ChevronDown size={15} className="text-gray-500 shrink-0" /> : <ChevronRight size={15} className="text-gray-500 shrink-0" />}
        <Wrench size={14} className="text-blue-600 shrink-0" />
        <span className="font-semibold text-sm text-gray-800 flex-1 truncate">{opName}</span>
        <div className="flex items-center gap-2 text-xs shrink-0 flex-wrap justify-end">
          {duration > 0 && <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"><Clock size={11} />{durStr(duration, durUnit)}</span>}
          {role       && <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full"><Users size={11} />{role}</span>}
          {staff > 0  && <span className="text-gray-400">{staff} kişi</span>}
          {hasColor   && <span className="bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Palette size={10} />Renk</span>}
          {hasConcept && <span className="bg-teal-50 text-teal-600 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Layers size={10} />Konsept</span>}
          {hasEquip   && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Settings size={10} />Ekipman</span>}
          <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{rows.length} malzeme</span>
        </div>
      </div>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-700 text-slate-200">
                <th className="w-7 px-2 py-2"></th>
                <th className="text-left px-3 py-2 font-medium">Kod</th>
                <th className="text-left px-3 py-2 font-medium">Malzeme Adı</th>
                <th className="text-right px-3 py-2 font-medium">Miktar</th>
                <th className="text-left px-3 py-2 font-medium">Birim</th>
                <th className="text-left px-3 py-2 font-medium">Renk</th>
                <th className="text-left px-3 py-2 font-medium">Konsept</th>
                <th className="text-left px-3 py-2 font-medium">Ekipman</th>
                <th className="text-left px-3 py-2 font-medium">Önemli</th>
                <th className="w-16 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} className={`border-t border-gray-100 ${selected.has(row.id) ? 'bg-blue-50' : i%2===0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => onSelect(row.id, !selected.has(row.id))}>
                      {selected.has(row.id) ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} className="text-gray-400" />}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-gray-600">{row.material_code || '-'}</td>
                  <td className="px-3 py-1.5 text-gray-800 max-w-xs truncate" title={row.material_name}>{row.material_name || row.material || '-'}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{numFmt(row.quantity)}</td>
                  <td className="px-3 py-1.5 text-gray-500">{row.unit}</td>
                  <td className="px-3 py-1.5 text-gray-600 max-w-[110px] truncate" title={row.color}>{row.color||'-'}</td>
                  <td className="px-3 py-1.5 text-gray-600 max-w-[130px] truncate" title={row.concept}>{row.concept||'-'}</td>
                  <td className="px-3 py-1.5 text-gray-600 max-w-[130px] truncate" title={row.equipments}>{row.equipments||'-'}</td>
                  <td className="px-3 py-1.5">
                    {row.is_important_material==='Yes'
                      ? <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[10px] font-medium">Kritik</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => onEdit(row)} className="p-1 rounded hover:bg-blue-50 text-blue-500"><Pencil size={12} /></button>
                      <button onClick={() => onDelete(row.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-t text-xs text-gray-500">
            <span>{rows.length} malzeme satırı</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(null, { operation: opName, product: rows[0]?.product, product_package: rows[0]?.product_package }, true)}
                className="flex items-center gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                <Warehouse size={12} /> Depodan Ekle
              </button>
              <button
                onClick={() => onEdit(null, { operation: opName, product: rows[0]?.product, product_package: rows[0]?.product_package })}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                <Plus size={12} /> Manuel Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ana sayfa ────────────────────────────────────────────────────────────────
export default function Operasyon() {
  const qc = useQueryClient();

  // Seçim: { product, package }
  const [selection, setSelection]   = useState(null);
  // Açık ürün grupları (accordion)
  const [openGroups, setOpenGroups] = useState({});
  const [filters, setFilters]       = useState({ role: 'all', color: 'all', concept: 'all' });
  const [search, setSearch]         = useState('');
  const [modal, setModal]           = useState(null);
  const [selected, setSelected]     = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewMode, setViewMode]     = useState('operation');

  // ── Queries ──────────────────────────────────────────────────────────────
  const metaQ = useQuery({
    queryKey: ['operasyon-meta'],
    queryFn: () => getOperasyonMeta().then(r => r.data),
  });
  const meta = metaQ.data || { productTree: [], operations: [], roles: [], colors: [], concepts: [], equipments: [] };

  const dataQ = useQuery({
    queryKey: ['operasyon', selection, filters, search],
    queryFn: () => {
      const params = {
        product: selection.product,
        package: selection.package,
        search: search || undefined,
      };
      if (filters.role    !== 'all') params.role    = filters.role;
      if (filters.color   !== 'all') params.color   = filters.color;
      if (filters.concept !== 'all') params.concept = filters.concept;
      return getOperasyonlar(params).then(r => r.data);
    },
    enabled: !!selection,
  });
  const rows = dataQ.data || [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: data => modal?.row?.id ? updateOperasyon(modal.row.id, data) : createOperasyon(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operasyon'] }); qc.invalidateQueries({ queryKey: ['operasyon-meta'] }); setModal(null); },
  });
  const delMut = useMutation({
    mutationFn: id => deleteOperasyon(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operasyon'] }); setConfirmDelete(null); setSelected(s => { const n = new Set(s); n.delete(confirmDelete); return n; }); },
  });
  const syncMut = useMutation({
    mutationFn: syncOperasyonExcel,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operasyon'] }); qc.invalidateQueries({ queryKey: ['operasyon-meta'] }); },
  });

  // Operasyon gruplama
  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.operation)) map.set(r.operation, []);
      map.get(r.operation).push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [rows]);

  // Filtreli roller/renkler/konseptler (sadece bu pakete ait)
  const availRoles    = useMemo(() => [...new Set(rows.map(r=>r.role).filter(Boolean))].sort(), [rows]);
  const availColors   = useMemo(() => [...new Set(rows.map(r=>r.color).filter(Boolean))].sort(), [rows]);
  const availConcepts = useMemo(() => [...new Set(rows.map(r=>r.concept).filter(Boolean))].sort(), [rows]);

  function handleSelect(id, val) {
    setSelected(s => { const n = new Set(s); val ? n.add(id) : n.delete(id); return n; });
  }
  function handleSelectAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  }
  function toggleGroup(name) {
    setOpenGroups(g => ({ ...g, [name]: !g[name] }));
  }
  function selectPkg(product, pkg) {
    setSelection({ product, package: pkg });
    setSelected(new Set());
    setFilters({ role: 'all', color: 'all', concept: 'all' });
    setSearch('');
  }
  function filterSet(k, v) { setFilters(f => ({ ...f, [k]: v })); }

  function exportExcel(onlySelected = false) {
    const data = onlySelected ? rows.filter(r => selected.has(r.id)) : rows;
    const ws = XLSX.utils.json_to_sheet(data.map(r => ({
      'Ürün': r.product, 'Paket': r.product_package, 'Operasyon': r.operation,
      'Süre': r.duration, 'Süre Birimi': r.duration_unit,
      'Malzeme Kodu': r.material_code, 'Malzeme Adı': r.material_name,
      'Miktar': r.quantity, 'Birim': r.unit,
      'Renk': r.color, 'Konsept': r.concept, 'Ekipman': r.equipments,
      'Rol': r.role, 'Personel': r.total_staff,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operasyonlar');
    XLSX.writeFile(wb, `Operasyonlar_${(selection?.package || 'Tum').replace(/ /g,'_')}.xlsx`);
  }

  const imgSrc  = selection ? imageForPackage(selection.product, selection.package) : null;
  const selColor = selection ? prodColor(selection.product) : null;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Başlık */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Wrench size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-lg">Üretim Operasyonları</h1>
            <p className="text-xs text-gray-500">Araç / paket bazlı operasyon ve malzeme yönetimi</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => syncMut.mutate()} disabled={syncMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 text-gray-600">
            <RefreshCw size={14} className={syncMut.isPending ? 'animate-spin' : ''} /> Excel'den Yenile
          </button>
          <button
            onClick={() => setModal({ row: null, defaults: { product: selection?.product||'', product_package: selection?.package||'' } })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Plus size={14} /> Yeni Satır
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sol Panel: Ürün ağacı ─────────────────────────────────────────── */}
        <aside className="w-64 bg-white border-r flex flex-col shrink-0 overflow-y-auto">
          <div className="px-3 py-2.5 border-b shrink-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Araç Seç</p>
          </div>

          <div className="flex-1 py-1">
            {meta.productTree.map(group => {
              const pc       = prodColor(group.product);
              const isOpen   = !!openGroups[group.product];
              const hasImg   = !!imageForPackage(group.product, group.packages[0] || '');

              return (
                <div key={group.product}>
                  {/* Ürün grup başlığı */}
                  <button
                    onClick={() => toggleGroup(group.product)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 text-left transition-colors"
                  >
                    {isOpen
                      ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                      : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                    <div className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-black shrink-0"
                      style={{ backgroundColor: pc.bg, color: pc.color }}>
                      {pc.abbr}
                    </div>
                    <span className="text-xs font-bold text-gray-700 truncate flex-1">{group.product}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">{group.packages.length}</span>
                  </button>

                  {/* Paket alt öğeleri */}
                  {isOpen && (
                    <div className="pb-1">
                      {group.packages.map(pkg => {
                        const img    = imageForPackage(group.product, pkg);
                        const isActive = selection?.product === group.product && selection?.package === pkg;
                        return (
                          <button
                            key={pkg}
                            onClick={() => selectPkg(group.product, pkg)}
                            className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 text-left transition-all rounded-lg mx-1 ${
                              isActive
                                ? 'text-white shadow-sm'
                                : 'hover:bg-gray-100 text-gray-600'
                            }`}
                            style={isActive ? { backgroundColor: pc.color, width: 'calc(100% - 8px)' } : { width: 'calc(100% - 8px)' }}
                          >
                            {img ? (
                              <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 bg-gray-900">
                                <img src={img} alt="" className="w-full h-full object-contain" />
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center text-[9px] font-bold"
                                style={isActive ? { backgroundColor:'rgba(255,255,255,0.2)', color:'#fff' } : { backgroundColor: pc.bg, color: pc.color }}>
                                {pkgLabel(pkg).substring(0,4)}
                              </div>
                            )}
                            <span className="text-xs leading-snug truncate">{pkgLabel(pkg)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Seçili araç görseli */}
          {selection && imgSrc && (
            <div className="border-t p-3 shrink-0">
              <div className="rounded-xl overflow-hidden bg-gray-900 shadow-lg">
                <img src={imgSrc} alt={selection.package} className="w-full object-contain" style={{ maxHeight: 160 }} />
              </div>
              <p className="text-xs font-semibold text-center mt-2 truncate" style={{ color: selColor?.color }}>
                {pkgLabel(selection.package)}
              </p>
            </div>
          )}
        </aside>

        {/* ── Sağ Panel ─────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!selection ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Car size={56} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">Soldaki listeden bir araç / paket seçin</p>
                <p className="text-sm mt-1">Operasyon detayları burada görünecek</p>
              </div>
            </div>
          ) : (
            <>
              {/* Başlık şeridi */}
              <div className="bg-white border-b px-4 py-2.5 flex items-center gap-3 shrink-0">
                <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-black shrink-0"
                  style={{ backgroundColor: selColor?.bg, color: selColor?.color }}>
                  {selColor?.abbr}
                </div>
                <div>
                  <p className="text-xs text-gray-400">{selection.product}</p>
                  <p className="font-bold text-sm text-gray-800">{selection.package}</p>
                </div>
              </div>

              {/* Filtre çubuğu */}
              <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-2 shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Operasyon veya malzeme ara..."
                    className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X size={12} className="text-gray-400" /></button>}
                </div>

                {availRoles.length > 0 && (
                  <select value={filters.role} onChange={e => filterSet('role', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="all">Tüm Roller</option>
                    {availRoles.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                )}

                {availColors.length > 0 && (
                  <select value={filters.color} onChange={e => filterSet('color', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="all">Tüm Renkler</option>
                    {availColors.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}

                {availConcepts.length > 0 && (
                  <select value={filters.concept} onChange={e => filterSet('concept', e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="all">Tüm Konseptler</option>
                    {availConcepts.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}

                {(filters.role !== 'all' || filters.color !== 'all' || filters.concept !== 'all' || search) && (
                  <button onClick={() => { setFilters({ role:'all', color:'all', concept:'all' }); setSearch(''); }}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                    <X size={12} /> Sıfırla
                  </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  {selected.size > 0 && <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full">{selected.size} seçili</span>}
                  <button onClick={() => exportExcel(selected.size > 0)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 text-gray-700">
                    <Download size={14} />
                    {selected.size > 0 ? `Seçilileri İndir (${selected.size})` : 'Excel İndir'}
                  </button>
                </div>
              </div>

              {/* İstatistik + görünüm toggle */}
              <div className="bg-white border-b px-4 py-2 flex items-center gap-4 shrink-0">
                <button onClick={handleSelectAll} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                  {selected.size === rows.length && rows.length > 0 ? <CheckSquare size={13} className="text-blue-600" /> : <Square size={13} />}
                  Tümünü seç
                </button>
                <span className="text-xs text-gray-500">
                  <strong className="text-gray-800">{grouped.length}</strong> operasyon,{' '}
                  <strong className="text-gray-800">{rows.length}</strong> malzeme
                </span>
                <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg ml-auto">
                  <button onClick={() => setViewMode('operation')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${viewMode==='operation' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                    <Wrench size={12} /> Operasyon
                  </button>
                  <button onClick={() => setViewMode('material')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${viewMode==='material' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}>
                    <Package size={12} /> Malzeme
                  </button>
                </div>
              </div>

              {/* İçerik */}
              <div className="flex-1 overflow-y-auto p-4">
                {dataQ.isLoading ? (
                  <div className="flex items-center justify-center h-40 text-gray-400"><RefreshCw size={24} className="animate-spin mr-2" /> Yükleniyor...</div>
                ) : dataQ.isError ? (
                  <div className="flex items-center justify-center h-40 text-red-500"><AlertCircle size={20} className="mr-2" /> Veri yüklenemedi</div>
                ) : rows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <Info size={32} className="mb-2 opacity-50" />
                    <p>Bu kriterlere uygun kayıt bulunamadı.</p>
                  </div>
                ) : viewMode === 'operation' ? (
                  <div className="space-y-2">
                    {grouped.map(([opName, opRows]) => (
                      <OperationGroup key={opName} opName={opName} rows={opRows}
                        selected={selected} onSelect={handleSelect}
                        onEdit={(row, defaults, openStok=false) => setModal({ row, defaults, openStok })}
                        onDelete={id => setConfirmDelete(id)} />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-700 text-slate-200">
                          <th className="w-7 px-2 py-2.5">
                            <button onClick={handleSelectAll}>
                              {selected.size===rows.length&&rows.length>0 ? <CheckSquare size={13} className="text-blue-300"/> : <Square size={13}/>}
                            </button>
                          </th>
                          <th className="text-left px-3 py-2.5 font-medium">Operasyon</th>
                          <th className="text-left px-3 py-2.5 font-medium">Kod</th>
                          <th className="text-left px-3 py-2.5 font-medium">Malzeme Adı</th>
                          <th className="text-right px-3 py-2.5 font-medium">Miktar</th>
                          <th className="text-left px-3 py-2.5 font-medium">Birim</th>
                          <th className="text-left px-3 py-2.5 font-medium">Rol</th>
                          <th className="text-left px-3 py-2.5 font-medium">Renk</th>
                          <th className="text-left px-3 py-2.5 font-medium">Konsept</th>
                          <th className="text-left px-3 py-2.5 font-medium">Süre</th>
                          <th className="w-16 px-2 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={row.id} className={`border-t border-gray-100 ${selected.has(row.id)?'bg-blue-50':i%2===0?'bg-white':'bg-gray-50/40'}`}>
                            <td className="px-2 py-1.5 text-center">
                              <button onClick={() => handleSelect(row.id, !selected.has(row.id))}>
                                {selected.has(row.id) ? <CheckSquare size={13} className="text-blue-600"/> : <Square size={13} className="text-gray-400"/>}
                              </button>
                            </td>
                            <td className="px-3 py-1.5 font-medium text-gray-700 max-w-[150px] truncate" title={row.operation}>{row.operation}</td>
                            <td className="px-3 py-1.5 font-mono text-gray-500">{row.material_code||'-'}</td>
                            <td className="px-3 py-1.5 text-gray-800 max-w-[160px] truncate" title={row.material_name}>{row.material_name||'-'}</td>
                            <td className="px-3 py-1.5 text-right font-medium">{numFmt(row.quantity)}</td>
                            <td className="px-3 py-1.5 text-gray-500">{row.unit}</td>
                            <td className="px-3 py-1.5 text-gray-600">{row.role||'-'}</td>
                            <td className="px-3 py-1.5 text-gray-600 max-w-[100px] truncate" title={row.color}>{row.color||'-'}</td>
                            <td className="px-3 py-1.5 text-gray-600 max-w-[120px] truncate" title={row.concept}>{row.concept||'-'}</td>
                            <td className="px-3 py-1.5 text-gray-500">{durStr(row.duration, row.duration_unit)}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex items-center gap-1 justify-end">
                                <button onClick={() => setModal({ row })} className="p-1 rounded hover:bg-blue-50 text-blue-500"><Pencil size={12}/></button>
                                <button onClick={() => setConfirmDelete(row.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={12}/></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal */}
      {modal !== null && (
        <RowModal
          initial={modal.row ? modal.row : modal.defaults || null}
          meta={meta}
          onSave={data => saveMut.mutate(data)}
          onClose={() => setModal(null)}
          openStokInitially={!!modal.openStok}
        />
      )}

      {/* Silme onayı */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center"><Trash2 size={18} className="text-red-600"/></div>
              <div><p className="font-bold text-gray-900">Satırı Sil</p><p className="text-sm text-gray-500">Bu işlem geri alınamaz.</p></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">İptal</button>
              <button onClick={() => delMut.mutate(confirmDelete)} disabled={delMut.isPending}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 font-medium">
                {delMut.isPending ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
