# Modos de Pedido via WhatsApp

Este documento descreve os três modos de operação do sistema de pedidos via WhatsApp no DeliveryHub SaaS.

## Configuração

A configuração é feita nas **settings do tenant** através do campo `whatsappOrderMode`:

```json
{
  "whatsappOrderMode": "link" | "direct" | "ai",
  "directOrderMessages": {
    "welcome": "Personalizar mensagem de boas-vindas",
    "askAddress": "Personalizar solicitação de endereço"
  }
}
```

---

## Modos Disponíveis

### 1. Modo Link (Padrão)

**Valor:** `"link"`

O cliente recebe um link para o cardápio digital onde finaliza o pedido.

**Como funciona:**
1. Cliente envia mensagem no WhatsApp
2. Bot responde com link da loja: `seusite.com/loja/slug?whatsapp=numero`
3. Cliente acessa o link, monta o pedido e finaliza no site
4. Pedido é salvo e notificado

**Vantagens:**
- Interface visual completa
- Todas as funcionalidades do cardápio digital
- Melhor para cardápios extensos

**Quando usar:**
- Restaurantes com muitos itens
- Quando quer que cliente veja fotos dos produtos
- Para integração com sistemas de pagamento online

---

### 2. Modo Direto (Novo!)

**Valor:** `"direct"`

Pedidos são feitos 100% via conversa no WhatsApp, sem sair do app.

**Como funciona:**
1. Cliente envia mensagem no WhatsApp
2. Bot analisa a mensagem e detecta produtos/intenções
3. Fluxo conversacional guia o cliente:
   - Adicionar itens → Escolher entrega/retirada → Endereço → Pagamento → Confirmar
4. Pedido é salvo e notificado no grupo

**Comandos suportados:**
| Comando | Ação |
|---------|------|
| `cardápio` | Mostra o cardápio formatado |
| `[nome do produto]` | Adiciona ao carrinho |
| `2x [produto]` | Adiciona quantidade específica |
| `entrega` | Inicia fluxo de entrega |
| `retirada` / `buscar` | Inicia fluxo de retirada |
| `pix` | Mostra chave PIX |
| `reiniciar` | Limpa o carrinho |
| `ajuda` | Mostra comandos disponíveis |

**Estados do Fluxo:**
```
menu-inicial → browsing → delivery/address → name → observation → payment → finalizado
```

**Vantagens:**
- Clientes não saem do WhatsApp
- Experiência mais rápida para pedidos simples
- Funciona bem em áreas com internet lenta

**Quando usar:**
- Restaurantes com cardápio pequeno/médio
- Clientes que preferem não abrir links
- Para agilizar pedidos de clientes frequentes

---

### 3. Modo IA (Conversacional)

**Valor:** `"ai"`

Usa inteligência artificial (Gemini/OpenAI) para processar linguagem natural.

**Como funciona:**
1. Cliente envia mensagem em linguagem natural
2. IA interpreta a intenção e extrai informações
3. Sistema monta o pedido baseado na interpretação

**Requisitos:**
- API Key configurada (Gemini ou OpenAI)
- `aiBot.enabled: true` nas settings

**Quando usar:**
- Quando quer máxima flexibilidade de linguagem
- Para clientes que escrevem de formas variadas

---

## Arquivos do Módulo Direct Order

```
server/direct-order/
├── index.js              # Ponto de entrada público
├── config.js             # Estados e configurações
├── services/
│   ├── cart-service.js   # Gerenciamento de carrinho
│   └── customer-service.js # Cache de clientes
└── core/
    ├── word-analyzer.js  # Análise de palavras-chave
    └── state-machine.js  # Máquina de estados
```

---

## Como Habilitar Modo Direto

### Via API (atualizar settings do tenant):

```javascript
// PUT /api/tenants/:id/settings
{
  "whatsappOrderMode": "direct",
  "directOrderMessages": {
    "welcome": "Olá! Bem-vindo ao {restaurante}!\n\nDigite o que deseja pedir ou 'cardápio' para ver nossas opções."
  }
}
```

### Via Banco de Dados:

```sql
UPDATE tenants 
SET settings = json_set(settings, '$.whatsappOrderMode', 'direct')
WHERE id = 'seu-tenant-id';
```

---

## Customização de Mensagens

O tenant pode customizar as mensagens em `directOrderMessages`:

| Chave | Uso |
|-------|-----|
| `welcome` | Primeira mensagem ao cliente |
| `askAddress` | Solicitação de endereço |
| `reset` | Quando carrinho é reiniciado |
| `completed` | Após pedido finalizado |

**Variáveis disponíveis:**
- `{restaurante}` - Nome do restaurante
- `{nome}` - Nome do cliente
- `{link}` - Link da loja (modo link)
