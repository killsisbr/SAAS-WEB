// ============================================================
// Agent Employee - Cart Service
// Gerenciamento de carrinho em memória por sessão
// ============================================================

import { AGENT_STATES } from '../config.js';

// Armazenamento em memória: Map<tenantId, Map<customerId, CartSession>>
const sessions = new Map();

/**
 * Obter ou criar sessão do cliente
 */
export function getSession(tenantId, customerId) {
    if (!sessions.has(tenantId)) {
        sessions.set(tenantId, new Map());
    }

    const tenantSessions = sessions.get(tenantId);

    if (!tenantSessions.has(customerId)) {
        tenantSessions.set(customerId, createNewSession());
    }

    return tenantSessions.get(customerId);
}

/**
 * Criar nova sessão limpa
 */
function createNewSession() {
    return {
        state: AGENT_STATES.GREETING,
        items: [],
        subtotal: 0,
        deliveryFee: 0,
        total: 0,
        deliveryType: null, // 'delivery' ou 'pickup'
        address: null,
        customerName: null,
        observation: null,
        paymentMethod: null,
        change: null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
}

/**
 * Resetar sessão
 */
export function resetSession(tenantId, customerId) {
    const tenantSessions = sessions.get(tenantId);
    if (tenantSessions) {
        tenantSessions.set(customerId, createNewSession());
    }
    return getSession(tenantId, customerId);
}

/**
 * Atualizar estado da sessão
 */
export function setState(tenantId, customerId, newState) {
    const session = getSession(tenantId, customerId);
    session.state = newState;
    session.updatedAt = new Date();
    return session;
}

/**
 * Adicionar item ao carrinho
 * @param {string} tenantId - ID do tenant
 * @param {string} customerId - ID do cliente
 * @param {Object} item - { product, quantity, addons: [] }
 */
export function addItem(tenantId, customerId, itemData) {
    const { product, quantity = 1, observation = '', addons = [], size = null } = itemData;

    if (!product) {
        return getSession(tenantId, customerId);
    }

    const session = getSession(tenantId, customerId);

    // Para itens com adicionais (marmitas, açai), sempre adicionamos como item único
    // Para produtos simples sem adicionais, tentamos agrupar se já existe
    if (addons.length === 0) {
        const existingIndex = session.items.findIndex(i => i.productId === product.id && !i.addons?.length);
        if (existingIndex >= 0) {
            session.items[existingIndex].quantity += quantity;
            session.items[existingIndex].total = session.items[existingIndex].quantity * (product.price || 0);
            if (observation) session.items[existingIndex].observation = observation;
            session.subtotal = session.items.reduce((sum, item) => sum + item.total, 0);
            session.total = session.subtotal + session.deliveryFee;
            return session;
        }
    }

    // Calcular preço dos adicionais
    const addonsTotal = addons.reduce((sum, m) => sum + (m.price || 0), 0);
    const itemUnitPrice = (product.price || 0) + addonsTotal;

    // Adicionar novo item
    console.log(`[CartService] addItem: ${product.name} (ID: ${product.id}), addons: ${addons.length}, size: ${size || 'N/A'}`);
    session.items.push({
        productId: product.id,
        name: product.name,
        size: size || null,
        price: product.price || 0,
        quantity: quantity,
        observation: observation,
        addons: addons.map(m => ({
            id: m.id,
            name: m.name || m.nome,
            price: m.price || 0
        })),
        total: itemUnitPrice * quantity
    });

    // Recalcular subtotal
    session.subtotal = session.items.reduce((sum, item) => sum + item.total, 0);
    session.total = session.subtotal + (session.deliveryFee || 0);
    session.updatedAt = new Date();

    return session;
}

/**
 * Remover último item do carrinho
 */
export function removeLastItem(tenantId, customerId) {
    const session = getSession(tenantId, customerId);

    if (session.items.length > 0) {
        session.items.pop();
        session.subtotal = session.items.reduce((sum, item) => sum + item.total, 0);
        session.total = session.subtotal + session.deliveryFee;
        session.updatedAt = new Date();
    }

    return session;
}

/**
 * Definir taxa de entrega
 */
export function setDeliveryFee(tenantId, customerId, fee) {
    const session = getSession(tenantId, customerId);
    session.deliveryFee = fee;
    session.total = session.subtotal + fee;
    session.updatedAt = new Date();
    return session;
}

/**
 * Formatar carrinho para exibição
 */
export function formatCart(tenantId, customerId) {
    const session = getSession(tenantId, customerId);

    if (!session || session.items.length === 0) {
        return '🛒 *Seu carrinho está vazio.*';
    }

    let text = '🛒 *RESUMO DO PEDIDO*\n';
    text += '────────────────────\n';

    console.log(`[CartService] formatCart items:`, session.items.length);

    session.items.forEach((item) => {
        const sizeLabel = item.size ? ` (${item.size})` : '';
        text += `✅ *${item.quantity}x* ${item.name}${sizeLabel}\n`;

        // Exibir adicionais (adicionais ou itens de buffet)
        if (item.addons && item.addons.length > 0) {
            item.addons.forEach(mod => {
                const priceText = mod.price > 0 ? ` (+R$ ${mod.price.toFixed(2).replace('.', ',')})` : '';
                text += `   └─ ${mod.name}${priceText}\n`;
            });
        }

        text += `   └─ R$ ${item.total.toFixed(2).replace('.', ',')}\n`;

        if (item.observation) {
            text += `   _(${item.observation})_\n`;
        }
    });

    text += '────────────────────\n';

    text += `*Subtotal:* R$ ${session.subtotal.toFixed(2).replace('.', ',')}\n`;
    if (session.deliveryFee > 0) {
        text += `*Taxa de Entrega:* R$ ${session.deliveryFee.toFixed(2).replace('.', ',')} 📍\n`;
    }

    text += `\n*💰 TOTAL A PAGAR: R$ ${session.total.toFixed(2).replace('.', ',')}*\n`;
    text += '────────────────────';

    return text.trim();
}

/**
 * Limpar sessões antigas (mais de 2 horas)
 */
export function cleanupOldSessions() {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    sessions.forEach((tenantSessions, tenantId) => {
        tenantSessions.forEach((session, customerId) => {
            if (session.updatedAt < twoHoursAgo) {
                tenantSessions.delete(customerId);
            }
        });
    });
}

// Limpar sessões antigas a cada 30 minutos
setInterval(cleanupOldSessions, 30 * 60 * 1000);

export default {
    getSession,
    resetSession,
    setState,
    addItem,
    removeLastItem,
    setDeliveryFee,
    formatCart,
    cleanupOldSessions
};
