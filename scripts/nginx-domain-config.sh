#!/bin/bash
# ============================================================
# Script de Configuração de Domínio Customizado para Nginx
# DeliveryHub SaaS
# ============================================================
# Uso: sudo ./nginx-domain-config.sh <dominio> <slug>
# Exemplo: sudo ./nginx-domain-config.sh restaurantedegust.com degust
# ============================================================

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se é root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO] Execute como root: sudo $0 $@${NC}"
    exit 1
fi

# Verificar argumentos
if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}[ERRO] Uso: $0 <dominio> <slug>${NC}"
    echo "Exemplo: $0 restaurantedegust.com degust"
    exit 1
fi

DOMAIN=$1
SLUG=$2
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
APP_PORT=3000
APP_HOST="localhost"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Configurando domínio: ${GREEN}$DOMAIN${NC}"
echo -e "${YELLOW}Slug do tenant: ${GREEN}$SLUG${NC}"
echo -e "${YELLOW}========================================${NC}"

# Criar configuração do Nginx
CONFIG_FILE="$NGINX_AVAILABLE/$DOMAIN"

echo -e "${YELLOW}[1/5] Criando configuração Nginx...${NC}"

cat > "$CONFIG_FILE" << EOF
# Configuração para $DOMAIN
# Tenant: $SLUG
# Gerado automaticamente em $(date)

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Redirecionar para HTTPS (será ativado após Certbot)
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL será configurado pelo Certbot
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Configurações de segurança SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Headers de segurança
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Logs
    access_log /var/log/nginx/${DOMAIN}_access.log;
    error_log /var/log/nginx/${DOMAIN}_error.log;

    # Tamanho máximo de upload
    client_max_body_size 50M;

    # Reescrever URL raiz para a loja do tenant
    location = / {
        return 301 /loja/$SLUG;
    }

    # Proxy para o Node.js
    location / {
        proxy_pass http://$APP_HOST:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket para whatsapp-web.js
    location /socket.io/ {
        proxy_pass http://$APP_HOST:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # Cache de arquivos estáticos
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff|woff2|ttf|svg|webp)$ {
        proxy_pass http://$APP_HOST:$APP_PORT;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo -e "${GREEN}[OK] Configuração criada em $CONFIG_FILE${NC}"

# Criar symlink em sites-enabled
echo -e "${YELLOW}[2/5] Ativando site...${NC}"
if [ -L "$NGINX_ENABLED/$DOMAIN" ]; then
    rm "$NGINX_ENABLED/$DOMAIN"
fi
ln -s "$CONFIG_FILE" "$NGINX_ENABLED/$DOMAIN"
echo -e "${GREEN}[OK] Site ativado${NC}"

# Testar configuração do Nginx
echo -e "${YELLOW}[3/5] Testando configuração Nginx...${NC}"
nginx -t
if [ $? -ne 0 ]; then
    echo -e "${RED}[ERRO] Configuração Nginx inválida!${NC}"
    rm "$CONFIG_FILE"
    rm "$NGINX_ENABLED/$DOMAIN"
    exit 1
fi
echo -e "${GREEN}[OK] Configuração válida${NC}"

# Recarregar Nginx
echo -e "${YELLOW}[4/5] Recarregando Nginx...${NC}"
systemctl reload nginx
echo -e "${GREEN}[OK] Nginx recarregado${NC}"

# Gerar certificado SSL com Certbot
echo -e "${YELLOW}[5/5] Gerando certificado SSL...${NC}"
if command -v certbot &> /dev/null; then
    certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[OK] Certificado SSL gerado com sucesso${NC}"
    else
        echo -e "${YELLOW}[AVISO] Erro ao gerar SSL. Verifique se o DNS está apontando para este servidor.${NC}"
        echo -e "${YELLOW}        Você pode tentar novamente depois com:${NC}"
        echo -e "${YELLOW}        sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN${NC}"
    fi
else
    echo -e "${YELLOW}[AVISO] Certbot não instalado. Instale com:${NC}"
    echo -e "${YELLOW}        sudo apt install certbot python3-certbot-nginx${NC}"
    echo -e "${YELLOW}        Depois execute:${NC}"
    echo -e "${YELLOW}        sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Configuração concluída!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Próximos passos:"
echo -e "1. Configure o DNS do domínio ${YELLOW}$DOMAIN${NC} para apontar para este servidor"
echo -e "2. Aguarde a propagação do DNS (pode levar até 48h)"
echo -e "3. Acesse ${GREEN}https://$DOMAIN${NC} para testar"
echo ""
