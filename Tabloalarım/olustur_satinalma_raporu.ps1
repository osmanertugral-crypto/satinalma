$ErrorActionPreference = 'Stop'

function To-Double($v) {
    if ($null -eq $v -or $v -eq '') { return $null }
    if ($v -is [double] -or $v -is [float] -or $v -is [decimal] -or $v -is [int] -or $v -is [long]) {
        return [double]$v
    }

    $s = [string]$v
    $s = $s.Trim()
    if ($s -eq '' -or $s -eq '#####' -or $s -eq '######') { return $null }

    $s = $s -replace '\.', ''
    $s = $s -replace ',', '.'

    $out = 0.0
    if ([double]::TryParse($s, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$out)) {
        return $out
    }
    return $null
}

function To-Date($v) {
    if ($null -eq $v -or $v -eq '') { return $null }

    if ($v -is [double] -or $v -is [float] -or $v -is [decimal] -or $v -is [int] -or $v -is [long]) {
        return [DateTime]::FromOADate([double]$v)
    }

    $s = [string]$v
    $s = $s.Trim()
    if ($s -eq '' -or $s -eq '#####') { return $null }

    $cultures = @('tr-TR', 'en-US')
    foreach ($c in $cultures) {
        $ci = [System.Globalization.CultureInfo]::GetCultureInfo($c)
        $dt = [DateTime]::MinValue
        if ([DateTime]::TryParse($s, $ci, [System.Globalization.DateTimeStyles]::None, [ref]$dt)) {
            return $dt
        }
    }
    return $null
}

function Normalize-TextKey($s) {
    if ($null -eq $s) { return '' }
    $u = [string]$s
    $u = $u.Trim().ToUpperInvariant()

    $map = @{
        'İ' = 'I'
        'Ğ' = 'G'
        'Ü' = 'U'
        'Ş' = 'S'
        'Ö' = 'O'
        'Ç' = 'C'
    }

    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $u.ToCharArray()) {
        $cs = [string]$ch
        if ($map.ContainsKey($cs)) {
            [void]$sb.Append($map[$cs])
        } else {
            [void]$sb.Append($cs)
        }
    }

    $out = $sb.ToString()
    $out = [System.Text.RegularExpressions.Regex]::Replace($out, '\s+', ' ')
    return $out.Trim()
}

function Pick-Middle($items) {
    if ($null -eq $items -or $items.Count -eq 0) { return $null }
    $idx = [int][Math]::Floor(($items.Count - 1) / 2)
    return $items[$idx]
}

function Safe-Pct($base, $new) {
    if ($null -eq $base -or $base -eq 0 -or $null -eq $new) { return $null }
    return (($new - $base) / $base) * 100.0
}

$cwd = Get-Location
$inputFile = Join-Path $cwd '25-26.XLSX'
if (-not (Test-Path $inputFile)) {
    throw 'Girdi dosyasi bulunamadi: 25-26.XLSX'
}

$today = Get-Date
$reportDate = Get-Date -Year $today.Year -Month $today.Month -Day $today.Day
$startDate = Get-Date '2025-01-01'

$periodStart = (Get-Date -Year $reportDate.Year -Month $reportDate.Month -Day 1).AddMonths(-14)
$periodEnd = $reportDate
$periodDays = [Math]::Max(1, ($periodEnd - $periodStart).TotalDays)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$wb = $excel.Workbooks.Open($inputFile)
$ws = $wb.Worksheets.Item(1)
$used = $ws.UsedRange
$rows = $used.Rows.Count
$cols = $used.Columns.Count

$headerRow = 2

$headers = @{}
for ($c = 1; $c -le $cols; $c++) {
    $h = [string]$ws.Cells.Item($headerRow, $c).Value2
    if ($null -eq $h) { $h = '' }
    $h = $h.Trim()
    if ($h -ne '') {
        $headers[$h] = $c
    }
}

$required = @('TARIH', 'STOK_KODU', 'STOK_ADI', 'STOK_GRUP', 'MIKTAR', 'FIYAT', 'TUTAR')
foreach ($k in $required) {
    if (-not $headers.ContainsKey($k)) {
        $wb.Close($false)
        $excel.Quit()
        throw "Zorunlu sutun bulunamadi: $k"
    }
}

$records = New-Object System.Collections.Generic.List[object]

for ($r = $headerRow + 1; $r -le $rows; $r++) {
    $stokKodu = [string]$ws.Cells.Item($r, $headers['STOK_KODU']).Value2
    if ([string]::IsNullOrWhiteSpace($stokKodu)) { continue }

    $dt = To-Date($ws.Cells.Item($r, $headers['TARIH']).Value2)
    if ($null -eq $dt) { continue }
    if ($dt -lt $startDate -or $dt -gt $reportDate) { continue }

    $stokAdi = [string]$ws.Cells.Item($r, $headers['STOK_ADI']).Value2
    $stokGrup = [string]$ws.Cells.Item($r, $headers['STOK_GRUP']).Value2
    $miktar = To-Double($ws.Cells.Item($r, $headers['MIKTAR']).Value2)
    $fiyat = To-Double($ws.Cells.Item($r, $headers['FIYAT']).Value2)
    $tutar = To-Double($ws.Cells.Item($r, $headers['TUTAR']).Value2)

    if ($null -eq $miktar) { $miktar = 0.0 }
    if ($null -eq $tutar) { $tutar = 0.0 }

    if ($null -eq $fiyat -or $fiyat -eq 0) {
        if ($miktar -ne 0 -and $tutar -ne 0) {
            $fiyat = $tutar / $miktar
        }
    }

    $obj = [PSCustomObject]@{
        Tarih = $dt.Date
        StokKodu = $stokKodu.Trim()
        StokAdi = if ($stokAdi) { $stokAdi.Trim() } else { '' }
        StokGrupOrj = if ($stokGrup) { $stokGrup.Trim() } else { '' }
        StokGrupNormKey = Normalize-TextKey($stokGrup)
        Miktar = [double]$miktar
        Fiyat = if ($null -ne $fiyat) { [double]$fiyat } else { $null }
        Tutar = [double]$tutar
    }

    $records.Add($obj)
}

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($used) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($ws) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

if ($records.Count -eq 0) {
    throw 'Filtre sonrasi kayit kalmadi (2025-01-01 ile bugun arasi).'
}

$groupNames = @{}
foreach ($g in ($records | Group-Object StokGrupNormKey)) {
    $name = ($g.Group | Where-Object { -not [string]::IsNullOrWhiteSpace($_.StokGrupOrj) } | Group-Object StokGrupOrj | Sort-Object Count -Descending | Select-Object -First 1 -ExpandProperty Name)
    if (-not $name) { $name = 'TANIMSIZ' }
    $groupNames[$g.Name] = $name
}

$byProduct = $records | Group-Object StokKodu
$output = New-Object System.Collections.Generic.List[object]

foreach ($p in $byProduct) {
    $items = $p.Group | Sort-Object Tarih
    $n = $items.Count
    $first = $items[0]
    $mid = Pick-Middle $items
    $last = $items[$n - 1]

    $sumQty = ($items | Measure-Object -Property Miktar -Sum).Sum
    $sumAmt = ($items | Measure-Object -Property Tutar -Sum).Sum
    $avgPrice = if ($sumQty -ne 0) { $sumAmt / $sumQty } else { $null }
    $avgQtyPerOrder = if ($n -ne 0) { $sumQty / $n } else { $null }

    $gaps = New-Object System.Collections.Generic.List[double]
    for ($i = 1; $i -lt $n; $i++) {
        $d = ($items[$i].Tarih - $items[$i-1].Tarih).TotalDays
        if ($d -ge 0) { $gaps.Add([double]$d) }
    }
    $avgDays = if ($gaps.Count -gt 0) { ($gaps | Measure-Object -Average).Average } else { $null }

    $priceVals = @($items | Where-Object { $null -ne $_.Fiyat -and $_.Fiyat -gt 0 } | Select-Object -ExpandProperty Fiyat)
    $volPct = $null
    if ($priceVals.Count -ge 2) {
        $mean = ($priceVals | Measure-Object -Average).Average
        $std = [Math]::Sqrt((($priceVals | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Sum).Sum) / $priceVals.Count)
        if ($mean -ne 0) { $volPct = ($std / $mean) * 100.0 }
    }

    $sub15 = @($items | Where-Object { $_.Tarih -ge $periodStart -and $_.Tarih -le $periodEnd })
    $n15 = $sub15.Count
    $sumQty15 = if ($n15 -gt 0) { ($sub15 | Measure-Object -Property Miktar -Sum).Sum } else { 0 }
    $sumAmt15 = if ($n15 -gt 0) { ($sub15 | Measure-Object -Property Tutar -Sum).Sum } else { 0 }
    $avgPrice15 = if ($sumQty15 -ne 0) { $sumAmt15 / $sumQty15 } else { $null }

    $f15 = $null; $m15 = $null; $l15 = $null
    if ($n15 -gt 0) {
        $sub15 = $sub15 | Sort-Object Tarih
        $f15 = $sub15[0]
        $m15 = Pick-Middle $sub15
        $l15 = $sub15[$n15 - 1]
    }

    $gaps15 = New-Object System.Collections.Generic.List[double]
    if ($n15 -gt 1) {
        for ($j = 1; $j -lt $n15; $j++) {
            $d2 = ($sub15[$j].Tarih - $sub15[$j-1].Tarih).TotalDays
            if ($d2 -ge 0) { $gaps15.Add([double]$d2) }
        }
    }
    $avgDays15 = if ($gaps15.Count -gt 0) { ($gaps15 | Measure-Object -Average).Average } else { $null }

    $daysFromLast = ($reportDate - $last.Tarih).TotalDays

    $usage = if (($daysFromLast -le 120) -or (($n -ge 3) -and ($avgDays -ne $null) -and ($avgDays -le 120))) { 'Evet' } else { 'Hayir' }

    $turnoverMonthly = if ($periodDays -gt 0) { ($sumQty15 / $periodDays) * 30.0 } else { $null }

    $groupKey = $first.StokGrupNormKey
    $groupFinal = if ($groupNames.ContainsKey($groupKey)) { $groupNames[$groupKey] } else { $first.StokGrupOrj }

    $output.Add([PSCustomObject]@{
        Stok_Kodu = $first.StokKodu
        Stok_Adi = $first.StokAdi
        Stok_Grubu_Normalize = $groupFinal

        Alis_Sayisi_2025_2026 = $n
        Toplam_Adet_2025_2026 = [Math]::Round($sumQty, 2)
        Toplam_Tutar_2025_2026 = [Math]::Round($sumAmt, 2)
        Ortalama_Fiyat_2025_2026 = if ($avgPrice -ne $null) { [Math]::Round($avgPrice, 4) } else { $null }

        Ilk_Alis_Tarih = $first.Tarih.ToString('yyyy-MM-dd')
        Ilk_Alis_Fiyat = if ($first.Fiyat -ne $null) { [Math]::Round($first.Fiyat, 4) } else { $null }

        Orta_Alis_Tarih = if ($mid -ne $null) { $mid.Tarih.ToString('yyyy-MM-dd') } else { $null }
        Orta_Alis_Fiyat = if ($mid -ne $null -and $mid.Fiyat -ne $null) { [Math]::Round($mid.Fiyat, 4) } else { $null }

        Son_Alis_Tarih = $last.Tarih.ToString('yyyy-MM-dd')
        Son_Alis_Fiyat = if ($last.Fiyat -ne $null) { [Math]::Round($last.Fiyat, 4) } else { $null }

        Artis_Yuzde_Ilk_Orta = [Math]::Round((Safe-Pct $first.Fiyat $mid.Fiyat), 2)
        Artis_Yuzde_Orta_Son = [Math]::Round((Safe-Pct $mid.Fiyat $last.Fiyat), 2)
        Artis_Yuzde_Ilk_Son = [Math]::Round((Safe-Pct $first.Fiyat $last.Fiyat), 2)

        Ortalama_Alim_Araligi_Gun = if ($avgDays -ne $null) { [Math]::Round($avgDays, 1) } else { $null }
        Ortalama_Adet_Alim_Basina = if ($avgQtyPerOrder -ne $null) { [Math]::Round($avgQtyPerOrder, 2) } else { $null }

        Alis_Sayisi_15Ay = $n15
        Toplam_Adet_15Ay = [Math]::Round($sumQty15, 2)
        Toplam_Tutar_15Ay = [Math]::Round($sumAmt15, 2)
        Ortalama_Fiyat_15Ay = if ($avgPrice15 -ne $null) { [Math]::Round($avgPrice15, 4) } else { $null }

        Ilk_Alis_15Ay_Tarih = if ($f15) { $f15.Tarih.ToString('yyyy-MM-dd') } else { $null }
        Ilk_Alis_15Ay_Fiyat = if ($f15 -and $f15.Fiyat -ne $null) { [Math]::Round($f15.Fiyat, 4) } else { $null }
        Orta_Alis_15Ay_Tarih = if ($m15) { $m15.Tarih.ToString('yyyy-MM-dd') } else { $null }
        Orta_Alis_15Ay_Fiyat = if ($m15 -and $m15.Fiyat -ne $null) { [Math]::Round($m15.Fiyat, 4) } else { $null }
        Son_Alis_15Ay_Tarih = if ($l15) { $l15.Tarih.ToString('yyyy-MM-dd') } else { $null }
        Son_Alis_15Ay_Fiyat = if ($l15 -and $l15.Fiyat -ne $null) { [Math]::Round($l15.Fiyat, 4) } else { $null }

        Artis_Yuzde_Ilk_Orta_15Ay = if ($f15 -and $m15) { [Math]::Round((Safe-Pct $f15.Fiyat $m15.Fiyat), 2) } else { $null }
        Artis_Yuzde_Ilk_Son_15Ay = if ($f15 -and $l15) { [Math]::Round((Safe-Pct $f15.Fiyat $l15.Fiyat), 2) } else { $null }
        Ortalama_Alim_Araligi_Gun_15Ay = if ($avgDays15 -ne $null) { [Math]::Round($avgDays15, 1) } else { $null }

        Tahmini_Stok_Devir_Hizi_Aylik_Adet = if ($turnoverMonthly -ne $null) { [Math]::Round($turnoverMonthly, 2) } else { $null }
        Son_Alimdan_Beri_Gun = [Math]::Round($daysFromLast, 0)
        Fiyat_Oynakligi_Yuzde = if ($volPct -ne $null) { [Math]::Round($volPct, 2) } else { $null }

        Kullaniliyor_Mu = $usage
    })
}

$final = $output | Sort-Object Toplam_Tutar_15Ay -Descending

$csvPath = Join-Path $cwd 'Satinalma_Analiz_Raporu_2025_2026.csv'
$xlsxPath = Join-Path $cwd 'Satinalma_Analiz_Raporu_2025_2026.xlsx'
$notePath = Join-Path $cwd 'Rapor_Notlari.txt'

$final | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

$excelOut = New-Object -ComObject Excel.Application
$excelOut.Visible = $false
$excelOut.DisplayAlerts = $false
$wbOut = $excelOut.Workbooks.Open($csvPath)
$wsOut = $wbOut.Worksheets.Item(1)
$wsOut.Name = 'Analiz'
$wsOut.Rows.Item(1).Font.Bold = $true
$wsOut.Rows.Item(1).Interior.ColorIndex = 15
$wsOut.Columns.AutoFit() | Out-Null

$wbOut.SaveAs($xlsxPath, 51)
$wbOut.Close($true)
$excelOut.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wsOut) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wbOut) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excelOut) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

@(
    'Satinalma analiz raporu olusturuldu.',
    "Kayit sayisi (urun): $($final.Count)",
    "Kaynak dosya: $inputFile",
    "CSV cikti: $csvPath",
    "XLSX cikti: $xlsxPath",
    "15 aylik pencere: $($periodStart.ToString('yyyy-MM-dd')) - $($periodEnd.ToString('yyyy-MM-dd'))",
    'Kullaniliyor_Mu: Son alim <=120 gun veya sik alim yapan urunler Evet olarak siniflandi.'
) | Set-Content -Path $notePath -Encoding UTF8

Write-Output "Tamamlandi. Urun sayisi: $($final.Count)"
Write-Output "Cikti: $xlsxPath"
