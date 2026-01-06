// ============================================================
// Conversation Handler - Orquestra fluxo de pedido via IA
// ============================================================

import { processMessage, generateGreeting } from './ai-processor.js';
import { getOrCreateSession, ORDER_STATES, removeSession } from './order-session.js';
import { findProduct, findAddon, extractQuantity, detectBasicIntent } from './menu-matcher.js';

/**
 * Handler principal de conversa
 * @param {object} params - Parametros da mensagem
 * @returns {object} Resposta para enviar ao cliente
 */
export async function handleConversation(params) {
    const {
        message,
        whatsappId,
        tenantId,
        customerName,
        menuData,
        tenantSettings,
        db
    } = params;

    // Verificar se bot IA esta habilitado
    const aiConfig = tenantSettings.aiBot || {};
    if (!aiConfig.enabled || !aiConfig.apiKey) {
        return null; // Retorna null para usar fluxo padrao (link)
    }

    // Obter ou criar sessao
    const session = getOrCreateSession(whatsappId, tenantId, customerName);

    // Construir contexto para IA
    const context = {
        state: session.state,
        items: session.items,
        total: session.getTotal(),
        currentItem: session.currentItem,
        pendingProduct: session.pendingProduct,
        deliveryType: session.deliveryType,
        restaurantName: tenantSettings.name || 'Restaurante'
    };

    try {
        // Processar com IA
        const aiResponse = await processMessage(
            message,
            context,
            menuData,
            aiConfig.apiKey,
            aiConfig.provider || 'gemini'
        );

        // Executar acao baseada na intencao
        const result = await executeIntent(session, aiResponse, menuData, db, tenantId, message);

        return {
            response: result.response || aiResponse.response,
            session: session,
            orderCreated: result.orderCreated || null
        };

    } catch (error) {
        console.error('[ConversationHandler] Erro:', error);
        return {
            response: 'Desculpe, tive um probleminha. Pode repetir?',
            session: session
        };
    }
}

/**
 * Executar acao baseada na intencao detectada pela IA
 */
async function executeIntent(session, aiResponse, menuData, db, tenantId, message) {
    const { intent, product, productId, quantity, option, addons, deliveryType, paymentMethod, nextState } = aiResponse;

    switch (intent) {
        case 'greeting':
            session.setState(ORDER_STATES.BROWSING);
            return { response: aiResponse.response };

        case 'add_item':
            return handleAddItem(session, product, productId, quantity, menuData, aiResponse);

        case 'select_option':
            return handleSelectOption(session, option, aiResponse);

        case 'addon':
            return handleAddon(session, addons, menuData, aiResponse);

        case 'view_cart':
            return handleViewCart(session);

        case 'remove_item':
            return handleRemoveItem(session, product, aiResponse);

        case 'checkout':
            session.setState(ORDER_STATES.DELIVERY_TYPE);
            return {
                response: `${session.formatCart()}\n\nTotal: R$ ${session.getTotal().toFixed(2).replace('.', ',')}\n\nE para entrega ou retirada?`
            };

        case 'delivery_type':
            session.deliveryType = deliveryType || 'DELIVERY';
            if (session.deliveryType === 'DELIVERY') {
                session.setState(ORDER_STATES.ADDRESS);
                return { response: 'Perfeito! Me envia sua localizacao ou digite o endereco.' };
            } else {
                const paymentMethods = [];
                if (tenantSettings.acceptPix !== false) paymentMethods.push('- PIX');
                if (tenantSettings.acceptCard !== false) paymentMethods.push('- Cartao');
                if (tenantSettings.acceptCash !== false) paymentMethods.push('- Dinheiro');
                const pText = paymentMethods.length > 0 ? paymentMethods.join('\n') : '- A combinar';

                return { response: `Otimo! Retirada no local.\n\nQual sera a forma de pagamento?\n${pText}` };
            }

        case 'address':
            session.address = {
                street: aiResponse.address || message,
                raw: message
            };
            const paymentMethodsArr = [];
            if (tenantSettings.acceptPix !== false) paymentMethodsArr.push('- PIX');
            if (tenantSettings.acceptCard !== false) paymentMethodsArr.push('- Cartao');
            if (tenantSettings.acceptCash !== false) paymentMethodsArr.push('- Dinheiro');
            const pTextAddr = paymentMethodsArr.length > 0 ? paymentMethodsArr.join('\n') : '- A combinar';

            return {
                response: `Entrega para: ${session.address.street}\n\nQual sera a forma de pagamento?\n${pTextAddr}`
            };

        case 'payment':
            session.paymentMethod = paymentMethod || 'CASH';
            session.setState(ORDER_STATES.CONFIRMED);
            return await createOrder(session, db, tenantId);

        case 'confirm':
            if (session.state === ORDER_STATES.CART_REVIEW) {
                session.setState(ORDER_STATES.DELIVERY_TYPE);
                return { response: 'E para entrega ou retirada?' };
            }
            return { response: aiResponse.response };

        case 'cancel':
            session.reset();
            return { response: 'Pedido cancelado. Se precisar de algo, e so chamar!' };

        case 'help':
            return {
                response: `Como posso ajudar:\n\n` +
                    `- Diga o que quer pedir (ex: "quero um hamburguer")\n` +
                    `- Veja seu carrinho: "ver pedido"\n` +
                    `- Finalize: "fechar pedido"\n` +
                    `- Cancele: "cancelar"\n\n` +
                    `O que vai ser?`
            };

        default:
            return { response: aiResponse.response };
    }
}

/**
 * Handle adicao de item
 */
function handleAddItem(session, productName, productId, quantity, menuData, aiResponse) {
    // Tentar encontrar produto pelo ID primeiro
    let product = null;

    if (productId) {
        product = menuData.products.find(p => p.id == productId);
    }

    // Se nao encontrou, buscar por nome
    if (!product && productName) {
        const matches = findProduct(productName, menuData.products);
        if (matches.length > 0) {
            product = matches[0].product;
        }
    }

    if (!product) {
        return {
            response: `Nao encontrei "${productName}" no cardapio. Pode tentar de outra forma?`
        };
    }

    // Verificar se tem variacoes/opcoes
    const variations = menuData.variations?.filter(v => v.product_id === product.id) || [];
    if (variations.length > 0) {
        session.pendingProduct = product;
        session.setState(ORDER_STATES.SELECT_OPTION);
        const options = variations.map(v => `- ${v.name}: R$ ${Number(v.price).toFixed(2).replace('.', ',')}`).join('\n');
        return {
            response: `${product.name}! Qual opcao voce prefere?\n\n${options}`
        };
    }

    // Adicionar direto
    const qty = quantity || extractQuantity(productName) || 1;
    const item = session.addItem(product, qty);
    session.setState(ORDER_STATES.BROWSING);

    // Verificar se tem adicionais disponiveis
    const productAddons = menuData.addons?.filter(a => a.product_id === product.id) || [];
    if (productAddons.length > 0) {
        session.currentItem = item;
        session.setState(ORDER_STATES.ADDONS);
        const addonsList = productAddons.map(a => `- ${a.name} (+R$ ${Number(a.price).toFixed(2).replace('.', ',')})`).join('\n');
        return {
            response: `${qty}x ${product.name} adicionado!\n\nDeseja algum adicional?\n${addonsList}\n\nOu diga "nao" para continuar.`
        };
    }

    return {
        response: `${qty}x ${product.name} adicionado! (R$ ${item.total.toFixed(2).replace('.', ',')})\n\nMais alguma coisa?`
    };
}

/**
 * Handle selecao de opcao
 */
function handleSelectOption(session, option, aiResponse) {
    if (!session.pendingProduct) {
        return { response: aiResponse.response };
    }

    // Adicionar com a opcao selecionada
    const item = session.addItem(session.pendingProduct, 1, option);
    session.setState(ORDER_STATES.BROWSING);

    return {
        response: `${session.pendingProduct.name} (${option}) adicionado!\n\nMais alguma coisa?`
    };
}

/**
 * Handle adicao de adicionais
 */
function handleAddon(session, addonNames, menuData, aiResponse) {
    if (!session.currentItem) {
        return { response: aiResponse.response };
    }

    // Buscar adicionais mencionados
    const allAddons = menuData.addons || [];
    const addedAddons = [];

    for (const name of (addonNames || [])) {
        const matches = findAddon(name, allAddons);
        if (matches.length > 0) {
            const addon = matches[0].addon;
            session.currentItem.addons.push({
                id: addon.id,
                name: addon.name,
                price: Number(addon.price || 0)
            });
            session.currentItem.total += Number(addon.price || 0) * session.currentItem.quantity;
            addedAddons.push(addon.name);
        }
    }

    session.currentItem = null;
    session.setState(ORDER_STATES.BROWSING);

    if (addedAddons.length > 0) {
        return {
            response: `Adicionado: ${addedAddons.join(', ')}!\n\nMais alguma coisa?`
        };
    }

    return { response: 'Ok! Mais alguma coisa?' };
}

/**
 * Handle visualizacao do carrinho
 */
function handleViewCart(session) {
    if (session.items.length === 0) {
        return { response: 'Seu carrinho esta vazio. O que vai querer?' };
    }

    const cart = session.formatCart();
    return {
        response: `Seu pedido:\n\n${cart}\n\nTotal: R$ ${session.getTotal().toFixed(2).replace('.', ',')}\n\nDeseja mais alguma coisa ou posso fechar?`
    };
}

/**
 * Handle remocao de item
 */
function handleRemoveItem(session, productName, aiResponse) {
    if (session.items.length === 0) {
        return { response: 'Seu carrinho ja esta vazio.' };
    }

    // Tentar encontrar item para remover
    const itemToRemove = session.items.find(i =>
        i.name.toLowerCase().includes(productName?.toLowerCase() || '')
    );

    if (itemToRemove) {
        session.removeItem(itemToRemove.id);
        return { response: `${itemToRemove.name} removido do pedido.` };
    }

    return { response: aiResponse.response };
}

/**
 * Criar pedido no banco de dados
 */
async function createOrder(session, db, tenantId) {
    try {
        const orderData = session.toOrder();

        // Gerar numero do pedido
        const today = new Date().toISOString().split('T')[0];
        const countResult = await db.get(
            'SELECT COUNT(*) as count FROM orders WHERE tenant_id = ? AND date(created_at) = ?',
            [tenantId, today]
        );
        const orderNumber = (countResult?.count || 0) + 1;

        // Inserir pedido
        const result = await db.run(`
            INSERT INTO orders (
                tenant_id, order_number, customer_name, customer_phone, whatsapp_id,
                items, delivery_type, address, payment_method, 
                total, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))
        `, [
            tenantId,
            orderNumber,
            orderData.customerName,
            orderData.customerPhone,
            orderData.whatsappId,
            JSON.stringify(orderData.items),
            orderData.deliveryType,
            JSON.stringify(orderData.address),
            orderData.paymentMethod,
            orderData.total
        ]);

        // Formatar confirmacao
        const paymentText = {
            'PIX': 'PIX',
            'CASH': 'Dinheiro',
            'CREDIT_CARD': 'Cartao'
        }[orderData.paymentMethod] || orderData.paymentMethod;

        let response = `Pedido #${orderNumber} confirmado!\n\n` +
            `${session.formatCart()}\n\n` +
            `${orderData.deliveryType === 'DELIVERY' ? 'Entrega: ' + (orderData.address?.street || 'A confirmar') : 'Retirada no local'}\n` +
            `Pagamento: ${paymentText}\n` +
            `Total: R$ ${orderData.total.toFixed(2).replace('.', ',')}\n\n`;

        // Adicionar PIX se necessario
        if (orderData.paymentMethod === 'PIX') {
            const tenant = await db.get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
            const settings = JSON.parse(tenant?.settings || '{}');

            if (settings.pixKey) {
                const { generatePixPayload } = await import('../utils/pix.js');
                const pixPayload = generatePixPayload({
                    pixKey: settings.pixKey,
                    pixKeyType: settings.pixKeyType || 'PHONE',
                    merchantName: tenant.name || 'Restaurante',
                    merchantCity: settings.city || 'SAO PAULO',
                    amount: orderData.total,
                    txId: `ORD${orderNumber}`,
                    description: `Pedido ${orderNumber}`
                });

                response += `*DADOS PARA PAGAMENTO PIX*\n`;
                response += `Chave PIX: ${settings.pixKey}\n\n`;
                response += `Copia e Cola:\n`;
                response += '```' + pixPayload + '```\n\n';
                response += `_Pague agora para agilizar o preparo!_\n\n`;
            }
        }

        response += `Agradecemos a preferencia!`;

        // Limpar sessao
        removeSession(session.whatsappId, tenantId);

        return {
            response,
            orderCreated: {
                id: result.lastID,
                orderNumber,
                ...orderData
            }
        };

    } catch (error) {
        console.error('[ConversationHandler] Erro ao criar pedido:', error);
        return {
            response: 'Ops! Tive um problema ao finalizar. Pode tentar novamente?'
        };
    }
}

/**
 * Handle para mensagem de localizacao
 */
export function handleLocation(latitude, longitude, whatsappId, tenantId, tenantSettings = {}) {
    const session = getOrCreateSession(whatsappId, tenantId);

    if (session.state === ORDER_STATES.ADDRESS) {
        session.address = {
            coordinates: { latitude, longitude },
            street: `Localizacao: https://www.google.com/maps?q=${latitude},${longitude}`
        };
        session.setState(ORDER_STATES.PAYMENT);

        const paymentMethodsArr = [];
        if (tenantSettings.acceptPix !== false) paymentMethodsArr.push('- PIX');
        if (tenantSettings.acceptCard !== false) paymentMethodsArr.push('- Cartao');
        if (tenantSettings.acceptCash !== false) paymentMethodsArr.push('- Dinheiro');
        const pText = paymentMethodsArr.length > 0 ? paymentMethodsArr.join('\n') : '- A combinar';

        return {
            response: `Localizacao recebida com sucesso! ✅\n\nQual sera a forma de pagamento?\n${pText}`
        };
    }

    return null;
}

export default {
    handleConversation,
    handleLocation
};
