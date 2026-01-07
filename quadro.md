# Quadro de Anotacoes - SAAS-WEB DeliveryHub

> Documentacao importante do projeto para referencia rapida.

---

## VPS - Servidor de Producao

| Item | Valor |
|------|-------|
| **IP** | `82.29.58.126` |
| **Usuario** | `root` |
| **SO** | Ubuntu 25.04 |
| **Node.js** | Instalado via NVM |
| **PM2** | Gerenciador de processos |
| **Nginx** | Proxy reverso + SSL |

### Acesso SSH
```bash
ssh root@82.29.58.126
```

---

## Dominios Configurados

### brutusburger.online
| Item | Valor |
|------|-------|
| **Slug** | `brutus-burger` |
| **Rota** | `/loja/brutus-burger` |
| **Porta Backend** | 5000 |
| **SSL** | Let's Encrypt (existente) |
| **Nginx Config** | `/etc/nginx/sites-available/brutusburger` |

### restaurantedegust.com
| Item | Valor |
|------|-------|
| **Slug** | `degust` |
| **Rota** | `/loja/degust` |
| **Porta Backend** | 5000 |
| **SSL** | Let's Encrypt (expira 2026-04-07) |
| **Subdominio** | shop.restaurantedegust.com |
| **Nginx Config** | `/etc/nginx/sites-available/restaurantedegust` |

> **Nota:** `www` e `loja` subdomains tem DNS conflitante (84.32.84.32)

---

## Processos PM2

| Nome | Porta | Status | Descricao |
|------|-------|--------|-----------|
| **SAAS-WEB** | 5000 | online | DeliveryHub SaaS Multi-Tenant |
| **brutusweb** | - | online | Antigo catalogo (CATALOGO-WEB) |
| **server** | - | online | Outro servico |
| **prison** | - | online | Minecraft Prison |
| **BRUTUSx** | - | stopped | - |
| **PAINELVPS** | - | stopped | - |

### Comandos PM2
```bash
pm2 list                  # Ver todos processos
pm2 logs SAAS-WEB         # Ver logs
pm2 restart SAAS-WEB      # Reiniciar
pm2 save                  # Salvar config
```

---

## Banco de Dados

| Item | Valor |
|------|-------|
| **Tipo** | SQLite |
| **Arquivo** | `/root/killsis/SAAS-WEB/server/database/deliveryhub.sqlite` |
| **Backups** | Automatico (diario, mantém 7) |

---

## Estrutura de Rotas

| Rota | Descricao |
|------|-----------|
| `/` | Landing page |
| `/login` | Login admin |
| `/onboarding` | Cadastro novo tenant |
| `/loja/:slug` | Loja publica do tenant |
| `/loja/:slug/quadro` | Quadro de pedidos |
| `/loja/:slug/admin/` | Painel admin da loja |
| `/superadmin` | Super admin geral |
| `/api/health` | Health check |

---

## Tenants (Lojas)

| Slug | Dominio Customizado | Status |
|------|---------------------|--------|
| `brutus-burger` | brutusburger.online | Configurado |
| `restaurantedegust` | restaurantedegust.com | Configurado |

> **Para criar novo tenant:** Usar `/onboarding` ou inserir via `seeds.sql`

---

## Arquivos Importantes

| Arquivo | Descricao |
|---------|-----------|
| `server/server.js` | Entry point do servidor |
| `server/database/schema.sql` | Schema do banco |
| `server/database/seeds.sql` | Dados iniciais |
| `.env` | Variaveis de ambiente (nao commitado) |
| `deploy.sh` | Script de deploy |

---

## Comandos Uteis

### Nginx
```bash
nginx -t                           # Testar config
systemctl reload nginx             # Recarregar
certbot --nginx -d dominio.com     # SSL
```

### Deploy
```bash
cd /root/killsis/SAAS-WEB/server
git pull
npm install
pm2 restart SAAS-WEB
```

---

## Notas

- **07/01/2026:** Configurado brutusburger.online e restaurantedegust.com
- Apache foi desativado para liberar porta 443 para nginx

---

*Autor: killsis (Lucas Larocca)*
