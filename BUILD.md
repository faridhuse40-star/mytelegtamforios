# Сборка APK и IPA через GitHub Actions

В репо настроены три workflow:

| Файл | Что делает |
|---|---|
| `.github/workflows/build-android.yml` | Собирает **Android APK** (release, авто-подпись debug-keystore — APK сразу устанавливается) |
| `.github/workflows/build-ios.yml` | Собирает **unsigned iOS IPA** на macOS-runner (для sideload через Sideloadly/AltStore) |
| `.github/workflows/build-eas.yml` | Альтернативная облачная сборка через **Expo EAS** (нужен `EXPO_TOKEN` в Secrets) |

## 1. Перед первым запуском

### a) Запушить код в GitHub

```powershell
git init
git add -A
git commit -m "init: messenger monorepo"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### b) Указать API URL (адрес бэкенда) — обязательно для реального устройства

В GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable**:

- **Name**: `API_URL`
- **Value**: `https://api.example.com` (адрес, по которому твой телефон достанет бэкенд — публичный домен, ngrok, IP в локалке и т.п.)

Без этого APK будет ходить на `http://10.0.2.2:4000` (только эмулятор), IPA — на `http://localhost:4000` (только симулятор).

### c) (опционально) Если хочешь EAS Build

Создать токен на <https://expo.dev/settings/access-tokens> и положить в **Secrets** как `EXPO_TOKEN`. Залогиниться `eas login` локально, выполнить `eas project:init` в `apps/mobile`.

## 2. Запуск сборки

GitHub: **Actions → выбрать workflow → Run workflow**.

- **Build Android APK** — собирает APK. По умолчанию `release`, можно переключить на `debug` через input.
- **Build iOS IPA (unsigned)** — собирает unsigned IPA.
- **Build via EAS** — выбираешь профиль (`development`/`preview`/`production`) и платформу.

Также сборки запускаются автоматически на каждый push в `main`/`master`, если изменены файлы в `apps/mobile/**`, `packages/shared/**` или сам workflow.

## 3. Скачать артефакт

После успешного билда:

1. Открыть запуск (Actions → конкретный run).
2. Внизу страницы — секция **Artifacts**.
3. Скачать:
   - `messenger-android-release-<N>.zip` → внутри `app-release.apk`
   - `messenger-ios-unsigned-<N>.zip` → внутри `Messenger-unsigned.ipa`

## 4. Установка на устройство

### Android (APK)

```powershell
# вариант 1: ADB через USB (включить в настройках "Отладка по USB")
adb install -r .\app-release.apk

# вариант 2: скинуть APK в Telegram самому себе или на Google Drive
# открыть на телефоне → разрешить установку из неизвестных источников
```

### iOS (IPA, unsigned)

Без платного Apple Developer ($99/год) IPA ставится через **повторное подписание** твоим личным Apple ID:

1. Скачать **Sideloadly** (Windows/Mac, бесплатно): <https://sideloadly.io>
2. Подключить iPhone по USB, доверить компьютеру.
3. Перетащить `Messenger-unsigned.ipa` в окно Sideloadly.
4. Ввести свой Apple ID — Sideloadly подпишет приложение под твою учётку и установит.
5. На iPhone: **Настройки → Основные → VPN и управление устройством → Trust** (доверять разработчику = твой Apple ID).
6. **Важно**: бесплатный профиль работает 7 дней, потом нужно переподписать (Sideloadly умеет делать это автоматически).

Альтернатива — **AltStore** (стоит один раз настроить, потом обновляет приложение фоном).

## 5. Авто-релиз через тег

Пушнуть тег → APK и IPA автоматически попадут в **GitHub Releases**:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

## 6. Звонки (WebRTC)

Звонки **работают только в собранном APK/IPA**, не в Expo Go (для них нужны нативные модули `react-native-webrtc`, которые добавляются на этапе `expo prebuild` — в CI это происходит автоматически).

Что нужно для работы звонков:

1. Бэкенд запущен и доступен по `API_URL` (см. п.1.b).
2. Coturn (TURN-сервер) запущен (`docker compose up -d coturn`) — без него звонки не пройдут через NAT.
3. Указать публичный адрес TURN в `apps/api/.env`:
   ```
   TURN_URL=turn:<ваш-публичный-IP>:3478
   TURN_USERNAME=messenger
   TURN_PASSWORD=messenger
   ```
4. В мобильном приложении на запрос камеры/микрофона ответить «Разрешить» (разрешения уже прописаны в `app.json`).

При первом входящем звонке приложение **автоматически открывает экран звонка** — глобальный `IncomingCallBridge` слушает `call:incoming` и навигирует.

## 7. Локальная сборка (если нужно)

### Android (Windows)

```powershell
# 1. Установить зависимости
npm install --legacy-peer-deps

# 2. Сгенерировать нативный проект
cd apps\mobile
npx expo prebuild --platform android --clean

# 3. Собрать APK
cd android
.\gradlew.bat assembleRelease

# APK будет здесь:
# apps\mobile\android\app\build\outputs\apk\release\app-release.apk
```

Требуется: **JDK 17**, **Android SDK** (через Android Studio), переменная окружения `ANDROID_HOME`.

### iOS (только на Mac)

```bash
npm install --legacy-peer-deps
cd apps/mobile
npx expo prebuild --platform ios --clean
cd ios && pod install && cd ..
npx expo run:ios --device  # или --configuration Release
```

## 8. Решение типовых проблем

| Симптом | Причина | Фикс |
|---|---|---|
| APK ставится, но при запуске белый экран | Метро не может найти JS-бандл (например, `index.android.bundle` не упаковался) | Перезапустить workflow, убедиться что `npx expo prebuild` отработал без ошибок |
| Login/register падает с network error | На реальном устройстве не доступен `localhost` | Указать `API_URL` в репо-переменной (п.1.b) |
| Звонок не подключается, но индикатор «Вызов…» горит | Не настроен TURN | Указать публичный адрес coturn в `apps/api/.env` |
| Sideloadly «Failed to install» | Apple ID без 2FA / не введён app-specific password | Создать app-specific password на appleid.apple.com и использовать его |
| iOS workflow падает на `xcodebuild` | Версия Xcode runner-а не подходит SDK | Поменять `sudo xcode-select -s /Applications/Xcode_15.4.app` на актуальную (`Xcode_16.app` для macos-15) |
