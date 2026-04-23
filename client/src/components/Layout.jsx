import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard, Users, Package, FileText,
  TrendingUp, Warehouse, LogOut,
  Menu, X, ListChecks, LineChart, Container, ClipboardList, Wallet
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', key: 'dashboard' },
  { to: '/finance', icon: Wallet, label: 'Finans', key: 'finance' },
  { to: '/suppliers', icon: Users, label: 'Siparişler ve Tedarikçiler', key: 'suppliers' },
  { to: '/products', icon: Package, label: 'Ürünler', key: 'products' },
  { to: '/inventory', icon: Warehouse, label: 'Envanter', key: 'inventory' },
  { to: '/depo', icon: Container, label: 'Depo Stok', key: 'depo' },
  { to: '/malzeme-ihtiyac', icon: ClipboardList, label: 'Malzeme İhtiyaç', key: 'malzeme-ihtiyac' },
  { to: '/price-analysis', icon: LineChart, label: 'Fiyat Analizi', key: 'price-analysis' },
  { to: '/projeler', icon: TrendingUp, label: 'Projeler', key: 'projects' },
  { to: '/department-requests', icon: ClipboardList, label: 'Departman Talepleri', key: 'department-requests' },
  { to: '/hasar-tutanaklari', icon: FileText, label: 'Hasar Tutanakları', key: 'damage-reports' },
  { to: '/outlook-tasks', icon: ListChecks, label: 'Outlook Yapılacaklar', key: 'outlook-tasks' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-gray-100 font-sans">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-slate-800 text-white flex flex-col transition-all duration-200`}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          {sidebarOpen && <span className="font-bold text-lg truncate">Satınalma</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-slate-700">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems
            .filter(item => user?.role === 'admin' || !user?.allowed_pages || user.allowed_pages.includes(item.key))
            .map(({ to, icon: Icon, label, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`
              }
            >
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`
              }
            >
              <Users size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">Kullanıcılar</span>}
            </NavLink>
          )}
        </nav>
        <div className="p-4 border-t border-slate-700">
          {sidebarOpen && (
            <div className="text-xs text-slate-400 mb-2 truncate">
              <span className="font-medium text-white">{user?.name}</span>
              <span className="ml-1 capitalize bg-slate-600 px-1.5 py-0.5 rounded text-slate-300">{user?.role}</span>
            </div>
          )}
          <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm w-full">
            <LogOut size={16} />
            {sidebarOpen && 'Çıkış'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
