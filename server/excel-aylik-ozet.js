const XLSX = require('xlsx');
const ExcelJS = require('exceljs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '..', 'gecici', 'Ocak 2025-2026 Mart 30.xls');
const OUTPUT_FILE = path.join(__dirname, '..', 'gecici', 'Ocak 2025-2026 Mart 30 - AYLIK OZET DUZELTILMIS.xlsx');

const RAW_MATERIAL_GROUPS = new Set([
  'HAMMADDE',
  'HIRDAVAT',
  'KARAVAN EKIPMAN',
  'MEKANIK',
  '3D-BASKI',
  'BEDELSIZ',
  'CADIR',
  'DOSEME',
  'ELEKTRIK',
  'KARAVAN',
  'KIMYASAL',
  'MOBILYA',
  'YEDEK PARCA',
]);

const CATEGORY_ORDER = [
  'HAMMADDE',
  'E-TICARET',
  'ARGE',
  'NUMUNE',
  'MARKETING',
  'UYKU KAPSULU',
  'KABIN',
  'DIGER',
];

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/İ/g, 'I')
    .replace(/İ/g, 'I')
    .replace(/I/g, 'I')
    .replace(/Ş/g, 'S')
    .replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U')
    .replace(/Ö/g, 'O')
    .replace(/Ç/g, 'C')
    .replace(/ı/g, 'I')
    .replace(/i/g, 'I')
    .replace(/ş/g, 'S')
    .replace(/ğ/g, 'G')
    .replace(/ü/g, 'U')
    .replace(/ö/g, 'O')
    .replace(/ç/g, 'C')
    .replace(/\s+/g, ' ');
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function mapCategory(groupValue) {
  const group = normalizeText(groupValue);

  if (!group) {
    return 'DIGER';
  }

  if (RAW_MATERIAL_GROUPS.has(group)) {
    return 'HAMMADDE';
  }

  if (group === 'ETICARET' || group === 'E-TICARET') {
    return 'E-TICARET';
  }

  if (group === 'ARGE' || group === 'AR-GE') {
    return 'ARGE';
  }

  if (group === 'NUMUNE') {
    return 'NUMUNE';
  }

  if (group === 'MARKETING') {
    return 'MARKETING';
  }

  if (group === 'UYKU KAPSULU') {
    return 'UYKU KAPSULU';
  }

  if (group === 'KABIN') {
    return 'KABIN';
  }

  return 'DIGER';
}

function buildMonthKeys() {
  const monthKeys = [];
  for (let year = 2025; year <= 2026; year += 1) {
    const maxMonth = year === 2025 ? 12 : 3;
    for (let month = 1; month <= maxMonth; month += 1) {
      monthKeys.push(formatMonth(year, month));
    }
  }
  return monthKeys;
}

async function main() {
  console.log(`Kaynak okunuyor: ${INPUT_FILE}`);
  const workbook = XLSX.readFile(INPUT_FILE);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  const monthKeys = buildMonthKeys();
  const monthlyTotals = {};
  const mappingAudit = {};

  for (const monthKey of monthKeys) {
    monthlyTotals[monthKey] = {
      'HAMMADDE': 0,
      'E-TICARET': 0,
      'ARGE': 0,
      'NUMUNE': 0,
      'MARKETING': 0,
      'UYKU KAPSULU': 0,
      'KABIN': 0,
      'DIGER': 0,
      'IADE_TUTAR': 0,
      'GENEL_TOPLAM': 0,
    };
  }

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const year = toNumber(row[0]);
    const month = toNumber(row[1]);
    if (!year || !month) {
      continue;
    }

    const monthKey = formatMonth(year, month);
    if (!monthlyTotals[monthKey]) {
      continue;
    }

    const rawGroup = String(row[7] || '').trim();
    const normalizedGroup = normalizeText(rawGroup);
    const category = mapCategory(rawGroup);
    const purchaseAmount = toNumber(row[16]);
    const returnQuantity = toNumber(row[12]);

    if (returnQuantity !== 0) {
      monthlyTotals[monthKey].IADE_TUTAR += purchaseAmount;
      monthlyTotals[monthKey].GENEL_TOPLAM += purchaseAmount;
    } else {
      monthlyTotals[monthKey][category] += purchaseAmount;
      monthlyTotals[monthKey].GENEL_TOPLAM += purchaseAmount;
    }

    const auditKey = normalizedGroup || '(BOS)';
    if (!mappingAudit[auditKey]) {
      mappingAudit[auditKey] = {
        rawGroup,
        normalizedGroup: auditKey,
        category,
        rowCount: 0,
        amountTotal: 0,
        returnTotal: 0,
        excludedReturnAmount: 0,
      };
    }
    mappingAudit[auditKey].rowCount += 1;
    mappingAudit[auditKey].returnTotal += returnQuantity;
    if (returnQuantity !== 0) {
      mappingAudit[auditKey].excludedReturnAmount += purchaseAmount;
    } else {
      mappingAudit[auditKey].amountTotal += purchaseAmount;
    }
  }

  const output = new ExcelJS.Workbook();
  const summarySheet = output.addWorksheet('AYLIK_OZET');
  const mappingSheet = output.addWorksheet('GRUP_HARITASI');

  const summaryHeaders = [
    'AY',
    'HAMMADDE_Q_TOPLAM',
    'E-TICARET_Q_TOPLAM',
    'ARGE_Q_TOPLAM',
    'NUMUNE_Q_TOPLAM',
    'MARKETING_Q_TOPLAM',
    'UYKU KAPSULU_Q_TOPLAM',
    'KABIN_Q_TOPLAM',
    'DIGER_Q_TOPLAM',
    'IADE_Q_TOPLAM',
    'GENEL_TOPLAM_Q',
  ];

  summarySheet.addRow(summaryHeaders);
  for (const monthKey of monthKeys) {
    const totals = monthlyTotals[monthKey];
    summarySheet.addRow([
      monthKey,
      totals['HAMMADDE'],
      totals['E-TICARET'],
      totals['ARGE'],
      totals['NUMUNE'],
      totals['MARKETING'],
      totals['UYKU KAPSULU'],
      totals['KABIN'],
      totals['DIGER'],
      totals['IADE_TUTAR'],
      totals['GENEL_TOPLAM'],
    ]);
  }

  const totalRow = ['GENEL TOPLAM'];
  for (const key of ['HAMMADDE', 'E-TICARET', 'ARGE', 'NUMUNE', 'MARKETING', 'UYKU KAPSULU', 'KABIN', 'DIGER', 'IADE_TUTAR', 'GENEL_TOPLAM']) {
    totalRow.push(monthKeys.reduce((sum, monthKey) => sum + monthlyTotals[monthKey][key], 0));
  }
  summarySheet.addRow(totalRow);

  mappingSheet.addRow(['HAM_VERI_STOK_GRUP', 'NORMALIZE_STOK_GRUP', 'ESLESEN_BASLIK', 'SATIR_SAYISI', 'Q_TOPLAM_DAHIL', 'M_IADE_TOPLAM', 'IADE_SEBEBIYLE_DISLANAN_Q']);
  Object.values(mappingAudit)
    .sort((left, right) => (right.amountTotal + right.excludedReturnAmount) - (left.amountTotal + left.excludedReturnAmount))
    .forEach((item) => {
      mappingSheet.addRow([
        item.rawGroup || '(BOS)',
        item.normalizedGroup,
        item.category,
        item.rowCount,
        item.amountTotal,
        item.returnTotal,
        item.excludedReturnAmount,
      ]);
    });

  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(summarySheet.rowCount).font = { bold: true };
  mappingSheet.getRow(1).font = { bold: true };

  const currencyColumns = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  for (let rowIndex = 2; rowIndex <= summarySheet.rowCount; rowIndex += 1) {
    for (const columnIndex of currencyColumns) {
      summarySheet.getCell(rowIndex, columnIndex).numFmt = '#,##0.00';
    }
  }

  for (let rowIndex = 2; rowIndex <= mappingSheet.rowCount; rowIndex += 1) {
    mappingSheet.getCell(rowIndex, 5).numFmt = '#,##0.00';
    mappingSheet.getCell(rowIndex, 6).numFmt = '#,##0.00';
    mappingSheet.getCell(rowIndex, 7).numFmt = '#,##0.00';
  }

  summarySheet.columns = [
    { width: 12 },
    { width: 20 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 20 },
    { width: 24 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
  ];

  mappingSheet.columns = [
    { width: 24 },
    { width: 24 },
    { width: 18 },
    { width: 14 },
    { width: 18 },
    { width: 18 },
    { width: 24 },
  ];

  await output.xlsx.writeFile(OUTPUT_FILE);
  console.log(`Yazildi: ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});