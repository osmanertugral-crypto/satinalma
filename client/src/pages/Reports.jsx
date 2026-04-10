import React, { useRef, useState } from 'react';
import { PageHeader, Card, Button } from '../components/UI';
import { Download, BarChart2, TrendingUp, ShoppingCart, Upload, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { importPurchaseReport } from '../api';

function ExportButton({ href, label, icon: Icon }) {
  return (
    <a href={href} download className="block">
      <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600"><Icon size={22} /></div>
          <div className="flex-1">
            <p className="font-semibold text-gray-800">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">Excel (.xlsx) olarak indir</p>
          </div>
          <Download size={18} className="text-gray-400" />
        </div>
      </Card>
    </a>
  );
}

export default function ReportsPage() {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null); // { success, message, stats } | { error }
  const [dragOver, setDragOver] = useState(false);

  async function handleImport(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xls', 'xlsx'].includes(ext)) {
      setImportResult({ error: 'Sadece .xls veya .xlsx dosyası seçin.' });
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importPurchaseReport(file);
      setImportResult(result);
    } catch (e) {
      setImportResult({ error: e.response?.data?.error || e.message || 'Beklenmeyen hata' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onFileChange(e) {
    handleImport(e.target.files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleImport(e.dataTransfer.files[0]);
  }

  return (
    <div className="p-6">
      <PageHeader title="Raporlar & İçe Aktar" subtitle="Excel'e aktarın veya mevcut raporları içe aktarın" />

      {/* SATINALMA RAPORU İÇE AKTAR */}
      <div className="mb-8">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Upload size={18} className="text-blue-500" /> Satınalma Raporu İçe Aktar
        </h2>
        <Card className="p-6">
          <p className="text-sm text-gray-500 mb-1">
            ERP sisteminizden aldığınız satınalma raporunu (.xls / .xlsx) yükleyin.
          </p>
          <p className="text-xs text-gray-400 mb-5">
            Zorunlu sütunlar: <span className="font-mono">YIL, AY, TARIH, FISNO, CARI_KODU, CARI_UNVANI, STOK_KODU, STOK_ADI, MIKTAR, BIRIM, FIYAT, TUTAR, SIPARIS_DOVIZ_TIPI, KAPALI</span>
          </p>

          {/* Sürükle-bırak / tıkla alanı */}
          <div
            onClick={() => !importing && fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
              ${importing ? 'border-blue-300 bg-blue-50 cursor-wait' :
                dragOver ? 'border-blue-400 bg-blue-50' :
                'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={onFileChange}
            />
            <FileSpreadsheet size={40} className={`mx-auto mb-3 ${importing ? 'text-blue-400 animate-pulse' : 'text-gray-300'}`} />
            {importing ? (
              <p className="text-blue-600 font-medium">İçe aktarılıyor, lütfen bekleyin…</p>
            ) : (
              <>
                <p className="text-gray-600 font-medium">Dosyayı buraya sürükleyin veya tıklayın</p>
                <p className="text-xs text-gray-400 mt-1">.xls veya .xlsx • Maks. 50 MB</p>
              </>
            )}
          </div>

          {/* Sonuç */}
          {importResult && (
            <div className={`mt-4 rounded-xl p-4 flex gap-3 ${importResult.error ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              {importResult.error ? (
                <>
                  <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700">Hata</p>
                    <p className="text-sm text-red-600 mt-0.5">{importResult.error}</p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle size={20} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-700">İçe aktarma tamamlandı!</p>
                    <p className="text-sm text-emerald-600 mt-0.5">{importResult.message}</p>
                    {importResult.stats && (
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        {[
                          { label: 'Tedarikçi', val: importResult.stats.suppliers },
                          { label: 'Ürün', val: importResult.stats.products },
                          { label: 'Kategori', val: importResult.stats.categories },
                          { label: 'Sipariş (PO)', val: importResult.stats.pos },
                          { label: 'PO Kalemi', val: importResult.stats.items },
                          { label: 'Fiyat Kaydı', val: importResult.stats.prices },
                        ].map(s => (
                          <div key={s.label} className="bg-white rounded-lg p-2 text-center">
                            <p className="text-lg font-bold text-emerald-700">{s.val}</p>
                            <p className="text-xs text-gray-500">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {importResult.stats?.skipped > 0 && (
                      <p className="text-xs text-amber-600 mt-2">⚠ {importResult.stats.skipped} satır atlandı (boş stok kodu veya cari kodu)</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* EXPORT BÖLÜMÜ */}
      <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
        <Download size={18} className="text-emerald-500" /> Excel Dışa Aktar
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ExportButton href="/api/reports/export/suppliers" label="Tedarikçi Listesi" icon={BarChart2} />
        <ExportButton href="/api/reports/export/prices" label="Fiyat Geçmişi (Tümü)" icon={TrendingUp} />
        <ExportButton href="/api/reports/export/po" label="Satın Alma Siparişleri" icon={ShoppingCart} />
      </div>

      <div className="mt-8">
        <h2 className="font-semibold text-gray-700 mb-4">Ürün Bazlı Fiyat Raporu</h2>
        <Card className="p-5">
          <p className="text-sm text-gray-500 mb-4">Belirli bir ürünün fiyat geçmişini indirin (URL'e product_id parametresi ekleyin):</p>
          <p className="font-mono text-xs bg-gray-100 rounded p-3 text-gray-600">/api/reports/export/prices?product_id=URUN_ID</p>
          <p className="text-xs text-gray-400 mt-2">Ürün detay sayfasından ürün ID'sini kopyalayabilirsiniz.</p>
        </Card>
      </div>
    </div>
  );
}
