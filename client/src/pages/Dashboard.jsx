import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboard } from '../api';
import { PageHeader, Card, StatCard, Badge, Spinner, Modal, Table, Button } from '../components/UI';
import { Users, Package, ShoppingCart, FileText, Warehouse, AlertTriangle, TrendingUp, TrendingDown, Settings, CheckCircle, BarChart2, Wallet, Container, Activity, CalendarRange, Clock3, Building2, ArrowUpRight, ArrowDownRight, Download } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STATUS_LABELS = { draft: 'Taslak', sent: 'Gönderildi', confirmed: 'Onaylandı', delivered: 'Teslim Alındı', cancelled: 'İptal' };
const STATUS_COLOR = { draft: 'gray', sent: 'blue', confirmed: 'green', delivered: 'purple', cancelled: 'red' };
const PERIOD_OPTIONS = [
  { value: 1, label: '1 Ay' },
  { value: 3, label: '3 Ay' },
  { value: 6, label: '6 Ay' },
  { value: 12, label: '12 Ay' },
];

function fmtNum(v) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtCur(v) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}
function fmtDateTime(v) {
  if (!v) return '-';
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return v;
  return date.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
function fmtMonth(v) {
  if (!v) return '-';
  const [year, month] = String(v).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return v;
  return date.toLocaleDateString('tr-TR', { month: 'short' });
}
function fmtDate(v) {
  if (!v) return '-';
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) return v;
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
function exportCsv(filename, headers, rows) {
  const csv = [headers.map(csvEscape).join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
function ExportButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      title="CSV olarak disa aktar"
    >
      <Download size={14} />
      Disa Aktar
    </button>
  );
}

// ─── Widget tanımları ─────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: 'kritik-stok',   label: 'Kritik Stok', icon: Warehouse,   desc: 'Min. stok altındaki ürünler' },
  { id: 'fiyat-artis',   label: 'Fiyat Artışları', icon: TrendingUp, desc: 'En fazla fiyat artan ürünler (grafik)' },
  { id: 'fiyat-uyari',   label: 'Fiyat Uyarıları', icon: AlertTriangle, desc: 'Tetiklenen fiyat alarmları' },
  { id: 'son-siparisler',label: 'Son Siparişler', icon: ShoppingCart, desc: 'En son PO siparişleri' },
  { id: 'projeler',      label: 'Projeler Özeti', icon: Building2, desc: 'Teklif, kazanım ve kayıp trendi' },
  { id: 'finans',        label: 'Finans Özeti', icon: Wallet, desc: 'Cari borç/alacak özeti' },
  { id: 'depo-stok',     label: 'Depo Stok Özeti', icon: Container, desc: 'Depo toplam stok bilgisi' },
];

const DEFAULT_LEFT = 'fiyat-uyari';
const DEFAULT_RIGHT = 'kritik-stok';
const LS_KEY = 'dashboard_widgets';
const DASHBOARD_PREFS_KEY = 'dashboard_preferences_v1';
const DEFAULT_DASHBOARD_PREFS = {
  statSuppliers: true,
  statProducts: true,
  statActivePo: true,
  statLowStock: true,
  statOpenOrders: true,
  sectionActionSummary: true,
  sectionPoStatus: true,
  sectionTopSuppliers: true,
  sectionSupplierPerformance: true,
  sectionRecentActivity: true,
  sectionWidgets: true,
  sectionCriticalAlert: true,
};

function loadWidgets() {
  try {
    const s = localStorage.getItem(LS_KEY);
    if (s) return JSON.parse(s);
  } catch {}
  return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
}
function saveWidgets(v) {
  localStorage.setItem(LS_KEY, JSON.stringify(v));
}

function loadDashboardPrefs() {
  try {
    const s = localStorage.getItem(DASHBOARD_PREFS_KEY);
    if (!s) return { ...DEFAULT_DASHBOARD_PREFS };
    const parsed = JSON.parse(s);
    return { ...DEFAULT_DASHBOARD_PREFS, ...(parsed || {}) };
  } catch {
    return { ...DEFAULT_DASHBOARD_PREFS };
  }
}

function saveDashboardPrefs(v) {
  localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(v));
}

// ─── Widget içerikler ────────────────────────────────────────────────────────
function WidgetKritikStok({ data, navigate }) {
  const items = data?.criticalStock || [];
  if (!items.length) return <p className="text-gray-400 text-sm py-4 text-center">Kritik stok yok 🎉</p>;
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {items.map((item, i) => {
        const pct = Math.min(100, Number(item.stock_pct) || 0);
        const isBelow = item.quantity <= item.min_stock_level;
        return (
          <div key={i} className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-2 py-1.5 cursor-pointer" onClick={() => navigate('/inventory')}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-gray-800 truncate">{item.name}</span>
                <span className="text-xs text-gray-400 font-mono shrink-0">{item.code}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct <= 0 ? 'bg-red-500' : pct < 50 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
                <span className={`text-xs font-semibold shrink-0 ${isBelow ? 'text-red-600' : 'text-amber-600'}`}>
                  {fmtNum(item.quantity)} / {fmtNum(item.min_stock_level)} {item.unit}
                </span>
              </div>
            </div>
            {isBelow
              ? <Badge color="red">Kritik</Badge>
              : <Badge color="yellow">Düşük</Badge>
            }
          </div>
        );
      })}
    </div>
  );
}

function WidgetFiyatArtis({ data, navigate }) {
  const items = data?.topPriceIncreases || [];
  if (!items.length) return <p className="text-gray-400 text-sm py-4 text-center">Fiyat artışı kaydı yok</p>;
  const chartData = items.slice(0, 8).map(i => ({ name: i.code || i.name?.slice(0, 10), pct: i.change_percent, fullName: i.name }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `%${v}`} />
          <YAxis type="category" dataKey="name" width={64} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v, _, props) => [`%${v}`, props?.payload?.fullName || 'Artış']}
            contentStyle={{ fontSize: 11 }}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {chartData.map((_, idx) => (
              <Cell key={idx} fill={idx === 0 ? '#ef4444' : idx < 3 ? '#f97316' : '#f59e0b'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
        {items.slice(0, 6).map((item, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer" onClick={() => navigate('/price-analysis')}>
            <span className="text-gray-700 truncate max-w-[200px]">{item.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-gray-400">{fmtCur(item.prev_price)} → {fmtCur(item.latest_price)}</span>
              <span className="text-red-600 font-bold">+%{item.change_percent}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetFiyatUyari({ data }) {
  const items = data?.triggeredAlerts || [];
  if (!items.length) return <p className="text-gray-400 text-sm py-4 text-center">Tetiklenen uyarı yok.</p>;
  return (
    <div className="space-y-3 max-h-80 overflow-y-auto">
      {items.map(a => (
        <div key={a.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div>
            <p className="font-medium text-sm text-gray-800">{a.product_name} <span className="text-gray-400">({a.product_code})</span></p>
            <p className="text-xs text-gray-500">Eşik: %{a.threshold_percent}</p>
          </div>
          <span className="text-red-600 font-bold text-sm">+%{a.change_percent}</span>
        </div>
      ))}
    </div>
  );
}

function WidgetSonSiparisler({ data, navigate }) {
  const items = data?.recentPo || [];
  if (!items.length) return <p className="text-gray-400 text-sm">Henüz sipariş yok.</p>;
  return (
    <div className="space-y-2 max-h-80 overflow-y-auto">
      {items.map(po => (
        <div key={po.po_number} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 rounded px-2" onClick={() => navigate('/po')}>
          <div>
            <p className="font-medium text-sm text-gray-800">{po.po_number}</p>
            <p className="text-xs text-gray-500">{po.supplier_name}</p>
          </div>
          <div className="text-right">
            <Badge color={STATUS_COLOR[po.status]}>{STATUS_LABELS[po.status]}</Badge>
            <p className="text-xs text-gray-500 mt-1">{po.total_amount?.toLocaleString('tr-TR')} ₺</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function WidgetFinans({ navigate }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['finance-cariler-dashboard'],
    queryFn: () => import('../api').then(m => m.getFinanceCariler().then(r => r.data)),
    staleTime: 5 * 60 * 1000,
  });
  if (isLoading) return <Spinner />;
  if (isError || !data?.length) return (
    <div className="text-center py-4">
      <p className="text-gray-400 text-sm">Finans verisi yüklenemedi</p>
      <p className="text-xs text-gray-300 mt-1">Cari Extre.xlsx dosyasını kontrol edin</p>
    </div>
  );
  const topBorclu = [...data].filter(c => Math.abs(c.bakiye) > 0).sort((a, b) => Math.abs(b.bakiye) - Math.abs(a.bakiye)).slice(0, 5);
  const toplamBorc = data.reduce((s, c) => s + Math.abs(c.bakiye || 0), 0);
  const vadesiGelen = data.reduce((s, c) => s + Math.abs(c.vadesiGelen || 0), 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-red-50 rounded-lg p-2 text-center">
          <p className="text-xs text-red-500 font-medium">Toplam Borç</p>
          <p className="text-sm font-bold text-red-700">{fmtCur(toplamBorc)}</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 text-center">
          <p className="text-xs text-amber-500 font-medium">Vadesi Gelen</p>
          <p className="text-sm font-bold text-amber-700">{fmtCur(vadesiGelen)}</p>
        </div>
      </div>
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        {topBorclu.map((c, i) => (
          <div key={i} className="flex items-center justify-between text-xs px-1 py-1 hover:bg-gray-50 rounded cursor-pointer" onClick={() => navigate('/finance')}>
            <span className="text-gray-700 truncate max-w-[180px]">{c.cariAdi}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {c.vadesiGelen > 0 && <Badge color="red">Vadeli</Badge>}
              <span className="font-semibold text-gray-800">{fmtCur(Math.abs(c.bakiye))}</span>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/finance')} className="mt-2 text-xs text-blue-600 hover:underline w-full text-right">Tümünü Gör →</button>
    </div>
  );
}

function WidgetDepoStok({ navigate }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['warehouse-summary-dashboard'],
    queryFn: () => import('../api').then(m => m.getWarehouseSummary().then(r => r.data)),
    staleTime: 5 * 60 * 1000,
  });
  if (isLoading) return <Spinner />;
  if (isError || !data?.totals) return (
    <div className="text-center py-4">
      <p className="text-gray-400 text-sm">Depo verisi yüklenemedi</p>
      <p className="text-xs text-gray-300 mt-1">Stok raporunu senkronize edin</p>
    </div>
  );
  const { totals, byType } = data;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="text-xs text-blue-500 font-medium">Toplam Ürün</p>
          <p className="text-sm font-bold text-blue-700">{fmtNum(totals?.urun_sayisi)}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2 text-center">
          <p className="text-xs text-emerald-500 font-medium">Toplam Tutar</p>
          <p className="text-sm font-bold text-emerald-700">{fmtCur(totals?.toplam_tutar)}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mb-3">
        {[
          { label: 'Gebze', adet: totals?.gebze_adet, tutar: totals?.gebze_tutar },
          { label: 'E-Ticaret', adet: totals?.eticaret_adet, tutar: totals?.eticaret_tutar },
          { label: 'Showroom', adet: totals?.showroom_adet, tutar: totals?.showroom_tutar },
        ].map(loc => (
          <div key={loc.label} className="bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500 font-medium">{loc.label}</p>
            <p className="text-xs font-bold text-gray-700">{fmtNum(loc.adet)} adet</p>
            <p className="text-xs text-gray-400">{fmtCur(loc.tutar)}</p>
          </div>
        ))}
      </div>
      {byType?.slice(0, 4).map((t, i) => (
        <div key={i} className="flex justify-between text-xs px-1 py-0.5 hover:bg-gray-50 rounded">
          <span className="text-gray-600 truncate">{t.kart_tipi || 'Diğer'}</span>
          <span className="font-medium text-gray-700">{fmtCur(t.toplam_tutar)}</span>
        </div>
      ))}
      <button onClick={() => navigate('/depo')} className="mt-2 text-xs text-blue-600 hover:underline w-full text-right">Depoya Git →</button>
    </div>
  );
}

function WidgetProjeler({ data, navigate }) {
  const summary = data?.projectSummary || {};
  const trend = (data?.projectMonthlyTrend || []).map(row => ({
    month: fmtMonth(row.month),
    won: Number(row.won || 0),
    lost: Number(row.lost || 0),
    offered: Number(row.offered || 0),
  }));

  if (!summary.total) {
    return <p className="text-gray-400 text-sm py-4 text-center">Proje verisi yok.</p>;
  }

  const margin = Number(summary.realizedRevenueTlTotal || 0) - Number(summary.realizedCostTlTotal || 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="text-xs text-blue-500 font-medium">Toplam Proje</p>
          <p className="text-sm font-bold text-blue-700">{fmtNum(summary.total)}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2 text-center">
          <p className="text-xs text-emerald-500 font-medium">Onaylanan İş</p>
          <p className="text-sm font-bold text-emerald-700">{fmtNum(summary.won)}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-amber-50 rounded-lg p-2 text-center">
          <p className="text-xs text-amber-500 font-medium">Teklif Toplam</p>
          <p className="text-sm font-bold text-amber-700">{fmtCur(summary.quotedTlTotal)}</p>
        </div>
        <div className={`${margin >= 0 ? 'bg-emerald-50' : 'bg-red-50'} rounded-lg p-2 text-center`}>
          <p className={`text-xs ${margin >= 0 ? 'text-emerald-500' : 'text-red-500'} font-medium`}>Gerçekleşen Kar/Zarar</p>
          <p className={`text-sm font-bold ${margin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtCur(margin)}</p>
        </div>
      </div>
      {!!trend.length && (
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={trend} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="won" stackId="a" fill="#10b981" name="Onaylanan" />
            <Bar dataKey="lost" stackId="a" fill="#ef4444" name="Kaybedilen" />
            <Bar dataKey="offered" stackId="a" fill="#3b82f6" name="Açık/Bekleyen" />
          </BarChart>
        </ResponsiveContainer>
      )}
      <button onClick={() => navigate('/projeler')} className="mt-2 text-xs text-blue-600 hover:underline w-full text-right">Projelere Git →</button>
    </div>
  );
}

function ActionSummaryCard({ data, navigate }) {
  const overduePo = data?.overduePo?.count || 0;
  const overdueAmount = data?.overduePo?.total || 0;
  const triggeredCount = data?.triggeredAlerts?.length || 0;
  const month = data?.monthSummary || {};
  const trendData = (data?.monthlyPurchaseTrend || []).map(item => ({
    month: fmtMonth(item.month),
    total: Number(item.total_amount) || 0,
  }));
  const change = month.poTotalChangePercent;
  const isPositiveChange = change != null && change >= 0;
  const actionItems = [
    {
      label: 'Geciken sipariş',
      value: overduePo,
      detail: overduePo ? fmtCur(overdueAmount) : 'Gecikme görünmüyor',
      color: overduePo ? 'text-red-600' : 'text-emerald-600',
      target: '/po',
    },
    {
      label: 'Kritik stok',
      value: data?.lowStock || 0,
      detail: 'Minimum stok altındaki ürünler',
      color: data?.lowStock ? 'text-red-600' : 'text-emerald-600',
      target: '/inventory',
    },
    {
      label: 'Açık RFQ',
      value: data?.openRfq || 0,
      detail: 'Yanıt bekleyen talepler',
      color: data?.openRfq ? 'text-amber-600' : 'text-emerald-600',
      target: '/rfq',
    },
    {
      label: 'Fiyat alarmı',
      value: triggeredCount,
      detail: 'Tetiklenen fiyat uyarıları',
      color: triggeredCount ? 'text-amber-600' : 'text-emerald-600',
      target: '/prices',
    },
  ];
  function handleExport() {
    exportCsv(
      `dashboard-aksiyon-ozeti-${data?.period || 6}ay.csv`,
      ['Alan', 'Deger', 'Detay'],
      [
        ['Donem', `${data?.period || 6} Ay`, 'Secili filtre'],
        ['PO Sayisi', month.poCount || 0, 'Secili donem'],
        ['PO Toplami', month.poTotal || 0, 'TL'],
        ['Onceki Donem PO Toplami', month.previousPoTotal || 0, 'TL'],
        ['Yeni Tedarikci', month.newSuppliers || 0, 'Secili donem'],
        ['Yeni Urun', month.newProducts || 0, 'Secili donem'],
        ...actionItems.map(item => [item.label, item.value, item.detail]),
      ]
    );
  }

  return (
    <Card className="p-5">
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-4 mb-4">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarRange size={18} className="text-blue-500" />
              <h2 className="font-semibold text-gray-700">Aylık Özet ve Aksiyonlar</h2>
            </div>
            <p className="text-xs text-gray-500">Son 6 aya göre satınalma hareketi</p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButton onClick={handleExport} />
            <div className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${change == null ? 'bg-gray-100 text-gray-500' : isPositiveChange ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {change == null ? null : isPositiveChange ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {change == null ? 'Gecen donem verisi yok' : `%${fmtNum(Math.abs(change))} ${isPositiveChange ? 'artis' : 'azalis'}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-xl bg-white/80 backdrop-blur px-3 py-3 shadow-sm border border-white">
            <p className="text-xs text-blue-600 font-medium">Bu Ay PO</p>
            <p className="text-lg font-bold text-blue-800 mt-1">{fmtNum(month.poCount || 0)}</p>
            <p className="text-xs text-blue-700 mt-1">Toplam {fmtCur(month.poTotal || 0)}</p>
          </div>
          <div className="rounded-xl bg-white/80 backdrop-blur px-3 py-3 shadow-sm border border-white">
            <p className="text-xs text-emerald-600 font-medium">Yeni Kayıtlar</p>
            <p className="text-lg font-bold text-emerald-800 mt-1">{fmtNum((month.newSuppliers || 0) + (month.newProducts || 0))}</p>
            <p className="text-xs text-emerald-700 mt-1">Tedarikçi {fmtNum(month.newSuppliers || 0)} • Ürün {fmtNum(month.newProducts || 0)}</p>
          </div>
        </div>

        {!!trendData.length && (
          <div className="h-24 rounded-xl bg-white/70 px-2 py-2 border border-white">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip formatter={value => fmtCur(value)} contentStyle={{ fontSize: 11, borderRadius: 12 }} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {actionItems.map(item => (
          <button
            key={item.label}
            onClick={() => navigate(item.target)}
            className="w-full flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="text-sm font-medium text-gray-700">{item.label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{item.detail}</p>
            </div>
            <span className={`text-lg font-bold ${item.color}`}>{fmtNum(item.value)}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

function SupplierPerformanceCard({ data, navigate }) {
  const items = data?.supplierPerformance || [];
  function handleExport() {
    exportCsv(
      `dashboard-tedarikci-performansi-${data?.period || 6}ay.csv`,
      ['Tedarikci', 'Skor', 'Toplam PO', 'Zamaninda Teslim Orani', 'Geciken Acik Siparis', 'Ort Gecikme Gun', 'Maks Gecikme Gun', 'Son Siparis'],
      items.map(item => [item.name, item.performanceScore, item.total_orders, item.onTimeRate, item.delayed_open_orders, item.avgDelayDays, item.maxDelayDays, item.last_order_date])
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-emerald-500" />
          <h2 className="font-semibold text-gray-700">Tedarikçi Performansı</h2>
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      {!items.length && <p className="text-sm text-gray-400 py-6 text-center">Seçili dönem için performans verisi yok.</p>}

      <div className="space-y-3">
        {items.map(item => {
          const score = item.performanceScore;
          const scoreColor = score == null ? 'bg-gray-100 text-gray-500' : score >= 85 ? 'bg-emerald-100 text-emerald-700' : score >= 65 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/suppliers/${item.id}`)}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500 mt-1">Son sipariş: {fmtDate(item.last_order_date)}</p>
                </div>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${scoreColor}`}>
                  {score == null ? 'Skor yok' : `Skor ${fmtNum(score)}`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-2">
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-500">Toplam PO</p>
                  <p className="text-sm font-semibold text-gray-800">{fmtNum(item.total_orders)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-500">Zamanında</p>
                  <p className="text-sm font-semibold text-gray-800">{item.onTimeRate == null ? '-' : `%${fmtNum(item.onTimeRate)}`}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-500">Geciken</p>
                  <p className={`text-sm font-semibold ${item.delayed_open_orders ? 'text-red-600' : 'text-emerald-600'}`}>{fmtNum(item.delayed_open_orders)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-gray-500 mb-2">
                <span>Ort. gecikme: {item.avgDelayDays ? `${fmtNum(item.avgDelayDays)} gun` : '-'}</span>
                <span>Maks. gecikme: {item.maxDelayDays ? `${fmtNum(item.maxDelayDays)} gun` : '-'}</span>
              </div>

              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${score == null ? 'bg-gray-300' : score >= 85 ? 'bg-emerald-400' : score >= 65 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ width: `${Math.max(score || 0, score == null ? 18 : 8)}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function POStatusCard({ data, navigate }) {
  const rows = ['draft', 'sent', 'confirmed', 'delivered'].map(status => {
    const row = data?.poByStatus?.find(item => item.status === status);
    return {
      status,
      label: STATUS_LABELS[status],
      count: row?.count || 0,
      total: row?.total || 0,
    };
  });
  const maxCount = Math.max(...rows.map(row => row.count), 1);
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const chartData = rows.map(row => ({ name: row.label, count: row.count }));
  function handleExport() {
    exportCsv(
      `dashboard-po-durumlari-${data?.period || 6}ay.csv`,
      ['Durum', 'Kayit Sayisi', 'Yuzde', 'Toplam Tutar'],
      rows.map(row => [row.label, row.count, totalCount ? Number(((row.count / totalCount) * 100).toFixed(2)) : 0, row.total])
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-orange-500" />
          <h2 className="font-semibold text-gray-700">PO Durum Dağılımı</h2>
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-orange-700">Durumlara göre sipariş yoğunluğu</p>
          <span className="text-xs text-orange-600">Toplam {fmtNum(totalCount)} kayıt</span>
        </div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9a3412' }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9a3412' }} />
              <Tooltip formatter={value => [`${fmtNum(value)} kayıt`, 'Adet']} contentStyle={{ fontSize: 11, borderRadius: 12 }} />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {chartData.map((_, idx) => (
                  <Cell key={idx} fill={[ '#f59e0b', '#fb923c', '#f97316', '#ea580c' ][idx % 4]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map(row => (
          <button
            key={row.status}
            onClick={() => navigate('/po')}
            className="w-full text-left rounded-xl border border-gray-200 px-3 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2">
                <Badge color={STATUS_COLOR[row.status]}>{row.label}</Badge>
                <span className="text-sm text-gray-500">{fmtNum(row.count)} kayıt</span>
              </div>
              <span className="text-xs font-medium text-gray-600">%{totalCount ? fmtNum((row.count / totalCount) * 100) : 0}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-orange-400 transition-all"
                style={{ width: `${Math.max((row.count / maxCount) * 100, row.count ? 10 : 0)}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-gray-500">Toplam tutar: {fmtCur(row.total)}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function TopSuppliersCard({ data, navigate }) {
  const items = data?.topSuppliers || [];
  const maxTotal = Math.max(...items.map(item => Number(item.total_amount) || 0), 1);
  function handleExport() {
    exportCsv(
      `dashboard-top-tedarikciler-${data?.period || 6}ay.csv`,
      ['Sira', 'Tedarikci', 'PO Sayisi', 'Toplam Tutar', 'Son Siparis'],
      items.map((item, index) => [index + 1, item.name, item.po_count, item.total_amount, item.last_order_date])
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-indigo-500" />
          <h2 className="font-semibold text-gray-700">En Çok Sipariş Verilen Tedarikçiler</h2>
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      {!items.length && <p className="text-sm text-gray-400 py-6 text-center">Henüz tedarikçi sipariş verisi yok.</p>}

      <div className="space-y-3">
        {items.map((item, index) => {
          const width = Math.max(((Number(item.total_amount) || 0) / maxTotal) * 100, 10);
          return (
            <button
              key={item.id}
              onClick={() => navigate(`/suppliers/${item.id}`)}
              className="w-full rounded-xl border border-gray-200 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{index + 1}</span>
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Son sipariş: {item.last_order_date || '-'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-800">{fmtCur(item.total_amount)}</p>
                  <p className="text-xs text-gray-500">{fmtNum(item.po_count)} PO</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-indigo-50 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-sky-400" style={{ width: `${width}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function RecentActivityCard({ data, navigate }) {
  const items = data?.recentActivities || [];
  const targetByType = {
    po: '/po',
    price: '/prices',
    inventory: '/inventory',
    document: '/documents',
  };
  const badgeByType = {
    po: { label: 'PO', color: 'blue' },
    price: { label: 'Fiyat', color: 'yellow' },
    inventory: { label: 'Stok', color: 'green' },
    document: { label: 'Belge', color: 'purple' },
  };
  function handleExport() {
    exportCsv(
      `dashboard-son-hareketler-${data?.period || 6}ay.csv`,
      ['Tur', 'Baslik', 'Aksiyon', 'Alt Bilgi', 'Tarih', 'Tutar'],
      items.map(item => [badgeByType[item.type]?.label || item.type, item.title, item.action, item.subtitle, item.created_at, item.amount])
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-emerald-500" />
          <h2 className="font-semibold text-gray-700">Son Hareketler</h2>
        </div>
        <ExportButton onClick={handleExport} />
      </div>

      {!items.length && <p className="text-sm text-gray-400 py-6 text-center">Henüz hareket görünmüyor.</p>}

      <div className="space-y-2 max-h-[380px] overflow-y-auto">
        {items.map((item, index) => {
          const badge = badgeByType[item.type] || { label: item.type, color: 'gray' };
          return (
            <button
              key={`${item.type}-${item.created_at}-${index}`}
              onClick={() => navigate(targetByType[item.type] || '/')}
              className="w-full flex items-start gap-3 rounded-xl border border-gray-200 px-3 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <div className="mt-0.5">
                <Clock3 size={16} className="text-gray-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge color={badge.color}>{badge.label}</Badge>
                  <span className="text-xs text-gray-400">{fmtDateTime(item.created_at)}</span>
                </div>
                <p className="text-sm font-medium text-gray-700 truncate">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.action} • {item.subtitle}</p>
              </div>
              {item.amount != null && (
                <span className="text-xs font-semibold text-gray-600 shrink-0">
                  {item.type === 'document' ? `${fmtNum(item.amount)} B` : fmtNum(item.amount)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Widget Seçici Modal ─────────────────────────────────────────────────────
function WidgetPicker({ side, current, onSelect, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-gray-700">Widget Seç — {side === 'left' ? 'Sol' : 'Sağ'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-4 space-y-2">
          {WIDGET_DEFS.map(w => (
            <button
              key={w.id}
              onClick={() => { onSelect(w.id); onClose(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${current === w.id ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-200 hover:bg-gray-50'}`}
            >
              <w.icon size={18} className="shrink-0" />
              <div>
                <p className="text-sm font-medium">{w.label}</p>
                <p className="text-xs text-gray-400">{w.desc}</p>
              </div>
              {current === w.id && <CheckCircle size={16} className="text-blue-500 ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Widget Wrapper ──────────────────────────────────────────────────────────
function Widget({ id, data, navigate, onChangePicker }) {
  const def = WIDGET_DEFS.find(w => w.id === id);
  const Icon = def?.icon || BarChart2;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <Icon size={18} className="text-blue-500" />
          {def?.label}
        </h2>
        <button
          onClick={onChangePicker}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Widget'ı değiştir"
        >
          <Settings size={15} />
        </button>
      </div>
      {id === 'kritik-stok' && <WidgetKritikStok data={data} navigate={navigate} />}
      {id === 'fiyat-artis' && <WidgetFiyatArtis data={data} navigate={navigate} />}
      {id === 'fiyat-uyari' && <WidgetFiyatUyari data={data} />}
      {id === 'son-siparisler' && <WidgetSonSiparisler data={data} navigate={navigate} />}
      {id === 'projeler' && <WidgetProjeler data={data} navigate={navigate} />}
      {id === 'finans' && <WidgetFinans navigate={navigate} />}
      {id === 'depo-stok' && <WidgetDepoStok navigate={navigate} />}
    </Card>
  );
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(6);
  const [showPrefsModal, setShowPrefsModal] = useState(false);
  const [showOpenOrders, setShowOpenOrders] = useState(false);
  const [openOrdersSearch, setOpenOrdersSearch] = useState('');
  const [openOrdersFrom, setOpenOrdersFrom] = useState('');
  const [openOrdersTo, setOpenOrdersTo] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['dashboard', period], queryFn: () => getDashboard({ period }).then(r => r.data) });
  const [widgets, setWidgets] = useState(loadWidgets);
  const [widgetsDraft, setWidgetsDraft] = useState(loadWidgets);
  const [prefs, setPrefs] = useState(loadDashboardPrefs);
  const [prefsDraft, setPrefsDraft] = useState(loadDashboardPrefs);
  const [picker, setPicker] = useState(null); // 'left' | 'right'
  const selectedPeriod = PERIOD_OPTIONS.find(option => option.value === period);
  const filteredOpenOrders = useMemo(() => {
    const rows = data?.openOrders || [];
    const s = openOrdersSearch.trim().toLowerCase();
    return rows.filter(row => {
      if (s) {
        const matchSearch = (row.po_number || '').toLowerCase().includes(s)
          || (row.supplier_name || '').toLowerCase().includes(s);
        if (!matchSearch) return false;
      }
      if (openOrdersFrom && row.order_date && row.order_date < openOrdersFrom) return false;
      if (openOrdersTo && row.order_date && row.order_date > openOrdersTo) return false;
      return true;
    });
  }, [data?.openOrders, openOrdersSearch, openOrdersFrom, openOrdersTo]);

  function setWidget(side, id) {
    setWidgets(prev => {
      const next = { ...prev, [side]: id };
      saveWidgets(next);
      return next;
    });
  }

  function openPrefsModal() {
    setPrefsDraft({ ...prefs });
    setWidgetsDraft({ ...widgets });
    setShowPrefsModal(true);
  }

  function savePrefsModal() {
    setPrefs({ ...prefsDraft });
    saveDashboardPrefs(prefsDraft);
    setWidgets({ ...widgetsDraft });
    saveWidgets(widgetsDraft);
    setShowPrefsModal(false);
  }

  function resetPrefsModal() {
    setPrefsDraft({ ...DEFAULT_DASHBOARD_PREFS });
    setWidgetsDraft({ left: DEFAULT_LEFT, right: DEFAULT_RIGHT });
  }

  function updatePref(key, value) {
    setPrefsDraft(prev => ({ ...prev, [key]: value }));
  }

  if (isLoading) return <div className="p-8"><Spinner /></div>;

  return (
    <div className="p-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Genel ozet ve uyarilar • Secili donem: ${selectedPeriod?.label || '6 Ay'}`}
        action={(
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-1 shadow-sm overflow-x-auto">
              {PERIOD_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setPeriod(option.value)}
                  className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors ${period === option.value ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              onClick={openPrefsModal}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              title="Dashboard ayarlari"
            >
              <Settings size={16} />
              Dashboard Ayarlari
            </button>
          </div>
        )}
      />

      {/* İstatistikler */}
      {(prefs.statSuppliers || prefs.statProducts || prefs.statActivePo || prefs.statLowStock || prefs.statOpenOrders) && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {prefs.statSuppliers && (
            <button onClick={() => navigate('/suppliers')} className="text-left" title="Tedarikciler sayfasina git">
              <StatCard label="Tedarikçiler" value={data.totalSuppliers} icon={Users} color="blue" />
            </button>
          )}
          {prefs.statProducts && (
            <button onClick={() => navigate('/products')} className="text-left" title="Urunler sayfasina git">
              <StatCard label="Ürünler" value={data.totalProducts} icon={Package} color="green" />
            </button>
          )}
          {prefs.statActivePo && (
            <button onClick={() => navigate('/po')} className="text-left" title="PO sayfasina git">
              <StatCard label="Aktif PO" value={data.activePo} icon={ShoppingCart} color="orange" />
            </button>
          )}
          {prefs.statLowStock && (
            <button onClick={() => navigate('/depo')} className="text-left" title="Depo stok sayfasina git">
              <StatCard label="Kritik Stok" value={data.lowStock} icon={Warehouse} color="red" />
            </button>
          )}
          {prefs.statOpenOrders && (
            <button
              onClick={() => setShowOpenOrders(true)}
              className="text-left"
              title="Acik siparisleri gor"
            >
              <StatCard
                label="Acik Siparis"
                value={Number(data?.openOrderSummary?.count || 0)}
                icon={FileText}
                color="yellow"
              />
            </button>
          )}
        </div>
      )}

      {(prefs.sectionActionSummary || prefs.sectionPoStatus || prefs.sectionTopSuppliers) && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
          {prefs.sectionActionSummary && (
            <div className="xl:col-span-4">
              <ActionSummaryCard data={data} navigate={navigate} />
            </div>
          )}
          {prefs.sectionPoStatus && (
            <div className="xl:col-span-4">
              <POStatusCard data={data} navigate={navigate} />
            </div>
          )}
          {prefs.sectionTopSuppliers && (
            <div className="xl:col-span-4">
              <TopSuppliersCard data={data} navigate={navigate} />
            </div>
          )}
        </div>
      )}

      {(prefs.sectionSupplierPerformance || prefs.sectionRecentActivity) && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
          {prefs.sectionSupplierPerformance && (
            <div className="xl:col-span-5">
              <SupplierPerformanceCard data={data} navigate={navigate} />
            </div>
          )}
          {prefs.sectionRecentActivity && (
            <div className="xl:col-span-7">
              <RecentActivityCard data={data} navigate={navigate} />
            </div>
          )}
        </div>
      )}

      {/* İki Widget */}
      {prefs.sectionWidgets && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Widget id={widgets.left}  data={data} navigate={navigate} onChangePicker={() => setPicker('left')} />
          <Widget id={widgets.right} data={data} navigate={navigate} onChangePicker={() => setPicker('right')} />
        </div>
      )}

      {/* Kritik stok alt uyarı */}
      {prefs.sectionCriticalAlert && data.lowStock > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium text-red-700">{data.lowStock} ürün minimum stok seviyesinin altında!</p>
            <button onClick={() => navigate('/inventory')} className="text-sm text-red-600 underline mt-1">Envanteri görüntüle</button>
          </div>
        </div>
      )}

      <Modal open={showPrefsModal} onClose={() => setShowPrefsModal(false)} title="Dashboard Ayarlari" size="lg">
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ust Kartlar</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.statSuppliers} onChange={e => updatePref('statSuppliers', e.target.checked)} /> Tedarikçiler</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.statProducts} onChange={e => updatePref('statProducts', e.target.checked)} /> Ürünler</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.statActivePo} onChange={e => updatePref('statActivePo', e.target.checked)} /> Aktif PO</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.statLowStock} onChange={e => updatePref('statLowStock', e.target.checked)} /> Kritik Stok</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.statOpenOrders} onChange={e => updatePref('statOpenOrders', e.target.checked)} /> Açık Sipariş</label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Ana Bölümler</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionActionSummary} onChange={e => updatePref('sectionActionSummary', e.target.checked)} /> Aylık Özet ve Aksiyonlar</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionPoStatus} onChange={e => updatePref('sectionPoStatus', e.target.checked)} /> PO Durum Dağılımı</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionTopSuppliers} onChange={e => updatePref('sectionTopSuppliers', e.target.checked)} /> En Çok Sipariş Verilen Tedarikçiler</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionSupplierPerformance} onChange={e => updatePref('sectionSupplierPerformance', e.target.checked)} /> Tedarikçi Performansı</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionRecentActivity} onChange={e => updatePref('sectionRecentActivity', e.target.checked)} /> Son Hareketler</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionWidgets} onChange={e => updatePref('sectionWidgets', e.target.checked)} /> Widget Alanı</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={prefsDraft.sectionCriticalAlert} onChange={e => updatePref('sectionCriticalAlert', e.target.checked)} /> Kritik Stok Uyarısı</label>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Widget Yerleşimi</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sol Widget</label>
                <select
                  value={widgetsDraft.left}
                  onChange={e => setWidgetsDraft(prev => ({ ...prev, left: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {WIDGET_DEFS.map(w => <option key={`left-${w.id}`} value={w.id}>{w.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sağ Widget</label>
                <select
                  value={widgetsDraft.right}
                  onChange={e => setWidgetsDraft(prev => ({ ...prev, right: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {WIDGET_DEFS.map(w => <option key={`right-${w.id}`} value={w.id}>{w.label}</option>)}
                </select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Finans ozetini eklemek icin Sol/Sağ widgetlardan birini "Finans Özeti" yapabilirsiniz.</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={resetPrefsModal}>Varsayilana Don</Button>
            <Button variant="secondary" onClick={() => setShowPrefsModal(false)}>Vazgec</Button>
            <Button onClick={savePrefsModal}>Kaydet ve Sabitle</Button>
          </div>
        </div>
      </Modal>

      {/* Widget Picker Modal */}
      {picker && (
        <WidgetPicker
          side={picker}
          current={widgets[picker]}
          onSelect={id => setWidget(picker, id)}
          onClose={() => setPicker(null)}
        />
      )}

      <Modal open={showOpenOrders} onClose={() => setShowOpenOrders(false)} title="Acik Siparisler" size="xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Toplam acik siparis: <strong>{data?.openOrderSummary?.count || 0}</strong></span>
            <span className="text-gray-800 font-semibold">Toplam tutar: {Number(data?.openOrderSummary?.total || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="PO veya tedarikci ara..."
              value={openOrdersSearch}
              onChange={e => setOpenOrdersSearch(e.target.value)}
            />
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={openOrdersFrom}
              onChange={e => setOpenOrdersFrom(e.target.value)}
            />
            <input
              type="date"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={openOrdersTo}
              onChange={e => setOpenOrdersTo(e.target.value)}
            />
          </div>
          <div className="text-xs text-gray-500">Filtreye uyan acik siparis: {filteredOpenOrders.length}</div>
          <Table headers={['PO No', 'Tedarikci', 'Tarih', 'Tutar']} empty={filteredOpenOrders.length === 0 && 'Filtreye uygun acik siparis bulunamadi'}>
            {filteredOpenOrders.map(order => (
              <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 text-sm font-medium text-blue-600">{order.po_number}</td>
                <td className="px-4 py-2 text-sm text-gray-700">{order.supplier_name}</td>
                <td className="px-4 py-2 text-sm text-gray-600">{order.order_date}</td>
                <td className="px-4 py-2 text-sm font-semibold text-gray-800">{Number(order.total_amount || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {order.currency || 'TRY'}</td>
              </tr>
            ))}
          </Table>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowOpenOrders(false)}>Kapat</Button>
            <Button onClick={() => { setShowOpenOrders(false); navigate('/suppliers?tab=orders&status=açık'); }}>Acik Siparislerde Filtrele</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
