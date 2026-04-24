import api from './axios';

export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
export const changePassword = (data) => api.put('/auth/change-password', data);

// Users
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const resetUserPassword = (id, data) => api.put(`/users/${id}/reset-password`, data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

// Suppliers
export const getSuppliers = (params) => api.get('/suppliers', { params });
export const getSupplierStats = (params) => api.get('/suppliers/stats/charts', { params });
export const getSupplier = (id) => api.get(`/suppliers/${id}`);
export const getSupplierPanelDetail = (id) => api.get(`/suppliers/${id}/panel-detail`);
export const createSupplier = (data) => api.post('/suppliers', data);
export const updateSupplier = (id, data) => api.put(`/suppliers/${id}`, data);
export const updateSupplierRating = (id, rating) => api.patch(`/suppliers/${id}/rating`, { rating });
export const toggleSupplierActive = (id) => api.patch(`/suppliers/${id}/toggle-active`);
export const deleteSupplier = (id) => api.delete(`/suppliers/${id}`);
export const addSupplierProduct = (id, data) => api.post(`/suppliers/${id}/products`, data);
export const removeSupplierProduct = (id, spId) => api.delete(`/suppliers/${id}/products/${spId}`);

// Products
export const getProducts = (params) => api.get('/products', { params });
export const getProduct = (id) => api.get(`/products/${id}`);
export const getProductStats = (params) => api.get('/products/stats/charts', { params });
export const createProduct = (data) => api.post('/products', data);
export const updateProduct = (id, data) => api.put(`/products/${id}`, data);
export const deleteProduct = (id) => api.delete(`/products/${id}`);
export const getCategories = () => api.get('/products/categories');
export const createCategory = (data) => api.post('/products/categories', data);
export const deleteCategory = (id) => api.delete(`/products/categories/${id}`);

// Prices
export const getPrices = (params) => api.get('/prices', { params });
export const addPrice = (data) => api.post('/prices', data);
export const deletePrice = (id) => api.delete(`/prices/${id}`);
export const getPriceAlerts = () => api.get('/prices/alerts');
export const createPriceAlert = (data) => api.post('/prices/alerts', data);
export const deletePriceAlert = (id) => api.delete(`/prices/alerts/${id}`);
export const getTriggeredAlerts = () => api.get('/prices/triggered-alerts');
export const getPriceTrend = (params) => api.get('/reports/price-trend', { params });

// Purchase Orders
export const getPOs = (params) => api.get('/po', { params });
export const getPO = (id) => api.get(`/po/${id}`);
export const createPO = (data) => api.post('/po', data);
export const updatePOStatus = (id, data) => api.put(`/po/${id}/status`, data);
export const deletePO = (id) => api.delete(`/po/${id}`);

// RFQ
export const getRFQs = () => api.get('/rfq');
export const getRFQ = (id) => api.get(`/rfq/${id}`);
export const createRFQ = (data) => api.post('/rfq', data);
export const addRFQResponse = (id, data) => api.post(`/rfq/${id}/responses`, data);
export const updateRFQStatus = (id, data) => api.put(`/rfq/${id}/status`, data);

// Inventory
export const getInventory = () => api.get('/inventory');
export const getInventoryTransactions = (params) => api.get('/inventory/transactions', { params });
export const createInventoryTransaction = (data) => api.post('/inventory/transaction', data);
export const syncInventoryFromExcel = () => api.post('/inventory/sync-excel');

// Documents
export const getDocuments = (params) => api.get('/documents', { params });
export const uploadDocument = (formData) => api.post('/documents', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteDocument = (id) => api.delete(`/documents/${id}`);
export const getDocumentDownloadUrl = (id) => `/api/documents/${id}/download`;

// Reports / Dashboard
export const getDashboard = (params) => api.get('/reports/dashboard', { params });
export const getMonthlySummary = () => api.get('/reports/monthly-summary');
export const getProductPriceAnalysis = (params) => api.get('/reports/product-price-analysis', { params });

// Warehouse (Depo)
export const getWarehouseSummary = () => api.get('/warehouse/summary');
export const getWarehouseStock = (params) => api.get('/warehouse/stock', { params });
export const getWarehouseKartTipleri = () => api.get('/warehouse/kart-tipleri');
export const getWarehouseStatus = () => api.get('/warehouse/status');
export const syncWarehouse = () => api.post('/warehouse/sync', {});
export const refreshWarehouseExcelAndSync = () => api.post('/warehouse/sync', { refreshExcel: true }, { timeout: 300_000 });

// Outlook Tasks
export const getOutlookStatus = () => api.get('/outlook/status');
export const getOutlookConnectUrl = () => api.get('/outlook/connect-url');
export const syncOutlookTasks = () => api.post('/outlook/sync');
export const getOutlookTasks = () => api.get('/outlook/tasks');
export const updateOutlookTaskStatus = (id, data) => api.patch(`/outlook/tasks/${id}`, data);

// Malzeme İhtiyaç
export const refreshMalzemeExcel = () => api.post('/malzeme-ihtiyac/refresh', {}, { timeout: 300_000 });
export const getMalzemeUretimIhtiyac = (proje) => api.get('/malzeme-ihtiyac/uretim-ihtiyac', { params: { proje } });
export const getMalzemeProjeMaliyet = () => api.get('/malzeme-ihtiyac/proje-maliyet');
export const getMalzemeSatinalma = (proje) => api.get('/malzeme-ihtiyac/satinalma', { params: { proje } });
export const downloadTedarikciPdf = (data) => api.post('/malzeme-ihtiyac/tedarikci-pdf', data, { responseType: 'blob' });

// Department Requests
export const getDepartmentRequests = (params) => api.get('/department-requests', { params });
export const createDepartmentRequest = (data) => api.post('/department-requests', data);
export const updateDepartmentRequestStatus = (id, data) => api.patch(`/department-requests/${id}/status`, data);

// Import
export const importPurchaseReport = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/import/purchase-report', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000, // büyük dosyalar için 2 dk
  }).then(r => r.data);
};

// Finance
export const getFinanceKurlar = () => api.get('/finance/kurlar');
export const getFinanceOzet = () => api.get('/finance/ozet');
export const getFinanceCariler = (params) => api.get('/finance/cariler', { params });
export const getFinanceCariDetay = (params) => api.get('/finance/cari-detay', { params });
export const refreshFinanceExcel = () => api.post('/finance/refresh-excel', {});
export const getFinanceRefreshStatus = () => api.get('/finance/refresh-status');

// Damage Reports (Kirilan/Bozulan Urun Tutanak)
export const getDamageReports = (params) => api.get('/damage-reports', { params });
export const importDamageReports = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/damage-reports/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }).then(r => r.data);
};

// Projects (Teklif/Tender)
export const getProjects = (params) => api.get('/projects', { params });
export const getProjectDetail = (id) => api.get(`/projects/${id}`);
export const updateProject = (id, data) => api.patch(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);
export const createProjectItem = (id, data) => api.post(`/projects/${id}/items`, data);
export const updateProjectItem = (id, itemId, data) => api.patch(`/projects/${id}/items/${itemId}`, data);
export const deleteProjectItem = (id, itemId) => api.delete(`/projects/${id}/items/${itemId}`);
export const importProjects = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/projects/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }).then(r => r.data);
};

// Ciro Raporu
export const getCiroRaporu = () => api.get('/ciro/raporu');
export const getCiroRaporuForce = () => api.get('/ciro/raporu', { params: { force: 'true' } });
