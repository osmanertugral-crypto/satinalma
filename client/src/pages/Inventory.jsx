import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEviraInventory, syncEviraInventory } from '../api';
import { PageHeader, Card, Button, Spinner } from '../components/UI';
import { RefreshCw, Search, Download, Package, Warehouse, BarChart2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('tr-TR'); } catch { return iso; }
}

export default function InventoryPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canEdit = user?.role !== 'viewer';

  const [search, setSearch] = useState('');
  const [ambarFilter, setAmbarFilter] = useState('');
  const [syncMsg, setSyncMsg] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['evira-inventory'],
    queryFn: () => getEviraInventory().then(r => r.data),
  });

  const syncMutation = useMutation({
    mutationFn: syncEviraInventory,
    onSuccess: (res) => {
      qc.invalidateQueries(['evira-inventory']);
      setSyncMsg({ ok: true, text: res.data?.message || 'Güncellendi' });
      setTimeout(() => setSyncMsg(null), 4000);
    },
    onError: (e) => {
      setSyncMsg({ ok: false, text: e.response?.data?.error || e.message });
      setTimeout(() => setSyncMsg(null), 6000);
    },
  });

  const rows   = data?.rows   || [];
  const ambars = data?.ambars || [];

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (ambarFilter && r.ambar_kodu !== ambarFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (r.stok_kodu || '').toLowerCase().includes(q) ||
               (r.stok_adi  || '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [rows, ambarFilter, search]);

  const totalQty      = filtered.reduce((s, r) => s + (r.miktar || 0), 0);
  const uniqueItems   = new Set(filtered.map(r => r.stok_kodu)).size;
  const activeAmbars  = new Set(filtered.map(r => r.ambar_kodu)).size;

  function handleExport() {
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'Ambar':      r.ambar_adi,
      'Stok Kodu':  r.stok_kodu,
      'Stok Adı':   r.stok_adi,
      'Birim':      r.birim,
      'Miktar':     r.miktar,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Envanter');
    XLSX.writeFile(wb, `evira_envanter_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner /></div>;

  const isEmpty = rows.length === 0;

  return (
    <div className="p-6">
      <PageHeader
        title="Envanter"
        subtitle="EVIRA depo stok durumu"
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="flex items-center gap-1.5 text-sm"
              >
                {syncMutation.isPending
                  ? <><Spinner /><span>Güncelleniyor…</span></>
                  : <><RefreshCw size={13} /><span>EVIRA'dan Güncelle</span></>}
              </Button>
            )}
            {filtered.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                <Download size={13} />Excel
              </button>
            )}
          </div>
        }
      />

      {/* Sync mesajı */}
      {syncMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-md text-sm ${syncMsg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {syncMsg.text}
        </div>
      )}

      {/* Özet kartlar */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Package size={16} className="text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Ürün Çeşidi</p>
            <p className="text-xl font-bold text-gray-800">{uniqueItems.toLocaleString('tr-TR')}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <BarChart2 size={16} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Toplam Miktar</p>
            <p className="text-xl font-bold text-gray-800">{totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
            <Warehouse size={16} className="text-purple-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Ambar</p>
            <p className="text-xl font-bold text-gray-800">{activeAmbars}</p>
          </div>
        </Card>
      </div>

      {isEmpty ? (
        <Card className="p-10 text-center">
          <Package size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm">Henüz stok verisi yok.</p>
          {canEdit && (
            <p className="text-gray-400 text-xs mt-1">
              "EVIRA'dan Güncelle" butonuna basarak verileri yükleyin.
            </p>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/* Filtreler */}
          <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Stok kodu veya adı…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <select
              value={ambarFilter}
              onChange={e => setAmbarFilter(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Tüm Ambarlar</option>
              {ambars.map(a => (
                <option key={a.ambar_kodu} value={a.ambar_kodu}>{a.ambar_adi || a.ambar_kodu}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400 ml-auto">
              {filtered.length} / {rows.length} kayıt
              {data?.synced_at && ` · ${formatDate(data.synced_at)}`}
            </span>
          </div>

          {/* Tablo */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Ambar</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stok Kodu</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stok Adı</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Birim</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Miktar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5">
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-700 font-medium">
                        {r.ambar_adi || r.ambar_kodu}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.stok_kodu}</td>
                    <td className="px-4 py-2.5 text-gray-800">{r.stok_adi}</td>
                    <td className="px-4 py-2.5 text-center text-gray-500">{r.birim}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800">
                      {Number(r.miktar).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
