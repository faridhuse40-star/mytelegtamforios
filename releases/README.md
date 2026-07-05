# Releases

Локальные сборки (не попадают в git, см. `.gitignore`).

## Бэкенд

Приложение стучится в `https://messenger-api-far.fly.dev` (Fly.io, регион `iad`;
Postgres — Neon, `us-east-1`). Работает 24/7, ПК включать не нужно.

Проверить что бэк жив:

```powershell
Invoke-WebRequest https://messenger-api-far.fly.dev/health
```

## Текущие файлы

- `Messenger-android.apk` — релиз-APK, ставится на любой Android.
- `Messenger-ios-unsigned.ipa` — **неподписанный** IPA. Нужен
  [AltStore](https://altstore.io), [Sideloadly](https://sideloadly.io) или
  Xcode, чтобы подписать своим Apple ID и установить на iPhone.

## Установка Android

1. Скопировать `Messenger-android.apk` на телефон (USB / Telegram / Google Drive).
2. Открыть файл → разрешить установку из неизвестных источников.
3. Запустить приложение.

> На первом запуске приложение спросит микрофон / камеру / уведомления —
> это нужно для звонков.

## Установка iOS (без Apple Developer)

**Sideloadly (проще всего):**

1. Поставить Sideloadly, подключить iPhone к ПК.
2. Перетащить `Messenger-ios-unsigned.ipa` в окно Sideloadly.
3. Ввести Apple ID → Start. Приложение появится на телефоне.
4. На iPhone: Settings → General → VPN & Device Management → доверять профилю.

> Бесплатный Apple ID = профиль живёт 7 дней, потом нужно повторно подписать.

## Обновить сборки из CI

```powershell
# посмотреть последние запуски
gh run list -L 5

# скачать всё из нужного run в releases/
gh run download <RUN_ID> -D .\releases

# после скачивания переименовать:
# releases\<subdir>\app-release.apk        → releases\Messenger-android.apk
# releases\<subdir>\Messenger-unsigned.ipa → releases\Messenger-ios-unsigned.ipa
```
