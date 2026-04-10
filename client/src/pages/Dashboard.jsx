import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDashboard, getFinanceCariler, getWarehouseSummary } from '../api';
import { PageHeader, Card, StatCard, Badge, Spinner } from '../components/UI';
import { Users, Package, ShoppingCart, FileText, Warehouse, AlertTriangle, TrendingUp, TrendingDown, Settings, CheckCircle, X, BarChart2, Wallet, Container, GripVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const STATUS_LABELS = { draft: 'Taslak', sent: 'Gönderildi', confirmed: 'Onaylandı', delivered: 'Teslim Alındı', cancelled: 'İptal' };
const STATUS_COLOR = { draft: 'gray', sent: 'blue', confirmed: 'green', delivered: 'purple', cancelled: 'red' };

function fmtNum(v) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtCur(v) {
  if (v == null || isNaN(v)) return '-';
  return Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

// ─── Widget tanımları ─────────────────────────────────────────────────────────
const WIDGET_DEFS = [
  { id: 'kritik-stok',   label: 'Kritik Stok', icon: Warehouse,   desc: 'Min. stok altındaki ürünler' },
  { id: 'fiyat-artis',   label: 'Fiyat Artışları', icon: TrendingUp, desc: 'En fazla fiyat artan ürünler (grafik)' },
  { id: 'fiyat-uyari',   label: 'Fiyat Uyarıları', icon: AlertTriangle, desc: 'Tetiklenen fiyat alarmları' },
  { id: 'son-siparisler',label: 'Son Siparişler', icon: ShoppingCart, desc: 'En son PO siparişleri' },
  { id: 'finans',        label: 'Finans Özeti', icon: Wallet, desc: 'Cari borç/alacak özeti' },
  { id: 'depo-stok',     label: 'Depo Stok Özeti', icon: Container, desc: 'Depo toplam stok bilgisi' },
];

const DEFAULT_LEFT = 'fiyat-uyari';
const DEFAULT_RIGHT = 'kritik-stok';
const LS_KEY = 'dashboard_widgets';

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
      {id === 'finans' && <WidgetFinans navigate={navigate} />}
      {id === 'depo-stok' && <WidgetDepoStok navigate={navigate} />}
    </Card>
  );
}

// ─── Ana Sayfa ───────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => getDashboard().then(r => r.data) });
  const [widgets, setWidgets] = useState(loadWidgets);
  const [picker, setPicker] = useState(null); // 'left' | 'right'

  function setWidget(side, id) {
    setWidgets(prev => {
      const next = { ...prev, [side]: id };
      saveWidgets(next);
      return next;
    });
  }

  if (isLoading) return <div className="p-8"><Spinner /></div>;

  return (
    <div className="p-6">
      <PageHeader title="Dashboard" subtitle="Genel özet ve uyarılar" />

      {/* İstatistikler */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Tedarikçiler" value={data.totalSuppliers} icon={Users} color="blue" />
        <StatCard label="Ürünler" value={data.totalProducts} icon={Package} color="green" />
        <StatCard label="Aktif PO" value={data.activePo} icon={ShoppingCart} color="orange" />
        <StatCard label="Açık RFQ" value={data.openRfq} icon={FileText} color="purple" />
        <StatCard label="Kritik Stok" value={data.lowStock} icon={Warehouse} color="red" />
      </div>

      {/* İki Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Widget id={widgets.left}  data={data} navigate={navigate} onChangePicker={() => setPicker('left')} />
        <Widget id={widgets.right} data={data} navigate={navigate} onChangePicker={() => setPicker('right')} />
      </div>

      {/* Kritik stok alt uyarı */}
      {data.lowStock > 0 && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 items-start">
          <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
          <div>
            <p className="font-medium text-red-700">{data.lowStock} ürün minimum stok seviyesinin altında!</p>
            <button onClick={() => navigate('/inventory')} className="text-sm text-red-600 underline mt-1">Envanteri görüntüle</button>
          </div>
        </div>
      )}

      {/* Widget Picker Modal */}
      {picker && (
        <WidgetPicker
          side={picker}
          current={widgets[picker]}
          onSelect={id => setWidget(picker, id)}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
