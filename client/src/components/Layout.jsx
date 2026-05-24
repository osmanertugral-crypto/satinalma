import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getRates } from '../api';
import {
  LayoutDashboard, Users, Package, FileText,
  TrendingUp, LogOut, Briefcase,
  Menu, X, Container, ClipboardList, Wallet, BarChart2, Settings, ArrowLeftRight,
  ShoppingCart, ChevronDown, AlertTriangle, FlaskConical, Wrench
} from 'lucide-react';

// RESTAR marka renkleri
const R = {
  blue: '#1A8FD8',
  blueDark: '#1579BC',
  blueLight: '#E8F4FC',
  charcoal: '#1E1E1E',
  charcoalMid: '#2A2A2A',
  charcoalLight: '#333333',
};

const navGroups = [
  {
    label: 'Satın Alma',
    key: 'satin-alma',
    icon: ShoppingCart,
    items: [
      { to: '/malzeme-ihtiyac', icon: ClipboardList, label: 'Malzeme İhtiyaç', key: 'malzeme-ihtiyac' },
      { to: '/operasyon', icon: Wrench, label: 'Operasyon', key: 'operasyon' },
      { to: '/suppliers', icon: Users, label: 'Siparişler ve Tedarikçiler', key: 'suppliers' },
      { to: '/deneme', icon: FlaskConical, label: 'Deneme', key: 'deneme' },
    ],
  },
  {
    label: 'Stok & Analiz',
    key: 'stok-analiz',
    icon: Container,
    items: [
      { to: '/depo', icon: Container, label: 'Depo Stok', key: 'depo' },
      { to: '/hareketler', icon: ArrowLeftRight, label: 'Depo Hareketleri', key: 'hareketler' },
      { to: '/products', icon: TrendingUp, label: 'Fiyat Analizi', key: 'products' },
      { to: '/kritik-stok', icon: AlertTriangle, label: 'Kritik Stok', key: 'kritik-stok' },
    ],
  },
  {
    label: 'Finans',
    key: 'finans',
    icon: Wallet,
    items: [
      { to: '/finance', icon: Wallet, label: 'Cariler', key: 'finance' },
      { to: '/ciro-raporu', icon: BarChart2, label: 'Ciro Raporu', key: 'ciro-raporu' },
    ],
  },
  {
    label: 'SVC Takip',
    key: 'svc',
    icon: TrendingUp,
    items: [
      { to: '/svc-takip', icon: TrendingUp, label: 'SVC Takip', key: 'svc-takip' },
      { to: '/tekliflerim', icon: Briefcase, label: 'Tekliflerim', key: 'tekliflerim' },
    ],
  },
];

const extraItems = [
  { to: '/department-requests', icon: ClipboardList, label: 'Departman Talepleri', key: 'department-requests' },
  { to: '/hasar-tutanaklari', icon: FileText, label: 'Hasar Tutanakları', key: 'damage-reports' },
];

function NavItem({ to, icon: Icon, label, sidebarOpen, indent = false }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => [
        'flex items-center gap-3 py-2 text-sm transition-all duration-150 relative group',
        indent ? (sidebarOpen ? 'pl-10 pr-3' : 'px-3') : 'px-3',
        isActive
          ? 'text-white font-medium'
          : 'text-[#A0A0A0] hover:text-white',
      ].join(' ')}
      style={({ isActive }) => isActive ? {
        background: `linear-gradient(90deg, ${R.blue}22 0%, transparent 100%)`,
        borderLeft: `3px solid ${R.blue}`,
      } : {
        borderLeft: '3px solid transparent',
      }}
    >
      <Icon size={indent ? 15 : 17} className="shrink-0" style={{ color: 'inherit' }} />
      {sidebarOpen && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function RateBar() {
  const [rates, setRates] = useState(null);

  useEffect(() => {
    getRates()
      .then(r => setRates(r.data))
      .catch(() => {});

    // Her gün sabah yenile (24 saat)
    const t = setInterval(() => {
      getRates().then(r => setRates(r.data)).catch(() => {});
    }, 60 * 60 * 1000); // saatte bir kontrol, cache halleder
    return () => clearInterval(t);
  }, []);

  if (!rates?.usd && !rates?.eur) return null;

  const fmt = (v) => v ? Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '—';

  return (
    <div className="flex items-center gap-4 text-xs font-medium" style={{ color: '#fff' }}>
      {rates.usd && (
        <span className="flex items-center gap-1">
          <span style={{ opacity: 0.65 }}>USD</span>
          <span>{fmt(rates.usd)} ₺</span>
        </span>
      )}
      {rates.eur && (
        <span className="flex items-center gap-1">
          <span style={{ opacity: 0.65 }}>EUR</span>
          <span>{fmt(rates.eur)} ₺</span>
        </span>
      )}
      <span style={{ opacity: 0.4, fontSize: 10 }}>TCMB · {rates.date}</span>
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState({ 'satin-alma': true, 'stok-analiz': true, 'finans': true, 'svc': true });

  function handleLogout() { logout(); navigate('/login'); }
  function toggleGroup(key) { setOpenGroups(prev => ({ ...prev, [key]: !prev[key] })); }
  function canSee(key) {
    return user?.role === 'admin' || !user?.allowed_pages || user.allowed_pages.includes(key);
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F0F4F8' }}>
      {/* ── Sidebar ────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-200"
        style={{
          width: sidebarOpen ? 240 : 56,
          background: R.charcoal,
          borderRight: `1px solid ${R.charcoalLight}`,
        }}
      >
        {/* Logo alanı */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            padding: sidebarOpen ? '14px 12px 14px 16px' : '14px 8px',
            borderBottom: `1px solid ${R.charcoalLight}`,
            minHeight: 60,
          }}
        >
          {sidebarOpen ? (
            <img src="/RESTAR.png" alt="RESTAR" style={{ height: 28, objectFit: 'contain' }} />
          ) : (
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg font-bold text-white text-sm"
              style={{ background: R.blue, flexShrink: 0 }}
            >
              R
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1.5 transition-colors"
            style={{ color: '#808080' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#808080'}
          >
            {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* Navigasyon */}
        <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
          {/* Dashboard */}
          {canSee('dashboard') && (
            <NavItem to="/" icon={LayoutDashboard} label="Dashboard" sidebarOpen={sidebarOpen} />
          )}

          {/* Gruplar */}
          {navGroups.map(group => {
            const visibleItems = group.items.filter(item => canSee(item.key));
            if (!visibleItems.length) return null;
            const isOpen = openGroups[group.key];
            const GroupIcon = group.icon;

            return (
              <div key={group.key} className="mt-2">
                <button
                  onClick={() => sidebarOpen && toggleGroup(group.key)}
                  className="flex items-center w-full px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors"
                  style={{
                    color: sidebarOpen ? R.blue : '#555',
                    cursor: sidebarOpen ? 'pointer' : 'default',
                    letterSpacing: '0.08em',
                  }}
                >
                  <GroupIcon size={14} className="shrink-0" style={{ color: sidebarOpen ? R.blue : '#555' }} />
                  {sidebarOpen && (
                    <>
                      <span className="ml-2 flex-1 text-left">{group.label}</span>
                      <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                    </>
                  )}
                </button>

                {(isOpen || !sidebarOpen) && visibleItems.map(item => (
                  <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label}
                    sidebarOpen={sidebarOpen} indent />
                ))}
              </div>
            );
          })}

          {/* Ayırıcı */}
          <div style={{ borderTop: `1px solid ${R.charcoalLight}`, margin: '8px 12px' }} />

          {/* Extra öğeler */}
          {extraItems.filter(item => canSee(item.key)).map(item => (
            <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} sidebarOpen={sidebarOpen} />
          ))}

          {/* Admin öğeleri */}
          {user?.role === 'admin' && (
            <>
              <div style={{ borderTop: `1px solid ${R.charcoalLight}`, margin: '8px 12px' }} />
              <NavItem to="/admin/users" icon={Users} label="Kullanıcılar" sidebarOpen={sidebarOpen} />
              <NavItem to="/admin/settings" icon={Settings} label="Ayarlar" sidebarOpen={sidebarOpen} />
            </>
          )}
        </nav>

        {/* Kullanıcı alanı */}
        <div
          className="shrink-0 p-3"
          style={{ borderTop: `1px solid ${R.charcoalLight}` }}
        >
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: R.blue }}
              >
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
                <div className="text-[10px] capitalize" style={{ color: R.blue }}>{user?.role}</div>
              </div>
              <button onClick={handleLogout} title="Çıkış"
                className="p-1.5 rounded-md transition-colors"
                style={{ color: '#808080' }}
                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                onMouseLeave={e => e.currentTarget.style.color = '#808080'}>
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <button onClick={handleLogout} title="Çıkış"
              className="w-full flex justify-center py-1 rounded-md transition-colors"
              style={{ color: '#808080' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#808080'}>
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {/* ── Ana İçerik ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Üst şerit — kur göstergesi */}
        <div
          className="shrink-0 flex items-center justify-end px-5 gap-4"
          style={{
            height: 32,
            background: `linear-gradient(90deg, ${R.blue} 0%, ${R.blueDark} 100%)`,
          }}
        >
          <RateBar />
        </div>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
