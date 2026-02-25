#!/bin/bash
# =============================================================================
# AitoVideo — полная установка на обычный VPS (Ubuntu 22.04 / Debian 12)
# =============================================================================
# Запуск:
#   chmod +x setup-vps.sh && sudo ./setup-vps.sh
#
# Что делает скрипт:
#   1. Устанавливает Docker + Docker Compose
#   2. Запрашивает BOT_TOKEN, домен и другие переменные
#   3. Клонирует репозиторий
#   4. Получает SSL-сертификат через Let's Encrypt (Certbot)
#   5. Запускает все сервисы
# =============================================================================

set -e

REPO_URL="https://github.com/Rast53/aitovideo.git"
INSTALL_DIR="/opt/aitovideo"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}▶ $*${NC}"; }
ok()   { echo -e "${GREEN}✔ $*${NC}"; }
warn() { echo -e "${YELLOW}⚠ $*${NC}"; }
err()  { echo -e "${RED}✖ $*${NC}" >&2; exit 1; }

# ── 0. Root check ─────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  err "Запусти скрипт от root: sudo ./setup-vps.sh"
fi

# ── 1. Install Docker ─────────────────────────────────────────────────────────
log "Проверка Docker..."
if ! command -v docker &>/dev/null; then
  log "Устанавливаем Docker..."
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release

  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker --now
  ok "Docker установлен"
else
  ok "Docker уже установлен: $(docker --version)"
fi

# ── 2. Collect configuration ──────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo "       Настройка AitoVideo"
echo "════════════════════════════════════════════"
echo ""

read -rp "  BOT_TOKEN (от @BotFather): " BOT_TOKEN
[ -z "$BOT_TOKEN" ] && err "BOT_TOKEN обязателен"

read -rp "  Домен (без https://, напр. video.example.com): " AITOVIDEO_DOMAIN
[ -z "$AITOVIDEO_DOMAIN" ] && err "Домен обязателен"

read -rp "  VK_SERVICE_TOKEN (необязательно, Enter — пропустить): " VK_SERVICE_TOKEN

echo ""
warn "Убедись что DNS-запись A для ${AITOVIDEO_DOMAIN} уже указывает на этот сервер!"
read -rp "  DNS настроен? [y/N] " DNS_READY
[[ "$DNS_READY" =~ ^[Yy]$ ]] || err "Настрой DNS и запусти скрипт снова"

# ── 3. Clone or update repo ───────────────────────────────────────────────────
log "Клонирование репозитория в ${INSTALL_DIR}..."
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" pull --quiet
  ok "Репозиторий обновлён"
else
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  ok "Репозиторий клонирован"
fi
cd "$INSTALL_DIR"

# ── 4. Write .env ─────────────────────────────────────────────────────────────
log "Создаём .env..."
cat > .env <<EOF
BOT_TOKEN=${BOT_TOKEN}
AITOVIDEO_DOMAIN=${AITOVIDEO_DOMAIN}
VK_SERVICE_TOKEN=${VK_SERVICE_TOKEN}
EOF
chmod 600 .env
ok ".env создан"

# ── 5. Pull latest Docker images ──────────────────────────────────────────────
log "Загружаем Docker-образы..."
docker compose -f docker-compose.standalone.yml pull
ok "Образы загружены"

# ── 6. Bootstrap SSL: start Nginx HTTP-only, issue certificate ────────────────
log "Запускаем Nginx (HTTP) для получения сертификата..."

# Temporarily replace config: only HTTP block (no SSL references yet)
TMP_NGINX=$(mktemp)
cat > "$TMP_NGINX" <<NGINX
server {
    listen 80;
    server_name ${AITOVIDEO_DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; }
}
NGINX

# Start only nginx with temp config
docker run -d --rm --name nginx-bootstrap \
  -p 80:80 \
  -v "$TMP_NGINX":/etc/nginx/conf.d/default.conf:ro \
  -v certbot-www:/var/www/certbot \
  nginx:alpine

log "Получаем SSL-сертификат для ${AITOVIDEO_DOMAIN}..."
docker run --rm \
  -v certbot-certs:/etc/letsencrypt \
  -v certbot-www:/var/www/certbot \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    --non-interactive --agree-tos \
    --email "admin@${AITOVIDEO_DOMAIN}" \
    -d "${AITOVIDEO_DOMAIN}"

docker stop nginx-bootstrap 2>/dev/null || true
rm -f "$TMP_NGINX"
ok "SSL-сертификат получен"

# ── 7. Start all services ─────────────────────────────────────────────────────
log "Запускаем все сервисы..."
docker compose -f docker-compose.standalone.yml up -d
ok "Все сервисы запущены"

# ── 8. Verify ─────────────────────────────────────────────────────────────────
echo ""
sleep 5
if curl -sf "https://${AITOVIDEO_DOMAIN}/health" | grep -q 'ok'; then
  ok "Health check пройден — приложение работает!"
else
  warn "Health check не ответил, проверь логи: docker compose -f docker-compose.standalone.yml logs"
fi

# ── 9. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════"
echo -e "${GREEN}  AitoVideo успешно развёрнут!${NC}"
echo "════════════════════════════════════════════"
echo ""
echo "  Mini App:  https://${AITOVIDEO_DOMAIN}"
echo "  Health:    https://${AITOVIDEO_DOMAIN}/health"
echo ""
echo "  Полезные команды:"
echo "    Логи:     docker compose -f ${INSTALL_DIR}/docker-compose.standalone.yml logs -f"
echo "    Стоп:     docker compose -f ${INSTALL_DIR}/docker-compose.standalone.yml down"
echo "    Обновить: docker compose -f ${INSTALL_DIR}/docker-compose.standalone.yml pull && \\"
echo "              docker compose -f ${INSTALL_DIR}/docker-compose.standalone.yml up -d"
echo ""
