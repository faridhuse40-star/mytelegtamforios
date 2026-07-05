# Messenger — приватный мессенджер без номера телефона

Кросс-платформенное (iOS + Android) приложение на **React Native + Expo SDK 52** с бэкендом на **Fastify + Prisma + Socket.io** и звонками через **WebRTC**. Строго ч/б дизайн:
iOS — glassmorphism поверх `BlurView`, Android — монохромный Material You.

> **Хочешь сразу скомпилировать APK / IPA через GitHub?** Открой [`BUILD.md`](./BUILD.md) — там пошагово описан весь процесс (workflows уже настроены).
>
> **Локальный setup в один клик (Windows):** `powershell -ExecutionPolicy Bypass -File .\setup.ps1`

## Структура монорепо

```
messenger/
├── apps/
│   ├── mobile/           ← React Native + Expo Router (file-based навигация)
│   │   ├── app/          ← экраны (auth, tabs, chat, call, user, search)
│   │   ├── components/ui ← платформенные обёртки (Surface = glass/material)
│   │   ├── services/     ← api, socket, storage (MMKV)
│   │   ├── store/        ← Zustand
│   │   └── constants/    ← theme, config
│   └── api/              ← Fastify + Prisma + Socket.io
│       ├── src/
│       │   ├── routes/   ← auth, users, chats, calls
│       │   ├── sockets/  ← чат + WebRTC сигналинг
│       │   └── lib/      ← prisma, redis, tokens, env
│       └── prisma/schema.prisma
└── packages/
    └── shared/           ← общие TypeScript типы и события сокетов
```

## Быстрый старт

### 1. Инфраструктура (Postgres + Redis + coturn)

```bash
docker compose up -d postgres redis coturn
```

### 2. Установка зависимостей (корень монорепо)

```bash
npm install
```

### 3. Бэкенд

```bash
cp apps/api/.env.example apps/api/.env
npm run api:migrate    # prisma migrate dev
npm run api:dev        # http://localhost:4000
```

### 4. Мобильное приложение

```bash
npm run mobile         # expo start
```

Запустите на телефоне через Expo Go. Если используете физическое устройство, укажите IP хоста:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 EXPO_PUBLIC_SOCKET_URL=http://192.168.1.10:4000 npm run mobile
```

### 5. Звонки (WebRTC)

`react-native-webrtc` требует нативную сборку — **не работает в Expo Go**. Для звонков:

```bash
cd apps/mobile
npx expo prebuild
npx expo run:ios      # или run:android
```

Экран звонка и сигналинг через Socket.io работают в Expo Go без медиа-потоков
(для быстрой демонстрации UI и потока событий).

## Что реализовано

### Авторизация (без телефона)
- Регистрация: имя, фамилия, `@username` (4–32 символа, латиница/цифры/_), email, пароль (bcrypt, минимум 8).
- JWT access 15 мин + refresh 7 дней; ротация refresh-токена при обновлении.
- Auto-login через `react-native-mmkv` (зашифровано) + прозрачный refresh на 401.
- Logout с инвалидацией refresh-токена на сервере.

### Профиль
- Свой: аватар (picker + cropping + JPEG 512px), имя, фамилия, `@username` (с проверкой уникальности), bio ≤ 70 символов, email.
- Чужой: аватар, имя, `@username`, bio, presence (онлайн / был(а) недавно), кнопки «Написать» / «Аудиозвонок» / «Видеозвонок».

### Поиск
- Live-search с debounce 300 мс по `@username` и имени/фамилии (case-insensitive).
- История последних поисков локально через MMKV + на сервере (`/users/search-history`).
- Пустой результат → «Пользователь не найден».

### Чаты (realtime)
- Список чатов с последним сообщением, временем, онлайн-статусом собеседника и **белым** badge-ом непрочитанных.
- Экран чата: оптимистичная отправка текста, статусы ✓ / ✓✓, typing-индикатор с анимацией (Reanimated), пагинация при скролле вверх, поиск по сообщениям (GET `/chats/:id/messages?search=`), редактирование/удаление своих сообщений через Socket.
- События: `message:new/updated/deleted`, `chat:typing`, `chat:read`, `presence:update`.

### Звонки
- Инициация `call:invite` → `call:incoming` через Socket.io.
- Полноэкранный UI с аватаром, таймером, кнопками mute / camera / end. Тактильный feedback при подключении.
- ICE-конфигурация выдаётся сервером: Google STUN + свой coturn (Docker).
- История звонков: тип (аудио/видео), направление, длительность, статус, перезвонить.

### Платформенный UI (строго ч/б)
| | iOS (glass) | Android (material) |
|---|---|---|
| Фон | `#000000` | `#0D0D0D` |
| Поверхность | `rgba(255,255,255,0.07)` поверх `BlurView` (intensity=80, tint="dark") | `#1C1C1C` |
| Карточки | border `rgba(255,255,255,0.15)`, radius 20–28 | `#2A2A2A`, radius 12–20 |
| Сообщения вх. | `rgba(255,255,255,0.08)` + blur | `#1C1C1C` |
| Сообщения исх. | `rgba(255,255,255,0.18)` + blur | `#FFFFFF` (текст чёрный) |
| Ripple | — | `rgba(255,255,255,0.12)` |
| Шрифт | SF Pro Display | Roboto |

Общий primitive `Surface` автоматически выбирает рендер:
- iOS: `BlurView` + полупрозрачный overlay + тонкая рамка.
- Android: плотная поверхность без elevation.

### Общее
- **Никаких цветных акцентов** — только `#000`, `#FFF`, прозрачные серые.
- `SafeAreaView` на всех экранах, `KeyboardAvoidingView` в чате/auth.
- `FlashList` для списка чатов и сообщений.
- Иконки подразумеваются монохромными SVG (можно подключить `lucide-react-native` stroke-only).

## Переменные окружения

### `apps/api/.env`
```
DATABASE_URL="postgresql://messenger:messenger@localhost:5432/messenger?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_ACCESS_SECRET="..."
JWT_REFRESH_SECRET="..."
TURN_URL="turn:localhost:3478"
TURN_USERNAME="messenger"
TURN_PASSWORD="messenger"
```

### Мобиль
`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL` (опционально — переопределяют `http://localhost:4000` в `app.json`).

## Команды

| Команда | Действие |
|---|---|
| `npm install` | Установить все зависимости (workspaces) |
| `npm run docker:up` | Поднять postgres, redis, coturn |
| `npm run api:migrate` | Prisma миграции |
| `npm run api:dev` | API в dev-режиме (tsx watch) |
| `npm run mobile` | Expo dev-server |
| `npm run mobile:ios` / `mobile:android` | Нативный запуск (после prebuild) |

## Деплой

- API: `docker compose up -d api` — собирает из `apps/api/Dockerfile`, применяет миграции, слушает `:4000`.
- Мобиль: `eas build --platform ios` / `--platform android` через Expo EAS.
- coturn: `docker compose up -d coturn` (UDP 3478 + relay 49152-49200).

## Roadmap (за рамками MVP)

- Загрузка аватаров/файлов в S3/Cloudinary (сейчас сохраняется локальный URI).
- Email-подтверждение регистрации.
- Push-уведомления через Expo (`expo-notifications` — плагин уже добавлен).
- Групповые чаты и голосовые сообщения.
- Шифрование E2EE (signal-protocol).
