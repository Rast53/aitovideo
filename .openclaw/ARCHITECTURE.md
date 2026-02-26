# AitoVideo — Контекст для AI-агентов

## Что это
Telegram Mini App для управления очередью видео с YouTube, Rutube, VK Video.

## Архитектура

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Telegram   │────▶│   Backend   │────▶│   SQLite    │
│    Bot      │     │  Node.js    │     │   (local)   │
└─────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │  Mini App   │
                     │   React     │
                     └─────────────┘
```

## Стек
- **Backend:** Node.js + TypeScript + Express + SQLite
- **Mini App:** React + TypeScript + Vite
- **Bot:** node-telegram-bot-api

## Критические ограничения (НЕ НАРУШАТЬ)

### API и данные
- База данных SQLite — файл `backend/data/videos.db`
- НЕ менять схему без миграции
- НЕ удалять существующие таблицы
- НЕ менять формат хранения videoId

### Telegram Bot
- BOT_TOKEN берётся из `.env`
- Webhook URL настраивается в `deploy.sh`
- НЕ менять команды бота без согласования

### Mini App
- URL Mini App настраивается в @BotFather
- НЕ менять initData проверку
- НЕ менять формат передачи userId

## Паттерны

### Добавление нового парсера видео
1. Создать файл в `backend/src/services/parsers/`
2. Экспортировать функцию `parseVideo(url: string): Promise<VideoInfo>`
3. Добавить в `backend/src/services/videoService.ts`
4. Написать тест в `backend/src/services/parsers/__tests__/` (если есть)

### Добавление API endpoint
1. Создать route в `backend/src/api/routes/`
2. Добавить в `backend/src/api/index.ts`
3. Валидировать входные данные (zod или ручная проверка)
4. Обрабатывать ошибки с понятными сообщениями

### Изменение базы данных
1. Создать миграцию в `backend/src/models/migrations/`
2. Добавить запуск миграции в `backend/src/models/index.ts`
3. Проверить обратную совместимость

## Структура проекта

```
aitovideo/
├── backend/
│   ├── src/
│   │   ├── api/          # Express routes
│   │   ├── bot/          # Telegram bot handlers
│   │   ├── models/       # Database + migrations
│   │   ├── services/     # Business logic + parsers
│   │   └── types/        # TypeScript types
│   ├── data/             # SQLite database
│   └── tests/            # Test files
├── miniapp/
│   └── src/
│       ├── components/   # React components
│       ├── hooks/        # Custom hooks
│       └── types/        # TypeScript types
└── deploy.sh             # Deployment script
```

## Логирование

Используется **pino** (структурированные JSON-логи).

```typescript
import { apiLogger, botLogger, serviceLogger } from '../logger.js';
// НЕ использовать console.log в production-коде!

apiLogger.info({ userId, action }, 'User action');
apiLogger.error({ err, url }, 'Request failed');
```

Child-логгеры: `apiLogger`, `botLogger`, `dbLogger`, `serviceLogger`.
В dev-режиме: pino-pretty (цветной вывод). В production: JSON.

## Как запускать

### Локально (разработка)
```bash
# Backend
cd backend
npm install
npm run dev        # API на :3000
npm run bot        # Bot (в другом терминале)

# Mini App
cd miniapp
npm install
npm run dev        # Dev server на :5173
```

## Деплой

### Production — Docker Swarm (основной)
```bash
# Деплой / обновление стека
docker stack deploy -c docker-compose.yml aitovideo

# Проверить статус сервисов
docker service ls | grep aitovideo

# Логи backend
docker service logs aitovideo_backend --tail 100 -f

# Логи bot
docker service logs aitovideo_bot --tail 100 -f

# Принудительный рестарт (после push нового образа)
docker service update --force aitovideo_backend
docker service update --force aitovideo_bot
```

### Сборка и публикация образов
```bash
# Backend
docker build -t rast53/aitovideo-backend:latest ./backend
docker push rast53/aitovideo-backend:latest

# Mini App
docker build -t rast53/aitovideo-miniapp:latest ./miniapp
docker push rast53/aitovideo-miniapp:latest
```

### Инфраструктура Swarm
- **Сети:** `traefik-net` (external, для reverse proxy), `aitovideo-net` (overlay, внутренняя)
- **Volumes:** `backend-data` (SQLite persistent storage)
- **Traefik:** автоматические SSL сертификаты, домен через `AITOVIDEO_DOMAIN`
- **Переменные:** `BOT_TOKEN`, `AITOVIDEO_DOMAIN`, `VK_SERVICE_TOKEN`

## Связанные файлы
- `README.md` — общая документация
- `deploy.sh` — скрипт деплоя
- `.env.example` — переменные окружения
