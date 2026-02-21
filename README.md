# AitoVideo

Telegram Mini App для управления очередью видео с YouTube, Rutube и VK Video.

## Как работает

1. Отправляешь боту ссылку на видео
2. Бот сохраняет название, канал, превью
3. Открываешь Mini App на любом устройстве
4. Смотришь видео через встроенный плеер

## Быстрый старт

### 1. Клонирование и установка

```bash
git clone https://github.com/Rast53/aitovideo.git
cd aitovideo

# Backend
cd backend
cp .env.example .env
# Отредактируй .env, добавь BOT_TOKEN
npm install

# Mini App
cd ../miniapp
npm install
```

### 2. Запуск для разработки

```bash
# Terminal 1 - Backend API
cd backend
npm run dev

# Terminal 2 - Bot
cd backend
npm run bot

# Terminal 3 - Mini App
cd miniapp
npm run dev
```

### 3. Деплой на VPS

```bash
./deploy.sh
```

## Настройка бота

1. Напиши @BotFather в Telegram
2. Создай нового бота: `/newbot`
3. Получи токен, добавь в `.env`
4. Настрой Mini App: `/mybots` → твой бот → Bot Settings → Menu Button → Configure menu button
5. Укажи URL Mini App

## Стек

- **Backend:** Node.js + TypeScript + Express + SQLite
- **Mini App:** React + TypeScript + Vite
- **Bot:** node-telegram-bot-api

## Структура проекта

```
aitovideo/
├── backend/           # Node.js API + Bot
│   ├── src/
│   │   ├── api/       # Express REST API
│   │   ├── bot/       # Telegram bot
│   │   ├── models/    # Database models
│   │   ├── services/  # Video parsers
│   │   └── types/     # TypeScript types
│   └── tsconfig.json
├── miniapp/           # React Mini App
│   ├── src/
│   │   ├── components/
│   │   └── types/
│   └── tsconfig.json
├── .gitignore
├── .dockerignore
└── deploy.sh
```

## Лицензия

MIT