import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle, FileText, Plus, Send, ShieldCheck, XCircle, X, Search, Check, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getProducts,
  getProjects,
  getDepartmentRequests,
  createDepartmentRequest,
  updateDepartmentRequestStatus,
} from '../api';

const DEPARTMENTS = ['İK', 'Muhasebe', 'Finans', 'İdari İşler', 'Teknik', 'Satış', 'Üretim', 'Diğer'];

const STATUS_LABELS = {
  draft: 'Taslak',
  waiting_manager: 'Yönetici Onayı Bekleniyor',
  waiting_gm: 'Genel Müdür Onayı Bekleniyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi'
};

const WORKFLOW = {
  'İK': false, 'Satış': false,
  'Muhasebe': true, 'Finans': true, 'İdari İşler': true, 'Teknik': true, 'Üretim': true, 'Diğer': true
};

export default function DepartmentRequestsPage() {
  const { user } = useAuth();
  const [dept, setDept] = useState('İK');
  const [itemType, setItemType] = useState('stoklu');
  const [products, setProducts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [nonStockName, setNonStockName] = useState('');
  const [unit, setUnit] = useState('adet');
  const [usageLocation, setUsageLocation] = useState('');
  const [details, setDetails] = useState('');
  const [procEmail, setProcEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter((p) => (p.code?.toLowerCase() + ' ' + p.name?.toLowerCase()).includes(q));
  }, [products, productSearch]);

  const openProjects = useMemo(() => projects.filter((p) => ['pending', 'offered'].includes(p.status)), [projects]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [pRes, prRes, rRes] = await Promise.all([
          getProducts({ limit: 200 }),
          getProjects(),
          getDepartmentRequests(),
        ]);
        setProducts(pRes.data || []);
        setProjects(prRes.data?.rows || []);
        setRequests(rRes.data?.requests || []);
      } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: 'Veriler yüklenemedi.' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleProduct(pId) {
    const found = selectedProducts.find((item) => item.id === pId);
    if (found) {
      setSelectedProducts(selectedProducts.filter((item) => item.id !== pId));
    } else {
      const product = products.find((p) => p.id === pId);
      if (product) {
        setSelectedProducts([...selectedProducts, { id: pId, code: product.code, name: product.name, qty: 1 }]);
        setShowProductPicker(false);
        setProductSearch('');
      }
    }
  }

  function updateQty(pId, q) {
    setSelectedProducts(selectedProducts.map((item) =>
      item.id === pId ? { ...item, qty: Math.max(1, Number(q)) } : item
    ));
  }

  function removeProduct(pId) {
    setSelectedProducts(selectedProducts.filter((item) => item.id !== pId));
  }

  function toggleProject(prId) {
    setSelectedProjects(selectedProjects.includes(prId)
      ? selectedProjects.filter((id) => id !== prId)
      : [...selectedProjects, prId]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      if (itemType === 'stoklu' && selectedProducts.length === 0) {
        setMessage({ type: 'error', text: 'Lütfen en az bir ürün seçiniz.' });
        setSaving(false);
        return;
      }

      if (itemType === 'stok-disi' && !nonStockName.trim()) {
        setMessage({ type: 'error', text: 'Lütfen ürün adı giriniz.' });
        setSaving(false);
        return;
      }

      const firstProjectId = selectedProjects.length > 0 ? selectedProjects[0] : null;
      const firstProject = firstProjectId ? openProjects.find((p) => p.id === firstProjectId) : null;

      if (itemType === 'stoklu') {
        for (const product of selectedProducts) {
          await createDepartmentRequest({
            department: dept,
            item_type: 'stoklu',
            product_id: product.id,
            product_code: product.code,
            product_name: product.name,
            quantity: product.qty,
            unit: unit,
            project_id: firstProjectId,
            project_code: null,
            project_name: firstProject ? (firstProject.project_name || firstProject.sheet_name) : null,
            usage_location: usageLocation,
            details: details,
            procurement_email: procEmail,
          });
        }
      } else {
        await createDepartmentRequest({
          department: dept,
          item_type: 'stok-disi',
          non_stock_item_name: nonStockName,
          quantity: 1,
          unit: unit,
          project_id: firstProjectId,
          project_code: null,
          project_name: firstProject ? (firstProject.project_name || firstProject.sheet_name) : null,
          usage_location: usageLocation,
          details: details,
          procurement_email: procEmail,
        });
      }

      setDept('İK');
      setItemType('stoklu');
      setSelectedProducts([]);
      setSelectedProjects([]);
      setNonStockName('');
      setUnit('adet');
      setUsageLocation('');
      setDetails('');
      setProcEmail('');
      setProductSearch('');
      setShowProductPicker(false);
      setShowProjectPicker(false);

      setMessage({ type: 'success', text: `${itemType === 'stoklu' ? selectedProducts.length : 1} talep oluşturuldu.` });
      const rRes = await getDepartmentRequests();
      setRequests(rRes.data?.requests || []);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: error?.response?.data?.error || 'Talep kaydedilemedi.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusUpdate(id, action) {
    setSaving(true);
    try {
      await updateDepartmentRequestStatus(id, { action });
      setMessage({ type: 'success', text: 'Talep durumu güncellendi.' });
      const rRes = await getDepartmentRequests();
      setRequests(rRes.data?.requests || []);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Durum güncellenemedi.' });
    } finally {
      setSaving(false);
    }
  }

  const canApprove = user?.role === 'admin';

  return (
    <div className="p-6">
      <div className="mb-6 rounded-lg bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Departman Talep Merkezi</h1>
        <p className="text-slate-600 mt-1">Satınalma talebi oluşturun ve yönetin.</p>
      </div>

      {message && (
        <div className={`mb-4 rounded border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-rose-300 bg-rose-50 text-rose-700'}`}>
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Talep Formu</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Departman + Talep Tipi */}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Departman</span>
                <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" value={dept} onChange={(e) => setDept(e.target.value)}>
                  {DEPARTMENTS.map((d) => (<option key={d}>{d}</option>))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Talep Tipi</span>
                <select className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" value={itemType} onChange={(e) => setItemType(e.target.value)}>
                  <option value="stoklu">Stoklu Ürün</option>
                  <option value="stok-disi">Stok Dışı Ürün</option>
                </select>
              </label>
            </div>

            {/* STOKLU ÜRÜN */}
            {itemType === 'stoklu' && (
              <div className="space-y-3 rounded bg-blue-50 p-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ürün Seç (Arama)</label>
                  <input
                    type="text"
                    placeholder="Stok kodu veya adıyla ara..."
                    className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onFocus={() => setShowProductPicker(true)}
                  />
                  {showProductPicker && (
                    <div className="absolute top-full left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg z-10">
                      {filteredProducts.length === 0 ? (
                        <div className="p-3 text-sm text-slate-500">Ürün bulunamadı</div>
                      ) : (
                        filteredProducts.map((product) => (
                          <label key={product.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedProducts.some((item) => item.id === product.id)}
                              onChange={() => toggleProduct(product.id)}
                              className="rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-slate-800 truncate">{product.code}</div>
                              <div className="text-xs text-slate-600 truncate">{product.name}</div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Seçilen Ürünler */}
                {selectedProducts.length > 0 && (
                  <div className="border-t pt-3">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Seçilen Ürünler ({selectedProducts.length})</h4>
                    <div className="space-y-2">
                      {selectedProducts.map((product) => (
                        <div key={product.id} className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-800 text-sm truncate">{product.code} • {product.name}</div>
                          </div>
                          <input
                            type="number"
                            min="1"
                            value={product.qty}
                            onChange={(e) => updateQty(product.id, e.target.value)}
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-right"
                          />
                          <span className="text-sm text-slate-600 w-10">{unit}</span>
                          <button
                            type="button"
                            onClick={() => removeProduct(product.id)}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STOK DIŞI ÜRÜN */}
            {itemType === 'stok-disi' && (
              <div className="space-y-3 rounded bg-amber-50 p-4">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Talep Adı / Ürün Açıklaması</span>
                  <input
                    type="text"
                    placeholder="Örn: Yazıcı sarf malzemeleri, Ofis mobilyası..."
                    className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                    value={nonStockName}
                    onChange={(e) => setNonStockName(e.target.value)}
                  />
                </label>
              </div>
            )}

            {/* Birim */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Birim</span>
              <input
                type="text"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </label>

            {/* Açık Projeler Seçimi */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Açık Projeler (Opsiyonel, Tikle)</label>
              <button
                type="button"
                onClick={() => setShowProjectPicker(!showProjectPicker)}
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-left bg-white hover:bg-slate-50"
              >
                {selectedProjects.length === 0 ? 'Proje seç...' : `${selectedProjects.length} proje seçildi`}
              </button>
              {showProjectPicker && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded border border-slate-200 bg-white shadow-lg z-10">
                  {openProjects.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500">Açık proje yok</div>
                  ) : (
                    openProjects.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedProjects.includes(project.id)}
                          onChange={() => toggleProject(project.id)}
                          className="rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-800 text-sm truncate">{project.project_name || project.sheet_name}</div>
                          <div className="text-xs text-slate-600">{project.institution}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Kullanım Açıklaması */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Kullanım Açıklaması / İhtiyaç Nedeni</span>
              <textarea
                className="mt-1 min-h-[100px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={usageLocation}
                onChange={(e) => setUsageLocation(e.target.value)}
              />
            </label>

            {/* Detaylar */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Detay / Özellikler</span>
              <textarea
                className="mt-1 min-h-[100px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </label>

            {/* Email */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Satınalma Maili (Opsiyonel)</span>
              <input
                type="email"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={procEmail}
                onChange={(e) => setProcEmail(e.target.value)}
                placeholder="satinalma@ornek.com"
              />
            </label>

            {/* Submit */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-slate-600">
                {WORKFLOW[dept] ? '✓ Yönetici onayı gerekli' : '📤 Doğrudan GM onayına gider'}
              </div>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-slate-400">
                <Send size={16} /> Gönder
              </button>
            </div>
          </form>
        </section>

        {/* Talep Listesi */}
        <section className="rounded-lg bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Talepler</h2>
              <p className="text-xs text-slate-500">Son hazırladıklarınız</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center text-slate-500 py-4">Yükleniyor...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium text-slate-700">No</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-700">Dept</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-700">Ürün</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-700">Durum</th>
                    <th className="px-2 py-2 text-left font-medium text-slate-700">Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr><td colSpan="5" className="px-2 py-4 text-center text-slate-500">Talep yok</td></tr>
                  ) : requests.slice(0, 10).map((req) => (
                    <tr key={req.id} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-medium text-slate-700 truncate text-xs">{req.request_number}</td>
                      <td className="px-2 py-2 text-slate-600 text-xs">{req.department}</td>
                      <td className="px-2 py-2 text-slate-600 text-xs truncate">
                        {req.item_type === 'stoklu' ? `${req.product_code}` : req.non_stock_item_name}
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-block bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs">
                          {STATUS_LABELS[req.status] || req.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-xs space-x-1">
                        {canApprove && req.status === 'waiting_manager' && (
                          <button onClick={() => handleStatusUpdate(req.id, 'manager_approve')} className="inline-block bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600">
                            ✓ Onayla
                          </button>
                        )}
                        {canApprove && req.status === 'waiting_gm' && (
                          <button onClick={() => handleStatusUpdate(req.id, 'gm_approve')} className="inline-block bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                            ✓ GM
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
