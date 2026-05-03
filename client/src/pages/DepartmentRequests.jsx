import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, ClipboardList,
  Clock, Forward, HelpCircle, ListTodo, Plus, Send, Trash2,
  TrendingUp, UserCheck, X, XCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getProducts, getIsEmirleri, getUsers,
  getDepartmentRequests, createDepartmentRequest, updateDepartmentRequestStatus,
  getDepartmentRequestLogs, getDepartmentTasks, updateDepartmentTask, getDepartmentStats,
} from '../api';

// ── Sabitler ──────────────────────────────────────────────────────────────────

const DEPARTMENTS = ['İK','Muhasebe','Finans','İdari İşler','Teknik','Satış','Üretim','Diğer'];
const NON_STOCK_CATS = ['Kırtasiye','Mutfak','Bakım','Yedek Parça','El Aleti','Diğer'];

const STATUS_META = {
  waiting_manager:       { label: 'SA Müdürü Bekliyor',    color: 'bg-amber-100 text-amber-800',   dot: 'bg-amber-400' },
  forwarded_gm:          { label: 'GM Onayı Bekleniyor',   color: 'bg-purple-100 text-purple-800', dot: 'bg-purple-400' },
  forwarded_dept:        { label: 'Departman Kontrolü',    color: 'bg-sky-100 text-sky-800',       dot: 'bg-sky-400' },
  waiting_clarification: { label: 'Açıklama Bekleniyor',   color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-400' },
  approved:              { label: 'Onaylandı',             color: 'bg-emerald-100 text-emerald-800',dot: 'bg-emerald-400' },
  task_assigned:         { label: 'Göreve Atandı',         color: 'bg-blue-100 text-blue-800',     dot: 'bg-blue-400' },
  in_progress:           { label: 'Devam Ediyor',          color: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-400' },
  completed:             { label: 'Tamamlandı',            color: 'bg-green-100 text-green-800',   dot: 'bg-green-400' },
  rejected:              { label: 'Reddedildi',            color: 'bg-rose-100 text-rose-800',     dot: 'bg-rose-400' },
};

const ACTION_META = {
  created:              'Talep oluşturuldu',
  manager_approve:      'Onaylandı (SA Müdürü)',
  forward_gm:           'GM\'e iletildi',
  gm_approve:           'GM onayladı',
  forward_dept:         'Departmana iletildi',
  dept_confirm:         'Departman onayı alındı',
  request_clarification:'Açıklama istendi',
  provide_clarification: 'Açıklama gönderildi',
  assign_task:          'Göreve atandı',
  task_in_progress:     'Görev başladı',
  task_completed:       'Görev tamamlandı',
  reject:               'Reddedildi',
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-300' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function ItemLabel({ req }) {
  if (req.item_type === 'stoklu') return <span className="font-mono text-xs">{req.product_code} <span className="font-sans font-normal text-slate-500">{req.product_name}</span></span>;
  return <span>{req.non_stock_item_name}</span>;
}

let nsId = 0;

// ── Ana Bileşen ───────────────────────────────────────────────────────────────

export default function DepartmentRequestsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState(isAdmin ? 'inbox' : 'form');

  // Veriler
  const [products,   setProducts]   = useState([]);
  const [isEmirleri, setIsEmirleri] = useState([]);
  const [allUsers,   setAllUsers]   = useState([]);
  const [requests,   setRequests]   = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [message,    setMessage]    = useState(null);

  // Yeni talep formu
  const [dept,       setDept]       = useState('İK');
  const [itemType,   setItemType]   = useState('stoklu');
  const [selProds,   setSelProds]   = useState([]);
  const [nsItems,    setNsItems]    = useState([]);
  const [nsKat,      setNsKat]      = useState('Kırtasiye');
  const [nsAd,       setNsAd]       = useState('');
  const [nsQty,      setNsQty]      = useState(1);
  const [nsUnit,     setNsUnit]     = useState('adet');
  const [isEmri,     setIsEmri]     = useState('');
  const [isEmriMan,  setIsEmriMan]  = useState('');
  const [usageLoc,   setUsageLoc]   = useState('');
  const [detailsTxt, setDetailsTxt] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);
  const [saving,     setSaving]     = useState(false);

  // Aksiyon paneli (inbox)
  const [activeReq,  setActiveReq]  = useState(null); // request id
  const [activeAct,  setActiveAct]  = useState(null); // action string
  const [actNote,    setActNote]    = useState('');
  const [actEmail,   setActEmail]   = useState('');
  const [actUser,    setActUser]    = useState('');
  const [actDue,     setActDue]     = useState('');
  const [logs,       setLogs]       = useState({});   // { [reqId]: [...] }
  const [expandedLog,setExpandedLog]= useState(null);

  const projeKodu = isEmri === '__diger__' ? isEmriMan.trim() : isEmri;

  const filteredProds = useMemo(() => {
    if (!prodSearch.trim()) return products;
    const q = prodSearch.toLowerCase();
    return products.filter(p => (p.code+' '+p.name).toLowerCase().includes(q));
  }, [products, prodSearch]);

  // Dışarı tıklayınca ürün picker kapansın
  useEffect(() => {
    if (!showPicker) return;
    const h = (e) => { if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showPicker]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const promises = [getProducts({ limit: 300 }), getIsEmirleri(), getDepartmentRequests()];
      if (isAdmin) promises.push(getUsers(), getDepartmentTasks(), getDepartmentStats());
      const results = await Promise.all(promises);
      setProducts(results[0].data || []);
      setIsEmirleri(results[1].data?.is_emirleri || []);
      setRequests(results[2].data?.requests || []);
      if (isAdmin) {
        setAllUsers(results[3].data?.users || []);
        setTasks(results[4].data?.tasks || []);
        setStats(results[5].data || null);
      }
    } catch (e) { setMessage({ type: 'error', text: 'Veriler yüklenemedi.' }); }
    finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Yeni Talep ──────────────────────────────────────────────────────────────
  function toggleProd(pId) {
    const found = selProds.find(p => p.id === pId);
    if (found) { setSelProds(selProds.filter(p => p.id !== pId)); return; }
    const prod = products.find(p => p.id === pId);
    if (prod) { setSelProds([...selProds, { id: pId, code: prod.code, name: prod.name, qty: 1 }]); setShowPicker(false); setProdSearch(''); }
  }

  function addNsItem() {
    if (!nsAd.trim()) return;
    nsId++;
    setNsItems(prev => [...prev, { _id: nsId, kategori: nsKat, ad: nsAd.trim(), qty: nsQty, unit: nsUnit }]);
    setNsAd(''); setNsQty(1);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    if (itemType === 'stoklu') {
      if (!selProds.length) { setMessage({ type: 'error', text: 'En az bir ürün seçin.' }); return; }
      if (!projeKodu) { setMessage({ type: 'error', text: 'Stoklu ürün için İş Emri zorunludur.' }); return; }
    }
    if (itemType === 'stok-disi' && !nsItems.length) { setMessage({ type: 'error', text: 'En az bir ürün ekleyin.' }); return; }

    setSaving(true);
    try {
      const common = { department: dept, project_code: projeKodu||null, project_name: projeKodu||null, usage_location: usageLoc, details: detailsTxt };
      if (itemType === 'stoklu') {
        for (const p of selProds)
          await createDepartmentRequest({ ...common, item_type: 'stoklu', product_id: p.id, product_code: p.code, product_name: p.name, quantity: p.qty, unit: 'adet' });
      } else {
        for (const it of nsItems)
          await createDepartmentRequest({ ...common, item_type: 'stok-disi', non_stock_item_name: `[${it.kategori}] ${it.ad}`, quantity: it.qty, unit: it.unit });
      }
      const count = itemType === 'stoklu' ? selProds.length : nsItems.length;
      setMessage({ type: 'success', text: `${count} talep oluşturuldu. SA Müdürüne bildirim gönderildi.` });
      setSelProds([]); setNsItems([]); setNsAd(''); setNsQty(1); setIsEmri(''); setIsEmriMan(''); setUsageLoc(''); setDetailsTxt('');
      await loadAll();
      if (isAdmin) setTab('inbox'); else setTab('mine');
    } catch (err) { setMessage({ type: 'error', text: err?.response?.data?.error || 'Hata.' }); }
    finally { setSaving(false); }
  }

  // ── Aksiyon ─────────────────────────────────────────────────────────────────
  async function doAction(reqId, action) {
    setSaving(true);
    try {
      const payload = { action, note: actNote||undefined, forwardedTo: actEmail||undefined, assignedTo: actUser||undefined, dueDate: actDue||undefined };
      await updateDepartmentRequestStatus(reqId, payload);
      setMessage({ type: 'success', text: 'İşlem tamamlandı.' });
      setActiveReq(null); setActiveAct(null); setActNote(''); setActEmail(''); setActUser(''); setActDue('');
      await loadAll();
    } catch (err) { setMessage({ type: 'error', text: err?.response?.data?.error || 'Hata.' }); }
    finally { setSaving(false); }
  }

  async function loadLogs(reqId) {
    if (logs[reqId]) { setExpandedLog(expandedLog === reqId ? null : reqId); return; }
    try {
      const r = await getDepartmentRequestLogs(reqId);
      setLogs(prev => ({ ...prev, [reqId]: r.data?.logs || [] }));
      setExpandedLog(reqId);
    } catch {}
  }

  async function handleTaskUpdate(taskId, status, note) {
    setSaving(true);
    try {
      await updateDepartmentTask(taskId, { status, note });
      setMessage({ type: 'success', text: 'Görev güncellendi.' });
      await loadAll();
    } catch (err) { setMessage({ type: 'error', text: err?.response?.data?.error || 'Hata.' }); }
    finally { setSaving(false); }
  }

  // Gelen kutusu: aktif talepler
  const inboxRequests = useMemo(() =>
    requests.filter(r => ['waiting_manager','forwarded_gm','forwarded_dept','waiting_clarification'].includes(r.status))
            .sort((a,b) => new Date(b.created_at) - new Date(a.created_at)),
  [requests]);

  // Onaylananlar (görev atanmamış)
  const approvedPending = useMemo(() =>
    requests.filter(r => r.status === 'approved'),
  [requests]);

  // ── Tab Seçici ──────────────────────────────────────────────────────────────
  const tabs = isAdmin
    ? [
        { key: 'inbox',  label: 'Gelen Kutusu', icon: ClipboardList, badge: inboxRequests.length },
        { key: 'tasks',  label: 'Görevler',     icon: ListTodo,      badge: approvedPending.length + tasks.filter(t=>t.status!=='completed').length },
        { key: 'all',    label: 'Tüm Talepler', icon: Clock },
        { key: 'stats',  label: 'İstatistikler',icon: TrendingUp },
        { key: 'form',   label: 'Yeni Talep',   icon: Plus },
      ]
    : [
        { key: 'form',   label: 'Yeni Talep',   icon: Plus },
        { key: 'mine',   label: 'Taleplerim',   icon: ClipboardList, badge: requests.filter(r=>r.status==='waiting_clarification').length || undefined },
      ];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-800">Satınalma Talep Yönetimi</h1>
        <p className="text-sm text-slate-500 mt-0.5">Talep oluşturun, takip edin ve yönetin</p>
      </div>

      {message && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm flex justify-between gap-3 ${message.type==='success'?'border-emerald-300 bg-emerald-50 text-emerald-700':'border-rose-300 bg-rose-50 text-rose-700'}`}>
          {message.text}
          <button onClick={() => setMessage(null)}><X size={14}/></button>
        </div>
      )}

      {/* Sekmeler */}
      <div className="flex gap-1 mb-5 overflow-x-auto border-b border-slate-200">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab===t.key?'border-blue-600 text-blue-600':'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              <Icon size={15}/>
              {t.label}
              {t.badge ? <span className="ml-1 rounded-full bg-rose-500 text-white text-xs px-1.5 py-0.5 leading-none">{t.badge}</span> : null}
            </button>
          );
        })}
      </div>

      {/* ── YENİ TALEP FORMU ─────────────────────────────────────────────────── */}
      {tab === 'form' && (
        <div className="max-w-2xl">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-semibold mb-5">Yeni Satınalma Talebi</h2>
            <form onSubmit={handleSubmit} className="space-y-4">

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Departman</span>
                  <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={dept} onChange={e=>setDept(e.target.value)}>
                    {DEPARTMENTS.map(d=><option key={d}>{d}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Talep Tipi</span>
                  <select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={itemType} onChange={e=>{setItemType(e.target.value);setMessage(null);}}>
                    <option value="stoklu">Stoklu Ürün</option>
                    <option value="stok-disi">Stok Dışı Ürün</option>
                  </select>
                </label>
              </div>

              {/* Stoklu */}
              {itemType==='stoklu' && (
                <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 space-y-3">
                  <div className="relative" ref={pickerRef}>
                    <label className="text-xs font-medium text-slate-600">Ürün Ara</label>
                    <input type="text" placeholder="Stok kodu veya adıyla ara..." value={prodSearch}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      onChange={e=>{setProdSearch(e.target.value);setShowPicker(true);}}
                      onFocus={()=>setShowPicker(true)}/>
                    {showPicker && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                        <div className="flex justify-between px-3 py-1.5 bg-slate-50 border-b text-xs text-slate-400">
                          <span>{filteredProds.length} ürün</span>
                          <button type="button" onClick={()=>setShowPicker(false)}>Kapat</button>
                        </div>
                        {filteredProds.map(p=>(
                          <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={selProds.some(s=>s.id===p.id)} onChange={()=>toggleProd(p.id)}/>
                            <span className="font-mono text-xs text-slate-600">{p.code}</span>
                            <span className="text-sm text-slate-700 truncate">{p.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  {selProds.length>0 && (
                    <div className="space-y-1.5 pt-2 border-t border-blue-200">
                      {selProds.map(p=>(
                        <div key={p.id} className="flex items-center gap-2 bg-white rounded-lg border border-blue-200 px-3 py-2">
                          <span className="flex-1 font-mono text-xs text-slate-600">{p.code} <span className="font-sans font-normal text-slate-500">{p.name}</span></span>
                          <input type="number" min="1" value={p.qty} onChange={e=>setSelProds(selProds.map(s=>s.id===p.id?{...s,qty:Math.max(1,+e.target.value||1)}:s))}
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-xs text-right"/>
                          <span className="text-xs text-slate-400">adet</span>
                          <button type="button" onClick={()=>setSelProds(selProds.filter(s=>s.id!==p.id))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Stok Dışı */}
              {itemType==='stok-disi' && (
                <div className="rounded-lg bg-amber-50 border border-amber-100 p-4 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
                    <div>
                      <label className="text-xs text-slate-500">Kategori</label>
                      <select className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm bg-white" value={nsKat} onChange={e=>setNsKat(e.target.value)}>
                        {NON_STOCK_CATS.map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Ürün Adı</label>
                      <input type="text" placeholder="A4 kağıt, tornavida seti..." value={nsAd}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        onChange={e=>setNsAd(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();addNsItem();}}}/>
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <div><label className="text-xs text-slate-500">Miktar</label>
                      <input type="number" min="1" value={nsQty} onChange={e=>setNsQty(Math.max(1,+e.target.value||1))}
                        className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm text-right"/></div>
                    <div><label className="text-xs text-slate-500">Birim</label>
                      <input type="text" value={nsUnit} onChange={e=>setNsUnit(e.target.value)}
                        className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm"/></div>
                    <button type="button" onClick={addNsItem} disabled={!nsAd.trim()}
                      className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-40">
                      <Plus size={14}/> Ekle
                    </button>
                  </div>
                  {nsItems.length>0 && (
                    <div className="space-y-1.5 pt-2 border-t border-amber-200">
                      {nsItems.map(it=>(
                        <div key={it._id} className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2">
                          <span className="rounded bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5">{it.kategori}</span>
                          <span className="flex-1 text-sm text-slate-700 truncate">{it.ad}</span>
                          <span className="text-xs text-slate-400">{it.qty} {it.unit}</span>
                          <button type="button" onClick={()=>setNsItems(nsItems.filter(i=>i._id!==it._id))} className="text-rose-400 hover:text-rose-600"><Trash2 size={13}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* İş Emri */}
              <div>
                <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
                  İş Emri / Proje
                  {itemType==='stoklu'?<span className="ml-1 text-rose-500 font-semibold">* Zorunlu</span>:<span className="ml-1 text-slate-400 font-normal">(opsiyonel)</span>}
                </label>
                <select value={isEmri} onChange={e=>setIsEmri(e.target.value)}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white ${itemType==='stoklu'&&!isEmri?'border-rose-300':'border-slate-300'}`}>
                  <option value="">— İş emri seçin —</option>
                  {isEmirleri.map(k=><option key={k} value={k}>{k}</option>)}
                  <option value="__diger__">Diğer (manuel gir)</option>
                </select>
                {isEmri==='__diger__' && (
                  <input type="text" placeholder="Proje kodu veya adı..." value={isEmriMan} onChange={e=>setIsEmriMan(e.target.value)} autoFocus
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
                )}
              </div>

              <label className="block">
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Kullanım / İhtiyaç Nedeni</span>
                <textarea value={usageLoc} onChange={e=>setUsageLoc(e.target.value)}
                  className="mt-1 w-full min-h-[70px] rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">Ek Detay</span>
                <textarea value={detailsTxt} onChange={e=>setDetailsTxt(e.target.value)}
                  className="mt-1 w-full min-h-[50px] rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
              </label>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-400">✉ SA Müdürüne bildirim gönderilecek</span>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  <Send size={14}/>{saving?'Gönderiliyor...':'Gönder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GELEN KUTUSU (admin) ──────────────────────────────────────────────── */}
      {tab==='inbox' && isAdmin && (
        <div className="space-y-3">
          {loading && <p className="text-slate-400 text-sm">Yükleniyor...</p>}
          {!loading && inboxRequests.length===0 && (
            <div className="text-center py-16 text-slate-400">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-300"/>
              <p>Bekleyen talep yok</p>
            </div>
          )}
          {inboxRequests.map(req => (
            <RequestCard key={req.id} req={req}
              isActive={activeReq===req.id}
              activeAct={activeReq===req.id?activeAct:null}
              actNote={actNote} actEmail={actEmail} actUser={actUser} actDue={actDue}
              allUsers={allUsers}
              logOpen={expandedLog===req.id} logs={logs[req.id]}
              onToggleLog={()=>loadLogs(req.id)}
              onSetAct={(id,act)=>{ setActiveReq(id); setActiveAct(act); setActNote(''); setActEmail(''); setActUser(''); setActDue(''); }}
              onActNote={setActNote} onActEmail={setActEmail} onActUser={setActUser} onActDue={setActDue}
              onSubmitAct={doAction}
              onCancelAct={()=>{setActiveReq(null);setActiveAct(null);}}
              saving={saving}
            />
          ))}
        </div>
      )}

      {/* ── GÖREVLER (admin) ─────────────────────────────────────────────────── */}
      {tab==='tasks' && isAdmin && (
        <div className="space-y-6">
          {/* Onaylananlar — görev atanmamış */}
          {approvedPending.length>0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
                <UserCheck size={15} className="text-emerald-500"/> Onaylanan — Görev Atanacak ({approvedPending.length})
              </h3>
              <div className="space-y-2">
                {approvedPending.map(req=>(
                  <div key={req.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-mono text-xs text-slate-400">{req.request_number}</span>
                        <span className="mx-1 text-slate-300">·</span>
                        <span className="text-xs text-slate-500">{req.department}</span>
                        {req.project_code && <span className="ml-2 text-xs font-medium text-blue-600">{req.project_code}</span>}
                        <p className="text-sm text-slate-700 mt-0.5"><ItemLabel req={req}/> — {req.quantity} {req.unit}</p>
                      </div>
                      <StatusBadge status={req.status}/>
                    </div>
                    {activeReq===req.id && activeAct==='assign_task' ? (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="text-xs text-slate-500">Kişi</label>
                            <select value={actUser} onChange={e=>setActUser(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                              <option value="">— Seçin —</option>
                              {allUsers.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-slate-500">Son Tarih</label>
                            <input type="date" value={actDue} onChange={e=>setActDue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
                          </div>
                        </div>
                        <textarea placeholder="Not (opsiyonel)" value={actNote} onChange={e=>setActNote(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[50px]"/>
                        <div className="flex gap-2">
                          <button onClick={()=>doAction(req.id,'assign_task')} disabled={saving||!actUser} className="rounded-lg bg-blue-600 text-white px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-40">Ata</button>
                          <button onClick={()=>{setActiveReq(null);setActiveAct(null);}} className="rounded-lg border px-4 py-1.5 text-sm text-slate-500">İptal</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={()=>{setActiveReq(req.id);setActiveAct('assign_task');setActNote('');setActUser('');setActDue('');}}
                        className="mt-3 flex items-center gap-1 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs hover:bg-blue-700">
                        <UserCheck size={13}/> Göreve Ata
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Mevcut görevler */}
          <section>
            <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
              <ListTodo size={15} className="text-blue-500"/> Aktif Görevler
            </h3>
            {tasks.filter(t=>t.status!=='completed').length===0
              ? <p className="text-slate-400 text-sm py-4 text-center">Aktif görev yok</p>
              : (
                <div className="space-y-2">
                  {tasks.filter(t=>t.status!=='completed').map(task=>(
                    <TaskCard key={task.id} task={task} onUpdate={handleTaskUpdate} saving={saving}/>
                  ))}
                </div>
              )
            }
          </section>

          {tasks.filter(t=>t.status==='completed').length>0 && (
            <section>
              <h3 className="text-sm font-semibold text-slate-400 mb-2">Tamamlananlar ({tasks.filter(t=>t.status==='completed').length})</h3>
              <div className="space-y-2 opacity-70">
                {tasks.filter(t=>t.status==='completed').map(task=>(
                  <TaskCard key={task.id} task={task} onUpdate={handleTaskUpdate} saving={saving}/>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── TÜM TALEPLER ─────────────────────────────────────────────────────── */}
      {(tab==='all' || tab==='mine') && (
        <AllRequestsView requests={requests} isAdmin={isAdmin}
          onLoadLogs={loadLogs} logs={logs} expandedLog={expandedLog}
          onToggleLog={id=>loadLogs(id)}
        />
      )}

      {/* ── İSTATİSTİKLER ────────────────────────────────────────────────────── */}
      {tab==='stats' && isAdmin && stats && (
        <StatsView stats={stats}/>
      )}
    </div>
  );
}

// ── RequestCard ──────────────────────────────────────────────────────────────

function RequestCard({ req, isActive, activeAct, actNote, actEmail, actUser, actDue, allUsers,
  logOpen, logs, onToggleLog, onSetAct, onActNote, onActEmail, onActUser, onActDue,
  onSubmitAct, onCancelAct, saving }) {

  const actions = getAvailableActions(req.status);
  const urun = req.item_type==='stoklu'
    ? `${req.product_code} — ${req.product_name}`
    : req.non_stock_item_name;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${isActive?'border-blue-300 shadow-blue-50':'border-slate-200'}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-slate-400">{req.request_number}</span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-medium text-slate-600">{req.department}</span>
              {req.project_code && <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{req.project_code}</span>}
            </div>
            <p className="text-sm text-slate-700 mt-1 truncate">{urun}</p>
            <p className="text-xs text-slate-400 mt-0.5">{req.quantity} {req.unit} · {req.requester_name} · {new Date(req.created_at).toLocaleDateString('tr-TR')}</p>
            {req.usage_location && <p className="text-xs text-slate-500 mt-1 italic">"{req.usage_location}"</p>}
          </div>
          <StatusBadge status={req.status}/>
        </div>

        {/* Açıklama Q&A */}
        {req.clarification_question && (
          <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 p-3 text-xs space-y-1">
            <p className="font-semibold text-orange-700">Soru: {req.clarification_question}</p>
            {req.clarification_answer && <p className="text-slate-600">Cevap: {req.clarification_answer}</p>}
          </div>
        )}

        {/* Aksiyon butonları */}
        {!isActive && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {actions.map(act=>(
              <ActionButton key={act} action={act} onClick={()=>onSetAct(req.id, act)}/>
            ))}
          </div>
        )}
      </div>

      {/* Aksiyon Formu */}
      {isActive && activeAct && (
        <ActionForm action={activeAct} req={req}
          note={actNote} email={actEmail} assignee={actUser} due={actDue}
          allUsers={allUsers}
          onNote={onActNote} onEmail={onActEmail} onAssignee={onActUser} onDue={onActDue}
          onSubmit={()=>onSubmitAct(req.id, activeAct)}
          onCancel={onCancelAct}
          saving={saving}
        />
      )}

      {/* Log */}
      <div className="border-t border-slate-100">
        <button onClick={onToggleLog} className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-400 hover:bg-slate-50">
          <span>Geçmiş</span>
          {logOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
        </button>
        {logOpen && logs && (
          <div className="px-4 pb-3 space-y-1.5">
            {logs.map(log=>(
              <div key={log.id} className="flex items-start gap-2 text-xs text-slate-500">
                <span className="shrink-0 text-slate-300">{new Date(log.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</span>
                <span className="font-medium text-slate-600">{log.user_name||'—'}</span>
                <span>{ACTION_META[log.action]||log.action}</span>
                {log.note && <span className="text-slate-400 italic">"{log.note}"</span>}
                {log.forwarded_to && <span className="text-blue-500">→ {log.forwarded_to}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function getAvailableActions(status) {
  switch (status) {
    case 'waiting_manager': return ['manager_approve','forward_gm','forward_dept','request_clarification','reject'];
    case 'forwarded_gm':    return ['gm_approve','manager_approve','reject'];
    case 'forwarded_dept':  return ['dept_confirm','manager_approve','request_clarification','reject'];
    case 'waiting_clarification': return ['manager_approve','reject'];
    default: return [];
  }
}

const ACTION_LABELS = {
  manager_approve:      { label: 'Onayla',            color: 'bg-emerald-600 text-white hover:bg-emerald-700', icon: CheckCircle2 },
  forward_gm:           { label: 'GM\'e İlet',         color: 'bg-purple-600 text-white hover:bg-purple-700',  icon: Forward },
  forward_dept:         { label: 'Departmana İlet',   color: 'bg-sky-600 text-white hover:bg-sky-700',        icon: Forward },
  request_clarification:{ label: 'Açıklama İste',     color: 'bg-orange-500 text-white hover:bg-orange-600',  icon: HelpCircle },
  dept_confirm:         { label: 'Dept. Onayı Alındı',color: 'bg-teal-600 text-white hover:bg-teal-700',      icon: CheckCircle2 },
  gm_approve:           { label: 'GM Onayladı',       color: 'bg-emerald-600 text-white hover:bg-emerald-700',icon: CheckCircle2 },
  assign_task:          { label: 'Göreve Ata',        color: 'bg-blue-600 text-white hover:bg-blue-700',      icon: UserCheck },
  reject:               { label: 'Reddet',            color: 'bg-rose-500 text-white hover:bg-rose-600',      icon: XCircle },
};

function ActionButton({ action, onClick }) {
  const m = ACTION_LABELS[action] || { label: action, color: 'bg-slate-200 text-slate-700' };
  const Icon = m.icon;
  return (
    <button onClick={onClick} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${m.color}`}>
      {Icon && <Icon size={12}/>}{m.label}
    </button>
  );
}

function ActionForm({ action, req, note, email, assignee, due, allUsers, onNote, onEmail, onAssignee, onDue, onSubmit, onCancel, saving }) {
  const needsNote  = ['manager_approve','forward_gm','forward_dept','request_clarification','dept_confirm','gm_approve','reject'].includes(action);
  const needsEmail = ['forward_gm','forward_dept'].includes(action);
  const needsUser  = action === 'assign_task';
  const noteLabel  = action==='request_clarification' ? 'Açıklama sorusu' : action==='reject' ? 'Ret gerekçesi' : 'Not (opsiyonel)';
  const emailLabel = action==='forward_gm' ? 'GM e-posta adresi' : 'Departman yöneticisi e-postası';
  const required   = ['request_clarification'].includes(action) ? !note : needsUser ? !assignee : false;

  return (
    <div className="border-t border-blue-100 bg-blue-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700">{ACTION_LABELS[action]?.label}</p>
      {needsEmail && (
        <div>
          <label className="text-xs text-slate-500">{emailLabel} *</label>
          <input type="email" value={email} onChange={e=>onEmail(e.target.value)} placeholder="mail@ornek.com"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
        </div>
      )}
      {needsUser && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500">Kişi *</label>
            <select value={assignee} onChange={e=>onAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">— Seçin —</option>
              {allUsers.filter(u=>u.active).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Son Tarih</label>
            <input type="date" value={due} onChange={e=>onDue(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
          </div>
        </div>
      )}
      {needsNote && (
        <div>
          <label className="text-xs text-slate-500">{noteLabel}</label>
          <textarea value={note} onChange={e=>onNote(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[60px]"/>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onSubmit} disabled={saving||required} className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 ${action==='reject'?'bg-rose-500 hover:bg-rose-600':'bg-blue-600 hover:bg-blue-700'}`}>
          {saving?'...':'Uygula'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-500 hover:bg-slate-50">İptal</button>
      </div>
    </div>
  );
}

// ── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onUpdate, saving }) {
  const urun = task.item_type==='stoklu' ? `${task.product_code} ${task.product_name||''}` : task.non_stock_item_name||'—';
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <span className="font-mono">{task.request_number}</span>
            <span>·</span><span>{task.department}</span>
            {task.project_code && <span className="text-blue-600 font-semibold">{task.project_code}</span>}
          </div>
          <p className="text-sm text-slate-700 mt-0.5 truncate">{urun} — {task.quantity} {task.unit}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Atanan: <span className="font-medium text-slate-600">{task.assigned_to_name||'—'}</span>
            {task.due_date && <> · Son: <span className="font-medium text-rose-600">{task.due_date}</span></>}
          </p>
          {task.note && <p className="text-xs text-slate-500 italic mt-0.5">"{task.note}"</p>}
        </div>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${task.status==='completed'?'bg-green-100 text-green-700':task.status==='in_progress'?'bg-indigo-100 text-indigo-700':'bg-slate-100 text-slate-600'}`}>
          {task.status==='completed'?'Tamamlandı':task.status==='in_progress'?'Devam Ediyor':'Bekliyor'}
        </span>
      </div>
      {task.status!=='completed' && (
        <div className="mt-3 flex gap-1.5">
          {task.status==='pending' && (
            <button onClick={()=>onUpdate(task.id,'in_progress')} disabled={saving}
              className="rounded-lg bg-indigo-600 text-white text-xs px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-40">Başlat</button>
          )}
          {task.status==='in_progress' && (
            <button onClick={()=>onUpdate(task.id,'completed')} disabled={saving}
              className="rounded-lg bg-green-600 text-white text-xs px-3 py-1.5 hover:bg-green-700 disabled:opacity-40">Tamamla</button>
          )}
        </div>
      )}
    </div>
  );
}

// ── AllRequestsView ──────────────────────────────────────────────────────────

function AllRequestsView({ requests, isAdmin, onLoadLogs, logs, expandedLog, onToggleLog }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const filtered = useMemo(() => {
    let r = requests;
    if (filterStatus) r = r.filter(x=>x.status===filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x=>(x.request_number+' '+x.department+' '+(x.product_code||'')
        +' '+(x.product_name||'')+(x.non_stock_item_name||'')).toLowerCase().includes(q));
    }
    return r;
  }, [requests, search, filterStatus]);

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <input type="text" placeholder="Ara..." value={search} onChange={e=>setSearch(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-48"/>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Tüm durumlar</option>
          {Object.entries(STATUS_META).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="self-center text-xs text-slate-400">{filtered.length} talep</span>
      </div>

      <div className="space-y-2">
        {filtered.map(req=>{
          const urun = req.item_type==='stoklu'?`${req.product_code} — ${req.product_name}`:req.non_stock_item_name;
          const logOpen = expandedLog===req.id;
          return (
            <div key={req.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    <span className="font-mono">{req.request_number}</span>·<span>{req.department}</span>
                    {req.project_code && <span className="text-blue-600 font-semibold">{req.project_code}</span>}
                    {isAdmin && req.requester_name && <span>· {req.requester_name}</span>}
                  </div>
                  <p className="text-sm text-slate-700 mt-0.5 truncate">{urun} — {req.quantity} {req.unit}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(req.created_at).toLocaleDateString('tr-TR')}</p>
                </div>
                <StatusBadge status={req.status}/>
              </div>
              {/* Açıklama bekleniyor — kullanıcı formu */}
              {!isAdmin && req.status==='waiting_clarification' && (
                <ClarificationReplyForm req={req}/>
              )}
              <div className="border-t border-slate-100">
                <button onClick={()=>onToggleLog(req.id)} className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-400 hover:bg-slate-50">
                  <span>Geçmiş</span>{logOpen?<ChevronDown size={12}/>:<ChevronRight size={12}/>}
                </button>
                {logOpen && logs[req.id] && (
                  <div className="px-4 pb-3 space-y-1">
                    {logs[req.id].map(log=>(
                      <div key={log.id} className="flex gap-2 text-xs text-slate-500">
                        <span className="text-slate-300 shrink-0">{new Date(log.created_at).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'})}</span>
                        <span className="font-medium text-slate-600">{log.user_name||'—'}</span>
                        <span>{ACTION_META[log.action]||log.action}</span>
                        {log.note && <span className="italic text-slate-400">"{log.note}"</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ClarificationReplyForm({ req }) {
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (!answer.trim()) return;
    setSaving(true);
    try {
      await updateDepartmentRequestStatus(req.id, { action: 'provide_clarification', note: answer });
      setDone(true);
    } catch {}
    finally { setSaving(false); }
  }

  if (done) return <div className="px-4 pb-3 text-xs text-emerald-600">Açıklamanız iletildi.</div>;

  return (
    <div className="px-4 pb-4 bg-orange-50 border-t border-orange-100">
      <p className="text-xs font-semibold text-orange-700 mt-3 mb-1">Açıklama Bekleniyor</p>
      <p className="text-xs text-slate-600 mb-2 italic">"{req.clarification_question}"</p>
      <textarea value={answer} onChange={e=>setAnswer(e.target.value)} rows={2}
        placeholder="Cevabınızı yazın..."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-[60px]"/>
      <button onClick={submit} disabled={saving||!answer.trim()} className="mt-2 rounded-lg bg-orange-500 text-white text-xs px-4 py-1.5 hover:bg-orange-600 disabled:opacity-40">
        {saving?'Gönderiliyor...':'Gönder'}
      </button>
    </div>
  );
}

// ── StatsView ────────────────────────────────────────────────────────────────

function StatsView({ stats }) {
  const { totals, byStatus, byDept, byMonth, avgHours } = stats;
  const kpis = [
    { label: 'Toplam Talep',    value: totals?.total||0,      color: 'text-slate-700',   bg: 'bg-slate-50' },
    { label: 'Bekleyen',        value: totals?.pending||0,    color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Devam Eden',      value: totals?.inprogress||0, color: 'text-indigo-600',  bg: 'bg-indigo-50' },
    { label: 'Tamamlanan',      value: totals?.completed||0,  color: 'text-green-600',   bg: 'bg-green-50' },
    { label: 'Reddedilen',      value: totals?.rejected||0,   color: 'text-rose-600',    bg: 'bg-rose-50' },
    { label: 'Ort. İşlem Süresi', value: avgHours ? `${Math.round(avgHours)} sa` : '—', color: 'text-blue-600', bg: 'bg-blue-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k=>(
          <div key={k.label} className={`rounded-xl p-4 ${k.bg}`}>
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Duruma Göre</h3>
          <div className="space-y-2">
            {byStatus.map(s=>{
              const m = STATUS_META[s.status]||{label:s.status,dot:'bg-slate-300'};
              const pct = totals?.total ? Math.round(s.count/totals.total*100) : 0;
              return (
                <div key={s.status} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`}/>
                  <span className="text-xs text-slate-600 w-40 truncate">{m.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${m.dot}`} style={{width:`${pct}%`}}/>
                  </div>
                  <span className="text-xs text-slate-500 w-6 text-right">{s.count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-3">Departmana Göre</h3>
          <div className="space-y-2">
            {byDept.map(d=>{
              const pct = totals?.total ? Math.round(d.count/totals.total*100) : 0;
              return (
                <div key={d.department} className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 w-28 truncate">{d.department}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-blue-400" style={{width:`${pct}%`}}/>
                  </div>
                  <span className="text-xs text-slate-500 w-6 text-right">{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Aylık Talep Sayısı</h3>
        <div className="flex items-end gap-1 h-24">
          {[...byMonth].reverse().map(m=>{
            const max = Math.max(...byMonth.map(x=>x.count),1);
            const h = Math.round((m.count/max)*100);
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-slate-400">{m.count}</span>
                <div className="w-full bg-blue-400 rounded-t" style={{height:`${h}%`,minHeight:'4px'}}/>
                <span className="text-xs text-slate-400 truncate w-full text-center">{m.month?.slice(5)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
