#!/bin/bash
# ============================================================
# DeliveryHub SaaS - Auto-Config Nginx para Custom Domains
# Este script e executado pelo Node.js quando um dominio e verificado
# ============================================================

DOMAIN=$1
TENANT_SLUG=$2
APP_NAME="deliveryhub"

if [ -z "$DOMAIN" ] || [ -z "$TENANT_SLUG" ]; then
    echo "Uso: ./nginx-domain-config.sh <dominio> <tenant_slug>"
    exit 1
fi

echo "Configurando Nginx para: $DOMAIN -> $TENANT_SLUG"

# Criar config do dominio
cat > /etc/nginx/sites-available/domain-${DOMAIN} << EOF
# Custom Domain: ${DOMAIN}
# Tenant: ${TENANT_SLUG}
# Gerado automaticamente em $(date)

server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Tenant-Slug ${TENANT_SLUG};
        proxy_cache_bypass \$http_upgrade;
    }

    # SSE
    location /api/orders/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_set_header X-Tenant-Slug ${TENANT_SLUG};
        proxy_buffering off;
        proxy_cache off;
    }

    client_max_body_size 10M;
}
EOF

# Ativar site
ln -sf /etc/nginx/sites-available/domain-${DOMAIN} /etc/nginx/sites-enabled/

# Testar e recarregar
nginx -t && systemctl reload nginx

echo "Nginx configurado para ${DOMAIN}"

# Tentar SSL (opcional, nao falhar se nao conseguir)
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN} 2>/dev/null || echo "SSL nao configurado automaticamente"

echo "Concluido!"
