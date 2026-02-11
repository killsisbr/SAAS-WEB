// ============================================================
// Agent Employee - AI Interpreter
// Usa IA local para interpretar intenções do cliente
// ============================================================

import OllamaClient from '../../services/ollama-client.js';

/**
 * Interpretador de mensagens usando IA local
 */
export class AIInterpreter {
    constructor(config = {}) {
        this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
        this.model = config.model || 'gemma3:4b';
        this.ollama = new OllamaClient({
            url: this.ollamaUrl,
            model: this.model
        });
    }

    /**
     * Interpretar intenção da mensagem
     * @param {string} message - Mensagem do cliente
     * @param {string} currentState - Estado atual do agente
     * @param {Object} context - Contexto adicional (produtos, etc)
     * @returns {Object} Intenção detectada
     */
    async interpret(message, currentState, context = {}) {
        const msg = message.toLowerCase().trim();

        // Atalhos rápidos (sem precisar de IA)
        const quickIntent = this.getQuickIntent(msg, currentState);
        if (quickIntent) {
            return quickIntent;
        }

        // Se está em estado de coleta simples, não precisa de IA
        if (['ADDRESS', 'NAME', 'OBSERVATION'].includes(currentState)) {
            return { type: 'TEXT_INPUT', value: message.trim() };
        }

        // Para estados complexos, usar IA
        try {
            return await this.interpretWithAI(message, currentState, context);
        } catch (err) {
            console.error('[AIInterpreter] Erro na IA, usando fallback:', err.message);
            return { type: 'UNKNOWN', raw: message };
        }
    }

    /**
     * Detectar intenções rápidas sem IA
     */
    getQuickIntent(msg, currentState) {
        // Saudações
        if (/^(oi|ola|olá|bom dia|boa tarde|boa noite|eae|eai|hey|hello|hi)$/i.test(msg)) {
            return { type: 'GREETING' };
        }

        // Ver cardápio
        if (/cardapio|menu|o que tem|opcoes|opções/i.test(msg)) {
            return { type: 'SHOW_MENU' };
        }

        // Confirmar/Sim
        if (/^(sim|s|yes|confirma|confirmo|isso|exato|correto|pode ser|tá|ta)$/i.test(msg) || (msg.includes('certo') && msg.includes('isso'))) {
            return { type: 'CONFIRM' };
        }

        // Negar/Não
        if (/^(não|nao|n|no|nope|nenhuma?|nada|sem obs)$/i.test(msg)) {
            return { type: 'DENY' };
        }

        // Entrega
        if (/entrega|entregar|delivery|manda|trazer/i.test(msg)) {
            return { type: 'DELIVERY' };
        }

        // Retirada
        if (/retirada|retirar|buscar|balcão|balcao|pegar/i.test(msg)) {
            return { type: 'PICKUP' };
        }

        // Pagamentos
        if (/^(pix|1)$/i.test(msg) || msg.includes('pix')) {
            return { type: 'PAYMENT', method: 'PIX' };
        }
        if (/^(cartao|cartão|credito|crédito|debito|débito|2)$/i.test(msg) || msg.includes('cartao') || msg.includes('cartão')) {
            return { type: 'PAYMENT', method: 'CARD' };
        }
        if (/^(dinheiro|3)$/i.test(msg) || msg.includes('dinheiro')) {
            return { type: 'PAYMENT', method: 'CASH' };
        }

        // Cancelar/Voltar
        if (/cancelar|voltar|reiniciar|limpar|resetar/i.test(msg)) {
            return { type: 'RESET' };
        }

        // "Só isso" / Finalizar
        if (/so isso|só isso|somente isso|era isso|é isso|pronto|finalizar|fechar|acabou|so|só|ja deu|já deu/i.test(msg)) {
            return { type: 'FINALIZE_CART' };
        }

        return null; // Precisa de IA
    }

    /**
     * Interpretar com IA para casos complexos e extração múltipla
     */
    async interpretWithAI(message, currentState, context) {
        const { products = [] } = context;

        const productList = products.map(p => `- ${p.name}: R$ ${p.price}`).join('\n');

        const systemPrompt = `Você é um assistente de extração de dados de pedidos para um restaurante.
Analise a mensagem do cliente e extraia o máximo de informações possível.

REGRAS CRÍTICAS:
1. Se o cliente mencinar o NOME DA LOJA (ex: "Brutus Burger", "Brutus"), NÃO mapeie isso como um produto.
2. **Adicionais e Modificadores**: Se o cliente pedir "com bacon" ou "adicional de ovo", coloque esses itens no array "modifiers" DENTRO do item principal correspondente. 
3. **Observações**: Instruções como "sem cebola", "bem passado", "sem maionese", coloque no campo "observation" do item correspondente.
4. Se o cliente quer finalizar ou diz "só isso", use type: "FINALIZE_CART".
5. Se mencionar itens do cardápio, liste-os no array "items" com "name", "quantity", "modifiers" (nomes dos adicionais) e "observation".
6. Identifique o tipo de entrega (delivery ou pickup) no campo "deliveryType".
7. Retorne APENAS o JSON.

CARDÁPIO:
${productList}

Formato da Resposta (JSON):
{
  "type": "ORDER" | "FINALIZE_CART" | "ADDRESS_INPUT" | "GREETING" | "UNKNOWN",
  "items": [{"name": "string", "quantity": number, "modifiers": ["string"], "observation": "string"}],
  "deliveryType": "delivery" | "pickup" | null,
  "address": "string" | null,
  "paymentMethod": "PIX" | "CARD" | "CASH" | null,
  "understood": true
}`;

        const response = await this.ollama.generateResponse(
            systemPrompt,
            [{ role: 'user', content: `Mensagem do cliente: "${message}"` }],
            { temperature: 0.1, maxTokens: 300, model: this.model }
        );

        if (!response.success) return { type: 'UNKNOWN', raw: message, understood: false };

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    type: parsed.type || 'UNKNOWN',
                    items: parsed.items || [],
                    deliveryType: parsed.deliveryType,
                    address: parsed.address,
                    paymentMethod: parsed.paymentMethod,
                    understood: parsed.understood !== false
                };
            } catch (e) { }
        }
        return { type: 'UNKNOWN', raw: message, understood: false };
    }

    /**
     * Gerar resposta natural baseada no estado e contexto
     */
    async generateResponse(state, context = {}) {
        const {
            message,
            customerName,
            storeName,
            employeeName,
            cart,
            products = [],
            addons = [],
            buffet = [],
            lastIntent,
            customerContext = {}
        } = context;

        // Formatar itens do carrinho
        const cartItems = cart?.items?.length > 0
            ? cart.items.map(i => `• ${i.quantity}x *${i.name}*`).join('\n')
            : '_Carrinho vazio_';

        // Formatar catálogos para a IA
        const menuDisplay = products.slice(0, 10).map(p => `• ${p.name} (R$ ${p.price})`).join('\n');
        const addonsDisplay = addons.slice(0, 10).map(a => `• Adicional: ${a.name} (R$ ${a.price})`).join('\n');
        const buffetDisplay = buffet.slice(0, 10).map(b => `• Buffet: ${b.nome}`).join('\n');

        // Contexto de saudação (Evitar repetição em cada mensagem)
        const isInitialState = state === 'GREETING' || (cart?.items?.length === 0 && (state === 'ORDERING' || state === 'START'));
        const greetingRule = isInitialState
            ? (customerContext.isReturningCustomer
                ? `CLIENTE RECORRENTE! Já fez ${customerContext.totalOrders} pedido(s). ${customerContext.isVIP ? '⭐ CLIENTE VIP!' : ''} Use uma saudação calorosa tipo "Que bom te ver de novo!" ou "Já conheço você!"`
                : 'Cliente novo, seja acolhedor(a).')
            : 'CONVERSA EM ANDAMENTO: Seja direto e objetivo. NÃO repita saudações iniciais (já nos cumprimentamos). Vá direto ao assunto.';

        // Regras dinâmicas baseadas no carrinho
        const hasMarmita = cart?.items?.some(i => i.name.toLowerCase().includes('marmita'));
        const marmitaRule = hasMarmita
            ? '1. **Resuma e Confirme**: Como há marmita no carrinho, cite brevemente os itens do buffet escolhidos nela.'
            : '1. **Resuma e Confirme**: Confirme brevemente os itens que o cliente adicionou ao carrinho.';

        const systemPrompt = `Você é a ${employeeName}, atendente do ${storeName}. 🍔 ✨
Seu estilo é: AMIGÁVEL, NATURAL e OBJETIVA.

REGRAS CRÍTICAS:
${marmitaRule}
2. **PROIBIDO CITAR PREÇOS**: NÃO mencione valores, subtotais ou taxas. Um resumo com preços será exibido automaticamente.
3. **FOCO NO CARRINHO**: Sua resposta deve se basear APENAS nos itens da seção "Carrinho" abaixo. Ignore o resto do catálogo na hora de confirmar.
4. **Breve**: Use no máximo 2 frases curtas. Não faça listas.
5. **${greetingRule}**

CONTEXTO:
- Cliente: ${customerName || 'Amigo(a)'}
- Estado Atual: ${state}
- Carrinho Atual (CONFIRMAR ISSO):
${cartItems}

CATÁLOGO (APENAS PARA CONSULTA):
${menuDisplay}
${addonsDisplay}
${buffetDisplay}

MISSÃO AGORA:
${this.getStateObjective(state, lastIntent)}

Responda à mensagem: "${message}"`;

        const response = await this.ollama.generateResponse(
            systemPrompt,
            [],
            {
                temperature: 0.7,
                maxTokens: 400,
                model: this.model
            }
        );

        return response.success ? response.content.trim() : null;
    }

    /**
     * Definir objetivo (Menos insistente)
     */
    getStateObjective(state, intent) {
        switch (state) {
            case 'GREETING': return 'Dê boas-vindas e pergunte o que o cliente deseja pedir hoje.';
            case 'ORDERING':
                if (intent?.type === 'FINALIZE_CART') return 'Confirme o carrinho e pergunte se será para entrega ou retirada.';
                if (intent?.type === 'ORDER') return 'Confirme os itens adicionados e pergunte se ele deseja algo mais ou se podemos finalizar.';
                return 'Ajude o cliente com o cardápio de forma breve.';
            case 'DELIVERY_TYPE': return 'Pergunte se prefere entrega ou retirada 🛵🏠';
            case 'ADDRESS': return 'Peça o endereço completo para entrega 🗺️';
            case 'NAME': return 'Pergunte o nome para o pedido ✍️';
            case 'OBSERVATION': return 'Pergunte se há alguma observação especial 📝';
            case 'PAYMENT': return 'Informe o total e pergunte a forma de pagamento (Pix, Cartão ou Dinheiro) 💸';
            case 'CHANGE': return 'Pergunte se precisa de troco 💰';
            default: return 'Atenda com simpatia e foco em concluir o pedido.';
        }
    }
}

export default AIInterpreter;
