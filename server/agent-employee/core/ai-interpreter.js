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
        this.model = config.model || 'llama3:8b';
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
        // Saudações (apenas se a mensagem INTEIRA for saudação)
        if (/^(oi|ola|olá|bom dia|boa tarde|boa noite|eae|eai|hey|hello|hi)[!.,]?$/i.test(msg)) {
            return { type: 'GREETING' };
        }

        // ===== PRIORIDADE ALTA: Ações destrutivas/administrativas =====

        // Cancelar/Limpar/Resetar (ANTES de qualquer outra verificação)
        if (/\b(cancelar|limpar?|resetar|reiniciar|zerar|esvaziar)\b/i.test(msg) && /\b(carrinho|pedido|sacola|tudo|ordem)\b/i.test(msg)) {
            return { type: 'RESET' };
        }
        // Cancelar genérico (sem contexto de carrinho)
        if (/^(cancelar|cancelar tudo|cancela|limpar|limpa|resetar|reiniciar)$/i.test(msg)) {
            return { type: 'RESET' };
        }

        // ===== PRIORIDADE MEDIA: Navegação =====

        // "Só isso" / Finalizar (exato ou com contexto)
        if (/^(so isso|só isso|somente isso|era isso|é isso|pronto|finalizar|fechar|acabou|ja deu|já deu|isso|isso ai|beleza|pode fechar|certo|só|so)$/i.test(msg)) {
            return { type: 'FINALIZE_CART' };
        }

        // Confirmar/Sim (exato)
        if (/^(sim|s|yes|confirma|confirmo|exato|correto|pode ser|tá|ta|isso mesmo)$/i.test(msg)) {
            return { type: 'CONFIRM' };
        }

        // Negar/Não (exato)
        if (/^(não|nao|n|no|nope|nenhuma?|nada|sem obs)$/i.test(msg)) {
            return { type: 'DENY' };
        }

        // Entrega / Retirada
        if (/\b(entrega|entregar|delivery|trazer)\b/i.test(msg)) return { type: 'DELIVERY' };
        if (/\b(retirada|retirar|buscar|balcão|balcao|pegar)\b/i.test(msg)) return { type: 'PICKUP' };

        // Pagamentos
        if (/\bpix\b/i.test(msg)) return { type: 'PAYMENT', method: 'PIX' };
        if (/\b(cart[aã]o|credito|cr[eé]dito|d[eé]bito|debito)\b/i.test(msg)) return { type: 'PAYMENT', method: 'CARD' };
        if (/\bdinheiro\b/i.test(msg)) return { type: 'PAYMENT', method: 'CASH' };

        // ===== PRIORIDADE BAIXA: Navegação genérica =====
        // Ver cardápio (APENAS se for a intenção principal, NÃO como substring)
        if (/^(cardapio|cardápio|menu|ver cardapio|ver cardápio|ver menu|o que tem|opcoes|opções|quais opcoes|mostra o cardapio)$/i.test(msg)) {
            return { type: 'SHOW_MENU' };
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

        const systemPrompt = `Você é um extrator de intenções para um sistema de pedidos de restaurante.
Retorne APENAS um JSON válido, sem texto adicional.

CATÁLOGO DE PRODUTOS:
${productList}

ADICIONAIS/COMPLEMENTOS:
${addonList || 'Nenhum'}

TIPOS DE INTENÇÃO E QUANDO USAR:

1. "ORDER" - Quando o cliente pede um item ESPECÍFICO do catálogo.
   Use o NOME_EXATO do catálogo. Inclua quantity e modifiers (adicionais).
   Se o cliente mencionar um TAMANHO (ex: "700", "500ml", "2L", "1 bola"), 
   encontre o item NO CATÁLOGO que corresponde a esse tamanho e retorne ORDER.
   Se o cliente pedir COM adicional (ex: "com granola", "com paçoca"), coloque o nome do adicional em modifiers.

2. "REMOVE" - Quando o cliente quer TIRAR/CANCELAR um item do pedido.

3. "CLARIFY" - APENAS quando o pedido é COMPLETAMENTE genérico, SEM tamanho e SEM especificação.
   Ex: "quero açaí" (sem tamanho) mas existem vários tamanhos = CLARIFY
   Ex: "tem sorvete?" (sem tipo definido) = CLARIFY
   SE O CLIENTE ESPECIFICOU TAMANHO OU TIPO, NÃO USE CLARIFY. Use ORDER.

4. "SHOW_MENU" - Quando o cliente quer VER o cardápio completo.

5. "FINALIZE_CART" - Quando quer fechar/finalizar o pedido.

6. "RESET" - Quando quer limpar/cancelar o carrinho.

7. "UNKNOWN" - Quando não é possível determinar a intenção.

FORMATO:
{"type":"...","items":[{"name":"...","quantity":1,"modifiers":[],"observation":null}],"understood":true}

EXEMPLOS:
Cliente: "quero um açaí" -> {"type":"CLARIFY","items":[{"name":"açaí","quantity":1}],"understood":true}
Cliente: "açaí 700 com granola" -> {"type":"ORDER","items":[{"name":"Copo Açaí 700ml","quantity":1,"modifiers":["Granola"]}],"understood":true}
Cliente: "me vê um Copo Açaí 300ml" -> {"type":"ORDER","items":[{"name":"Copo Açaí 300ml","quantity":1}],"understood":true}
Cliente: "quero 2 picolé de mamão" -> {"type":"ORDER","items":[{"name":"Picolé de Mamão","quantity":2}],"understood":true}
Cliente: "1 açaí 500 com paçoca e leite condensado" -> {"type":"ORDER","items":[{"name":"Copo Açaí 500ml","quantity":1,"modifiers":["Paçoca","Leite Condensado"]}],"understood":true}
Cliente: "tira o picolé" -> {"type":"REMOVE","items":[{"name":"Picolé","quantity":1}],"understood":true}
Cliente: "tem sorvete?" -> {"type":"CLARIFY","items":[{"name":"sorvete","quantity":1}],"understood":true}
Cliente: "limpa o carrinho" -> {"type":"RESET","items":[],"understood":true}
Cliente: ".teste" -> {"type":"UNKNOWN","items":[],"understood":false}

MENSAGEM DO CLIENTE: "${message}"`;

        const response = await this.ollama.generateResponse(
            systemPrompt,
            [{ role: 'user', content: message }],
            { temperature: 0.05, maxTokens: 200, model: this.model }
        );

        console.log(`[AIInterpreter] Raw Response for "${message}":`, response.content);

        if (!response.success) return { type: 'UNKNOWN', raw: message, understood: false };

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                let jsonStr = jsonMatch[0].trim();
                // Limpeza para modelos de raciocínio (como DeepSeek-R1) que incluem blocos <think>
                const contentClean = response.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                const cleanMatch = contentClean.match(/\{[\s\S]*\}/);
                if (cleanMatch) jsonStr = cleanMatch[0].trim();

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

        const systemPrompt = `Você é ${employeeName}, atendente do restaurante ${storeName}. Responda ao cliente de forma natural.

CARRINHO ATUAL:
${cartItems}

DIRETRIZES:
1. Confirme adições ou remoções de forma clara.
2. Seja simpático, mas direto.
3. ${greetingRule}

MISSÃO: ${this.getStateObjective(state, lastIntent)}

FRASE DE RESPOSTA:`;

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

        // Limpar blocos de raciocínio (<think>) da resposta final
        const cleanContent = response.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

        const cleanLines = cleanContent.split('\n')
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
