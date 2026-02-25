# Деплой на обычный VPS (без Docker Swarm)

Подходит для Ubuntu 22.04 / Debian 12. Использует Docker Compose, Nginx и Let's Encrypt.

## Требования

- VPS с публичным IP
- Домен, DNS-запись **A** которого уже указывает на этот IP
- Открытые порты **80** и **443**
- Ubuntu 22.04 или Debian 12

## Быстрая установка (автоматически)

```bash
git clone https://github.com/Rast53/aitovideo.git
cd aitovideo
chmod +x vps/setup-vps.sh
sudo ./vps/setup-vps.sh
```

Скрипт сам:
- Установит Docker и Docker Compose
- Запросит BOT_TOKEN, домен и опциональный VK_SERVICE_TOKEN
- Получит SSL-сертификат через Let's Encrypt
- Запустит все сервисы

---

## Ручная установка (пошагово)

### 1. Установка Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable docker --now
```

### 2. Клонирование репозитория

```bash
git clone https://github.com/Rast53/aitovideo.git /opt/aitovideo
cd /opt/aitovideo
```

### 3. Создание .env

```bash
cat > .env <<EOF
BOT_TOKEN=1234567890:ABC-ваш-токен
AITOVIDEO_DOMAIN=video.example.com
VK_SERVICE_TOKEN=         # опционально
EOF
chmod 600 .env
```

### 4. Получение SSL-сертификата

```bash
# Шаг 4a: временный Nginx для ACME-challenge
docker run -d --rm --name nginx-tmp \
  -p 80:80 \
  -v certbot-www:/var/www/certbot \
  nginx:alpine

# Шаг 4b: получить сертификат (замени домен)
docker run --rm \
  -v certbot-certs:/etc/letsencrypt \
  -v certbot-www:/var/www/certbot \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    --non-interactive --agree-tos \
    --email admin@video.example.com \
    -d video.example.com

# Шаг 4c: остановить временный Nginx
docker stop nginx-tmp
```

### 5. Запуск всех сервисов

```bash
docker compose -f docker-compose.standalone.yml up -d
```

### 6. Проверка

```bash
curl https://video.example.com/health
# должно вернуть: {"status":"ok","timestamp":"..."}
```

---

## Обновление после выхода новой версии

```bash
cd /opt/aitovideo
git pull
docker compose -f docker-compose.standalone.yml pull
docker compose -f docker-compose.standalone.yml up -d
```

---

## Управление сервисами

```bash
# Просмотр логов (все)
docker compose -f docker-compose.standalone.yml logs -f

# Логи конкретного сервиса
docker compose -f docker-compose.standalone.yml logs -f backend

# Перезапуск одного сервиса
docker compose -f docker-compose.standalone.yml restart backend

# Остановка
docker compose -f docker-compose.standalone.yml down

# Полная очистка (ВНИМАНИЕ: удалит данные БД!)
docker compose -f docker-compose.standalone.yml down -v
```

---

## Структура после установки

```
/opt/aitovideo/
├── docker-compose.standalone.yml   # основной файл конфигурации
├── vps/
│   └── nginx.conf                  # шаблон Nginx (envsubst)
└── .env                            # BOT_TOKEN, DOMAIN и пр.

Docker volumes:
  backend-data    — SQLite база данных
  certbot-certs   — SSL-сертификаты
  certbot-www     — ACME-challenge файлы
```

---

## Архитектура

```
Internet
   │
   ▼ :80/:443
 Nginx (container)
   ├──/api/*  ──► backend:3000  (Express API)
   └──/*      ──► miniapp:80   (React SPA, nginx)

backend ──► SQLite (volume)
bot     ──► backend API (HTTP внутри сети)
certbot ──► авторелизация сертификата каждые 12 ч
```

---

## Возможные проблемы

| Симптом | Решение |
|---|---|
| Certbot: `Connection refused` | Проверь что порт 80 открыт в файрволе и DNS указывает на сервер |
| `502 Bad Gateway` | Сервисы ещё стартуют, подожди 10–15 сек, проверь `docker compose logs` |
| Бот не отвечает | Проверь `BOT_TOKEN` в `.env` и `docker compose logs bot` |
| Сертификат истёк | `docker compose restart certbot` или проверь, что сервис certbot запущен |
