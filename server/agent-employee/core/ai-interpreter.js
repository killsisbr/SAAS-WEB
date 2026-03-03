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
        this.model = config.model || 'gemma:2b';
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
        if (/\b(entrega|entregar|delivery|trazer)\b/i.test(msg)) {
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
        if (/so isso|só isso|somente isso|era isso|é isso|pronto|finalizar|fechar|acabou|so|só|ja deu|já deu|^isso$|^isso ai$|^beleza$|^pode fechar$|^certo$/i.test(msg)) {
            return { type: 'FINALIZE_CART' };
        }

        return null; // Precisa de IA
    }

    /**
     * Interpretar com IA para casos complexos e extração múltipla
     */
    async interpretWithAI(message, currentState, context) {
        const { products = [] } = context;

        // Separar produtos principais de adicionais
        const mainProducts = products.filter(p => p._type === 'product');
        const addonItems = products.filter(p => p._type === 'addon');
        const productList = mainProducts.map(p => `- ${p.name}: R$ ${p.price}`).join('\n');
        const addonList = addonItems.map(a => `- ${a.name}: R$ ${a.price}`).join('\n');

        const systemPrompt = `Aja como um extrator de JSON.
Responda APENAS o JSON.

CATALOGO:
${productList}

ADICIONAIS:
${addonList || 'Nenhum'}

FORMATO:
{"type":"ORDER","items":[{"name":"NOME_EXATO","quantity":1,"modifiers":["ADICIONAL_EXATO"],"observation":null}],"understood":true}

MENSAGEM: "${message}"`;

        const response = await this.ollama.generateResponse(
            systemPrompt,
            [{ role: 'user', content: `Mensagem do cliente: "${message}"` }],
            { temperature: 0.1, maxTokens: 300, model: this.model }
        );

        if (!response.success) return { type: 'UNKNOWN', raw: message, understood: false };

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                let jsonStr = jsonMatch[0].trim();
                // Limpeza agressiva para gemma:2b que às vezes repete o texto antes do JSON
                const parsed = JSON.parse(jsonStr);
                return {
                    type: parsed.type || 'UNKNOWN',
                    items: parsed.items || [],
                    deliveryType: parsed.deliveryType || null,
                    address: parsed.address || null,
                    paymentMethod: parsed.paymentMethod || null,
                    understood: parsed.understood ?? true
                };
            } catch (e) {
                console.error('[AIInterpreter] Erro parse JSON:', e.message, 'Raw:', response.content);
            }
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
                ? `CLIENTE RECORRENTE. Seja direto: "Olá ${customerName || 'Cliente'}, o que deseja hoje?". NÃO se apresente nem diga quem você é.`
                : `Cliente novo. Diga apenas: "Olá${customerName && customerName !== 'Cliente' ? ' ' + customerName : ''}, o que deseja hoje?". NÃO se apresente nem explique quem você é.`)
            : 'CONVERSA EM ANDAMENTO: Seja direto e objetivo. NÃO repita saudações iniciais. Vá direto ao assunto.';

        // Regras dinâmicas baseadas no carrinho
        const hasMarmita = cart?.items?.some(i => i.name.toLowerCase().includes('marmita'));
        const marmitaRule = hasMarmita
            ? '1. **Resuma e Confirme**: Como há marmita no carrinho, cite brevemente os itens do buffet escolhidos nela.'
            : '1. **Resuma e Confirme**: Confirme brevemente os itens que o cliente adicionou ao carrinho.';

        const systemPrompt = `Você é a atendente virtual ${employeeName} do restaurante ${storeName}.
MENSAGEM DO CLIENTE: "${message}"

DIRETRIZES DE RESPOSTA (OBRIGATÓRIO):
1. NUNCA responda com mais de 10 palavras.
2. Responda em UMA ÚNICA LINHA.
3. Não repita o cliente.
4. ${greetingRule}

Sua missão agora: ${this.getStateObjective(state, lastIntent)}

Sua única frase de resposta:`;

        const response = await this.ollama.generateResponse(
            systemPrompt,
            [],
            {
                temperature: 0.3,
                maxTokens: 50,
                model: this.model
            }
        );

        if (!response.success) return null;

        const cleanLines = response.content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        return cleanLines.length > 0 ? cleanLines[0].replace(/^["']|["']$/g, '') : null;
    }

    /**
     * Definir objetivo (Menos insistente)
     */
    getStateObjective(state, intent) {
        switch (state) {
            case 'GREETING': return 'Pergunte de forma DIRETA o que o cliente deseja pedir. NÃO se apresente.';
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
