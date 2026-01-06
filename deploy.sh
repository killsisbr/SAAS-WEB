#!/bin/bash
# ============================================================
# DeliveryHub SaaS - Script de Deploy VPS
# Autor: killsis (Lucas Larocca)
# ============================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DeliveryHub SaaS - Deploy VPS${NC}"
echo -e "${GREEN}========================================${NC}"

# Verificar se e root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Execute como root: sudo bash deploy.sh${NC}"
    exit 1
fi

# Variaveis de configuracao
APP_NAME="deliveryhub"
APP_DIR="/var/www/deliveryhub"
APP_USER="www-data"
NODE_VERSION="18"
DOMAIN="${1:-app.killsis.com}"

echo -e "${YELLOW}Dominio principal: ${DOMAIN}${NC}"

# ========================================
# 1. INSTALAR DEPENDENCIAS
# ========================================
echo -e "\n${GREEN}[1/6] Instalando dependencias...${NC}"

apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx

# Instalar Node.js
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
fi

# Instalar PM2
npm install -g pm2

echo -e "${GREEN}Node $(node -v) instalado${NC}"
echo -e "${GREEN}PM2 $(pm2 -v) instalado${NC}"

# ========================================
# 2. CRIAR DIRETORIO E COPIAR ARQUIVOS
# ========================================
echo -e "\n${GREEN}[2/6] Configurando diretorio da aplicacao...${NC}"

mkdir -p $APP_DIR
cp -r . $APP_DIR/
chown -R $APP_USER:$APP_USER $APP_DIR

cd $APP_DIR/server
npm install --production

# ========================================
# 3. CONFIGURAR VARIAVEIS DE AMBIENTE
# ========================================
echo -e "\n${GREEN}[3/6] Configurando variaveis de ambiente...${NC}"

if [ ! -f "$APP_DIR/.env" ]; then
    cat > $APP_DIR/.env << EOF
NODE_ENV=production
PORT=3000
JWT_SECRET=$(openssl rand -hex 32)
DOMAIN=${DOMAIN}
ORS_API_KEY=5b3ce3597851110001cf6248cfa0914bbad64af78bc4d5aad8b296fb
EOF
    echo -e "${GREEN}.env criado${NC}"
fi

# ========================================
# 4. CONFIGURAR NGINX
# ========================================
echo -e "\n${GREEN}[4/6] Configurando Nginx...${NC}"

cat > /etc/nginx/sites-available/$APP_NAME << EOF
# DeliveryHub SaaS - Nginx Config
# Gerado automaticamente

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} *.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
    }

    # SSE para updates em tempo real
    location /api/orders/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }

    # Uploads
    client_max_body_size 10M;
}
EOF

ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo -e "${GREEN}Nginx configurado${NC}"

# ========================================
# 5. INICIAR APLICACAO COM PM2
# ========================================
echo -e "\n${GREEN}[5/6] Iniciando aplicacao com PM2...${NC}"

cd $APP_DIR/server
pm2 delete $APP_NAME 2>/dev/null || true
pm2 start server.js --name $APP_NAME --watch --ignore-watch="node_modules uploads database/*.sqlite"
pm2 save
pm2 startup

echo -e "${GREEN}Aplicacao iniciada${NC}"

# ========================================
# 6. CONFIGURAR SSL (OPCIONAL)
# ========================================
echo -e "\n${GREEN}[6/6] Configurando SSL...${NC}"

read -p "Configurar SSL com Let's Encrypt? (s/n): " setup_ssl
if [ "$setup_ssl" = "s" ]; then
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
    echo -e "${GREEN}SSL configurado${NC}"
else
    echo -e "${YELLOW}SSL ignorado - configure manualmente depois${NC}"
fi

# ========================================
# FINALIZADO
# ========================================
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  DEPLOY CONCLUIDO!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  URL: http://${DOMAIN}"
echo -e "  Logs: pm2 logs ${APP_NAME}"
echo -e "  Status: pm2 status"
echo -e "  Restart: pm2 restart ${APP_NAME}"
echo -e "${GREEN}========================================${NC}"
