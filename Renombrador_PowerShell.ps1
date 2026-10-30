<#
.SYNOPSIS
    Herramienta de Renombrado Masivo Alfanumérico Nativa para Windows (Levapan S.A.)
.DESCRIPTION
    Permite renombrar archivos masivamente respetando secuencias alfanuméricas,
    detectando automáticamente el último consecutivo en la carpeta y guardando un
    historial para trazabilidad y reversión.
#>

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Renombrador Pro Alfanumérico - Levapan S.A."

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Show-Header {
    Clear-Host
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host "       HERRAMIENTA DE RENOMBRADO MASIVO ALFANUMÉRICO - LEVAPAN S.A.       " -ForegroundColor Green
    Write-Host "==========================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Select-FolderGUI {
    $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $folderDialog.Description = "Selecciona la carpeta que contiene los archivos a renombrar:"
    $folderDialog.ShowNewFolderButton = $false
    if ($folderDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $folderDialog.SelectedPath
    }
    return $null
}

function Increment-SmartNumeric([string]$seed, [int]$increment, [string]$minDigits = "auto") {
    if ($increment -eq 0) { return $seed }
    
    if ($seed -match '^(.*?)(\d+)([^\d]*)$') {
        $prefix = $matches[1]
        $digits = $matches[2]
        $suffix = $matches[3]

        $val = [int]$digits + $increment
        $padding = $digits.Length
        if ($minDigits -ne "auto" -and [int]::TryParse($minDigits, [ref]$null)) {
            $padding = [int]$minDigits
        }

        $formattedVal = $val.ToString().PadLeft($padding, '0')
        return "$prefix$formattedVal$suffix"
    } else {
        $pad = if ($minDigits -ne "auto") { [int]$minDigits } else { 4 }
        return "$seed-$((1 + $increment).ToString().PadLeft($pad, '0'))"
    }
}

function Detect-HighestSerial([string]$folderPath) {
    $files = Get-ChildItem -Path $folderPath -File
    $highestNum = -1
    $highestToken = ""
    $digitsLen = 4

    foreach ($f in $files) {
        $name = $f.Name
        $matchesList = [regex]::Matches($name, '([a-zA-Z0-9_\-]+?)[-_ ]?([0-9]{2,8})')
        foreach ($m in $matchesList) {
            $num = [int]$m.Groups[2].Value
            if ($num -gt $highestNum) {
                $highestNum = $num
                $highestToken = $m.Value
                $digitsLen = $m.Groups[2].Value.Length
            }
        }
    }

    if ($highestNum -ge 0) {
        $nextNum = ($highestNum + 1).ToString().PadLeft($digitsLen, '0')
        $nextToken = [regex]::Replace($highestToken, '[0-9]{2,8}$', $nextNum)
        return @{
            HighestToken = $highestToken
            NextToken = $nextToken
        }
    }
    return $null
}

# Bucle principal de la consola
do {
    $histFile = Join-Path $PSScriptRoot "historial_seriales.json"
    $lastSavedFolder = ""
    if (Test-Path $histFile) {
        try {
            $hData = Get-Content $histFile -Raw | ConvertFrom-Json
            if ($hData.ultimaCarpeta -and (Test-Path $hData.ultimaCarpeta)) {
                $lastSavedFolder = $hData.ultimaCarpeta
            }
        } catch {}
    }

    Show-Header
    Write-Host "Elige una opción:" -ForegroundColor Yellow
    if ($lastSavedFolder) {
        Write-Host " [U] Usar última carpeta recordada: $lastSavedFolder" -ForegroundColor Cyan
    }
    Write-Host " [1] Seleccionar carpeta y renombrar archivos en lote" -ForegroundColor White
    Write-Host " [2] Modo Centinela en Tiempo Real (Auto-renombrar nuevos archivos)" -ForegroundColor Green
    Write-Host " [3] Abrir Interfaz Web Moderna (Recomendado)" -ForegroundColor White
    Write-Host " [4] Ver Historial de Lotes / Revertir" -ForegroundColor White
    Write-Host " [5] Salir" -ForegroundColor Gray
    Write-Host ""
    $opcion = Read-Host "Opción (1-5 o U)"

    if ($opcion -eq "U" -or $opcion -eq "u") {
        if ($lastSavedFolder -and (Test-Path $lastSavedFolder)) {
            $folder = $lastSavedFolder
        } else {
            Write-Host "No hay carpeta previa guardada o no existe." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
            continue
        }
    } elseif ($opcion -eq "1") {
        Show-Header
        Write-Host "Abriendo selector de carpetas de Windows..." -ForegroundColor Cyan
        $folder = Select-FolderGUI
        if (-not $folder -or -not (Test-Path $folder)) {
            Write-Host "No se seleccionó ninguna carpeta válida." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
            continue
        }
    }

    if ($opcion -eq "1" -or $opcion -eq "U" -or $opcion -eq "u") {
        Write-Host "Carpeta en uso: $folder" -ForegroundColor Green

        # Guardar como última carpeta recordada
        if (Test-Path $histFile) {
            try {
                $hData = Get-Content $histFile -Raw | ConvertFrom-Json
                $hData | Add-Member -NotePropertyName "ultimaCarpeta" -NotePropertyValue $folder -Force
                $hData | ConvertTo-Json -Depth 5 | Set-Content -Path $histFile -Encoding UTF8
            } catch {}
        }

        # Detectar seriales existentes
        $detected = Detect-HighestSerial $folder
        $defaultSerial = "LEV-0001"
        if ($detected) {
            Write-Host ""
            Write-Host " [!] DETECCIÓN INTELIGENTE:" -ForegroundColor Magenta
            Write-Host "     Mayor serial encontrado: $($detected.HighestToken)" -ForegroundColor White
            Write-Host "     Siguiente consecutivo sugerido: $($detected.NextToken)" -ForegroundColor Cyan
            $defaultSerial = $detected.NextToken
        }

        Write-Host ""
        $serialInput = Read-Host "Ingresa el serial inicial (Presiona Enter para '$defaultSerial')"
        if ([string]::IsNullOrWhiteSpace($serialInput)) { $serialInput = $defaultSerial }

        $patronInput = Read-Host "Ingresa el patrón de nombre (Enter para '{SERIAL}_{ORIGINAL}')"
        if ([string]::IsNullOrWhiteSpace($patronInput)) { $patronInput = "{SERIAL}_{ORIGINAL}" }

        $filtroExt = Read-Host "Filtro de extensión (ej: *.pdf, *.xlsx o Enter para todos)"
        if ([string]::IsNullOrWhiteSpace($filtroExt)) { $filtroExt = "*.*" }

        $archivos = Get-ChildItem -Path $folder -Filter $filtroExt -File | Sort-Object Name
        if ($archivos.Count -eq 0) {
            Write-Host "No se encontraron archivos que coincidan con el filtro en la carpeta." -ForegroundColor Yellow
            Read-Host "Presiona Enter para continuar..."
            continue
        }

        # Generar vista previa
        Write-Host ""
        Write-Host "========================== VISTA PREVIA ==========================" -ForegroundColor Cyan
        $plan = @()
        $idx = 0
        foreach ($item in $archivos) {
            $serialActual = Increment-SmartNumeric $serialInput $idx
            $base = [System.IO.Path]::GetFileNameWithoutExtension($item.Name)
            $ext = $item.Extension
            $nuevoNombre = $patronInput -replace '\{SERIAL\}', $serialActual
            $nuevoNombre = $nuevoNombre -replace '\{ORIGINAL\}', $base
            $nuevoNombre = $nuevoNombre -replace '\{EXT\}', $ext
            $nuevoNombre = $nuevoNombre -replace '\{FECHA\}', (Get-Date -Format "yyyy-MM-dd")
            $nuevoNombre = $nuevoNombre -replace '\s+', '_'
            foreach ($invalidChar in [System.IO.Path]::GetInvalidFileNameChars()) {
                $nuevoNombre = $nuevoNombre.Replace($invalidChar, [char]'-')
            }
            if (-not $nuevoNombre.ToLower().EndsWith($ext.ToLower())) { $nuevoNombre += $ext }

            $plan += [PSCustomObject]@{
                Original = $item.Name
                Nuevo = $nuevoNombre
                Serial = $serialActual
                FullPath = $item.FullName
                NewFullPath = Join-Path $folder $nuevoNombre
            }
            if ($idx -lt 15) {
                Write-Host " $($item.Name)  -->  $nuevoNombre" -ForegroundColor Gray
            }
            $idx++
        }
        if ($archivos.Count -gt 15) {
            Write-Host " ... y $($archivos.Count - 15) archivos más." -ForegroundColor DarkGray
        }
        Write-Host "==================================================================" -ForegroundColor Cyan
        Write-Host "Total de archivos a renombrar: $($archivos.Count)" -ForegroundColor White
        Write-Host ""

        $confirm = Read-Host "¿Confirmas renombrar estos $($archivos.Count) archivos ahora? (S/N)"
        if ($confirm -eq "S" -or $confirm -eq "s") {
            $renombrados = 0
            $historialItems = @()

            foreach ($p in $plan) {
                try {
                    if ($p.FullPath -ne $p.NewFullPath) {
                        Rename-Item -Path $p.FullPath -NewName $p.Nuevo -ErrorAction Stop
                    }
                    $renombrados++
                    $historialItems += @{
                        originalName = $p.Original
                        newName = $p.Nuevo
                        serial = $p.Serial
                    }
                } catch {
                    Write-Host "Error al renombrar $($p.Original): $_" -ForegroundColor Red
                }
            }

            # Guardar en archivo historial_seriales.json
            $histData = @{ lotes = @() }
            if (Test-Path $histFile) {
                try { $histData = Get-Content $histFile -Raw | ConvertFrom-Json } catch {}
            }

            $nuevoLote = @{
                id = "batch-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
                folderName = $folder
                count = $renombrados
                startSerial = $plan[0].Serial
                endSerial = $plan[-1].Serial
                items = $historialItems
                reverted = $false
            }

            if (-not $histData.lotes) { $histData.lotes = @() }
            $histData.lotes = @($nuevoLote) + @($histData.lotes)
            $histData.ultimoSerialGlobal = Increment-SmartNumeric $plan[-1].Serial 1
            $histData.ultimaCarpeta = $folder
            $histData | ConvertTo-Json -Depth 5 | Set-Content -Path $histFile -Encoding UTF8

            Write-Host ""
            Write-Host "[OK] ¡Se renombraron $renombrados archivos exitosamente!" -ForegroundColor Green
            Write-Host "Próximo consecutivo guardado: $($histData.ultimoSerialGlobal)" -ForegroundColor Cyan
        } else {
            Write-Host "Operación cancelada por el usuario." -ForegroundColor Yellow
        }
        Read-Host "Presiona Enter para volver al menú..."
    } elseif ($opcion -eq "2") {
        # MODO CENTINELA EN TIEMPO REAL
        Show-Header
        Write-Host "MODO CENTINELA EN TIEMPO REAL (AUTO-RENOMBRADO)" -ForegroundColor Green
        Write-Host "Vigila la carpeta y renombra automáticamente cualquier nuevo archivo que se agregue." -ForegroundColor Gray
        Write-Host ""
        
        $watchFolder = ""
        if ($lastSavedFolder -and (Test-Path $lastSavedFolder)) {
            $usarPrev = Read-Host "¿Deseas vigilar la carpeta recordada '$lastSavedFolder'? (S/N)"
            if ($usarPrev -eq "S" -or $usarPrev -eq "s" -or [string]::IsNullOrWhiteSpace($usarPrev)) {
                $watchFolder = $lastSavedFolder
            }
        }
        if (-not $watchFolder) {
            $watchFolder = Select-FolderGUI
        }
        if (-not $watchFolder -or -not (Test-Path $watchFolder)) {
            Write-Host "Carpeta no válida seleccionada." -ForegroundColor Yellow
            Start-Sleep -Seconds 2
            continue
        }

        # Guardar como última carpeta
        if (Test-Path $histFile) {
            try {
                $hData = Get-Content $histFile -Raw | ConvertFrom-Json
                $hData | Add-Member -NotePropertyName "ultimaCarpeta" -NotePropertyValue $watchFolder -Force
                $hData | ConvertTo-Json -Depth 5 | Set-Content -Path $histFile -Encoding UTF8
            } catch {}
        }

        # Detectar consecutivo inicial
        $detected = Detect-HighestSerial $watchFolder
        $defSerial = if ($detected) { $detected.NextToken } else { "LEV-0001" }
        $currentWatcherSerial = Read-Host "Serial inicial para los nuevos archivos (Enter para '$defSerial')"
        if ([string]::IsNullOrWhiteSpace($currentWatcherSerial)) { $currentWatcherSerial = $defSerial }

        $patronWatcher = Read-Host "Patrón para nuevos archivos (Enter para '{SERIAL}_{ORIGINAL}')"
        if ([string]::IsNullOrWhiteSpace($patronWatcher)) { $patronWatcher = "{SERIAL}_{ORIGINAL}" }

        Write-Host ""
        Write-Host "==========================================================================" -ForegroundColor Cyan
        Write-Host " [CENTINELA ACTIVO] Vigilando: $watchFolder" -ForegroundColor Green
        Write-Host " Consecutivo actual: $currentWatcherSerial | Patrón: $patronWatcher" -ForegroundColor White
        Write-Host " Copia o arrastra cualquier archivo a la carpeta para ver el auto-renombrado." -ForegroundColor Yellow
        Write-Host " Presiona 'Q' + Enter para detener el Centinela y volver al menú." -ForegroundColor Gray
        Write-Host "==========================================================================" -ForegroundColor Cyan

        $knownWatcherFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
        Get-ChildItem -Path $watchFolder -File | ForEach-Object { [void]$knownWatcherFiles.Add($_.Name) }

        $watcherRunning = $true
        $script:serialCounter = $currentWatcherSerial

        # Bucle de sondeo ligero y seguro
        while ($watcherRunning) {
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                if ($key.Key -eq [ConsoleKey]::Q) {
                    Write-Host ""
                    Write-Host "Deteniendo Centinela..." -ForegroundColor Yellow
                    break
                }
            }

            $currentFiles = Get-ChildItem -Path $watchFolder -File
            foreach ($file in $currentFiles) {
                if (-not $knownWatcherFiles.Contains($file.Name)) {
                    [void]$knownWatcherFiles.Add($file.Name)
                    Start-Sleep -Milliseconds 400

                    $base = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
                    $ext = $file.Extension
                    $assignedSerial = $script:serialCounter
                    $newName = $patronWatcher -replace '\{SERIAL\}', $assignedSerial
                    $newName = $newName -replace '\{ORIGINAL\}', $base
                    $newName = $newName -replace '\{EXT\}', $ext
                    $newName = $newName -replace '\{FECHA\}', (Get-Date -Format "yyyy-MM-dd")
                    $newName = $newName -replace '\s+', '_'
                    foreach ($invalidChar in [System.IO.Path]::GetInvalidFileNameChars()) {
                        $newName = $newName.Replace($invalidChar, [char]'-')
                    }
                    if (-not $newName.ToLower().EndsWith($ext.ToLower())) { $newName += $ext }

                    try {
                        Rename-Item -Path $file.FullName -NewName $newName -ErrorAction Stop
                        [void]$knownWatcherFiles.Add($newName)
                        $script:serialCounter = Increment-SmartNumeric $script:serialCounter 1
                        
                        Write-Host "[+] AUTO-RENOMBRADO: '$($file.Name)' --> '$newName' (Serial: $assignedSerial)" -ForegroundColor Green

                        # Actualizar archivo historial
                        if (Test-Path $histFile) {
                            try {
                                $hData = Get-Content $histFile -Raw | ConvertFrom-Json
                                $hData.ultimoSerialGlobal = $script:serialCounter
                                $hData | ConvertTo-Json -Depth 5 | Set-Content -Path $histFile -Encoding UTF8
                            } catch {}
                        }
                    } catch {
                        Write-Host "[!] Error al auto-renombrar '$($file.Name)': $_" -ForegroundColor Red
                    }
                }
            }
            Start-Sleep -Milliseconds 1500
        }
        Read-Host "Centinela detenido. Presiona Enter para continuar..."
    } elseif ($opcion -eq "3") {
        Write-Host "Iniciando servidor web y abriendo interfaz..." -ForegroundColor Cyan
        Start-Process "$PSScriptRoot\Iniciar_Herramienta.bat"
        Start-Sleep -Seconds 2
    } elseif ($opcion -eq "4") {
        Show-Header
        if (Test-Path $histFile) {
            $histData = Get-Content $histFile -Raw | ConvertFrom-Json
            if ($histData.lotes -and $histData.lotes.Count -gt 0) {
                Write-Host "Lotes de renombramiento registrados:" -ForegroundColor Cyan
                $i = 1
                foreach ($lote in $histData.lotes) {
                    $revText = if ($lote.reverted) { "[REVERTIDO]" } else { "[ACTIVO]" }
                    Write-Host " [$i] $revText Fecha: $($lote.timestamp) | Carpeta: $($lote.folderName) | Cant: $($lote.count) | Seriales: $($lote.startSerial) a $($lote.endSerial)"
                    $i++
                }
            } else {
                Write-Host "No hay lotes en el historial aún." -ForegroundColor Yellow
            }
        } else {
            Write-Host "No existe archivo de historial aún." -ForegroundColor Yellow
        }
        Read-Host "Presiona Enter para volver al menú..."
    } elseif ($opcion -eq "5") {
        break
    }
} while ($true)
