# DeliveryHub SaaS - Deploy VPS

## Requisitos
- Ubuntu 20.04+ ou Debian 11+
- Acesso root
- Dominio apontando para IP da VPS

## Deploy Rapido

```bash
# 1. Clonar projeto na VPS
git clone https://github.com/seu-usuario/deliveryhub.git /var/www/deliveryhub
cd /var/www/deliveryhub

# 2. Executar script de deploy
chmod +x deploy.sh
sudo ./deploy.sh app.seudominio.com.br
```

## O que o script faz

1. Instala Node.js 18
2. Instala PM2 (gerenciador de processos)
3. Configura Nginx como reverse proxy
4. Cria servico systemd para auto-start
5. Opcionalmente configura SSL (Let's Encrypt)

## Arquivos de Deploy

| Arquivo | Descricao |
|---------|-----------|
| `deploy.sh` | Script principal de setup |
| `nginx-domain-config.sh` | Auto-config para custom domains |
| `deliveryhub.service` | Servico systemd |

## Comandos Uteis

```bash
# Ver status
pm2 status

# Ver logs
pm2 logs deliveryhub

# Reiniciar
pm2 restart deliveryhub

# Parar
pm2 stop deliveryhub
```

## Custom Domains

Quando um tenant verifica um dominio customizado, o sistema automaticamente:
1. Cria config Nginx para o dominio
2. Configura proxy para o Node.js
3. Tenta obter certificado SSL

### Requisitos para Custom Domain

O usuario deve configurar um registro **CNAME** apontando para `app.seudominio.com.br`

## Estrutura na VPS

```
/var/www/deliveryhub/
├── public/           # Frontend
├── server/          # Backend Node.js
│   ├── database/    # SQLite
│   └── uploads/     # Arquivos enviados
├── .env             # Variaveis de ambiente
└── nginx-domain-config.sh
```

## Firewall (UFW)

```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
sudo ufw enable
```
