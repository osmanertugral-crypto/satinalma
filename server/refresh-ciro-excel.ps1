# refresh-ciro-excel.ps1
# Excel COM otomasyonu ile Power Query sorgularını yeniler ve dosyayı kaydeder.
# Çalıştırma: powershell -NoProfile -ExecutionPolicy Bypass -File refresh-ciro-excel.ps1 "C:\path\to\file.xlsx"

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath
)

if (-not (Test-Path $FilePath)) {
    Write-Error "Dosya bulunamadi: $FilePath"
    exit 1
}

$excel = $null
$workbook = $null

try {
    # Excel COM nesnesini oluştur (görünmez modda)
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $excel.ScreenUpdating = $false
    $excel.EnableEvents = $false

    Write-Host "Excel açılıyor: $FilePath"
    $workbook = $excel.Workbooks.Open($FilePath, 0, $false)

    # Tüm bağlantılarda arka plan yenilemeyi kapat (mümkün olan bağlantı tiplerinde)
    foreach ($conn in $workbook.Connections) {
        try {
            if ($conn.Type -eq 1) { # xlConnectionTypeOLEDB (Power Query dahil)
                $conn.OLEDBConnection.BackgroundQuery = $false
            } elseif ($conn.Type -eq 2) { # xlConnectionTypeODBC
                $conn.ODBCConnection.BackgroundQuery = $false
            }
        } catch {}
    }

    Write-Host "Bağlantılar tek tek yenileniyor (SQL Server senkron mod)..."
    $connCount = 0
    foreach ($conn in $workbook.Connections) {
        $connName = $conn.Name
        Write-Host "  -> Yenileniyor: $connName"
        try {
            # OLEDB (Power Query / SQL Server) bağlantısı
            if ($conn.Type -eq 1) {
                $conn.OLEDBConnection.BackgroundQuery = $false
                $conn.Refresh()
            }
            # ODBC bağlantısı
            elseif ($conn.Type -eq 2) {
                $conn.ODBCConnection.BackgroundQuery = $false
                $conn.Refresh()
            }
            # Diğer tipler (model bağlantıları vs.)
            else {
                try { $conn.Refresh() } catch {}
            }
            $connCount++
        } catch {
            Write-Warning "  !! $connName yenilenemedi: $_"
        }
    }

    # Pivot tabloları ayrıca yenile (kaynak verisi değiştikten sonra)
    Write-Host "Pivot tablolar yenileniyor..."
    foreach ($sheet in $workbook.Sheets) {
        foreach ($pt in $sheet.PivotTables()) {
            try {
                $pt.RefreshTable() | Out-Null
                Write-Host "  -> Pivot yenilendi: $($sheet.Name) / $($pt.Name)"
            } catch {
                Write-Warning "  !! Pivot yenilenemedi: $_"
            }
        }
    }

    Write-Host "$connCount bağlantı yenilendi."

    Write-Host "Dosya kaydediliyor..."
    $workbook.Save()
    Write-Host "Tamamlandı."
    exit 0

} catch {
    Write-Error "Hata: $_"
    exit 1

} finally {
    if ($workbook -ne $null) {
        try { $workbook.Close($false) } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) | Out-Null
    }
    if ($excel -ne $null) {
        try { $excel.Quit() } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
    }
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
