#!/bin/bash

# ============================================================
# DeliveryHub SaaS - Script de Manutenção Programada
# Este script deve ser executado via crontab na VPS.
# ============================================================

LOG_FILE="/root/killsis/maintenance.log"
APP_DIR="/root/killsis/SAAS-WEB"

echo "" >> $LOG_FILE
echo "============================================================" >> $LOG_FILE
echo "[$(date)] INICIANDO MANUTENÇÃO PROGRAMADA" >> $LOG_FILE
echo "============================================================" >> $LOG_FILE

# 1. Limpar logs do PM2 para economizar espaço em disco
echo "[$(date)] Limpando logs do PM2..." >> $LOG_FILE
pm2 flush >> $LOG_FILE 2>&1

# 2. Reiniciar o serviço saas-web
echo "[$(date)] Reiniciando serviço saas-web..." >> $LOG_FILE
pm2 restart saas-web >> $LOG_FILE 2>&1

# 3. Verificar se o serviço subiu
sleep 5
STATUS=$(pm2 jlist | grep -o '"name":"saas-web","pm2_env":{"status":"online"' | wc -l)

if [ $STATUS -gt 0 ]; then
    echo "[$(date)] ✅ Serviço reiniciado com sucesso e está ONLINE." >> $LOG_FILE
else
    echo "[$(date)] ❌ Falha ao reiniciar serviço. Tentando force restart..." >> $LOG_FILE
    pm2 delete saas-web >> $LOG_FILE 2>&1
    cd $APP_DIR/server && pm2 start server.js --name saas-web >> $LOG_FILE 2>&1
fi

echo "[$(date)] MANUTENÇÃO CONCLUÍDA" >> $LOG_FILE
echo "============================================================" >> $LOG_FILE
