// ============================================================
// AI Processor - Multi-Provider (Gemini / Groq)
// Processa mensagens de WhatsApp e extrai intencoes
// ============================================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

// Cache de instancias
const aiInstances = new Map();

/**
 * Obter instancia do provider
 */
function getProvider(provider, apiKey) {
    const key = `${provider}:${apiKey}`;

    if (!aiInstances.has(key)) {
        if (provider === 'groq') {
            aiInstances.set(key, new Groq({ apiKey }));
        } else {
            aiInstances.set(key, new GoogleGenerativeAI(apiKey));
        }
    }
    return aiInstances.get(key);
}

/**
 * Processar mensagem com Groq (Llama 3)
 */
async function processWithGroq(message, context, menuData, apiKey) {
    const groq = getProvider('groq', apiKey);
    const systemPrompt = buildSystemPrompt(context, menuData);

    const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    return JSON.parse(responseText);
}

/**
 * Processar mensagem com Gemini
 */
async function processWithGemini(message, context, menuData, apiKey) {
    const genAI = getProvider('gemini', apiKey);
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash'
    });

    const systemPrompt = buildSystemPrompt(context, menuData);

    const result = await model.generateContent([
        { text: systemPrompt },
        { text: `Mensagem do cliente: "${message}"` }
    ]);

    let responseText = result.response.text();
    // Remover marcadores de markdown se presentes
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    return JSON.parse(responseText);
}

/**
 * Processar mensagem do cliente e extrair intencao
 * @param {string} message - Mensagem do cliente
 * @param {object} context - Contexto da sessao
 * @param {object} menuData - Dados do cardapio
 * @param {string} apiKey - Chave da API
 * @param {string} provider - 'gemini' ou 'groq'
 * @returns {object} Intencao e resposta
 */
export async function processMessage(message, context, menuData, apiKey, provider = 'gemini') {
    try {
        if (provider === 'groq') {
            return await processWithGroq(message, context, menuData, apiKey);
        } else {
            return await processWithGemini(message, context, menuData, apiKey);
        }
    } catch (error) {
        console.error(`[AI/${provider}] Erro ao processar:`, error.message);
        return {
            intent: 'error',
            response: 'Desculpe, nao entendi. Pode repetir?'
        };
    }
}

/**
 * Construir prompt do sistema baseado no contexto COMPLETO do negocio
 * @param {object} context - Contexto da sessao atual
 * @param {object} menuData - Dados do cardapio
 * @param {object} businessInfo - Informacoes completas do negocio (opcional)
 */
function buildSystemPrompt(context, menuData, businessInfo = {}) {
    const categories = menuData.categories || [];
    const products = menuData.products || [];
    const addonItems = menuData.addons || [];
    const addonGroups = menuData.addonGroups || [];

    // Informacoes do negocio
    const restaurantName = context.restaurantName || businessInfo.name || 'Delivery';
    const businessType = businessInfo.businessType || 'RESTAURANTE';
    const openTime = businessInfo.openTime || '11:00';
    const closeTime = businessInfo.closeTime || '23:00';
    const deliveryFee = businessInfo.deliveryFee || 0;
    const minOrder = businessInfo.minOrder || 0;
    // Metodos de pagamento dinâmicos
    const paymentMethods = [];
    if (businessInfo.acceptPix !== false) paymentMethods.push('PIX');
    if (businessInfo.acceptCard !== false) paymentMethods.push('Cartao');
    if (businessInfo.acceptCash !== false) paymentMethods.push('Dinheiro');
    if (paymentMethods.length === 0) paymentMethods.push('A combinar');

    const address = businessInfo.address || '';

    // Agrupar adicionais por grupo para facilitar acesso
    const groupsWithItems = addonGroups.map(group => ({
        ...group,
        items: addonItems.filter(item => item.group_id === group.id)
    }));

    // Formatar cardapio detalhado com regras de adicionais
    const menuText = categories.map(cat => {
        const catProducts = products.filter(p => p.category_id === cat.id);
        if (catProducts.length === 0) return null;

        // Buscar grupos vinculados a categoria
        const catGroups = groupsWithItems.filter(g => g.category_id === cat.id);

        const productList = catProducts.map(p => {
            let line = `  - ${p.name} (ID: ${p.id}): R$ ${Number(p.price).toFixed(2).replace('.', ',')}`;
            if (p.description) line += ` - ${p.description}`;

            // Buscar grupos vinculados diretamente ao produto ou a categoria dele
            const relevantGroups = [
                ...groupsWithItems.filter(g => g.product_id === p.id),
                ...catGroups
            ];

            if (relevantGroups.length > 0) {
                line += '\n    OPCOES DISPONIVEIS:';
                relevantGroups.forEach(g => {
                    const min = g.min_selection || 0;
                    const max = g.max_selection || 1;
                    const mandatory = min > 0 ? `(OBRIGATORIO: minimo ${min})` : '(Opcional)';
                    line += `\n    * ${g.name} ${mandatory} - Escolha entre ${min} e ${max}:`;
                    g.items.forEach(i => {
                        line += `\n      > ${i.name} (ID: ${i.id}): +R$ ${Number(i.price).toFixed(2).replace('.', ',')}`;
                    });
                });
            }
            return line;
        }).join('\n');

        return `[${cat.name.toUpperCase()}]\n${productList}`;
    }).filter(Boolean).join('\n\n');

    // Carrinho atual

    // Carrinho atual
    const cartText = context.items?.length > 0
        ? context.items.map(i => {
            let line = `${i.quantity}x ${i.name} (R$ ${(i.price * i.quantity).toFixed(2).replace('.', ',')})`;
            if (i.addons?.length) {
                line += ` + ${i.addons.map(a => a.name).join(', ')}`;
            }
            return line;
        }).join('\n')
        : '(vazio)';

    return `Voce e o atendente virtual do "${restaurantName}" (${businessType}).
Seu objetivo e anotar pedidos de forma natural, amigavel e eficiente via WhatsApp.

=== INFORMACOES DO ESTABELECIMENTO ===
Nome: ${restaurantName}
Tipo: ${businessType}
Horario: ${openTime} as ${closeTime}
Endereco: ${address || 'Consulte conosco'}
Taxa de Entrega: R$ ${Number(deliveryFee).toFixed(2).replace('.', ',')}
Pedido Minimo: R$ ${Number(minOrder).toFixed(2).replace('.', ',')}
Formas de Pagamento: ${paymentMethods.join(', ')}

=== CARDAPIO COMPLETO ===
${menuText || 'Cardapio nao disponivel'}

=== ADICIONAIS E OPCOES ===
${addonsText}
Regras de Selecao: Sempre verifique se o produto possui grupos de adicionais (addonGroups). 
Se houver, informe ao cliente as opcoes e respeite os limites:
- "min_selection": Quantidade minima OBRIGATORIA.
- "max_selection": Quantidade maxima permitida.

=== SESSAO ATUAL ===
Estado: ${context.state || 'IDLE'}
Carrinho:
${cartText}
Total Parcial: R$ ${(context.total || 0).toFixed(2).replace('.', ',')}
Tipo Entrega: ${context.deliveryType || 'Nao definido'}
Endereco: ${context.address || 'Nao informado'}

=== COMO ATENDER BEM ===
1. Seja cordial, use emojis com moderacao (1-2 por mensagem)
2. Cumprimente o cliente no primeiro contato
3. Ajude a escolher se o cliente estiver em duvida
4. Sugira combos ou adicionais quando apropriado
5. Confirme cada item adicionado
6. Ao fechar pedido, recapitule tudo antes de confirmar
7. Pergunte se e entrega ou retirada
8. Se entrega, peca endereco completo
9. Confirme forma de pagamento
10. Agradeca ao final

=== REGRAS DE NEGOCIO ===
- Se fora do horario, informe gentilmente
- Se pedido abaixo do minimo, avise o cliente
- Se produto nao existir, sugira opcoes similares
- Se o produto exigir escolha (ex: sabor ou ponto), pergunte antes de adicionar
- Sempre confirme antes de finalizar

=== FORMATO DE RESPOSTA ===
Responda SEMPRE em JSON valido:
{
    "intent": "greeting|add_item|select_option|addon|remove_item|view_cart|checkout|delivery_type|address|payment|confirm|cancel|help|question|unknown",
    "product": "nome do produto ou null",
    "productId": "id numerico do produto ou null",
    "quantity": 1,
    "option": "opcao selecionada ou null",
    "addons": [],
    "deliveryType": "DELIVERY|PICKUP ou null",
    "address": "endereco informado ou null",
    "paymentMethod": "PIX|CASH|CREDIT_CARD ou null",
    "response": "sua resposta amigavel ao cliente",
    "nextState": "proximo estado sugerido"
}`;
}

/**
 * Gerar resposta de saudacao inicial
 */
export async function generateGreeting(restaurantName, apiKey, provider = 'gemini') {
    try {
        if (provider === 'groq') {
            const groq = getProvider('groq', apiKey);
            const completion = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [{
                    role: 'user',
                    content: `Gere uma saudacao curta e amigavel para um cliente que acabou de enviar mensagem para o restaurante "${restaurantName}". Use 1-2 emojis. Pergunte o que ele gostaria de pedir. Maximo 3 linhas.`
                }],
                temperature: 0.8,
                max_tokens: 150
            });
            return completion.choices[0]?.message?.content || `Ola! Bem-vindo ao ${restaurantName}!`;
        } else {
            const genAI = getProvider('gemini', apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
            const result = await model.generateContent(
                `Gere uma saudacao curta e amigavel para um cliente que acabou de enviar mensagem para o restaurante "${restaurantName}". Use 1-2 emojis. Pergunte o que ele gostaria de pedir. Maximo 3 linhas.`
            );
            return result.response.text();
        }
    } catch (error) {
        return `Ola! Bem-vindo ao ${restaurantName}! O que vai querer hoje?`;
    }
}

/**
 * Formatar confirmacao de pedido
 */
export function formatOrderConfirmation(order) {
    const items = order.items.map(i => {
        let line = `${i.quantity}x ${i.name}`;
        if (i.addons?.length) {
            line += ` + ${i.addons.map(a => a.name).join(', ')}`;
        }
        return line;
    }).join('\n');

    return `Pedido #${order.orderNumber} confirmado!\n\n${items}\n\nTotal: R$ ${order.total.toFixed(2).replace('.', ',')}\n\nAgradecemos a preferencia!`;
}

export default {
    processMessage,
    generateGreeting,
    formatOrderConfirmation
};
