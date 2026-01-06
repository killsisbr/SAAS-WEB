# DeliveryHub SaaS

**Plataforma SaaS Multi-Tenant para Delivery de Restaurantes**

Sistema completo para gerenciamento de pedidos, cardapio digital, integracao com WhatsApp e atendimento por IA.

---

## Indice

- [Requisitos](#requisitos)
- [Instalacao](#instalacao)
- [Configuracao](#configuracao)
- [Execucao](#execucao)
- [Arquitetura](#arquitetura)
- [Funcionalidades](#funcionalidades)
  - [Multi-Tenancy](#multi-tenancy)
  - [WhatsApp Bot](#whatsapp-bot)
  - [Bot com IA](#bot-com-ia-premium)
  - [Sistema de Follow-up](#sistema-de-follow-up)
  - [Mensagens Customizaveis](#mensagens-customizaveis)
- [API Reference](#api-reference)
- [Banco de Dados](#banco-de-dados)
- [Deploy](#deploy)
- [Autor](#autor)

---

## Requisitos

| Requisito | Versao Minima |
|-----------|---------------|
| Node.js | 18.0+ |
| NPM | 9.0+ |
| SQLite | 3.0+ |

### Dependencias Principais

```json
{
  "express": "^4.18.2",
  "whatsapp-web.js": "^1.23.0",
  "@google/generative-ai": "^0.21.0",
  "jsonwebtoken": "^9.0.0",
  "bcryptjs": "^2.4.3",
  "better-sqlite3": "^9.0.0"
}
```

---

## Instalacao

```bash
# Clonar repositorio
git clone <repo-url>
cd Saas-Restaurante

# Instalar dependencias do servidor
cd server
npm install

# Voltar e instalar dependencias do root (se houver)
cd ..
npm install
```

---

## Configuracao

### 1. Variaveis de Ambiente

Crie o arquivo `.env` na pasta `server/`:

```env
# ========================================
# SERVIDOR
# ========================================
PORT=3000
NODE_ENV=development

# ========================================
# AUTENTICACAO
# ========================================
JWT_SECRET=sua-chave-secreta-muito-segura-aqui
JWT_EXPIRES_IN=7d

# ========================================
# DOMINIO (usado nos links do WhatsApp)
# ========================================
DOMAIN=seudominio.com

# ========================================
# SUPERADMIN (primeiro acesso)
# ========================================
SUPERADMIN_EMAIL=admin@seudominio.com
SUPERADMIN_PASSWORD=senha-segura

# ========================================
# GEMINI AI (opcional - para bot IA)
# ========================================
# Obtenha em: https://aistudio.google.com/apikey
GEMINI_API_KEY=sua-chave-gemini
```

### 2. Banco de Dados

O banco SQLite e criado automaticamente na primeira execucao em:
```
server/database/deliveryhub.sqlite
```

---

## Execucao

```bash
cd server

# Desenvolvimento (com hot reload)
npm run dev

# Producao
npm start
```

**URLs Disponiveis:**
| Rota | Descricao |
|------|-----------|
| `http://localhost:3000/` | Landing page |
| `http://localhost:3000/onboarding` | Cadastro de novo tenant |
| `http://localhost:3000/admin` | Painel administrativo |
| `http://localhost:3000/loja/:slug` | Loja publica do tenant |
| `http://localhost:3000/superadmin` | Dashboard da plataforma |

---

## Arquitetura

```
Saas-Restaurante/
│
├── public/                      # FRONTEND (HTML/CSS/JS)
│   ├── landing/                 # Landing page marketing
│   │   └── index.html
│   ├── onboarding/              # Wizard de cadastro (6 passos)
│   │   └── index.html
│   ├── admin/                   # Painel do restaurante
│   │   ├── index.html           # Dashboard
│   │   ├── produtos.html        # Gestao de produtos
│   │   ├── categorias.html      # Gestao de categorias
│   │   ├── quadro.html          # Quadro Kanban de pedidos
│   │   ├── whatsapp.html        # Config WhatsApp + IA
│   │   └── config.html          # Configuracoes gerais
│   ├── store/                   # Loja publica (cliente)
│   │   └── index.html
│   └── superadmin/              # Gestao da plataforma
│       └── index.html
│
├── server/                      # BACKEND (Node.js/Express)
│   ├── server.js                # Entry point
│   ├── routes/                  # API endpoints
│   │   ├── auth.js              # Autenticacao
│   │   ├── tenants.js           # Gestao de tenants
│   │   ├── products.js          # CRUD produtos
│   │   ├── categories.js        # CRUD categorias
│   │   ├── orders.js            # Gestao de pedidos
│   │   ├── whatsapp.js          # WhatsApp (servico antigo)
│   │   └── whatsapp-bot.js      # WhatsApp Bot (novo)
│   │
│   ├── middleware/              # Middlewares
│   │   ├── auth.js              # Verificacao JWT
│   │   └── tenant.js            # Contexto multi-tenant
│   │
│   ├── services/                # Servicos de negocio
│   │   ├── whatsapp-bot.js      # Bot WhatsApp multi-tenant
│   │   ├── ai-processor.js      # Integracao Gemini
│   │   ├── order-session.js     # State machine de pedidos
│   │   ├── menu-matcher.js      # Busca fuzzy no cardapio
│   │   ├── conversation-handler.js  # Orquestrador de conversa
│   │   └── follow-up.js         # Sistema de follow-up
│   │
│   └── database/                # Banco de dados
│       ├── schema.sql           # Estrutura das tabelas
│       ├── seeds.sql            # Dados iniciais
│       └── deliveryhub.sqlite   # Arquivo do banco
│
├── .env                         # Variaveis de ambiente
├── package.json
└── README.md
```

---

## Funcionalidades

### Multi-Tenancy

Cada restaurante e um **tenant** isolado com:
- Dominio/slug proprio (`/loja/meu-restaurante`)
- Usuarios e permissoes separados
- Configuracoes independentes
- Dados completamente isolados

**Fluxo de Onboarding:**
1. Escolha do tipo de restaurante
2. Dados do estabelecimento
3. Configuracao do cardapio
4. Personalizacao visual
5. Configuracao de entrega
6. Ativacao

---

### WhatsApp Bot

Bot automatico para atendimento via WhatsApp com dois modos de operacao:

#### Modo Link (Padrao)

O bot responde com um link para a loja online.

**Funcionamento:**
1. Cliente envia "oi" ou qualquer saudacao
2. Bot responde com mensagem de boas-vindas + link
3. Link usa formato simples: `?p=5511999999999`
4. Na loja, o telefone e pre-preenchido e oculto
5. Nome do cliente e salvo para proximas visitas

**Exemplo de Conversa:**
```
Cliente: oi
Bot: Ola! Bem-vindo ao Brutus Burger!
     Faca seu pedido pelo link:
     https://seusite.com/loja/brutus?p=5511999999999
```

**Comandos Reconhecidos:**
| Comando | Acao |
|---------|------|
| oi, ola, bom dia, etc | Envia boas-vindas + link |
| pedir, pedido, cardapio | Envia link da loja |
| ajuda | Envia instrucoes |

---

### Bot com IA (Premium)

Atendimento completo por conversa natural usando **Google Gemini**.

#### Caracteristicas

- **100% Gratuito** (Gemini Flash: 60 req/min)
- Entende linguagem natural
- Busca fuzzy no cardapio
- Gerencia adicionais e opcoes
- Coleta endereco e pagamento
- Cria pedido automaticamente

#### State Machine

O bot gerencia 12 estados de conversa:

```
IDLE -> GREETING -> BROWSING -> ADDING_ITEM -> SELECT_OPTION
                       |              |
                       v              v
                  CART_REVIEW <- ADDONS
                       |
                       v
                DELIVERY_TYPE -> ADDRESS -> PAYMENT -> CONFIRMED
                       |
                       v
                    PICKUP ─────────────────────┘
```

#### Fluxo Completo

```
Cliente: oi
Bot: Ola! Bem-vindo ao Brutus Burger! O que vai querer hoje?

Cliente: quero um hamburguer
Bot: Otima escolha! Temos:
     1. X-Burger (R$ 18,00)
     2. X-Bacon (R$ 22,00)
     3. X-Tudo (R$ 28,00)
     Qual voce prefere?

Cliente: x-bacon
Bot: X-Bacon anotado!
     Deseja adicionar algo?
     - Bacon extra (+R$ 4,00)
     - Queijo extra (+R$ 3,00)
     - Ovo (+R$ 2,00)

Cliente: bacon extra
Bot: Adicionado bacon extra!
     Mais alguma coisa no pedido?

Cliente: uma coca
Bot: Temos Coca-Cola:
     - Lata (R$ 6,00)
     - 600ml (R$ 8,00)
     - 2L (R$ 12,00)

Cliente: lata
Bot: Coca Lata anotada!
     
     Seu pedido ate agora:
     - 1x X-Bacon + Bacon extra = R$ 26,00
     - 1x Coca Lata = R$ 6,00
     Total: R$ 32,00
     
     Deseja mais alguma coisa ou posso fechar?

Cliente: fechar
Bot: Perfeito! E para entrega ou retirada?

Cliente: entrega
Bot: Me envia sua localizacao ou digite o endereco.

Cliente: Rua das Flores, 123 - Centro
Bot: Entrega para Rua das Flores, 123 - Centro.
     Taxa de entrega: R$ 5,00
     Total final: R$ 37,00
     
     Forma de pagamento?
     - PIX
     - Cartao na entrega
     - Dinheiro

Cliente: pix
Bot: Pedido #127 confirmado!
     
     1x X-Bacon + Bacon extra
     1x Coca Lata
     Entrega: Rua das Flores, 123 - Centro
     Total: R$ 37,00
     
     Chave PIX: 11999999999
     Previsao: 30-40min
     
     Agradecemos a preferencia!
```

#### Configuracao da IA

1. Acesse o painel admin: `/admin/whatsapp`
2. Localize o card **"Bot com IA (Premium)"**
3. Ative o toggle **"Habilitar Bot com IA"**
4. Obtenha sua API Key gratuita em [aistudio.google.com](https://aistudio.google.com/apikey)
5. Cole a chave no campo
6. Clique em **"TESTAR IA"** para validar
7. Salve as configuracoes

#### Componentes Tecnicos

| Arquivo | Responsabilidade |
|---------|------------------|
| `ai-processor.js` | Integra com Gemini, interpreta intencoes |
| `order-session.js` | Gerencia estado da conversa por cliente |
| `menu-matcher.js` | Busca produtos por similaridade (Levenshtein) |
| `conversation-handler.js` | Orquestra fluxo e cria pedidos |

---

### Sistema de Follow-up

Envia mensagens automaticas para clientes que nao pedem ha algum tempo.

#### Configuracao de Mensagens

| Periodo Inativo | Tipo de Mensagem |
|-----------------|------------------|
| 7-14 dias | Lembrete suave |
| 15-30 dias | Mensagem de saudade |
| 31-60 dias | Reconquista |

#### Execucao

- **Automatica:** Diariamente as 14h
- **Manual:** `POST /api/whatsapp-bot/follow-up`

#### Exemplo de Mensagens

**7-14 dias:**
```
Ola João! Sentimos sua falta no Brutus Burger!
Que tal um lanche hoje? Estamos com novidades deliciosas!
Faca seu pedido: https://site.com/loja/brutus?p=5511999999999
```

**15-30 dias:**
```
João! Faz um tempinho que voce nao pede no Brutus Burger!
Estamos com saudade! Aproveite e mate a vontade:
https://site.com/loja/brutus?p=5511999999999
```

**31-60 dias:**
```
João! Lembra de nos? Somos o Brutus Burger!
Voce faz falta aqui! Que tal relembrar nosso sabor?
https://site.com/loja/brutus?p=5511999999999
```

---

### Mensagens Customizaveis

Todas as mensagens do bot podem ser editadas no painel admin.

#### Templates Disponiveis

| Template | Uso |
|----------|-----|
| Boas-vindas | Primeira mensagem ao cliente |
| Link do Pedido | Quando cliente pede cardapio |
| Ajuda | Instrucoes de uso |
| Confirmacao | Apos pedido finalizado |
| Follow-up 7 dias | Lembrete suave |
| Follow-up 15 dias | Mensagem de saudade |
| Follow-up 30 dias | Reconquista |

#### Variaveis Disponiveis

| Variavel | Substitui por |
|----------|---------------|
| `{restaurante}` | Nome do restaurante |
| `{link}` | Link da loja com telefone |
| `{nome}` | Nome do cliente |
| `{numero}` | Numero do pedido |
| `{itens}` | Lista de itens do pedido |
| `{total}` | Valor total |

---

## API Reference

### Autenticacao

Todas as rotas protegidas exigem header:
```
Authorization: Bearer <jwt_token>
```

### Endpoints WhatsApp Bot

#### Status do Bot
```http
GET /api/whatsapp-bot/status
```

**Resposta:**
```json
{
  "initialized": true,
  "connected": true,
  "phone": "5511999999999"
}
```

#### Iniciar Bot
```http
POST /api/whatsapp-bot/start
```

**Resposta:**
```json
{
  "success": true,
  "message": "Bot iniciado. Aguarde o QR Code."
}
```

#### Obter QR Code
```http
GET /api/whatsapp-bot/qr
```

**Resposta:**
```json
{
  "connected": false,
  "qrAvailable": true,
  "qrCode": "data:image/png;base64,..."
}
```

#### Parar Bot
```http
POST /api/whatsapp-bot/stop
```

#### Gerar Link de Teste
```http
POST /api/whatsapp-bot/test-link
Content-Type: application/json

{
  "phone": "11999999999"
}
```

**Resposta:**
```json
{
  "success": true,
  "link": "https://site.com/loja/slug?p=5511999999999"
}
```

#### Enviar Follow-up Manual
```http
POST /api/whatsapp-bot/follow-up
Content-Type: application/json

{
  "daysInactive": 7
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Follow-up enviado para 15 clientes",
  "sent": 15,
  "total": 23
}
```

#### Atualizar Configuracoes
```http
PUT /api/whatsapp/settings
Content-Type: application/json

{
  "whatsappBotEnabled": true,
  "whatsappGroupId": "123456@g.us",
  "botMessages": {
    "welcome": "Ola! Bem-vindo ao {restaurante}!",
    "orderLink": "Faca seu pedido: {link}"
  },
  "aiBot": {
    "enabled": true,
    "apiKey": "sua-chave-gemini",
    "provider": "gemini"
  }
}
```

---

## Banco de Dados

### Principais Tabelas

| Tabela | Descricao |
|--------|-----------|
| `tenants` | Restaurantes cadastrados |
| `users` | Usuarios do sistema |
| `categories` | Categorias de produtos |
| `products` | Produtos do cardapio |
| `product_addons` | Adicionais de produtos |
| `orders` | Pedidos realizados |
| `customers` | Clientes cadastrados |
| `activity_logs` | Logs de atividades |

### Estrutura da Tabela Tenants

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  email TEXT,
  phone TEXT,
  settings TEXT,  -- JSON com configuracoes
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Settings JSON

```json
{
  "whatsappBotEnabled": true,
  "whatsappGroupId": "123456@g.us",
  "botMessages": {
    "welcome": "...",
    "orderLink": "...",
    "help": "...",
    "confirmation": "...",
    "followup7": "...",
    "followup15": "...",
    "followup30": "..."
  },
  "aiBot": {
    "enabled": true,
    "apiKey": "...",
    "provider": "gemini"
  },
  "theme": {
    "primaryColor": "#d9432e",
    "secondaryColor": "#ffb800"
  },
  "delivery": {
    "fee": 5.00,
    "minOrder": 20.00,
    "estimatedTime": "30-45min"
  }
}
```

---

## Deploy

Consulte o guia completo em: [docs/VPS-DEPLOY.md](docs/VPS-DEPLOY.md)

### Resumo Rapido

```bash
# 1. Instalar dependencias
npm install --production

# 2. Configurar .env
cp .env.example .env
nano .env

# 3. Iniciar com PM2
pm2 start server.js --name deliveryhub

# 4. Configurar Nginx (proxy reverso)
# 5. Configurar SSL (Let's Encrypt)
```

---

## Autor

**killsis (Lucas Larocca)**

---

## Licenca

Proprietario - Todos os direitos reservados.
