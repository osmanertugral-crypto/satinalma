import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import SuppliersOrdersPage from './pages/SuppliersOrders';
import SupplierDetailPage from './pages/SupplierDetail';
import ProductsAndPriceAnalysisPage from './pages/ProductsAndPriceAnalysis';
import ProductDetailPage from './pages/ProductDetail';
import PricesPage from './pages/Prices';
import POPage from './pages/PO';
import PODetailPage from './pages/PODetail';
import RFQPage from './pages/RFQ';
import RFQDetailPage from './pages/RFQDetail';
import InventoryPage from './pages/Inventory';
import DocumentsPage from './pages/Documents';
import ReportsPage from './pages/Reports';
// PriceAnalysis is now merged into ProductsAndPriceAnalysis
import DepoPage from './pages/Depo';
import AdminUsersPage from './pages/AdminUsers';
import OutlookTasksPage from './pages/OutlookTasks';
import MalzemeIhtiyacPage from './pages/MalzemeIhtiyac';
import FinancePage from './pages/Finance';
import DamageReportsPage from './pages/DamageReports';
import SvcTakipPage from './pages/SvcTakip';
import SvcDetailPage from './pages/SvcDetail';
import CiroRaporuPage from './pages/CiroRaporu';
import DepartmentRequestsPage from './pages/DepartmentRequests';
import SettingsPage from './pages/Settings';
import HareketlerPage from './pages/Hareketler';
import KritikStokPage from './pages/KritikStok';
import DenemePage from './pages/Deneme';
import OperasyonPage from './pages/Operasyon';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } }
});

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
              <Route index element={<DashboardPage />} />
              <Route path="suppliers" element={<SuppliersOrdersPage />} />
              <Route path="suppliers/:id" element={<SupplierDetailPage />} />
              <Route path="products" element={<ProductsAndPriceAnalysisPage />} />
              <Route path="products/:id" element={<ProductDetailPage />} />
              <Route path="prices" element={<PricesPage />} />
              <Route path="po" element={<POPage />} />
              <Route path="po/:id" element={<PODetailPage />} />
              <Route path="rfq" element={<RFQPage />} />
              <Route path="rfq/:id" element={<RFQDetailPage />} />
              <Route path="inventory" element={<InventoryPage />} />
              <Route path="depo" element={<DepoPage />} />
              <Route path="malzeme-ihtiyac" element={<MalzemeIhtiyacPage />} />
              <Route path="finance" element={<FinancePage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="outlook-tasks" element={<OutlookTasksPage />} />
              <Route path="price-analysis" element={<Navigate to="/products" replace />} />
              <Route path="hasar-tutanaklari" element={<DamageReportsPage />} />
              <Route path="svc-takip" element={<SvcTakipPage />} />
              <Route path="svc-takip/:id" element={<SvcDetailPage />} />
              <Route path="ciro-raporu" element={<CiroRaporuPage />} />
              <Route path="department-requests" element={<DepartmentRequestsPage />} />
              <Route path="hareketler" element={<HareketlerPage />} />
              <Route path="kritik-stok" element={<KritikStokPage />} />
              <Route path="deneme" element={<DenemePage />} />
              <Route path="operasyon" element={<OperasyonPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
              <Route path="admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
