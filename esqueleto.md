# Esqueleto do Projeto: Saas-Restaurante (DeliveryHub)

## 🏗️ Arquitetura Geral
O projeto é um SaaS **Multi-Tenant** rodando em Node.js com SQLite (better-sqlite3). Cada restaurante (tenant) possui seu próprio ambiente lógico, mas compartilha o mesmo banco de dados com isolamento por `tenant_id`.

## 🖥️ GUIs (Páginas Front-end)

### 1. Painel Admin (`/admin`)
- **Dashboard (`index.html`):** Resumo de vendas, pedidos recentes e métricas rápidas.
- **Quadro de Pedidos (`quadro.html`):** Kanban real-time para gestão de fluxo (Pendente -> Preparando -> Entrega -> Concluído).
- **Produtos (`produtos.html`):** CRUD de produtos com suporte a múltiplos adicionais.
- **Categorias (`categorias.html`):** Organização do cardápio.
- **Avaliações (`avaliacoes.html`):** Gestão de feedback dos clientes.
- **WhatsApp Web (`whatsapp.html`):** Conexão via QR Code e configuração do Bot IA.
- **Configurações (`config.html`):** Cores, logo, taxas de entrega e horários.

### 2. Loja do Cliente (`/loja/:slug`)
- **Cardápio Digital:** Interface responsiva, filtros por categoria, busca de produtos.
- **Carrinho de Compras:** Gestão de itens, adicionais e observações.
- **Checkout:** Identificação via WhatsApp, seleção de entrega/retirada, endereço e forma de pagamento.

### 3. Onboarding (`/onboarding`)
- Wizard de 6 passos para criação de conta e configuração inicial do restaurante.

### 4. Super Admin (`/superadmin`)
- Gestão de planos, assinaturas e monitoramento global da plataforma.

## ⚙️ Core Logic (Back-end)

### 1. WhatsApp Bot Service (`whatsapp-bot.js`)
- **Modo Link:** Resposta automática com link personalizado (`?p=telefone`).
- **Modo IA (Gemini):** Atendimento conversacional completo, entende pedidos em linguagem natural.
- **Follow-up:** Mensagens automáticas para reconquista de clientes inativos (7, 15, 30 dias).

### 2. AI Processor (`ai-processor.js`)
- Integração com Google Gemini 2.0 Flash.
- Extração de intenções (JSON) para automatizar a criação de pedidos.

### 3. Multi-Tenancy Middleware
- Identifica o tenant via Subdominio ou Path (`/loja/slug`).
- Garante que um tenant nunca acesse dados de outro.

## 🛠️ Pontos Pendentes / Melhorias

### 📦 Infra & Otimização
- [ ] **Cache em Memória:** Implementar cache para `products`, `categories` e `settings` por `tenant_id` (TTL 10min) para suportar 300+ pedidos/dia sem gargalo de I/O.
- [ ] **Autosave & Backup:** Script de snapshot do SQLite a cada 24h e backup incremental.
- [ ] **GUI Preview (TXT):** Criar ferramenta para visualizar o layout das GUIs (HTML) em formato texto estruturado para manutenção via Terminal/IA.

### 🤖 Bot & IA
- [ ] **Contexto Premium:** Integrar suporte a "Adicionais Obrigatórios" e "Limites de Escolha" (ex: escolha até 3 itens) no prompt do Gemini.
- [ ] **Fuzzy Matching:** Melhorar a busca de produtos com erros de digitação (Levenshtein Distance).
- [ ] **PIX Dinâmico:** Buscar `pix_key` nas configurações do tenant e anexar à mensagem de fechamento do pedido.
- [ ] **Distância Haversine:** Calcular distância entre restaurante e cliente para validar permissão de entrega (Link de Mapa).
- [ ] **Comandos de Admin (WhatsApp):** Implementar `/debug` (para logs em tempo real) e `/reload` (para recarregar configurações sem reiniciar o processo).
- [ ] **Tab-Completion (Simulado):** Respostas rápidas e sugestões de comandos no bot para facilitar a navegação.

### 🍔 Funcionalidades de Negócio
- [ ] **Sistema de Açaí:** Implementar lógica de tamanhos, adicionais grátis e categorias específicas para Açaí (similar ao @CAMPESTRE).
- [ ] **Blacklist Global/Tenant:** Sistema para bloquear clientes por WhatsApp ID com motivo e data.
- [ ] **Buffet do Dia:** Gerenciamento de itens rotativos do buffet.
- [ ] **Ajuste de Imagem:** Adicionar suporte a `posicao_imagem`, `zoom` e `coordenadas` para exibição premium dos produtos.

### 🖥️ Admin & Onboarding
- [ ] **E-mails Reais:** Integração com Nodemailer/SendGrid para convites de equipe e recuperação de senha.
- [ ] **Follow-up Dashboard:** Visualizar métricas de reconquista (7, 15, 30 dias) no painel admin.
- [ ] **Multi-Image CRUD:** Otimizar o upload e atribuição de imagens (baseado na lógica do projeto @CAMPESTRE).
