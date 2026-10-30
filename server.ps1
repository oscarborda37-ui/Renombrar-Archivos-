# Servidor Web local ligero para Herramienta de Renombrado Masivo
# Levapan S.A. - Desarrollado en PowerShell nativo (.NET HttpListener)

param(
    [int]$Port = 4567
)

$baseDir = $PSScriptRoot
if (-not $baseDir) { $baseDir = Get-Location }

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $listener.Start()
} catch {
    Write-Host "[!] El puerto $Port ya esta en uso o requiere permisos. Intentando puerto 4568..." -ForegroundColor Yellow
    $Port = 4568
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Clear()
    $listener.Prefixes.Add("http://localhost:$Port/")
    $listener.Prefixes.Add("http://127.0.0.1:$Port/")
    $listener.Start()
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  HERRAMIENTA DE RENOMBRADO MASIVO ALFANUMERICO LEVAPAN  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Servidor local activo en: http://localhost:$Port/" -ForegroundColor White
Write-Host " Presiona Ctrl + C en esta ventana para detener el servidor." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Abrir automaticamente en Microsoft Edge o navegador predeterminado
Start-Process "http://localhost:$Port/"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".txt"  = "text/plain; charset=utf-8"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/" -or [string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "/index.html"
        }

        # Decodificar URL y normalizar ruta local
        $decodedPath = [System.Uri]::UnescapeDataString($urlPath).TrimStart('/')
        $decodedPath = $decodedPath -replace '/', '\'
        $filePath = Join-Path $baseDir $decodedPath

        # Control API simple para guardar/leer historial si se solicita
        if ($request.HttpMethod -eq "POST" -and $urlPath -eq "/api/guardar-historial") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $postBody = $reader.ReadToEnd()
            $reader.Close()
            $histPath = Join-Path $baseDir "historial_seriales.json"
            [System.IO.File]::WriteAllText($histPath, $postBody, [System.Text.Encoding]::UTF8)
            $respBytes = [System.Text.Encoding]::UTF8.GetBytes('{"success": true}')
            $response.ContentType = "application/json"
            $response.ContentLength64 = $respBytes.Length
            $response.OutputStream.Write($respBytes, 0, $respBytes.Length)
            $response.OutputStream.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = $mimeTypes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - Archivo no encontrado")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    } catch {
        # Evitar caida del bucle por desconexion abrupta del cliente
    }
}
