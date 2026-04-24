import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader, Card, Button, Spinner, Badge, StatCard, Select, Input, Modal } from '../components/UI';
import { RefreshCw, Package, ShoppingCart, TrendingUp, Search, Filter, Download, AlertTriangle, CheckCircle, ArrowUpDown, List, Users, ChevronDown, ChevronRight, Mail, FileDown, Plus, Minus, Printer, ExternalLink, CheckSquare, Square, CreditCard, Info, X, Warehouse } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getMalzemeUretimIhtiyac,
  getMalzemeProjeMaliyet,
  getMalzemeSatinalma,
  refreshMalzemeExcel,
  downloadTedarikciPdf,
  getFinanceCariler,
  getWarehouseStock,
  getAllMalzemeProjects,
} from '../api';

const TABS = [
  { key: 'uretim', label: 'Üretim İhtiyaç Raporu', icon: Package },
  { key: 'maliyet', label: 'Proje Maliyet', icon: TrendingUp },
  { key: 'satinalma', label: 'Satınalma', icon: ShoppingCart },
];

function formatCurrency(val) {
  if (val == null || val === '') return '-';
  return Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₺';
}

function formatNumber(val) {
  if (val == null || val === '' || val === 0) return '-';
  return Number(val).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function MalzemeIhtiyac() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState('uretim');
  const [selectedProjeler, setSelectedProjeler] = useState([]);
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, dir: 'asc' });
  const [satinalmaSearch, setSatinalmaSearch] = useState('');
  const [satinalmaSortConfig, setSatinalmaSortConfig] = useState({ key: null, dir: 'asc' });
  const [satinalmaFilter, setSatinalmaFilter] = useState('all'); // all, eksik, yeterli
  const [satinalmaView, setSatinalmaView] = useState('liste'); // liste, tedarikci
  const [expandedTedarikci, setExpandedTedarikci] = useState(new Set());
  const [siparisModal, setSiparisModal] = useState(null); // { cari, action: 'pdf'|'mail', urunler: [{...row, adet}] }
  const [selectedTedarikci, setSelectedTedarikci] = useState(new Set());
  const [odemeOnayModal, setOdemeOnayModal] = useState(false);
  const [uretimGrupView, setUretimGrupView] = useState('liste'); // 'liste' | 'proje'
  const [uretimFilters, setUretimFilters] = useState({ tur: 'all', cari: 'all', grup: 'all', durum: 'all' });
  const [stokAraModal, setStokAraModal] = useState(null); // { cari: string }
  const [stokEklenenler, setStokEklenenler] = useState({}); // { [cari]: [{stok_kodu, stok_adi, adet, birim_fiyat}] }

  // Data queries
  const uretimQuery = useQuery({
    queryKey: ['malzeme-uretim', selectedProjeler],
    queryFn: () => getMalzemeUretimIhtiyac(selectedProjeler.length ? selectedProjeler.join(',') : undefined).then(r => r.data),
    enabled: activeTab === 'uretim',
  });

  const maliyetQuery = useQuery({
    queryKey: ['malzeme-maliyet'],
    queryFn: () => getMalzemeProjeMaliyet().then(r => r.data),
    enabled: activeTab === 'maliyet',
  });

  const satinalmaQuery = useQuery({
    queryKey: ['malzeme-satinalma', selectedProjeler],
    queryFn: () => getMalzemeSatinalma(selectedProjeler.length ? selectedProjeler.join(',') : undefined).then(r => r.data),
    enabled: activeTab === 'satinalma',
  });

  // Finance cari listesi (ödeme onay için)
  const cariListesiQuery = useQuery({
    queryKey: ['finance-cariler-all'],
    queryFn: () => getFinanceCariler().then(r => r.data),
    enabled: odemeOnayModal,
    staleTime: 5 * 60 * 1000,
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: refreshMalzemeExcel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['malzeme-uretim'] });
      qc.invalidateQueries({ queryKey: ['malzeme-maliyet'] });
      qc.invalidateQueries({ queryKey: ['malzeme-satinalma'] });
    },
  });

  // Proje listesi (tüm projeler: Excel + Database)
  const projelerQuery = useQuery({
    queryKey: ['malzeme-projeler'],
    queryFn: () => getAllMalzemeProjects().then(r => r.data.projeler),
  });

  const projeler = projelerQuery.data || [];

  // Proje seçimi toggle
  function toggleProje(proje) {
    setSelectedProjeler(prev =>
      prev.includes(proje) ? prev.filter(p => p !== proje) : [...prev, proje]
    );
  }

  function selectAllProjeler() {
    setSelectedProjeler(projeler.length === selectedProjeler.length ? [] : [...projeler]);
  }

  // Sorting
  function handleSort(key) {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }

  function handleSatinalmaSort(key) {
    setSatinalmaSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  }

  // Dropdown seçenekleri
  const uretimTurList = useMemo(() => [
    ...new Set((uretimQuery.data?.data || []).map(d => d.alt_kod_tur).filter(Boolean)),
  ].sort(), [uretimQuery.data]);

  const uretimCariList = useMemo(() => [
    ...new Set((uretimQuery.data?.data || []).map(d => d.son_satinalma_cari).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'tr')), [uretimQuery.data]);

  const uretimGrupList = useMemo(() => [
    ...new Set((uretimQuery.data?.data || []).map(d => d.alt_stok_grup_kodu).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, 'tr')), [uretimQuery.data]);

  // Filtered & sorted üretim data
  const filteredUretim = useMemo(() => {
    let data = uretimQuery.data?.data || [];
    if (search) {
      const s = normalizeStr(search);
      data = data.filter(d =>
        normalizeStr(d.alt_kod).includes(s) ||
        normalizeStr(d.alt_adi).includes(s) ||
        normalizeStr(d.proje_kodu).includes(s) ||
        normalizeStr(d.karavan_adi).includes(s) ||
        normalizeStr(d.son_satinalma_cari || '').includes(s)
      );
    }
    if (uretimFilters.tur !== 'all') data = data.filter(d => d.alt_kod_tur === uretimFilters.tur);
    if (uretimFilters.cari !== 'all') data = data.filter(d => d.son_satinalma_cari === uretimFilters.cari);
    if (uretimFilters.grup !== 'all') data = data.filter(d => d.alt_stok_grup_kodu === uretimFilters.grup);
    if (uretimFilters.durum === 'teslim') data = data.filter(d => Number(d.projelere_cikislar) > 0);
    else if (uretimFilters.durum === 'bekliyor') data = data.filter(d => Number(d.projelere_cikislar) === 0);
    else if (uretimFilters.durum === 'negatif') data = data.filter(d => Number(d.satinalma) < 0);
    if (sortConfig.key) {
      data = [...data].sort((a, b) => {
        const av = a[sortConfig.key], bv = b[sortConfig.key];
        if (typeof av === 'number' && typeof bv === 'number') return sortConfig.dir === 'asc' ? av - bv : bv - av;
        return sortConfig.dir === 'asc' ? String(av).localeCompare(String(bv), 'tr') : String(bv).localeCompare(String(av), 'tr');
      });
    }
    return data;
  }, [uretimQuery.data, search, sortConfig, uretimFilters]);

  // Proje dağılımı pivot
  const projeDagilimi = useMemo(() => {
    if (uretimGrupView !== 'proje') return null;
    const projelerList = [...new Set(filteredUretim.map(d => d.proje_kodu))].sort((a, b) => a.localeCompare(b, 'tr'));
    const urunMap = {};
    for (const row of filteredUretim) {
      if (!urunMap[row.alt_kod]) {
        urunMap[row.alt_kod] = {
          alt_kod: row.alt_kod, alt_adi: row.alt_adi, birim: row.birim,
          cari: row.son_satinalma_cari, grup: row.alt_stok_grup_kodu,
          tur: row.alt_kod_tur, projeler: {}, toplam: 0, toplam_tutar: 0,
        };
      }
      const m = Number(row.miktar || 0);
      urunMap[row.alt_kod].projeler[row.proje_kodu] = (urunMap[row.alt_kod].projeler[row.proje_kodu] || 0) + m;
      urunMap[row.alt_kod].toplam += m;
      urunMap[row.alt_kod].toplam_tutar += Number(row.tutar || 0);
    }
    const urunler = Object.values(urunMap).sort((a, b) => a.alt_kod.localeCompare(b.alt_kod, 'tr'));
    return { urunler, projelerList };
  }, [filteredUretim, uretimGrupView]);

  // Filtered & sorted satınalma data
  const filteredSatinalma = useMemo(() => {
    let data = satinalmaQuery.data?.data || [];
    if (satinalmaSearch) {
      const s = normalizeStr(satinalmaSearch);
      data = data.filter(d =>
        normalizeStr(d.alt_kod).includes(s) ||
        normalizeStr(d.alt_adi).includes(s) ||
        normalizeStr(d.son_satinalma_cari).includes(s)
      );
    }
    if (satinalmaFilter === 'eksik') {
      data = data.filter(d => (Number(d.gercek_satinalma) || 0) > 0);
    } else if (satinalmaFilter === 'yeterli') {
      data = data.filter(d => (Number(d.gercek_satinalma) || 0) <= 0);
    }
    if (satinalmaSortConfig.key) {
      data = [...data].sort((a, b) => {
        const av = a[satinalmaSortConfig.key], bv = b[satinalmaSortConfig.key];
        if (typeof av === 'number' && typeof bv === 'number') return satinalmaSortConfig.dir === 'asc' ? av - bv : bv - av;
        return satinalmaSortConfig.dir === 'asc' ? String(av).localeCompare(String(bv), 'tr') : String(bv).localeCompare(String(av), 'tr');
      });
    }
    return data;
  }, [satinalmaQuery.data, satinalmaSearch, satinalmaSortConfig, satinalmaFilter]);

  // Tedarikçiye göre gruplanmış satınalma (sadece eksik ürünler)
  const groupedByTedarikci = useMemo(() => {
    const eksikData = (satinalmaQuery.data?.data || []).filter(d => (Number(d.gercek_satinalma) || 0) > 0);
    const groups = {};
    for (const row of eksikData) {
      const cari = row.son_satinalma_cari || '(Belirtilmemiş)';
      if (!groups[cari]) {
        groups[cari] = { cari, urunler: [], toplam_tutar: 0, urun_sayisi: 0 };
      }
      groups[cari].urunler.push(row);
      groups[cari].toplam_tutar += Number(row.alinmasi_gereken_tutar) || 0;
      groups[cari].urun_sayisi += 1;
    }
    return Object.values(groups).sort((a, b) => b.toplam_tutar - a.toplam_tutar);
  }, [satinalmaQuery.data]);

  function toggleTedarikci(cari) {
    setExpandedTedarikci(prev => {
      const next = new Set(prev);
      if (next.has(cari)) next.delete(cari); else next.add(cari);
      return next;
    });
  }

  function toggleSelectTedarikci(cari, e) {
    if (e) e.stopPropagation();
    setSelectedTedarikci(prev => {
      const next = new Set(prev);
      if (next.has(cari)) next.delete(cari); else next.add(cari);
      return next;
    });
  }

  function selectAllTedarikci() {
    if (selectedTedarikci.size === groupedByTedarikci.length && groupedByTedarikci.length > 0) {
      setSelectedTedarikci(new Set());
    } else {
      setSelectedTedarikci(new Set(groupedByTedarikci.map(g => g.cari)));
    }
  }

  function normalizeStr(s) {
    return String(s).toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/ı/g, 'i')
      .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  function findMatchingCari(tedarikciAdi, cariler) {
    if (!cariler?.length) return null;
    const target = normalizeStr(tedarikciAdi);
    let m = cariler.find(c => normalizeStr(c.cariAdi) === target);
    if (m) return m;
    const words = target.split(' ').filter(w => w.length > 3);
    if (words.length > 0) {
      m = cariler.find(c => {
        const norm = normalizeStr(c.cariAdi);
        return words.every(w => norm.includes(w));
      });
      if (m) return m;
      if (words.length >= 2) {
        m = cariler.find(c => {
          const norm = normalizeStr(c.cariAdi);
          return words.filter(w => norm.includes(w)).length >= Math.max(2, Math.ceil(words.length * 0.6));
        });
        if (m) return m;
      }
    }
    return null;
  }

  function handleOdemeOnayExcel() {
    const cariler = cariListesiQuery.data || [];
    const selectedGroups = groupedByTedarikci.filter(g => selectedTedarikci.has(g.cari));
    const tarih = new Date().toLocaleDateString('tr-TR');
    const projeBilgisi = selectedProjeler.length > 0 ? selectedProjeler.join(', ') : 'Tüm Projeler';

    // ── Sayfa 1: Özet ──
    const ozetRows = [
      ['ÖDEME ONAY LİSTESİ'],
      [`Tarih: ${tarih}  |  Projeler: ${projeBilgisi}  |  ${selectedGroups.length} firma`],
      [],
      ['No', 'Firma Adı', 'Cari Kodu', 'Döviz', 'Toplam Borç', 'Vadesi Gelen Borç', 'Vadesi Gelmeyen', 'Son Ödeme Tarihi', 'Son Ödeme Tutarı', 'Son Ödemeden Geçen Gün', 'Ort. Vade Gün', 'Bu Siparişteki Tutar (TL)', 'Sipariş Ürün Sayısı'],
    ];

    selectedGroups.forEach((group, idx) => {
      const cari = findMatchingCari(group.cari, cariler);
      const bakiyeAbs = cari?.bakiye != null ? Math.abs(cari.bakiye) : null;
      ozetRows.push([
        idx + 1,
        group.cari,
        cari?.cariKodu || '',
        cari?.doviz || '',
        bakiyeAbs != null ? bakiyeAbs : '',
        cari?.vadesiGelen != null ? Math.abs(cari.vadesiGelen) : '',
        cari?.vadesiGelmeyen != null ? Math.abs(cari.vadesiGelmeyen) : '',
        cari?.sonOdemeTarih || '',
        cari?.sonOdemeTutar != null ? cari.sonOdemeTutar : '',
        cari?.sonOdemeGun != null ? cari.sonOdemeGun : '',
        cari?.ortGun || cari?.vadeSuresi || '',
        group.toplam_tutar,
        group.urun_sayisi,
      ]);
    });

    const genelToplamTutar = selectedGroups.reduce((s, g) => s + g.toplam_tutar, 0);
    ozetRows.push([]);
    ozetRows.push(['', 'GENEL TOPLAM', '', '', '', '', '', '', '', '', '', genelToplamTutar, selectedGroups.reduce((s, g) => s + g.urun_sayisi, 0)]);

    // ── Sayfa 2: Malzeme Detayı ──
    const detayRows = [
      ['MALZEME DETAY LİSTESİ'],
      [`Tarih: ${tarih}  |  Projeler: ${projeBilgisi}`],
      [],
      ['No', 'Firma Adı', 'Malzeme Kodu', 'Malzeme Adı', 'Miktar', 'Birim Fiyat (TL)', 'Tutar (TL)'],
    ];
    let detayNo = 1;
    selectedGroups.forEach(group => {
      group.urunler.forEach(urun => {
        detayRows.push([
          detayNo++,
          group.cari,
          urun.alt_kod || '',
          urun.alt_adi || '',
          Math.ceil(Number(urun.gercek_satinalma) || 0),
          Number(urun.birim_fiyat) || 0,
          Number(urun.alinmasi_gereken_tutar) || 0,
        ]);
      });
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet(ozetRows);
    ws1['!cols'] = [
      { wch: 4 }, { wch: 42 }, { wch: 16 }, { wch: 7 }, { wch: 18 }, { wch: 20 }, { wch: 18 },
      { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Ödeme Onay Özet');

    const ws2 = XLSX.utils.aoa_to_sheet(detayRows);
    ws2['!cols'] = [
      { wch: 4 }, { wch: 42 }, { wch: 18 }, { wch: 42 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, ws2, 'Malzeme Detayı');

    const dosyaAdi = `Odeme_Onay_${tarih.replace(/\./g, '-')}.xlsx`;
    XLSX.writeFile(wb, dosyaAdi);
  }

  function expandAllTedarikci() {
    if (expandedTedarikci.size === groupedByTedarikci.length) {
      setExpandedTedarikci(new Set());
    } else {
      setExpandedTedarikci(new Set(groupedByTedarikci.map(g => g.cari)));
    }
  }

  // Sipariş modal aç (mail/pdf)
  function openSiparisModal(group, action) {
    const ekUrunler = (stokEklenenler[group.cari] || []).map(s => ({
      alt_kod: s.stok_kodu,
      alt_adi: s.stok_adi,
      adet: s.adet,
      birim_fiyat: Number(s.birim_fiyat) || 0,
      orijinal_adet: s.adet,
      dahil: true,
      ekUrun: true,
    }));
    setSiparisModal({
      cari: group.cari,
      action,
      urunler: [
        ...group.urunler.map(u => ({
          alt_kod: u.alt_kod,
          alt_adi: u.alt_adi,
          adet: Math.max(0, Math.ceil(Number(u.gercek_satinalma) || 0)),
          birim_fiyat: Number(u.birim_fiyat) || 0,
          orijinal_adet: Math.max(0, Math.ceil(Number(u.gercek_satinalma) || 0)),
          dahil: true,
        })),
        ...ekUrunler,
      ],
    });
  }

  function updateSiparisAdet(idx, val) {
    setSiparisModal(prev => {
      const urunler = [...prev.urunler];
      urunler[idx] = { ...urunler[idx], adet: Math.max(0, Number(val) || 0) };
      return { ...prev, urunler };
    });
  }

  function toggleSiparisUrun(idx) {
    setSiparisModal(prev => {
      const urunler = [...prev.urunler];
      urunler[idx] = { ...urunler[idx], dahil: !urunler[idx].dahil };
      return { ...prev, urunler };
    });
  }

  function handleYazdir() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const tarih = new Date().toLocaleDateString('tr-TR');
    const projeBilgisi = selectedProjeler.length > 0 ? `Projeler: ${selectedProjeler.join(', ')}` : 'Tüm Projeler';
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Satınalma - Tedarikçiye Göre</title><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #333; padding: 15px; }
      h1 { font-size: 16px; margin-bottom: 4px; }
      .header-info { font-size: 10px; color: #666; margin-bottom: 12px; }
      .supplier-section { margin-bottom: 14px; page-break-inside: avoid; }
      .supplier-header { background: #f0f0f0; padding: 6px 10px; font-weight: bold; font-size: 12px; border: 1px solid #ccc; display: flex; justify-content: space-between; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f8f8f8; text-align: left; padding: 4px 6px; border: 1px solid #ccc; font-size: 10px; font-weight: 600; }
      td { padding: 3px 6px; border: 1px solid #ddd; font-size: 10px; }
      .text-right { text-align: right; }
      .font-mono { font-family: monospace; }
      .total-row { background: #f8f8f8; font-weight: bold; }
      .grand-total { margin-top: 14px; padding: 8px 10px; background: #e8e8e8; font-weight: bold; font-size: 13px; border: 1px solid #ccc; display: flex; justify-content: space-between; }
      @media print { body { padding: 0; } .supplier-section { page-break-inside: avoid; } }
    </style></head><body>`;
    html += `<h1>Satınalma İhtiyaç Listesi - Tedarikçiye Göre</h1>`;
    html += `<div class="header-info">${projeBilgisi} | Tarih: ${tarih} | ${groupedByTedarikci.length} tedarikçi, ${groupedByTedarikci.reduce((s, g) => s + g.urun_sayisi, 0)} ürün</div>`;
    let genelToplam = 0;
    for (const group of groupedByTedarikci) {
      genelToplam += group.toplam_tutar;
      html += `<div class="supplier-section">`;
      html += `<div class="supplier-header"><span>${group.cari}</span><span>${group.urun_sayisi} ürün | ${Number(group.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span></div>`;
      html += `<table><thead><tr><th>Malzeme Kodu</th><th>Malzeme Adı</th><th class="text-right">Miktar</th><th class="text-right">Birim Fiyat</th><th class="text-right">Tutar</th></tr></thead><tbody>`;
      for (const row of group.urunler) {
        html += `<tr>`;
        html += `<td class="font-mono">${row.alt_kod || ''}</td>`;
        html += `<td>${row.alt_adi || ''}</td>`;
        html += `<td class="text-right">${formatNumber(row.gercek_satinalma)}</td>`;
        html += `<td class="text-right">${formatCurrency(row.birim_fiyat)}</td>`;
        html += `<td class="text-right">${formatCurrency(row.alinmasi_gereken_tutar)}</td>`;
        html += `</tr>`;
      }
      html += `<tr class="total-row"><td colspan="4">Toplam</td><td class="text-right">${Number(group.toplam_tutar).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</td></tr>`;
      html += `</tbody></table></div>`;
    }
    html += `<div class="grand-total"><span>Genel Toplam</span><span>${Number(genelToplam).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺</span></div>`;
    html += `</body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function handlePdfIndir() {
    if (!siparisModal) return;
    const aktifUrunler = siparisModal.urunler.filter(u => u.dahil && u.adet > 0);
    if (!aktifUrunler.length) return;
    try {
      const response = await downloadTedarikciPdf({
        tedarikci: siparisModal.cari,
        urunler: aktifUrunler,
        projeler: selectedProjeler,
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${siparisModal.cari.replace(/[^a-zA-Z0-9 ]/g, '')}_siparis.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('PDF oluşturulurken hata: ' + (err?.response?.data?.error || err.message));
    }
  }

  function handleMailAt() {
    if (!siparisModal) return;
    const aktifUrunler = siparisModal.urunler.filter(u => u.dahil && u.adet > 0);
    if (!aktifUrunler.length) return;
    const subject = encodeURIComponent(`Satınalma Sipariş - ${siparisModal.cari}`);
    const lines = aktifUrunler.map(u =>
      `- ${u.alt_kod} | ${u.alt_adi} | Adet: ${u.adet} | Birim Fiyat: ${u.birim_fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL`
    );
    const toplam = aktifUrunler.reduce((s, u) => s + u.adet * u.birim_fiyat, 0);
    const body = encodeURIComponent(
      `Sayın ${siparisModal.cari},\n\nAşağıdaki ürünler için sipariş vermek istiyoruz:\n\n${lines.join('\n')}\n\nToplam Tutar: ${toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL\n${selectedProjeler.length ? `Projeler: ${selectedProjeler.join(', ')}\n` : ''}\nSaygılarımızla`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_self');
  }

  function handleSiparisAc() {
    if (!siparisModal) return;
    const aktifUrunler = siparisModal.urunler.filter(u => u.dahil && u.adet > 0);
    if (!aktifUrunler.length) return;
    // TODO: Logo Object bağlantısı ile sipariş açma - daha sonra yapılacak
    alert('Logo sipariş açma entegrasyonu henüz aktif değil.\n\nTedarikçi: ' + siparisModal.cari + '\nÜrün sayısı: ' + aktifUrunler.length);
  }

  const SortHeader = ({ label, sortKey, onSort, currentSort }) => (
    <th
      className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:bg-gray-50 select-none whitespace-nowrap"
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {currentSort.key === sortKey && (
          <ArrowUpDown size={12} className={currentSort.dir === 'desc' ? 'rotate-180' : ''} />
        )}
      </span>
    </th>
  );

  // ── Stok Ara Modal (satır içi bileşen) ──────────────────────────────────
  function StokAraModalView() {
    const cari = stokAraModal?.cari;
    const [araText, setAraText] = useState('');
    const [debouncedText, setDebouncedText] = useState('');
    const debounceRef = useRef(null);
    const [adetler, setAdetler] = useState({}); // { stok_kodu: number }

    const handleSearch = useCallback((val) => {
      setAraText(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setDebouncedText(val), 400);
    }, []);

    const stokQuery = useQuery({
      queryKey: ['warehouse-stock-search', debouncedText],
      queryFn: () => getWarehouseStock({ search: debouncedText, limit: 50 }).then(r => r.data),
      enabled: debouncedText.length >= 2,
      staleTime: 60_000,
    });

    const eklenenSet = new Set((stokEklenenler[cari] || []).map(s => s.stok_kodu));

    function handleEkle(row) {
      const adet = Number(adetler[row.stok_kodu]) || 1;
      setStokEklenenler(prev => {
        const mevcutlar = prev[cari] || [];
        const zatenVar = mevcutlar.findIndex(s => s.stok_kodu === row.stok_kodu);
        if (zatenVar >= 0) {
          // güncelle
          const updated = [...mevcutlar];
          updated[zatenVar] = { ...updated[zatenVar], adet };
          return { ...prev, [cari]: updated };
        }
        return {
          ...prev,
          [cari]: [...mevcutlar, { stok_kodu: row.stok_kodu, stok_adi: row.stok_adi, adet, birim_fiyat: row.birim_fiyat }],
        };
      });
    }

    function handleKaldir(stok_kodu) {
      setStokEklenenler(prev => ({
        ...prev,
        [cari]: (prev[cari] || []).filter(s => s.stok_kodu !== stok_kodu),
      }));
    }

    const rows = stokQuery.data?.rows || [];

    return (
      <Modal
        open={!!stokAraModal}
        onClose={() => setStokAraModal(null)}
        title={`Stoktan Ürün Ekle — ${cari || ''}`}
        size="xl"
      >
        <div className="space-y-4">
          {/* Eklenen ürünler listesi */}
          {(stokEklenenler[cari]?.length > 0) && (
            <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
              <p className="text-xs font-semibold text-violet-700 mb-2">Eklenen ürünler ({stokEklenenler[cari].length})</p>
              <div className="flex flex-wrap gap-2">
                {(stokEklenenler[cari] || []).map(s => (
                  <div key={s.stok_kodu} className="flex items-center gap-1 bg-white border border-violet-200 rounded-full px-2 py-0.5 text-xs text-violet-800">
                    <span className="font-mono">{s.stok_kodu}</span>
                    <span className="text-gray-600 max-w-[120px] truncate">{s.stok_adi}</span>
                    <span className="font-semibold text-violet-700">×{s.adet}</span>
                    <button onClick={() => handleKaldir(s.stok_kodu)} className="text-red-400 hover:text-red-600 ml-0.5"><X size={12} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Arama inputu */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Stok kodu veya adı ile ara (en az 2 karakter)..."
              value={araText}
              onChange={e => handleSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
            />
          </div>

          {/* Sonuçlar */}
          <div className="overflow-y-auto max-h-[340px] border rounded-lg">
            {debouncedText.length < 2 ? (
              <div className="py-10 text-center text-sm text-gray-400">En az 2 karakter girin</div>
            ) : stokQuery.isLoading ? (
              <div className="py-10 flex justify-center"><Spinner /></div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Sonuç bulunamadı</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Stok Kodu</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Stok Adı</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Depo</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Birim Fiyat</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-28">Adet</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const zaten = eklenenSet.has(row.stok_kodu);
                    return (
                      <tr key={row.stok_kodu} className={`border-b border-gray-100 hover:bg-gray-50 ${zaten ? 'bg-violet-50/40' : ''}`}>
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-gray-500">{row.stok_kodu}</td>
                        <td className="px-3 py-2 max-w-[220px] truncate text-gray-800" title={row.stok_adi}>{row.stok_adi}</td>
                        <td className="px-3 py-2 text-right text-blue-600 whitespace-nowrap">{formatNumber(row.gebze_stok ?? row.toplam_stok)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{formatCurrency(row.birim_fiyat)}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="1"
                            value={adetler[row.stok_kodu] ?? 1}
                            onChange={e => setAdetler(prev => ({ ...prev, [row.stok_kodu]: Math.max(1, Number(e.target.value) || 1) }))}
                            className="w-full text-center border border-gray-300 rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => handleEkle(row)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${zaten ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-violet-600 text-white hover:bg-violet-700'}`}
                          >
                            {zaten ? 'Güncelle' : 'Ekle'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t">
            <Button variant="secondary" onClick={() => setStokAraModal(null)}>Kapat</Button>
            <Button
              variant="primary"
              className="bg-violet-600 hover:bg-violet-700"
              onClick={() => setStokAraModal(null)}
              disabled={!stokEklenenler[cari]?.length}
            >
              Tamam ({stokEklenenler[cari]?.length || 0} ürün eklendi)
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Malzeme İhtiyaç"
        subtitle="Projelere göre malzeme ihtiyaç analizi ve satınalma takibi"
        action={
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            variant="primary"
          >
            <RefreshCw size={16} className={refreshMutation.isPending ? 'animate-spin' : ''} />
            {refreshMutation.isPending ? 'Yenileniyor...' : 'Excel Yenile'}
          </Button>
        }
      />

      {/* Refresh sonucu */}
      {refreshMutation.isSuccess && (
        <Card className="p-4 mb-4 border-green-200 bg-green-50">
          <div className="flex items-center gap-2 text-green-700">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">{refreshMutation.data?.data?.message}</span>
            <span className="text-xs text-green-500 ml-auto">{new Date(refreshMutation.data?.data?.timestamp).toLocaleString('tr-TR')}</span>
          </div>
        </Card>
      )}
      {refreshMutation.isError && (
        <Card className="p-4 mb-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle size={16} />
            <span className="text-sm">{refreshMutation.error?.response?.data?.error || 'Yenileme hatası'}</span>
          </div>
        </Card>
      )}

      {/* Proje seçici */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={16} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Proje Filtresi</span>
          <button
            onClick={selectAllProjeler}
            className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            {selectedProjeler.length === projeler.length ? 'Temizle' : 'Tümünü Seç'}
          </button>
          {selectedProjeler.length > 0 && (
            <Badge color="blue">{selectedProjeler.length} proje seçili</Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {projeler.map(p => (
            <button
              key={p}
              onClick={() => toggleProje(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                selectedProjeler.includes(p)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
          {projelerQuery.isLoading && <span className="text-xs text-gray-400">Yükleniyor...</span>}
        </div>
      </Card>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex-1 justify-center ${
              activeTab === key
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* TAB: ÜRETİM İHTİYAÇ RAPORU */}
      {activeTab === 'uretim' && (
        <div className="space-y-3">
          {/* Filtre bar */}
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* Arama */}
              <div className="relative min-w-[200px] flex-1 max-w-xs">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Kod, ad, proje, cari ara..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {/* Tür */}
              <select
                value={uretimFilters.tur}
                onChange={e => setUretimFilters(f => ({ ...f, tur: e.target.value }))}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tüm Türler</option>
                {uretimTurList.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {/* Durum */}
              <select
                value={uretimFilters.durum}
                onChange={e => setUretimFilters(f => ({ ...f, durum: e.target.value }))}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tüm Durumlar</option>
                <option value="teslim">✅ Çıkış Yapılmış</option>
                <option value="bekliyor">⏳ Çıkış Yok</option>
                <option value="negatif">🔴 Satınalma Gerekli</option>
              </select>
              {/* Cari */}
              <select
                value={uretimFilters.cari}
                onChange={e => setUretimFilters(f => ({ ...f, cari: e.target.value }))}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]"
              >
                <option value="all">Tüm Cariler</option>
                {uretimCariList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {/* Grup */}
              <select
                value={uretimFilters.grup}
                onChange={e => setUretimFilters(f => ({ ...f, grup: e.target.value }))}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tüm Gruplar</option>
                {uretimGrupList.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {/* Sıfırla */}
              {(search || uretimFilters.tur !== 'all' || uretimFilters.cari !== 'all' || uretimFilters.grup !== 'all' || uretimFilters.durum !== 'all') && (
                <button
                  onClick={() => { setSearch(''); setUretimFilters({ tur: 'all', cari: 'all', grup: 'all', durum: 'all' }); }}
                  className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded border border-red-200 hover:border-red-400 whitespace-nowrap"
                >
                  ✕ Filtreleri Sıfırla
                </button>
              )}
              <span className="text-sm text-gray-400 ml-auto whitespace-nowrap">{filteredUretim.length} kayıt</span>
              {/* Görünüm toggle */}
              <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg ml-2">
                <button
                  onClick={() => setUretimGrupView('liste')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${uretimGrupView === 'liste' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}
                >
                  <List size={13} /> Liste
                </button>
                <button
                  onClick={() => setUretimGrupView('proje')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${uretimGrupView === 'proje' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500'}`}
                >
                  <Users size={13} /> Proje Dağılımı
                </button>
              </div>
            </div>
          </Card>

          {uretimQuery.isLoading ? (
            <Card><Spinner /></Card>
          ) : uretimQuery.isError ? (
            <Card><div className="p-8 text-center text-red-500">{uretimQuery.error?.response?.data?.error || 'Veri yüklenemedi'}</div></Card>
          ) : uretimGrupView === 'liste' ? (
            /* ── LİSTE GÖRÜNÜMÜ ── */
            <Card>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr className="border-b border-gray-200">
                      <SortHeader label="Proje" sortKey="proje_kodu" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Karavan" sortKey="karavan_adi" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Tür" sortKey="alt_kod_tur" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Malzeme Kodu" sortKey="alt_kod" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Malzeme Adı" sortKey="alt_adi" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Miktar" sortKey="miktar" onSort={handleSort} currentSort={sortConfig} />
                      <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Birim</th>
                      <SortHeader label="Çıkışlar" sortKey="projelere_cikislar" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Elde Kalan" sortKey="elde_kalan" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Ürt.Depo" sortKey="uretim_depo" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Satınalma" sortKey="satinalma" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Açık Sip." sortKey="acik_satinalma_siparisleri" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Toplam" sortKey="toplam" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Birim Fiyat" sortKey="birim_fiyat" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Tutar" sortKey="tutar" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Cari" sortKey="son_satinalma_cari" onSort={handleSort} currentSort={sortConfig} />
                      <SortHeader label="Grup" sortKey="alt_stok_grup_kodu" onSort={handleSort} currentSort={sortConfig} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUretim.map((row, i) => {
                      const teslimEdildi = Number(row.projelere_cikislar) > 0;
                      return (
                        <tr
                          key={i}
                          className={`border-b border-gray-100 hover:bg-gray-50 ${teslimEdildi ? 'bg-green-50/50' : ''}`}
                        >
                          <td className="px-3 py-2 font-medium text-blue-700 whitespace-nowrap">{row.proje_kodu}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.karavan_adi}</td>
                          <td className="px-3 py-2"><Badge color={row.alt_kod_tur === 'Hammadde' ? 'blue' : 'gray'}>{row.alt_kod_tur}</Badge></td>
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.alt_kod}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate" title={row.alt_adi}>{row.alt_adi}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.miktar)}</td>
                          <td className="px-3 py-2 text-gray-500">{row.birim}</td>
                          <td className={`px-3 py-2 text-right ${Number(row.projelere_cikislar) > 0 ? 'text-green-600 font-medium' : ''}`}>
                            {formatNumber(row.projelere_cikislar)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.elde_kalan)}</td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.uretim_depo)}</td>
                          <td className={`px-3 py-2 text-right ${Number(row.satinalma) < 0 ? 'text-red-600 font-medium' : ''}`}>
                            {formatNumber(row.satinalma)}
                          </td>
                          <td className="px-3 py-2 text-right">{formatNumber(row.acik_satinalma_siparisleri)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatNumber(row.toplam)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.birim_fiyat)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(row.tutar)}</td>
                          <td className="px-3 py-2 text-xs max-w-[150px] truncate text-gray-500" title={row.son_satinalma_cari}>{row.son_satinalma_cari}</td>
                          <td className="px-3 py-2"><Badge color="purple">{row.alt_stok_grup_kodu}</Badge></td>
                        </tr>
                      );
                    })}
                    {filteredUretim.length === 0 && (
                      <tr><td colSpan={17} className="text-center text-gray-400 py-12">Veri bulunamadı</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            /* ── PROJE DAĞILIMI GÖRÜNÜMÜ ── */
            <Card>
              {!projeDagilimi || projeDagilimi.urunler.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Veri bulunamadı</div>
              ) : (
                <>
                  <div className="px-4 py-3 border-b bg-blue-50 flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-blue-800">Proje Bazlı Ürün Dağılımı</span>
                    <Badge color="blue">{projeDagilimi.urunler.length} ürün</Badge>
                    <Badge color="purple">{projeDagilimi.projelerList.length} proje</Badge>
                    <span className="text-xs text-blue-600 ml-auto">Her hücre: o projede bu ürünün toplam miktarını gösterir</span>
                  </div>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-800 text-white">
                          <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Malzeme Kodu</th>
                          <th className="text-left px-3 py-2.5 font-semibold">Malzeme Adı</th>
                          <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Birim</th>
                          <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Tür</th>
                          {projeDagilimi.projelerList.map(p => (
                            <th key={p} className="text-right px-2 py-2.5 font-semibold whitespace-nowrap bg-blue-700 border-x border-blue-600">{p}</th>
                          ))}
                          <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap bg-gray-700">Toplam</th>
                          <th className="text-right px-3 py-2.5 font-semibold whitespace-nowrap bg-gray-700">Tutar</th>
                          <th className="text-left px-3 py-2.5 font-semibold whitespace-nowrap">Cari</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projeDagilimi.urunler.map((u, i) => (
                          <tr key={u.alt_kod} className={`border-b border-gray-100 hover:bg-blue-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <td className="px-3 py-1.5 font-mono text-gray-500 whitespace-nowrap">{u.alt_kod}</td>
                            <td className="px-3 py-1.5 max-w-[200px] truncate text-gray-800 font-medium" title={u.alt_adi}>{u.alt_adi}</td>
                            <td className="px-3 py-1.5 text-center text-gray-400">{u.birim}</td>
                            <td className="px-3 py-1.5 text-center">
                              <Badge color={u.tur === 'Hammadde' ? 'blue' : 'gray'}>{u.tur}</Badge>
                            </td>
                            {projeDagilimi.projelerList.map(p => {
                              const val = u.projeler[p];
                              return (
                                <td key={p} className={`px-2 py-1.5 text-right border-x border-gray-100 font-medium whitespace-nowrap ${val ? 'text-blue-700 bg-blue-50/60' : 'text-gray-300'}`}>
                                  {val ? formatNumber(val) : '—'}
                                </td>
                              );
                            })}
                            <td className="px-3 py-1.5 text-right font-bold text-gray-800 bg-gray-50 whitespace-nowrap">{formatNumber(u.toplam)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-blue-700 bg-gray-50 whitespace-nowrap">{formatCurrency(u.toplam_tutar)}</td>
                            <td className="px-3 py-1.5 max-w-[140px] truncate text-gray-400 text-[11px]" title={u.cari}>{u.cari}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-800 text-white font-bold text-xs">
                          <td className="px-3 py-2" colSpan={4}>Toplam</td>
                          {projeDagilimi.projelerList.map(p => {
                            const total = projeDagilimi.urunler.reduce((s, u) => s + (u.projeler[p] || 0), 0);
                            return <td key={p} className="text-right px-2 py-2 bg-blue-800 border-x border-blue-700 whitespace-nowrap">{formatNumber(total)}</td>;
                          })}
                          <td className="text-right px-3 py-2 whitespace-nowrap">
                            {formatNumber(projeDagilimi.urunler.reduce((s, u) => s + u.toplam, 0))}
                          </td>
                          <td className="text-right px-3 py-2 whitespace-nowrap">
                            {formatCurrency(projeDagilimi.urunler.reduce((s, u) => s + u.toplam_tutar, 0))}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      )}

      {/* TAB: PROJE MALİYET */}
      {activeTab === 'maliyet' && (
        <div>
          {maliyetQuery.isLoading ? (
            <Spinner />
          ) : maliyetQuery.isError ? (
            <div className="p-8 text-center text-red-500">{maliyetQuery.error?.response?.data?.error || 'Veri yüklenemedi'}</div>
          ) : (
            <>
              {/* Genel Toplam */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <StatCard
                  label="Genel Toplam Maliyet"
                  value={formatCurrency(maliyetQuery.data?.genel_toplam)}
                  icon={TrendingUp}
                  color="blue"
                />
                <StatCard
                  label="Proje Sayısı"
                  value={maliyetQuery.data?.data?.length || 0}
                  icon={Package}
                  color="green"
                />
                <StatCard
                  label="Ortalama Proje Maliyeti"
                  value={formatCurrency(
                    maliyetQuery.data?.data?.length
                      ? maliyetQuery.data.genel_toplam / maliyetQuery.data.data.length
                      : 0
                  )}
                  icon={TrendingUp}
                  color="orange"
                />
              </div>

              <Card>
                <div className="p-4 border-b">
                  <h3 className="font-semibold text-gray-700">Araç Başı Proje Maliyetleri</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Proje Kodu</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Toplam Maliyet</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-1/2">Maliyet Dağılımı</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(maliyetQuery.data?.data || []).map((row, i) => {
                        const maxMaliyet = maliyetQuery.data?.data?.[0]?.toplam_maliyet || 1;
                        const pct = (row.toplam_maliyet / maxMaliyet) * 100;
                        return (
                          <tr key={row.proje_kodu} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                            <td className="px-4 py-3 font-semibold text-blue-700">{row.proje_kodu}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.toplam_maliyet)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                                  <div
                                    className="h-full bg-blue-500 rounded-full transition-all"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500 w-12 text-right">{pct.toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-4 py-3" colSpan={2}>Genel Toplam</td>
                        <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(maliyetQuery.data?.genel_toplam)}</td>
                        <td className="px-4 py-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB: SATINALMA */}
      {activeTab === 'satinalma' && (
        <div>
          {/* Proje seçim uyarısı */}
          {selectedProjeler.length === 0 && (
            <Card className="p-6 mb-4 border-amber-200 bg-amber-50">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Tüm projelerin toplu satınalma verisi gösteriliyor</p>
                  <p className="text-xs text-amber-600 mt-1">Belirli projeler için satınalma ihtiyacını görmek istiyorsanız yukarıdan proje seçin. Seçilen projelerin reçetelerine göre depo stoku ile karşılaştırma yapılacaktır.</p>
                </div>
              </div>
            </Card>
          )}
          {selectedProjeler.length > 0 && (
            <Card className="p-4 mb-4 border-blue-200 bg-blue-50">
              <div className="flex items-center gap-2 flex-wrap">
                <CheckCircle size={16} className="text-blue-600 shrink-0" />
                <span className="text-sm font-medium text-blue-800">
                  {selectedProjeler.length} proje için satınalma analizi:
                </span>
                {selectedProjeler.map(p => (
                  <Badge key={p} color="blue">{p}</Badge>
                ))}
              </div>
              <p className="text-xs text-blue-600 mt-1 ml-6">Seçili projelerin reçetelerindeki malzeme ihtiyacı, mevcut depo stoku ile karşılaştırılıyor.</p>
            </Card>
          )}

          {satinalmaQuery.isLoading ? (
            <Spinner />
          ) : satinalmaQuery.isError ? (
            <div className="p-8 text-center text-red-500">{satinalmaQuery.error?.response?.data?.error || 'Veri yüklenemedi'}</div>
          ) : (
            <>
              {/* Özet kartlar */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <StatCard
                  label="Toplam Ürün"
                  value={satinalmaQuery.data?.ozet?.toplam_urun || 0}
                  icon={Package}
                  color="blue"
                />
                <StatCard
                  label="Eksik Ürün (Satınalma Gerekli)"
                  value={satinalmaQuery.data?.ozet?.eksik_urun_sayisi || 0}
                  icon={AlertTriangle}
                  color="red"
                />
                <StatCard
                  label="Alınması Gereken Tutar"
                  value={formatCurrency(satinalmaQuery.data?.ozet?.alinmasi_gereken_toplam)}
                  icon={TrendingUp}
                  color="orange"
                />
              </div>

              {/* Görünüm seçici */}
              <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                  onClick={() => setSatinalmaView('liste')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    satinalmaView === 'liste' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <List size={14} /> Malzeme Listesi
                </button>
                <button
                  onClick={() => setSatinalmaView('tedarikci')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    satinalmaView === 'tedarikci' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Users size={14} /> Tedarikçiye Göre
                </button>
              </div>

              {/* Malzeme Listesi Görünümü */}
              {satinalmaView === 'liste' && (
              <Card>
                <div className="p-4 border-b flex items-center gap-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Malzeme kodu, adı veya cari ara..."
                      value={satinalmaSearch}
                      onChange={e => setSatinalmaSearch(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <select
                    value={satinalmaFilter}
                    onChange={e => setSatinalmaFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">Tümü</option>
                    <option value="eksik">Satınalma Gerekli</option>
                    <option value="yeterli">Stok Yeterli</option>
                  </select>
                  <span className="text-sm text-gray-500">{filteredSatinalma.length} kayıt</span>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 z-10">
                      <tr className="border-b border-gray-200">
                        <SortHeader label="Malzeme Kodu" sortKey="alt_kod" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Malzeme Adı" sortKey="alt_adi" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Cari</th>
                        <SortHeader label="Toplam İhtiyaç" sortKey="toplam_ihtiyac" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Çıkışlar" sortKey="projelere_cikislar" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Depo Stok" sortKey="depo_stok" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Ürt.Depo" sortKey="uretim_depo" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Açık Sip." sortKey="acik_siparisler" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Top.Satınalma" sortKey="toplam_satinalma" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Birim Fiyat" sortKey="birim_fiyat" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Gerçek Satınalma" sortKey="gercek_satinalma" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <SortHeader label="Alınması Gereken Tutar" sortKey="alinmasi_gereken_tutar" onSort={handleSatinalmaSort} currentSort={satinalmaSortConfig} />
                        <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSatinalma.map((row, i) => {
                        const eksik = (Number(row.gercek_satinalma) || 0) > 0;
                        return (
                          <tr
                            key={i}
                            className={`border-b border-gray-100 hover:bg-gray-50 ${eksik ? 'bg-red-50/50' : 'bg-green-50/30'}`}
                          >
                            <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.alt_kod}</td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={row.alt_adi}>{row.alt_adi}</td>
                            <td className="px-3 py-2 text-xs max-w-[150px] truncate text-gray-500" title={row.son_satinalma_cari}>{row.son_satinalma_cari}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.toplam_ihtiyac)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.projelere_cikislar)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.depo_stok)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.uretim_depo)}</td>
                            <td className="px-3 py-2 text-right">{formatNumber(row.acik_siparisler)}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatNumber(row.toplam_satinalma)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.birim_fiyat)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${eksik ? 'text-red-600' : 'text-green-600'}`}>
                              {formatNumber(row.gercek_satinalma)}
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold ${eksik ? 'text-red-700' : 'text-green-700'}`}>
                              {eksik ? formatCurrency(row.alinmasi_gereken_tutar) : '-'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {eksik ? (
                                <Badge color="red">Eksik</Badge>
                              ) : (
                                <Badge color="green">Yeterli</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredSatinalma.length === 0 && (
                        <tr><td colSpan={13} className="text-center text-gray-400 py-12">Veri bulunamadı</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
              )}

              {/* Tedarikçiye Göre Görünüm */}
              {satinalmaView === 'tedarikci' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={selectAllTedarikci}
                      className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      {selectedTedarikci.size === groupedByTedarikci.length && groupedByTedarikci.length > 0
                        ? <CheckSquare size={16} className="text-blue-600" />
                        : <Square size={16} className="text-gray-400" />
                      }
                      Tümünü Seç
                    </button>
                    {selectedTedarikci.size > 0 && (
                      <Badge color="blue">{selectedTedarikci.size} firma seçili</Badge>
                    )}
                    <span className="text-sm text-gray-500">
                      {groupedByTedarikci.length} tedarikçi · {groupedByTedarikci.reduce((s, g) => s + g.urun_sayisi, 0)} ürün
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedTedarikci.size > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => setOdemeOnayModal(true)}
                      >
                        <CreditCard size={14} /> Ödeme Onay Excel ({selectedTedarikci.size} firma)
                      </Button>
                    )}
                    <button
                      onClick={expandAllTedarikci}
                      className="text-xs text-blue-600 hover:text-blue-800 underline"
                    >
                      {expandedTedarikci.size === groupedByTedarikci.length ? 'Tümünü Kapat' : 'Tümünü Aç'}
                    </button>
                    <Button size="sm" variant="outline" onClick={handleYazdir} disabled={groupedByTedarikci.length === 0}>
                      <Printer size={14} /> Yazdır
                    </Button>
                  </div>
                </div>
                {groupedByTedarikci.map((group, gi) => {
                  const isExpanded = expandedTedarikci.has(group.cari);
                  const isSelected = selectedTedarikci.has(group.cari);
                  return (
                    <Card key={gi} className={isSelected ? 'ring-2 ring-emerald-400 ring-offset-1' : ''}>
                      <button
                        onClick={() => toggleTedarikci(group.cari)}
                        className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div
                          onClick={e => toggleSelectTedarikci(group.cari, e)}
                          className="shrink-0 p-0.5"
                        >
                          {isSelected
                            ? <CheckSquare size={18} className="text-emerald-600" />
                            : <Square size={18} className="text-gray-300 hover:text-gray-500" />
                          }
                        </div>
                        {isExpanded ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                        <Users size={16} className="text-blue-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate" title={group.cari}>{group.cari}</p>
                        </div>
                        <Badge color="blue">{group.urun_sayisi} ürün</Badge>
                        <span className="text-sm font-bold text-red-600 whitespace-nowrap ml-2">
                          {formatCurrency(group.toplam_tutar)}
                        </span>
                      </button>
                      {isExpanded && (
                        <div className="border-t">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Malzeme Kodu</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Malzeme Adı</th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Depo Stok</th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Açık Siparişler</th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Gerçek Satınalma</th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Birim Fiyat</th>
                                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Alınması Gereken Tutar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {group.urunler.map((row, ri) => (
                                  <tr key={ri} className="border-b border-gray-100 hover:bg-gray-50">
                                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.alt_kod}</td>
                                    <td className="px-3 py-2 max-w-[250px] truncate" title={row.alt_adi}>{row.alt_adi}</td>
                                    <td className="px-3 py-2 text-right text-blue-600">{formatNumber(row.depo_stok)}</td>
                                    <td className="px-3 py-2 text-right text-orange-600">{formatNumber(row.acik_siparisler)}</td>
                                    <td className="px-3 py-2 text-right text-red-600 font-medium">{formatNumber(row.gercek_satinalma)}</td>
                                    <td className="px-3 py-2 text-right">{formatCurrency(row.birim_fiyat)}</td>
                                    <td className="px-3 py-2 text-right font-semibold text-red-700">{formatCurrency(row.alinmasi_gereken_tutar)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-gray-50 font-semibold">
                                  <td className="px-3 py-2" colSpan={6}>Toplam</td>
                                  <td className="px-3 py-2 text-right text-red-700">{formatCurrency(group.toplam_tutar)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          <div className="p-3 bg-gray-50 border-t flex items-center gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-violet-300 text-violet-700 hover:bg-violet-50"
                              onClick={(e) => { e.stopPropagation(); setStokAraModal({ cari: group.cari }); }}
                            >
                              <Warehouse size={14} /> Ürün Ekle
                              {(stokEklenenler[group.cari]?.length > 0) && (
                                <Badge color="purple" className="ml-1">{stokEklenenler[group.cari].length}</Badge>
                              )}
                            </Button>
                            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openSiparisModal(group, 'mail'); }}>
                              <Mail size={14} /> Mail At
                            </Button>
                            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); openSiparisModal(group, 'pdf'); }}>
                              <FileDown size={14} /> PDF İndir
                            </Button>
                            <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={(e) => { e.stopPropagation(); openSiparisModal(group, 'siparis'); }}>
                              <ExternalLink size={14} /> Sipariş Aç
                            </Button>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
                {groupedByTedarikci.length === 0 && (
                  <Card className="p-8 text-center text-gray-400">Eksik ürün bulunamadı</Card>
                )}
              </div>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Stok Ara Modal */}
      {stokAraModal && <StokAraModalView />}

      {/* Sipariş Modal (Mail / PDF / Sipariş Aç) */}
      <Modal
        open={!!siparisModal}
        onClose={() => setSiparisModal(null)}
        title={`${siparisModal?.action === 'mail' ? 'Mail Gönder' : siparisModal?.action === 'siparis' ? 'Sipariş Aç (Logo)' : 'PDF İndir'} - ${siparisModal?.cari || ''}`}
        size="xl"
      >
        {siparisModal && (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              Adetleri düzenleyebilir, ürünleri dahil edip çıkarabilirsiniz.
            </p>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200">
                    <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-10">Dahil</th>
                    <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500 uppercase">Malzeme Kodu</th>
                    <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500 uppercase">Malzeme Adı</th>
                    <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500 uppercase w-36">Adet</th>
                    <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500 uppercase">Birim Fiyat</th>
                    <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  {siparisModal.urunler.map((u, i) => (
                    <tr key={i} className={`border-b border-gray-100 ${!u.dahil ? 'opacity-40' : ''}`}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={u.dahil}
                          onChange={() => toggleSiparisUrun(i)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">{u.alt_kod}</td>
                      <td className="px-2 py-2 max-w-[200px] truncate text-gray-700" title={u.alt_adi}>{u.alt_adi}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => updateSiparisAdet(i, u.adet - 1)}
                            disabled={!u.dahil}
                            className="p-1 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30"
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            value={u.adet}
                            onChange={e => updateSiparisAdet(i, e.target.value)}
                            disabled={!u.dahil}
                            className="w-16 text-center border border-gray-300 rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => updateSiparisAdet(i, u.adet + 1)}
                            disabled={!u.dahil}
                            className="p-1 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30"
                          >
                            <Plus size={14} />
                          </button>
                          {u.adet !== u.orijinal_adet && u.dahil && (
                            <button
                              onClick={() => updateSiparisAdet(i, u.orijinal_adet)}
                              className="text-xs text-blue-600 hover:underline ml-1"
                              title="Orijinal adete dön"
                            >
                              ↩
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600">{formatCurrency(u.birim_fiyat)}</td>
                      <td className="px-2 py-2 text-right font-medium">
                        {u.dahil ? formatCurrency(u.adet * u.birim_fiyat) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold border-t">
                    <td colSpan={3} className="px-2 py-2">
                      Toplam ({siparisModal.urunler.filter(u => u.dahil && u.adet > 0).length} ürün)
                    </td>
                    <td className="px-2 py-2 text-center">
                      {siparisModal.urunler.filter(u => u.dahil).reduce((s, u) => s + u.adet, 0)} adet
                    </td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right text-blue-700">
                      {formatCurrency(siparisModal.urunler.filter(u => u.dahil).reduce((s, u) => s + u.adet * u.birim_fiyat, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
              <Button variant="secondary" onClick={() => setSiparisModal(null)}>İptal</Button>
              {siparisModal.action === 'mail' ? (
                <Button variant="primary" onClick={handleMailAt}>
                  <Mail size={16} /> Mail Gönder
                </Button>
              ) : siparisModal.action === 'siparis' ? (
                <Button variant="primary" className="bg-green-600 hover:bg-green-700" onClick={handleSiparisAc}>
                  <ExternalLink size={16} /> Sipariş Aç
                </Button>
              ) : (
                <Button variant="primary" onClick={handlePdfIndir}>
                  <FileDown size={16} /> PDF İndir
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ═══ ÖDEME ONAY MODAL ═══ */}
      <Modal
        open={odemeOnayModal}
        onClose={() => setOdemeOnayModal(false)}
        title={`Ödeme Onay Listesi — ${selectedTedarikci.size} Firma Seçili`}
        size="xl"
      >
        {odemeOnayModal && (() => {
          const cariler = cariListesiQuery.data || [];
          const isLoading = cariListesiQuery.isLoading;
          const selectedGroups = groupedByTedarikci.filter(g => selectedTedarikci.has(g.cari));
          const genelToplamSiparis = selectedGroups.reduce((s, g) => s + g.toplam_tutar, 0);

          return (
            <div>
              <div className="flex items-start gap-3 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Aşağıdaki tablo seçilen firmaların cari bakiye bilgilerini Excel muhasebe kaydından çeker.
                  Tablo incelendikten sonra <strong>Excel İndir</strong> ile özeti ve malzeme detayını iki sayfa halinde kaydedebilirsiniz.
                  Excel üzerinde değişiklik yaparak Genel Müdür'e sunabilirsiniz.
                </p>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12"><Spinner /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-gray-300">
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">#</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-600 uppercase">Firma Adı</th>
                        <th className="text-left px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Cari Kodu</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Toplam Borç</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-red-600 uppercase whitespace-nowrap">Vadesi Gelen</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Vadesi Gelmeyen</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Son Ödeme Tarihi</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Son Ödeme</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Geçen Gün</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Ort. Vade</th>
                        <th className="text-right px-3 py-2.5 text-xs font-bold text-emerald-700 uppercase whitespace-nowrap">Bu Sipariş (TL)</th>
                        <th className="text-center px-3 py-2.5 text-xs font-bold text-gray-600 uppercase whitespace-nowrap">Ürün</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroups.map((group, idx) => {
                        const cari = findMatchingCari(group.cari, cariler);
                        const bakiyeAbs = cari?.bakiye != null ? Math.abs(cari.bakiye) : null;
                        const vadeliAbs = cari?.vadesiGelen != null ? Math.abs(cari.vadesiGelen) : null;
                        const vadesiGelmeyenAbs = cari?.vadesiGelmeyen != null ? Math.abs(cari.vadesiGelmeyen) : null;
                        return (
                          <tr key={idx} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
                            <td className="px-3 py-2.5 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-3 py-2.5 font-semibold text-gray-800 max-w-[200px]">
                              <div className="truncate" title={group.cari}>{group.cari}</div>
                              {!cari && cariler.length > 0 && (
                                <span className="text-xs text-amber-500 font-normal">⚠ Cari eşleşmedi</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                              {cari?.cariKodu || <span className="text-gray-300">—</span>}
                              {cari?.doviz && cari.doviz !== 'TL' && (
                                <Badge color="orange" className="ml-1">{cari.doviz}</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium text-gray-700">
                              {bakiyeAbs != null ? formatCurrency(bakiyeAbs) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-red-600">
                              {vadeliAbs != null && vadeliAbs > 0
                                ? formatCurrency(vadeliAbs)
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">
                              {vadesiGelmeyenAbs != null && vadesiGelmeyenAbs > 0
                                ? formatCurrency(vadesiGelmeyenAbs)
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600 whitespace-nowrap">
                              {cari?.sonOdemeTarih
                                ? new Date(cari.sonOdemeTarih).toLocaleDateString('tr-TR')
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-600">
                              {cari?.sonOdemeTutar != null
                                ? formatCurrency(cari.sonOdemeTutar)
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs">
                              {cari?.sonOdemeGun != null ? (
                                <span className={`font-medium ${cari.sonOdemeGun > 60 ? 'text-red-600' : cari.sonOdemeGun > 30 ? 'text-amber-600' : 'text-green-600'}`}>
                                  {cari.sonOdemeGun} gün
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-center text-xs text-gray-600">
                              {cari?.ortGun || cari?.vadeSuresi
                                ? `${cari.ortGun || cari.vadeSuresi} gün`
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right font-bold text-emerald-700">
                              {formatCurrency(group.toplam_tutar)}
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <Badge color="blue">{group.urun_sayisi}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td colSpan={10} className="px-3 py-2.5 text-right text-gray-700">Toplam Sipariş Tutarı:</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 text-base">{formatCurrency(genelToplamSiparis)}</td>
                        <td className="px-3 py-2.5 text-center text-gray-600">
                          {selectedGroups.reduce((s, g) => s + g.urun_sayisi, 0)} ürün
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {cariListesiQuery.isError && (
                <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-200">
                  ⚠ Cari bakiye verileri yüklenemedi: {cariListesiQuery.error?.response?.data?.error || cariListesiQuery.error?.message}
                </div>
              )}

              {!isLoading && cariler.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  {selectedGroups.filter(g => !findMatchingCari(g.cari, cariler)).length > 0 && (
                    <span className="text-amber-500">
                      ⚠ {selectedGroups.filter(g => !findMatchingCari(g.cari, cariler)).length} firma için cari kaydı eşleştirilemedi (isim farklılığı olabilir).
                    </span>
                  )}
                </p>
              )}

              <div className="flex justify-between items-center mt-5 pt-4 border-t gap-3">
                <Button variant="secondary" onClick={() => setOdemeOnayModal(false)}>Kapat</Button>
                <Button
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleOdemeOnayExcel}
                  disabled={isLoading}
                >
                  <FileDown size={16} /> Excel İndir ({selectedTedarikci.size} firma)
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
