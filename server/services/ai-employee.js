/**
 * AI Employee - Funcionário IA para Auto-Atendimento
 * Usa Ollama para conversar com clientes e anotar pedidos via WhatsApp
 */

import OllamaClient from './ollama-client.js';
import { v4 as uuidv4 } from 'uuid';

// Prompts especializados para atendimento de restaurante
const SYSTEM_PROMPTS = {
    friendly: `Você é {employeeName}, a atendente atenciosa e simpática do {storeName}. Seu objetivo é proporcionar uma experiência de atendimento incrível via WhatsApp.

REGRAS DE OURO:
1. **Atendimento Humano**: Fale de forma natural. Use emojis estrategicamente.
2. **Cardápio Inteligente**: Apresente o cardápio de forma organizada. **NUNCA** aceite itens que não estão no cardápio.
3. **Gerenciamento de Pedidos**: Você deve ser capaz de ADICIONAR e REMOVER itens conforme solicitado pelo cliente. Se o cliente pedir para "tirar", "remover" ou "cancelar" um item específico do carrinho, confirme a remoção.
4. **NUNCA FAÇA CONTAS**: O sistema calculará o valor exato no final. Apenas liste os itens para confirmação.
5. **Endereço e Pagamento**: Garanta que o endereço tenha Rua e Número. Para PIX, use a chave: {storeInfo.pixKey}.

INFORMAÇÕES DA LOJA:
{storeInfo}

CARDÁPIO DISPONÍVEL:
{menuItems}

Responda sempre em Português Brasileiro (PT-BR).`,

    professional: `Você é {employeeName}, atendente do {storeName}. Seja educado, eficiente e profissional.

REGRAS:
1. Apresente o cardápio de forma clara e estruturada.
2. Confirme os detalhes do pedido ponto a ponto.
3. Mantenha um tom prestativo mas objetivo.

CARDÁPIO:
{menuItems}

{storeInfo}`,

    casual: `Oi! Sou {employeeName} do {storeName}! 🍔✨ Aqui a gente foca em sabor e agilidade.

Manda aí o que você tá querendo comer hoje! Se quiser ver o que tem de bom, é só pedir o cardápio.

CARDÁPIO:
{menuItems}

{storeInfo}`
};

// Estados da conversa (alinhados com o banco de dados)
// CHECK (status IN ('active', 'ordering', 'confirming', 'completed', 'cancelled'))
const CONVERSATION_STATES = {
    GREETING: 'active',       // Estado inicial / ativo
    ORDERING: 'ordering',     // Adicionando itens
    CONFIRMING_ITEMS: 'confirming',  // Confirmando pedido
    ASKING_ADDRESS: 'confirming',    // Pedindo endereço (sub-estado de confirming)
    ASKING_PAYMENT: 'confirming',    // Pedindo pagamento (sub-estado de confirming)
    FINAL_CONFIRMATION: 'confirming',// Confirmação final
    COMPLETED: 'completed',   // Pedido finalizado
    CANCELLED: 'cancelled'    // Pedido cancelado
};

class AIEmployee {
    constructor(db, tenantId, config = {}) {
        this.db = db;
        this.tenantId = tenantId;

        // Configurações
        this.config = {
            employeeName: config.employeeName || 'Ana',
            storeName: config.storeName || 'Restaurante',
            personality: config.personality || 'friendly',
            ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
            model: config.model || 'llama3:8b',
            maxTokens: config.maxTokens || 1500, // Aumentado de 500 para 1500
            ...config
        };

        // Cliente Ollama
        this.ollama = new OllamaClient({
            url: this.config.ollamaUrl,
            model: this.config.model,
            timeout: 60000
        });

        // Cache de conversas ativas (em memória)
        this.conversations = new Map();
    }

    /**
     * Processa mensagem do cliente
     */
    async processMessage(customerPhone, message, pushName = '') {
        console.log(`[AIEmployee] Processando: ${customerPhone} -> "${message}"`);

        // Buscar ou criar conversa
        let conversation = await this.getOrCreateConversation(customerPhone, pushName);

        // Adicionar mensagem do cliente ao histórico
        conversation.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });

        // Gerar prompt com contexto
        const systemPrompt = await this.buildSystemPrompt();

        // Converter histórico para formato Ollama
        const ollamaMessages = conversation.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Gerar resposta
        const response = await this.ollama.generateResponse(
            systemPrompt,
            ollamaMessages,
            { maxTokens: this.config.maxTokens }
        );

        if (!response.success) {
            console.error('[AIEmployee] Erro Ollama:', response.error);
            return {
                success: false,
                message: 'Desculpe, estou com um problema técnico. Tente novamente em instantes! 😅'
            };
        }

        // Adicionar resposta ao histórico
        const assistantMessage = response.content.trim();
        conversation.messages.push({
            role: 'assistant',
            content: assistantMessage,
            timestamp: new Date().toISOString()
        });

        // Atualizar conversa no banco
        await this.saveConversation(conversation);

        // Verificar se pedido foi confirmado
        const orderExtracted = await this.checkForOrderConfirmation(conversation);
        if (orderExtracted) {
            console.log('[AIEmployee] Pedido detectado:', orderExtracted);
        }

        return {
            success: true,
            message: assistantMessage,
            conversation: conversation,
            orderExtracted: orderExtracted
        };
    }

    /**
     * Busca ou cria conversa para o cliente
     */
    async getOrCreateConversation(customerPhone, pushName = '') {
        // Verificar cache em memória
        const cacheKey = `${this.tenantId}:${customerPhone}`;
        if (this.conversations.has(cacheKey)) {
            const cached = this.conversations.get(cacheKey);
            // Conversa expira após 30 minutos de inatividade
            const lastUpdate = new Date(cached.updatedAt);
            const now = new Date();
            if ((now - lastUpdate) < 30 * 60 * 1000) {
                return cached;
            }
        }

        // Buscar no banco
        const existing = await this.db.get(
            `SELECT * FROM ai_conversations 
             WHERE tenant_id = ? AND customer_phone = ? AND status != 'completed'
             ORDER BY created_at DESC LIMIT 1`,
            [this.tenantId, customerPhone]
        );

        if (existing) {
            const conversation = {
                ...existing,
                messages: JSON.parse(existing.messages || '[]'),
                orderData: existing.order_data ? JSON.parse(existing.order_data) : null
            };
            this.conversations.set(cacheKey, conversation);
            return conversation;
        }

        // Criar nova conversa
        const newConversation = {
            id: uuidv4(),
            tenantId: this.tenantId,
            customerPhone: customerPhone,
            customerName: pushName,
            messages: [],
            status: CONVERSATION_STATES.GREETING,
            orderData: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await this.db.run(
            `INSERT INTO ai_conversations (id, tenant_id, customer_phone, customer_name, messages, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newConversation.id,
                newConversation.tenantId,
                newConversation.customerPhone,
                newConversation.customerName,
                JSON.stringify(newConversation.messages),
                newConversation.status,
                newConversation.createdAt,
                newConversation.updatedAt
            ]
        );

        this.conversations.set(cacheKey, newConversation);
        return newConversation;
    }

    /**
     * Salva conversa no banco
     */
    async saveConversation(conversation) {
        conversation.updatedAt = new Date().toISOString();

        await this.db.run(
            `UPDATE ai_conversations 
             SET messages = ?, status = ?, order_data = ?, updated_at = ?
             WHERE id = ?`,
            [
                JSON.stringify(conversation.messages),
                conversation.status,
                conversation.orderData ? JSON.stringify(conversation.orderData) : null,
                conversation.updatedAt,
                conversation.id
            ]
        );

        // Atualizar cache
        const cacheKey = `${this.tenantId}:${conversation.customerPhone}`;
        this.conversations.set(cacheKey, conversation);
    }

    /**
     * Constrói prompt com cardápio
     */
    /**
     * Constrói prompt com cardápio e informações da loja
     */
    async buildSystemPrompt() {
        // Buscar dados da loja
        const tenant = await this.db.get(
            `SELECT name, business_type, settings, theme_id FROM tenants WHERE id = ?`,
            [this.tenantId]
        );

        if (!tenant) {
            throw new Error('Loja não encontrada');
        }

        const settings = JSON.parse(tenant.settings || '{}');

        // Informações da loja para o prompt
        const storeInfo = {
            name: tenant.name,
            type: tenant.business_type,
            address: settings.address || 'Endereço não informado',
            phone: settings.phone || 'Telefone não informado',
            deliveryFee: settings.deliveryFee ? `R$ ${parseFloat(settings.deliveryFee).toFixed(2).replace('.', ',')}` : 'A consultar',
            minOrder: settings.minOrderValue ? `R$ ${parseFloat(settings.minOrderValue).toFixed(2).replace('.', ',')}` : 'Sem mínimo',
            openingHours: settings.openingHours || 'Horário não informado (consulte disponibilidade)',
            description: settings.description || '',
            pixKey: settings.pixKey || settings.pix_key || 'Não informada',
            pixName: settings.pixName || settings.pix_holder_name || ''
        };

        // Buscar produtos do tenant
        const products = await this.db.all(
            `SELECT p.name, p.price, p.description, c.name as category, p.is_featured
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.tenant_id = ? AND p.is_available = 1
             ORDER BY c.order_index, p.name`,
            [this.tenantId]
        );

        // Formatar cardápio com estilo Premium (WhatsApp Style)
        let menuItems = '';
        let currentCategory = '';

        for (const product of products) {
            if (product.category && product.category !== currentCategory) {
                currentCategory = product.category;
                menuItems += `\n*--- 📂 ${currentCategory.toUpperCase()} ---*\n`;
            }

            const price = `*R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}*`;
            const feature = product.is_featured ? '⭐ ' : '';
            const desc = product.description ? `\n   _${product.description}_` : '';

            menuItems += `${feature}• *${product.name}* » ${price}${desc}\n`;
        }

        if (!menuItems) {
            menuItems = '(Cardápio não configurado)';
        }

        // Construir Bloco de Informações da Loja
        const storeInfoBlock = `
*🏢 NOME DA LOJA:* ${storeInfo.name} (${storeInfo.type})
*📝 DESCRIÇÃO:* ${storeInfo.description}
*📍 ENDEREÇO:* ${storeInfo.address}
*⏰ HORÁRIO:* ${storeInfo.openingHours}
*🚚 TAXA DE ENTREGA:* ${storeInfo.deliveryFee}
*💳 PEDIDO MÍNIMO:* ${storeInfo.minOrder}
*💰 PAGAMENTO PIX (CHAVE):* ${storeInfo.pixKey} ${storeInfo.pixName ? `(${storeInfo.pixName})` : ''}
`;

        // Selecionar template de prompt
        const template = SYSTEM_PROMPTS[this.config.personality] || SYSTEM_PROMPTS.friendly;

        // Substituir placeholders
        return template
            .replace(/{employeeName}/g, this.config.employeeName)
            .replace(/{storeName}/g, this.config.storeName)
            .replace(/{menuItems}/g, menuItems)
            .replace(/{storeInfo}/g, storeInfoBlock);
    }

    /**
     * Verifica se há um pedido confirmado na conversa
     */
    /**
     * Verifica se há um pedido confirmado na conversa e extrai dados
     */
    async checkForOrderConfirmation(conversation) {
        // Verificar se a última mensagem do assistente indica confirmação
        const lastMessages = conversation.messages.slice(-4);
        const fullText = lastMessages.map(m => m.content).join(' ').toLowerCase();

        // Palavras-chave de confirmação
        const confirmationKeywords = [
            'pedido confirmado',
            'seu pedido foi anotado',
            'pedido enviado',
            'pedido realizado',
            'obrigado pelo pedido',
            'já mandei para a cozinha',
            'obrigado pela preferência',
            'obrigada pela preferência',
            'está confirmado',
            'esta confirmado',
            'agradecemos',
            'seu pedido completo é',
            'o valor total é'
        ];

        const isConfirmed = confirmationKeywords.some(kw => fullText.includes(kw));

        if (isConfirmed) {
            conversation.status = CONVERSATION_STATES.COMPLETED;

            // Extração Inteligente via LLM (JSON Mode)
            // Solicita à IA que estruture o pedido final
            const extraction = await this.extractOrderDetailsLLM(conversation, fullText);

            // Salvar dados extraídos na conversa
            conversation.orderData = extraction;
            await this.saveConversation(conversation);

            return extraction;
        }

        return null;
    }

    /**
     * Usa o LLM para extrair detalhes estruturados do pedido
     */
    async extractOrderDetailsLLM(conversation, fullText) {
        console.log('[AIEmployee] Iniciando extração estruturada de pedido...');

        // Histórico recente focado no pedido
        const relevantMessages = conversation.messages
            .slice(-10) // Últimas 10 mensagens devem conter o pedido
            .map(m => `${m.role === 'user' ? 'CLIENTE' : 'ATENDENTE'}: ${m.content}`)
            .join('\n');

        const prompt = `
Aja como um extrator de pedidos de delivery. Analise a conversa abaixo e extraia os dados do pedido final em formato JSON.

CONVERSA:
${relevantMessages}

REGRAS:
1. Identifique TODOS os itens mencionados no pedido final. Se um item foi REMOVIDO ou CANCELADO na conversa, ele NÃO deve aparecer no JSON.
2. Identifique o endereço de entrega completo (Rua, Número, Bairro). Se for Retirada, deixe vazio.
3. Identifique a forma de pagamento e o tipo de entrega ("entrega" ou "retirada").
4. Retorne APENAS o JSON válido.

Formato esperado:
{
  "items": [
    { "name": "Nome do produto", "quantity": 1, "observation": "obs", "addons": [] }
  ],
  "address": "Endereço completo",
  "paymentMethod": "PIX / Cartão / Dinheiro",
  "deliveryType": "entrega ou retirada"
}
`;

        // Chamada específica para extração (usando temperatura 0 para precisão)
        const response = await this.ollama.generateResponse(
            prompt,
            [],
            {
                temperature: 0.1,
                maxTokens: 500
            }
        );

        if (response.success) {
            try {
                // Tentar limpar markdown se houver (```json ... ```)
                let jsonStr = response.content.replace(/```json\n?|\n?```/g, '').trim();
                // Buscar o primeiro { e o último }
                const firstBrace = jsonStr.indexOf('{');
                const lastBrace = jsonStr.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
                    const data = JSON.parse(jsonStr);
                    data.executionType = 'LLM_EXTRACTION';
                    return data;
                }
            } catch (e) {
                console.error('[AIEmployee] Erro ao fazer parse do JSON extraído:', e);
            }
        }

        // Fallback para extração manual se LLM falhar
        return {
            executionType: 'FALLBACK_REGEX',
            confirmed: true,
            extractedAt: new Date().toISOString(),
            address: fullText.match(/rua|av\.|travessa|alameda/i) ? 'Detectado no texto' : null,
            payment: fullText.match(/pix|cartão|dinheiro/i) ? 'Detectado no texto' : null
        };
    }

    /**
     * Finaliza conversa e reseta para próximo atendimento
     */
    async resetConversation(customerPhone) {
        const cacheKey = `${this.tenantId}:${customerPhone}`;
        this.conversations.delete(cacheKey);

        await this.db.run(
            `UPDATE ai_conversations 
             SET status = 'completed', updated_at = ?
             WHERE tenant_id = ? AND customer_phone = ? AND status != 'completed'`,
            [new Date().toISOString(), this.tenantId, customerPhone]
        );
    }

    /**
     * Verifica se Ollama está disponível
     */
    async healthCheck() {
        return await this.ollama.healthCheck();
    }

    /**
     * Atualiza configurações
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.ollama.configure({
            url: this.config.ollamaUrl,
            model: this.config.model
        });
    }
}

export default AIEmployee;
export { CONVERSATION_STATES };
