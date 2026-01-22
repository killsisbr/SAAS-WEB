# Deploy Script for Windows
$ServerIP = "82.29.58.126"
$User = "root"
$RemotePath = "/var/www/deliveryhub"

Write-Host "🚀 Iniciando Deploy para $ServerIP..." -ForegroundColor Green

# 1. Limpar anterior
if (Test-Path "deploy.zip") { Remove-Item "deploy.zip" }

# 2. Compactar Arquivos (Ignorando node_modules e outros)
Write-Host "📦 Compactando arquivos..." -ForegroundColor Yellow
# Usando git archive se disponível, ou Compress-Archive manual
# Como git archive é mais confiável para respeitar .gitignore:
git archive -o deploy.zip HEAD

if (-not (Test-Path "deploy.zip")) {
    Write-Host "❌ Erro ao criar zip com git archive. Tentando Compress-Archive..." -ForegroundColor Red
    # Fallback (mais lento e pega tudo, entao cuidado)
    Get-ChildItem -Exclude node_modules, .git, .wwebjs_cache, server/database/*.sqlite* | Compress-Archive -DestinationPath deploy.zip
}

# 3. Upload
Write-Host "📤 Enviando arquivos para o servidor (Prepare a senha)..." -ForegroundColor Yellow
scp deploy.zip "$User@$ServerIP:/root/deploy.zip"

# 4. Copiar scripts de deploy
scp deploy/setup_vps.sh deploy/nginx.conf "$User@$ServerIP:/root/"

# 5. Executar Setup Remoto
Write-Host "🔧 Executando instalação no servidor..." -ForegroundColor Yellow
ssh "$User@$ServerIP" "
    # Criar pasta se n existir
    mkdir -p $RemotePath
    
    # Descompactar
    unzip -o /root/deploy.zip -d $RemotePath
    
    # Mover configs de deploy
    mv /root/setup_vps.sh $RemotePath/
    mv /root/nginx.conf $RemotePath/
    
    # Dar permissão e rodar setup
    chmod +x $RemotePath/setup_vps.sh
    cd $RemotePath
    ./setup_vps.sh
    
    # Configurar Nginx
    cp nginx.conf /etc/nginx/sites-available/deliveryhub
    ln -sf /etc/nginx/sites-available/deliveryhub /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
    
    # Iniciar PM2
    cd server
    npm install --production
    pm2 delete deliveryhub || true
    pm2 start index.js --name deliveryhub
    pm2 save
    pm2 startup
"

Write-Host "✅ Deploy Finalizado! Acesse: http://$ServerIP" -ForegroundColor Green
