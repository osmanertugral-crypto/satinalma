import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Briefcase, LayoutList, LayoutGrid, RefreshCw, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { getSvcProjects } from '../api';
import { Badge, Button, Card, Spinner } from '../components/UI';
import { SVC_STATUS } from './SvcTakip';

const STATUS_GROUPS = [
  { key: '', label: 'Tümü' },
  { key: 'not_offered', label: 'Teklif Verilmedi' },
  { key: 'offered',     label: 'Teklif Verildi' },
  { key: 'won',         label: 'Proje Alındı' },
  { key: 'lost',        label: 'Proje Alınamadı' },
];

function statusGroup(status) {
  if (['draft','submitted','reviewing','costing','offer_ready'].includes(status)) return 'not_offered';
  if (['offered','pending','revision_requested'].includes(status)) return 'offered';
  return status; // won, lost
}

export default function Tekliflerim() {
  const navigate = useNavigate();
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [yearFilter, setYear]     = useState('');
  const [view, setView]           = useState('card'); // 'card' | 'list'

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['tekliflerim'],
    queryFn: () => getSvcProjects({}).then(r => r.data),
  });

  const allRows = data?.rows || [];

  // Yıl listesi
  const years = [...new Set(allRows.map(r => r.created_date?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);

  const rows = allRows.filter(r => {
    if (search && !r.project_name?.toLowerCase().includes(search.toLowerCase()) &&
                  !r.institution?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && statusGroup(r.status) !== statusFilter) return false;
    if (yearFilter && r.created_date?.slice(0, 4) !== yearFilter) return false;
    return true;
  });

  // Dashboard istatistikleri
  const stats = {
    total:      allRows.length,
    notOffered: allRows.filter(r => statusGroup(r.status) === 'not_offered').length,
    offered:    allRows.filter(r => statusGroup(r.status) === 'offered').length,
    won:        allRows.filter(r => r.status === 'won').length,
    lost:       allRows.filter(r => r.status === 'lost').length,
    totalValue: allRows.reduce((s, r) => s + (Number(r.offer_price_tl) || 0), 0),
    wonValue:   allRows.filter(r => r.status === 'won').reduce((s, r) => s + (Number(r.offer_price_tl) || 0), 0),
  };

  const fmtTL = v => Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';

  return (
    <div className="p-6 space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Tekliflerim</h1>
          <p className="text-sm text-gray-500 mt-0.5">Size atanan SVC projeleri ve teklifleriniz</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Kart / Liste toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setView('card')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all ${view === 'card' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid size={15} /> Kart
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all ${view === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutList size={15} /> Liste
            </button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Yenile
          </Button>
        </div>
      </div>

      {/* Dashboard istatistikleri */}
      {!isLoading && allRows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Card className="p-4 col-span-2 md:col-span-1 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Briefcase size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
                <div className="text-xs text-gray-400 mt-0.5">Toplam Proje</div>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Teklif Bekliyor</div>
            <div className="text-xl font-bold text-orange-600">{stats.notOffered}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Teklif Verildi</div>
            <div className="text-xl font-bold text-emerald-600">{stats.offered}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Alındı</div>
            <div className="text-xl font-bold text-blue-600">{stats.won}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Alınamadı</div>
            <div className="text-xl font-bold text-gray-500">{stats.lost}</div>
          </Card>
          <Card className="p-4 col-span-2 md:col-span-2 lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <TrendingUp size={20} className="text-emerald-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-gray-400 mb-0.5">Toplam Teklif Değeri</div>
                <div className="text-base font-bold text-gray-800 truncate">{fmtTL(stats.totalValue)}</div>
                {stats.wonValue > 0 && (
                  <div className="text-xs text-emerald-600 mt-0.5">Kazanılan: {fmtTL(stats.wonValue)}</div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filtreler */}
      <div className="flex flex-wrap gap-2">
        <input
          className="flex-1 min-w-[180px] border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
          placeholder="Proje veya kurum ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Durum filtresi */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_GROUPS.map(sg => (
            <button
              key={sg.key}
              type="button"
              onClick={() => setStatus(sg.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                statusFilter === sg.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {sg.label}
            </button>
          ))}
        </div>

        {/* Yıl filtresi */}
        {years.length > 0 && (
          <select
            value={yearFilter}
            onChange={e => setYear(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white shadow-sm"
          >
            <option value="">Tüm Yıllar</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        )}

        {(search || statusFilter || yearFilter) && (
          <button
            type="button"
            onClick={() => { setSearch(''); setStatus(''); setYear(''); }}
            className="px-3 py-1.5 text-xs text-gray-500 hover:text-red-500 border border-gray-200 rounded-xl bg-white transition-colors"
          >
            Temizle
          </button>
        )}
      </div>

      {/* Sonuç sayısı */}
      {!isLoading && (
        <div className="text-xs text-gray-400">{rows.length} proje</div>
      )}

      {/* İçerik */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Card className="p-12 text-center">
          <Briefcase size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {search || statusFilter || yearFilter ? 'Filtreye uyan proje bulunamadı.' : 'Size atanmış proje bulunamadı.'}
          </p>
        </Card>
      ) : view === 'card' ? (
        <CardView rows={rows} navigate={navigate} />
      ) : (
        <ListView rows={rows} navigate={navigate} />
      )}
    </div>
  );
}

function CardView({ rows, navigate }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map(r => {
        const st = SVC_STATUS[r.status] || { label: r.status, color: 'gray' };
        const hasOffer = Number(r.offer_price_tl) > 0;
        return (
          <Card
            key={r.id}
            className="p-4 cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group"
            onClick={() => navigate(`/tekliflerim/${r.id}`)}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="font-semibold text-gray-800 text-sm leading-tight group-hover:text-blue-700 transition-colors">
                {r.project_name}
              </div>
              <Badge color={st.color}>{st.label}</Badge>
            </div>
            <div className="text-xs text-gray-500 space-y-0.5 mt-1">
              {r.institution && <div className="truncate">{r.institution}</div>}
              <div className="flex items-center gap-2 flex-wrap">
                {r.offer_due_date && <span>Teklif: <span className="font-medium text-gray-700">{r.offer_due_date}</span></span>}
                {r.country && <span className="text-gray-300">·</span>}
                {r.country && <span>{r.country}</span>}
              </div>
              <div>{r.item_count ?? 0} kalem</div>
            </div>
            {hasOffer && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">Verilen Teklif</span>
                <span className="text-sm font-bold text-blue-700">
                  {Number(r.offer_price_tl).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺
                </span>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function ListView({ rows, navigate }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left">Proje Adı</th>
              <th className="px-4 py-2.5 text-left">Kurum</th>
              <th className="px-4 py-2.5 text-left">Durum</th>
              <th className="px-4 py-2.5 text-center">Kalem</th>
              <th className="px-4 py-2.5 text-left">Teklif Tarihi</th>
              <th className="px-4 py-2.5 text-right">Verilen Teklif</th>
              <th className="px-4 py-2.5 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const st = SVC_STATUS[r.status] || { label: r.status, color: 'gray' };
              return (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/tekliflerim/${r.id}`)}
                  className={`border-b border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}
                >
                  <td className="px-4 py-2.5 font-medium text-gray-800">{r.project_name}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{r.institution || '—'}</td>
                  <td className="px-4 py-2.5"><Badge color={st.color}>{st.label}</Badge></td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{r.item_count ?? 0}</td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{r.offer_due_date || '—'}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-blue-700">
                    {Number(r.offer_price_tl) > 0
                      ? Number(r.offer_price_tl).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺'
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button size="sm" variant="secondary" onClick={e => { e.stopPropagation(); navigate(`/tekliflerim/${r.id}`); }}>
                      Aç
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
