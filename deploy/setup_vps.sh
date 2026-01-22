#!/bin/bash
set -e

# Cores
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}🚀 Iniciando Setup do Servidor (Ubuntu)...${NC}"

# 1. Atualizar Sistema
echo -e "${GREEN}📦 Atualizando pacotes...${NC}"
apt update
apt upgrade -y
apt install -y curl git nginx unzip build-essential sqlite3

# 2. Instalar Node.js 20
echo -e "${GREEN}📦 Instalando Node.js 20...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# 3. Instalar PM2 (Gerenciador de Processos)
echo -e "${GREEN}📦 Instalando PM2...${NC}"
npm install -g pm2

# 4. Configurar Firewall (UFW)
echo -e "${GREEN}🛡️ Configurando Firewall...${NC}"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 5. Criar Diretório da Aplicação
echo -e "${GREEN}📂 Criando diretórios...${NC}"
mkdir -p /var/www/deliveryhub
mkdir -p /var/www/deliveryhub/server/database

# 6. Permissões
chown -R root:root /var/www/deliveryhub

echo -e "${GREEN}✅ Setup do Ambiente Concluído!${NC}"
echo -e "Próximo passo: Fazer upload dos arquivos e rodar npm install."
