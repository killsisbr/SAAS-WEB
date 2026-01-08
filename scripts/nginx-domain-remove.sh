#!/bin/bash
# ============================================================
# Script de Remoção de Domínio Customizado do Nginx
# DeliveryHub SaaS
# ============================================================
# Uso: sudo ./nginx-domain-remove.sh <dominio>
# Exemplo: sudo ./nginx-domain-remove.sh restaurantedegust.com
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERRO] Execute como root: sudo $0 $@${NC}"
    exit 1
fi

if [ -z "$1" ]; then
    echo -e "${RED}[ERRO] Uso: $0 <dominio>${NC}"
    exit 1
fi

DOMAIN=$1

echo -e "${YELLOW}Removendo configuração para: $DOMAIN${NC}"

# Remover symlink
if [ -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    rm "/etc/nginx/sites-enabled/$DOMAIN"
    echo -e "${GREEN}[OK] Symlink removido${NC}"
fi

# Remover configuração
if [ -f "/etc/nginx/sites-available/$DOMAIN" ]; then
    rm "/etc/nginx/sites-available/$DOMAIN"
    echo -e "${GREEN}[OK] Configuração removida${NC}"
fi

# Recarregar Nginx
nginx -t && systemctl reload nginx
echo -e "${GREEN}[OK] Nginx recarregado${NC}"

# Perguntar sobre SSL
echo ""
read -p "Deseja remover também o certificado SSL? (s/N): " REMOVE_SSL
if [ "$REMOVE_SSL" = "s" ] || [ "$REMOVE_SSL" = "S" ]; then
    certbot delete --cert-name $DOMAIN
    echo -e "${GREEN}[OK] Certificado SSL removido${NC}"
fi

echo -e "${GREEN}Domínio $DOMAIN removido com sucesso!${NC}"
