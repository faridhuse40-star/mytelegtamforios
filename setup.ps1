# Локальный setup-скрипт для Windows. Запускать в PowerShell из корня репо:
#   powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Что делает:
#   1) Проверяет наличие Node 20+, Docker, JDK 17 (для Android)
#   2) Ставит npm-зависимости во всех workspace
#   3) Стартует Postgres + Redis + coturn в Docker
#   4) Прогоняет prisma migrate
#   5) Подсказывает следующие шаги

$ErrorActionPreference = "Stop"

function Step($msg) {
    Write-Host ""
    Write-Host ("==> " + $msg) -ForegroundColor Cyan
}
function Warn($msg) { Write-Host ("[!] " + $msg) -ForegroundColor Yellow }
function Ok($msg)   { Write-Host ("[OK] " + $msg) -ForegroundColor Green }
function Fail($msg) { Write-Host ("[FAIL] " + $msg) -ForegroundColor Red; exit 1 }

# ------------------- prerequisites -------------------
Step "Проверяю окружение"

# Node
try {
    $nodeVersion = (& node --version) -replace 'v', ''
    $major = [int]($nodeVersion.Split('.')[0])
    if ($major -lt 20) { Fail "Нужен Node 20+, найден v$nodeVersion" }
    Ok "Node v$nodeVersion"
} catch {
    Fail "Node.js не найден. Установи: https://nodejs.org/ (LTS 20+)"
}

# npm
try {
    $npmVersion = (& npm --version)
    Ok "npm v$npmVersion"
} catch {
    Fail "npm не найден"
}

# Docker (необязательно, но рекомендуется)
$dockerOk = $false
try {
    $null = & docker --version
    $dockerOk = $true
    Ok "Docker найден"
} catch {
    Warn "Docker не найден. Postgres/Redis/coturn нужно будет запустить руками."
}

# JDK (для локальной сборки Android)
try {
    $javaInfo = & java -version 2>&1 | Select-String -Pattern 'version'
    Ok "Java: $($javaInfo.Line.Trim())"
} catch {
    Warn "JDK не найден. Для локальной сборки Android нужен JDK 17 (https://adoptium.net/temurin/releases/?version=17)."
}

# ------------------- npm install -------------------
Step "Устанавливаю зависимости (npm install --legacy-peer-deps)"
npm install --legacy-peer-deps --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "npm install упал" }
Ok "Зависимости установлены"

# ------------------- shared build -------------------
Step "Собираю packages/shared"
npm run shared:build
if ($LASTEXITCODE -ne 0) { Fail "shared:build упал" }
Ok "Shared пакет собран"

# ------------------- docker -------------------
if ($dockerOk) {
    Step "Запускаю Postgres + Redis + coturn (docker compose up -d)"
    docker compose up -d postgres redis coturn
    if ($LASTEXITCODE -ne 0) { Fail "docker compose up упал" }
    Ok "Контейнеры запущены"

    # ждём, пока postgres станет healthy
    Step "Жду готовности Postgres"
    $tries = 0
    while ($tries -lt 30) {
        $health = (& docker inspect --format '{{.State.Health.Status}}' (docker compose ps -q postgres)) 2>$null
        if ($health -eq "healthy") { break }
        Start-Sleep -Seconds 1
        $tries++
    }
    if ($tries -ge 30) { Warn "Postgres не стал healthy за 30c — миграции могут упасть, попробуй ещё раз позже" }
    else { Ok "Postgres готов" }

    # ------------------- prisma -------------------
    if (-not (Test-Path "apps\api\.env")) {
        if (Test-Path "apps\api\.env.example") {
            Copy-Item "apps\api\.env.example" "apps\api\.env"
            Ok "Создан apps\api\.env из примера"
        } else {
            Warn "apps\api\.env.example не найден — создай apps\api\.env вручную"
        }
    }

    Step "Применяю Prisma миграции"
    npm run api:migrate
    if ($LASTEXITCODE -ne 0) { Warn "Миграции упали — проверь .env (DATABASE_URL должен указывать на postgres://messenger:messenger@localhost:5432/messenger)" }
    else { Ok "Миграции применены" }
}

# ------------------- summary -------------------
Step "Готово!"

Write-Host ""
Write-Host "Дальнейшие шаги:" -ForegroundColor White
Write-Host "  1. Запусти бэкенд:     " -NoNewline; Write-Host "npm run api:dev" -ForegroundColor Yellow
Write-Host "  2. Запусти Expo Go:    " -NoNewline; Write-Host "npm run mobile" -ForegroundColor Yellow
Write-Host "  3. Сборка APK/IPA:     см. " -NoNewline; Write-Host "BUILD.md" -ForegroundColor Yellow
Write-Host ""
Write-Host "Чтобы тестировать на физическом телефоне, перед npm run mobile:" -ForegroundColor White
Write-Host '  $env:EXPO_PUBLIC_API_URL = "http://<ip-твоего-компа>:4000"' -ForegroundColor DarkGray
Write-Host '  $env:EXPO_PUBLIC_SOCKET_URL = "http://<ip-твоего-компа>:4000"' -ForegroundColor DarkGray
Write-Host ""
